"use server";

import { createClient } from "@supabase/supabase-js";

import { getAdminSession } from "../../_lib/admin-auth";
import { createSupabaseServerClient } from "../../_lib/supabase-server";
import { logSupabaseError } from "../../_lib/supabase-error";
import { parseProductPostMessage, nullablePrice } from "../../_lib/product-post-parser";

const publishStatuses = ["draft", "live", "over"] as const;

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function queueError(message: string) {
  return { errorMessage: message };
}

function databaseErrorDetails(error: { code?: string; message?: string }) {
  const code = error.code ? ` (${error.code})` : "";
  const detail = error.message ? ` ${error.message}` : "";
  return `${code}${detail}`.slice(0, 500);
}

function priceValue(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function isConfiguredStorageImage(imageUrl: string, storageBucket: string) {
  try {
    const image = new URL(imageUrl);
    const supabase = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    return (
      image.origin === supabase.origin &&
      image.pathname.startsWith(`/storage/v1/object/public/${storageBucket}/`)
    );
  } catch {
    return false;
  }
}

export async function enqueueProductPublishJob(input: {
  id: string;
  imageUrl: string;
  description: string;
  status: string;
  productName: string;
  brand: string;
  platform: string;
  orderPrice: string;
  lessPrice: string;
  rating: string;
}) {
  try {
    const storageBucket = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET;
    if (!storageBucket || !isConfiguredStorageImage(input.imageUrl, storageBucket)) {
      return queueError("The product image is not saved in the configured storage bucket.");
    }
    if (!isUuid(input.id) || !input.description.trim() || input.description.length > 10_000) {
      return queueError("The queued product data is invalid.");
    }
    if (!publishStatuses.includes(input.status as (typeof publishStatuses)[number])) {
      return queueError("Choose a valid product status.");
    }

    const parsed = parseProductPostMessage(input.description);
    const orderPrice = input.orderPrice.trim() ? priceValue(input.orderPrice) : nullablePrice(parsed.orderPrice);
    const lessPrice = input.lessPrice.trim() ? priceValue(input.lessPrice) : nullablePrice(parsed.lessPrice);
    const rating = input.rating.trim() ? Number(input.rating) : null;
    if ((input.orderPrice.trim() && orderPrice === null) || (input.lessPrice.trim() && lessPrice === null)) {
      return queueError("Enter valid non-negative product prices.");
    }
    if (rating !== null && (!Number.isFinite(rating) || rating < 0 || rating > 5)) {
      return queueError("Enter a product rating from 0 to 5.");
    }

    const supabase = await createSupabaseServerClient(AbortSignal.timeout(15_000));
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError) {
      logSupabaseError("Unable to authenticate product queue insertion.", authError);
      return queueError("Unable to verify your admin session for product publishing.");
    }
    if (!user) return queueError("Your admin session is not authorized to enqueue products.");

    const { error } = await supabase.from("product_publish_jobs").insert({
      id: input.id,
      image_url: input.imageUrl,
      description: input.description,
      product_status: input.status,
      product_name: input.productName.trim() || parsed.productName || null,
      brand: input.brand.trim() || parsed.brand || null,
      platform: input.platform.trim() || parsed.platform || null,
      order_price: orderPrice,
      less_price: lessPrice,
      rating,
    });

    if (
      error?.code === "23505" &&
      (
        error.details?.includes(`(id)=(${input.id})`) === true ||
        error.message?.includes("product_publish_jobs_pkey") === true
      )
    ) {
      return { errorMessage: null };
    }
    if (error) {
      logSupabaseError("Unable to enqueue product publishing job.", error);
      return queueError(`The product is saved on this device but could not be added to the server queue.${databaseErrorDetails(error)}`);
    }
    return { errorMessage: null };
  } catch (error) {
    logSupabaseError("Unable to enqueue product publishing job.", error);
    return queueError("The product is saved on this device but could not be added to the server queue.");
  }
}

export async function getProductPublishJobs() {
  try {
    const supabase = await createSupabaseServerClient(AbortSignal.timeout(15_000));
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError) {
      logSupabaseError("Unable to authenticate product queue retrieval.", authError);
      return { errorMessage: "Unable to verify your admin session.", jobs: [] };
    }
    if (!user) return { errorMessage: "Your admin session is not authorized.", jobs: [] };

    const { data, error } = await supabase
      .from("product_publish_jobs")
      .select("id, image_url, description, state, attempts, last_error, created_at, updated_at, published_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) {
      logSupabaseError("Unable to load product publishing queue.", error);
      return {
        errorMessage: `Unable to load the server publishing queue.${databaseErrorDetails(error)}`,
        jobs: [],
      };
    }
    return { errorMessage: null, jobs: data ?? [] };
  } catch (error) {
    logSupabaseError("Unable to load product publishing queue.", error);
    return { errorMessage: "Unable to reach the server publishing queue.", jobs: [] };
  }
}

export async function retryProductPublishJob(id: string) {
  try {
    const { user, isAuthorized } = await getAdminSession(AbortSignal.timeout(15_000));
    if (!user || !isAuthorized) return queueError("Your admin session is not authorized.");
    if (!isUuid(id)) return queueError("The queue item ID is invalid.");

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceRoleKey) {
      return queueError("Queue retry is unavailable because the server service role is not configured.");
    }
    const supabase = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await supabase
      .from("product_publish_jobs")
      .update({
        state: "queued",
        attempts: 0,
        next_attempt_at: new Date().toISOString(),
        locked_until: null,
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("state", "failed")
      .select("id")
      .maybeSingle();
    if (error || !data) {
      logSupabaseError("Unable to retry product publishing job.", error ?? new Error("Queue item not found or is not failed."));
      return queueError("Unable to retry this product. Please try again.");
    }
    return { errorMessage: null };
  } catch (error) {
    logSupabaseError("Unable to retry product publishing job.", error);
    return queueError("Unable to retry this product. Please try again.");
  }
}
