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
import type { CreateDealState } from "./state";

const postStatuses = ["draft", "live", "over"] as const;
type ProductPostStatus = (typeof postStatuses)[number];

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

function validatePost(formData: FormData) {
  const imageUrl = textValue(formData, "imageUrl");
  const description = rawTextValue(formData, "details");
  const status = textValue(formData, "status");
  const productName = textValue(formData, "productName");
  const brand = textValue(formData, "brand");
  const platform = textValue(formData, "platform");
  const orderPrice = priceValue(textValue(formData, "orderPrice"));
  const lessPrice = priceValue(textValue(formData, "lessPrice"));
  const ratingText = textValue(formData, "rating");
  const rating = ratingText ? Number(ratingText) : null;
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

async function metadataForPublish(formData: FormData, description: string) {
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

export async function createProductPostAction(_previousState: CreateDealState, formData: FormData): Promise<CreateDealState> {
  try {
    return await createProductPost(formData);
  } catch (error) {
    return unexpectedActionError(error, "publish");
  }
}

async function createProductPost(formData: FormData): Promise<CreateDealState> {
  const { user, isAuthorized } = await getAdminSession();
  if (!user) return unauthorized("Your session has expired. Please sign in again.");
  if (!isAuthorized) return unauthorized("You are not authorized to publish product posts.");

  const description = rawTextValue(formData, "details");
  const extracted = await metadataForPublish(formData, description);
  const enriched = new FormData();
  for (const [name, value] of formData.entries()) enriched.append(name, value);
  enriched.set("details", description);
  enriched.set("productName", extracted.productName);
  enriched.set("brand", extracted.brand ?? "");
  enriched.set("platform", extracted.platform ?? "");
  enriched.set("orderPrice", extracted.orderPrice === null ? "" : String(extracted.orderPrice));
  enriched.set("lessPrice", extracted.lessPrice === null ? "" : String(extracted.lessPrice));
  enriched.set("rating", extracted.rating === null ? "" : String(extracted.rating));
  const { fieldErrors, values } = validatePost(enriched);
  if (Object.keys(fieldErrors).length > 0) return { errorMessage: "Please correct the highlighted fields.", successMessage: null, fieldErrors };

  const storageBucket = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET;
  if (!storageBucket || !values.imageUrl.includes(`/storage/v1/object/public/${storageBucket}/`)) {
    return unauthorized("The image must be uploaded to the configured product-images bucket before publishing.");
  }

  const supabase = await createSupabaseServerClient();
  const fullPayload = {
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
  let { error } = await supabase.from("product_posts").insert(fullPayload);

  if (error && classifySupabaseError(error) === "missing-column") {
    const metadataPayload = {
      image_url: values.imageUrl,
      description: values.description,
      status: values.status,
      product_name: values.productName,
      brand: values.brand,
      platform: values.platform,
      order_price: values.orderPrice,
      less_price: values.lessPrice,
    };
    const metadataAttempt = await supabase.from("product_posts").insert(metadataPayload);
    error = metadataAttempt.error;
  }

  if (error && classifySupabaseError(error) === "missing-column") {
    const baseAttempt = await supabase.from("product_posts").insert({
      image_url: values.imageUrl,
      description: values.description,
      status: values.status,
    });
    error = baseAttempt.error;
  }

  if (error) {
    logSupabaseError("Unable to create product post.", error);
    return unauthorized(insertErrorMessage(error));
  }

  return { errorMessage: null, successMessage: "Product published successfully.", fieldErrors: {} };
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
  const extracted = await metadataForPublish(formData, description);
  const enriched = new FormData();
  for (const [name, value] of formData.entries()) enriched.append(name, value);
  enriched.set("details", description);
  enriched.set("productName", extracted.productName);
  enriched.set("brand", extracted.brand ?? "");
  enriched.set("platform", extracted.platform ?? "");
  enriched.set("orderPrice", extracted.orderPrice === null ? "" : String(extracted.orderPrice));
  enriched.set("lessPrice", extracted.lessPrice === null ? "" : String(extracted.lessPrice));
  enriched.set("rating", extracted.rating === null ? "" : String(extracted.rating));
  const { fieldErrors, values } = validatePost(enriched);
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
