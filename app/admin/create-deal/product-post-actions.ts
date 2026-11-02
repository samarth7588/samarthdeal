"use server";

import { revalidatePath } from "next/cache";

import { getAdminSession } from "../../_lib/admin-auth";
import { removeProductImage } from "../../_lib/product-image-storage";
import { createSupabaseServerClient } from "../../_lib/supabase-server";
import { classifySupabaseError, logSupabaseError } from "../../_lib/supabase-error";
import {
  nullablePrice,
  parseProductPostMessage,
} from "../../_lib/product-post-parser";
import type { AdminProductPost } from "../../_lib/admin-product-posts";
import type { CreateDealState } from "./state";

const postStatuses = ["draft", "live", "over"] as const;
type ProductPostStatus = (typeof postStatuses)[number];
const publishTimeoutMs = 20_000;

async function timeOperation<T>(label: string, operation: () => PromiseLike<T>): Promise<T> {
  console.time(label);
  try {
    return await operation();
  } finally {
    console.timeEnd(label);
  }
}

function textValue(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function rawTextValue(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function priceValue(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function validHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function validatePost(formData: FormData, metadata: ReturnType<typeof metadataForPublish>) {
  const imageUrl = textValue(formData, "imageUrl");
  const description = rawTextValue(formData, "details");
  const status = textValue(formData, "status");
  const productName = metadata.productName;
  const brand = metadata.brand;
  const platform = metadata.platform;
  const orderPrice = metadata.orderPrice;
  const lessPrice = metadata.lessPrice;
  const rating = metadata.rating;
  const ratingText = textValue(formData, "rating");
  const validRating = ratingText === "" || (rating !== null && Number.isFinite(rating) && rating >= 0 && rating <= 5);
  const fieldErrors: Record<string, string> = {};

  if (!imageUrl || !validHttpUrl(imageUrl)) fieldErrors.imageUrl = "Upload a valid product image before publishing.";
  if (!description.trim()) fieldErrors.details = "Add a product description before publishing.";
  if (description.length > 10000) fieldErrors.details = "Description must be 10,000 characters or fewer.";
  if (!postStatuses.includes(status as ProductPostStatus)) fieldErrors.status = "Choose a valid post status.";
  if (textValue(formData, "orderPrice") && orderPrice === null) fieldErrors.orderPrice = "Enter a valid non-negative order price.";
  if (textValue(formData, "lessPrice") && lessPrice === null) fieldErrors.lessPrice = "Enter a valid non-negative final price.";
  if (!validRating) fieldErrors.rating = "Enter a rating from 0 to 5.";

  return {
    fieldErrors,
    values: { imageUrl, description, status: status as ProductPostStatus, productName: productName || null, brand: brand || null, platform: platform || null, orderPrice, lessPrice, rating },
  };
}

function unauthorized(message: string): CreateDealState {
  return { errorMessage: message, successMessage: null, fieldErrors: {} };
}

function metadataForPublish(formData: FormData, description: string) {
  const parsed = parseProductPostMessage(description);
  const submittedProductName = textValue(formData, "productName");
  const submittedBrand = textValue(formData, "brand");
  const submittedPlatform = textValue(formData, "platform");
  const submittedOrderPrice = priceValue(textValue(formData, "orderPrice"));
  const submittedLessPrice = priceValue(textValue(formData, "lessPrice"));
  const submittedRatingText = textValue(formData, "rating");
  const submittedRating = submittedRatingText ? Number(submittedRatingText) : null;

  return {
    productName: submittedProductName || parsed.productName || "",
    brand: submittedBrand || parsed.brand || "",
    platform: submittedPlatform || parsed.platform || "",
    orderPrice: submittedOrderPrice ?? nullablePrice(parsed.orderPrice),
    lessPrice: submittedLessPrice ?? nullablePrice(parsed.lessPrice),
    rating: submittedRating ?? null,
  };
}

function insertErrorMessage(error: unknown) {
  const category = classifySupabaseError(error);
  if (category === "rls") return "Supabase denied the product post insert. Confirm your account is an active admin and the product_posts INSERT policy is applied.";
  if (category === "missing-table") return "The product_posts table is missing. Apply 20261002_create_product_posts.sql in Supabase before publishing.";
  if (category === "missing-column") return "The base product_posts columns are missing. Apply 20261002_create_product_posts.sql in Supabase before publishing.";
  if (category === "network") return "Supabase could not be reached while publishing. Check the Supabase URL and network connection.";
  return "We could not publish this product post. Check the server log for the Supabase error code and message.";
}

function unexpectedActionError(error: unknown, operation: "publish" | "update") {
  logSupabaseError(`Unable to ${operation} product post.`, error);
  if (classifySupabaseError(error) === "network") {
    return unauthorized("Supabase did not respond in time. Check your connection and try again.");
  }
  return unauthorized(`We could not ${operation} this product post. Check the server log for details.`);
}

function validPublishId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isDuplicatePublishId(error: unknown, id: string) {
  if (!error || typeof error !== "object") return false;
  const value = error as { code?: unknown; details?: unknown; message?: unknown };
  const details = typeof value.details === "string" ? value.details : "";
  const message = typeof value.message === "string" ? value.message : "";
  return value.code === "23505" && (
    details.includes(`(id)=(${id})`) ||
    message.includes("product_posts_pkey")
  );
}

function publishedPost(id: string, values: ReturnType<typeof validatePost>["values"]): AdminProductPost {
  const now = new Date().toISOString();
  return {
    id,
    image_url: values.imageUrl,
    description: values.description,
    product_name: values.productName,
    brand: values.brand,
    platform: values.platform,
    order_price: values.orderPrice,
    less_price: values.lessPrice,
    rating: values.rating,
    serial_number: null,
    published_at: null,
    status: values.status,
    created_at: now,
    updated_at: now,
  };
}

export async function createProductPostAction(_previousState: CreateDealState, formData: FormData): Promise<CreateDealState> {
  const timeoutSignal = AbortSignal.timeout(publishTimeoutMs);
  const timingId = crypto.randomUUID();
  console.time(`product-publish-server:${timingId}`);
  try {
    const result = await createProductPost(formData, timeoutSignal, timingId);
    if (timeoutSignal.aborted) {
      return unauthorized("Publishing took too long. Check the product list before trying again.");
    }
    return result;
  } catch (error) {
    if (timeoutSignal.aborted) {
      logSupabaseError("Product publishing timed out.", error);
      return unauthorized("Publishing took too long. Check the product list before trying again.");
    }
    return unexpectedActionError(error, "publish");
  } finally {
    console.timeEnd(`product-publish-server:${timingId}`);
  }
}

async function createProductPost(formData: FormData, timeoutSignal: AbortSignal, timingId: string): Promise<CreateDealState> {
  const { user, isAuthorized } = await timeOperation(
    `product-publish-admin-auth:${timingId}`,
    () => getAdminSession(timeoutSignal),
  );
  if (!user) return unauthorized("Your session has expired. Please sign in again.");
  if (!isAuthorized) return unauthorized("You are not authorized to publish product posts.");

  const description = rawTextValue(formData, "details");
  console.time(`product-publish-caption-parse:${timingId}`);
  const extracted = metadataForPublish(formData, description);
  console.timeEnd(`product-publish-caption-parse:${timingId}`);
  const { fieldErrors, values } = validatePost(formData, extracted);
  if (Object.keys(fieldErrors).length > 0) return { errorMessage: "Please correct the highlighted fields.", successMessage: null, fieldErrors };

  const publishId = textValue(formData, "publishId");
  if (!validPublishId(publishId)) {
    return unauthorized("The publishing request is invalid. Please try again.");
  }

  const storageBucket = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET;
  if (!storageBucket || !values.imageUrl.includes(`/storage/v1/object/public/${storageBucket}/`)) {
    return unauthorized("The image must be uploaded to the configured product-images bucket before publishing.");
  }

  const supabase = await timeOperation(
    `product-publish-supabase-client:${timingId}`,
    () => createSupabaseServerClient(timeoutSignal),
  );
  const fullPayload = {
    id: publishId,
    image_url: values.imageUrl,
    description: values.description,
    status: values.status,
    product_name: values.productName,
    brand: values.brand,
    platform: values.platform,
    order_price: values.orderPrice,
    less_price: values.lessPrice,
    rating: values.rating,
  };
  const fullAttempt = await timeOperation(
    `product-publish-database-insert:${timingId}`,
    () => supabase.from("product_posts").insert(fullPayload),
  );
  let error = fullAttempt.error;

  if (error && classifySupabaseError(error) === "missing-column") {
    const metadataPayload = {
      id: publishId,
      image_url: values.imageUrl,
      description: values.description,
      status: values.status,
      product_name: values.productName,
      brand: values.brand,
      platform: values.platform,
      order_price: values.orderPrice,
      less_price: values.lessPrice,
    };
    const metadataAttempt = await timeOperation(
      `product-publish-database-metadata-fallback:${timingId}`,
      () => supabase.from("product_posts").insert(metadataPayload),
    );
    error = metadataAttempt.error;
  }

  if (error && classifySupabaseError(error) === "missing-column") {
    const baseAttempt = await timeOperation(
      `product-publish-database-base-fallback:${timingId}`,
      () => supabase.from("product_posts").insert({
        id: publishId,
        image_url: values.imageUrl,
        description: values.description,
        status: values.status,
      }),
    );
    error = baseAttempt.error;
  }

  if (error && isDuplicatePublishId(error, publishId)) {
    revalidatePath("/");
    if (values.status !== "draft") revalidatePath(`/products/${publishId}`);
    return {
      errorMessage: null,
      successMessage: "Product published successfully.",
      fieldErrors: {},
      publishedPost: publishedPost(publishId, values),
    };
  }

  if (error) {
    logSupabaseError("Unable to create product post.", error);
    return unauthorized(insertErrorMessage(error));
  }

  revalidatePath("/");
  if (values.status !== "draft") revalidatePath(`/products/${publishId}`);
  return {
    errorMessage: null,
    successMessage: "Product published successfully.",
    fieldErrors: {},
    publishedPost: publishedPost(publishId, values),
  };
}

export async function updateProductPostAction(_previousState: CreateDealState, formData: FormData): Promise<CreateDealState> {
  try {
    return await updateProductPost(formData);
  } catch (error) {
    return unexpectedActionError(error, "update");
  }
}

async function updateProductPost(formData: FormData): Promise<CreateDealState> {
  const { user, isAuthorized } = await getAdminSession();
  if (!user) return unauthorized("Your session has expired. Please sign in again.");
  if (!isAuthorized) return unauthorized("You are not authorized to update product posts.");

  const id = textValue(formData, "postId");
  const description = rawTextValue(formData, "details");
  const extracted = metadataForPublish(formData, description);
  const { fieldErrors, values } = validatePost(formData, extracted);
  if (!id) return unauthorized("A product post id is required.");
  if (Object.keys(fieldErrors).length > 0) return { errorMessage: "Please correct the highlighted fields.", successMessage: null, fieldErrors };

  const supabase = await createSupabaseServerClient();
  const { data: existingPost, error: existingPostError } = await supabase
    .from("product_posts")
    .select("status, image_url")
    .eq("id", id)
    .maybeSingle();
  if (existingPostError) {
    logSupabaseError("Unable to load product post before updating.", existingPostError);
    return unauthorized("We could not load this product post. Check the server log for the Supabase error.");
  }
  if (!existingPost) return unauthorized("That product post could not be found.");
  const storageBucket = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET;
  if (values.imageUrl !== existingPost.image_url && (!storageBucket || !values.imageUrl.includes(`/storage/v1/object/public/${storageBucket}/`))) {
    return unauthorized("The replacement image must be uploaded to the configured product-images bucket.");
  }

  const payload = {
    image_url: values.imageUrl,
    description: values.description,
    status: values.status,
    product_name: values.productName,
    brand: values.brand,
    platform: values.platform,
    order_price: values.orderPrice,
    less_price: values.lessPrice,
    rating: values.rating,
  };
  const { data: updatedPost, error } = await supabase
    .from("product_posts")
    .update(payload)
    .eq("id", id)
    .select("id, image_url, description, status, product_name, brand, platform, order_price, less_price, rating")
    .maybeSingle();

  if (error) {
    logSupabaseError("Unable to update product post metadata.", error);
    return unauthorized("We could not update this product post. Check the server log for the Supabase error.");
  }
  if (!updatedPost) {
    logSupabaseError("Product post update returned no row.", { code: "UPDATE_NO_ROW", message: `No product post matched id ${id}.` });
    return unauthorized("The product post could not be verified after saving.");
  }
  const imageRemovalError = existingPost.image_url !== values.imageUrl && storageBucket
    ? await removeProductImage(supabase, existingPost.image_url, storageBucket)
    : null;
  if (imageRemovalError) {
    logSupabaseError("Product post was updated, but the previous product image could not be removed.", imageRemovalError, "warn");
  }
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/admin/create-deal");
  revalidatePath(`/products/${id}`);
  return {
    errorMessage: null,
    successMessage: imageRemovalError
      ? "Product details were updated, but the previous image could not be removed from storage."
      : "Product details updated successfully.",
    fieldErrors: {},
  };
}

export async function deleteProductPostAction(id: string) {
  const { user, isAuthorized } = await getAdminSession();
  if (!user || !isAuthorized) return { errorMessage: "You are not authorized to delete product posts." };
  if (!id) return { errorMessage: "A product post id is required." };

  const supabase = await createSupabaseServerClient();
  const { data: post, error: lookupError } = await supabase.from("product_posts").select("image_url").eq("id", id).maybeSingle();
  if (lookupError || !post) return { errorMessage: "That product post could not be found." };
  const storageBucket = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET;
  if (storageBucket) {
    const imageError = await removeProductImage(supabase, post.image_url, storageBucket);
    if (imageError) return { errorMessage: "The product image could not be removed, so the product was not deleted." };
  }
  const { error } = await supabase.from("product_posts").delete().eq("id", id);
  if (error) return { errorMessage: "We could not delete this product post." };

  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/admin/create-deal");
  revalidatePath(`/products/${id}`);
  return { errorMessage: null };
}

export async function markProductPostOverAction(id: string) {
  const { user, isAuthorized } = await getAdminSession();
  if (!user || !isAuthorized) return { errorMessage: "You are not authorized to update product posts." };
  if (!id) return { errorMessage: "A product post id is required." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("product_posts").update({ status: "over" }).eq("id", id);
  if (error) return { errorMessage: "We could not mark this product post as over." };

  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath(`/products/${id}`);
  return { errorMessage: null };
}

export async function setProductPostStatusAction(
  id: string,
  status: "live" | "over",
) {
  const { user, isAuthorized } = await getAdminSession();
  if (!user || !isAuthorized) return { errorMessage: "You are not authorized to update product posts." };
  if (!id) return { errorMessage: "A product post id is required." };

  const supabase = await createSupabaseServerClient();
  const { data: updatedPost, error } = await supabase
    .from("product_posts")
    .update({ status })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) {
    logSupabaseError("Unable to change product post status.", error);
    return { errorMessage: "We could not update this product post status." };
  }
  if (!updatedPost) {
    logSupabaseError("Product post status update returned no row.", { code: "UPDATE_NO_ROW", message: `No product post matched id ${id}.` });
    return { errorMessage: "That product post could not be found." };
  }

  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/admin/create-deal");
  revalidatePath(`/products/${id}`);
  return { errorMessage: null };
}

export type ProductPostActionState = {
  errorMessage: string | null;
};

export async function deleteProductPostFormAction(
  _previousState: ProductPostActionState,
  formData: FormData,
): Promise<ProductPostActionState> {
  return deleteProductPostAction(textValue(formData, "postId"));
}

export async function markProductPostOverFormAction(formData: FormData) {
  await markProductPostOverAction(textValue(formData, "postId"));
}
export async function setProductPostStatusFormAction(formData: FormData) {
  const id = textValue(formData, "postId");
  const status = textValue(formData, "status");
  if (status !== "live" && status !== "over") return;
  await setProductPostStatusAction(id, status);
}
