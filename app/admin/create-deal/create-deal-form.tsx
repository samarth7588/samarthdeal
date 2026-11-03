"use client";

import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";

import {
  getOrderFormPostStatus,
  getJayShakthiOrderFormUrl,
  type OrderFormSlotAvailability,
} from "../../_lib/order-form-slots";
import { createSupabaseBrowserClient } from "../../_lib/supabase-browser";
import {
  parseProductPostMessage,
  type ProductPostMetadata,
} from "../../_lib/product-post-parser";
import type { AdminProductPost } from "../../_lib/admin-product-posts";
import { productOrderLinksInDescription } from "../../_lib/product-links";
import { assignProductSerialNumbers } from "../../_lib/product-post-serial-numbers";
import { formatPrice } from "../../_lib/formatters";
import { numericPrice } from "../../_lib/pricing";
import ProductPostSlotCount from "../../_components/product-post-slot-count";
import { createProductPostAction, updateProductPostAction } from "./product-post-actions";
import { initialCreateDealState, normalizeCreateDealState } from "./state";
import { compressProductImage, imageFingerprint } from "./product-image-optimization";

const acceptedTypes = ["image/jpeg", "image/png", "image/webp"];
const maxImageSize = 5 * 1024 * 1024;
const imageUploadTimeoutMs = 20_000;
const emptyMetadata: ProductPostMetadata = {
  productName: "",
  brand: "",
  platform: "",
  orderPrice: "",
  lessPrice: "",
  rating: "",
};

async function timeOperation<T>(label: string, operation: () => Promise<T>): Promise<T> {
  console.time(label);
  try {
    return await operation();
  } finally {
    console.timeEnd(label);
  }
}

function DuplicateProductCard({
  post,
  serialNumber,
  url,
  platform,
}: {
  post: AdminProductPost;
  serialNumber: number;
  url: string;
  platform: string;
}) {
  const price = numericPrice(post.order_price) ?? numericPrice(post.less_price);
  const statusLabel = post.status === "live" ? "LIVE" : post.status === "over" ? "OVER" : "DRAFT";

  return (
    <aside aria-live="polite" className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4">
      <p className="text-sm font-bold text-amber-900">Matching product link already exists. Publishing is still available.</p>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-slate-800">
        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-black">#{serialNumber}</span>
        {price !== null && <span className="font-semibold">{formatPrice(price)}</span>}
        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold">{platform || "Platform not specified"}</span>
        <span className={`rounded-full px-2.5 py-1 text-xs font-black ${post.status === "live" ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"}`}>{statusLabel}</span>
        <a
          aria-label={`Open matching product link on ${platform || "platform not specified"}`}
          className="rounded-full bg-orange-100 px-2.5 py-1 text-xs font-black text-orange-800 hover:bg-orange-200"
          href={url}
          rel="noopener noreferrer"
          target="_blank"
        >
          🔥 Open link
        </a>
      </div>
      <a className="mt-3 block break-all text-xs font-medium text-slate-600 underline underline-offset-2" href={url} rel="noopener noreferrer" target="_blank">{url}</a>
      <ProductPostSlotCount className="mt-2" formUrl={getJayShakthiOrderFormUrl(post.description)} />
    </aside>
  );
}

export default function CreateDealForm({
  post,
  posts = [],
  onSaved,
  onPublished,
}: {
  post?: AdminProductPost;
  posts?: AdminProductPost[];
  onSaved?: () => void;
  onPublished?: () => void;
}) {
  const isEditing = Boolean(post);
  const [state, setState] = useState(initialCreateDealState);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isTakingLong, setIsTakingLong] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);
  const [description, setDescription] = useState(post?.description ?? "");
  const [metadata, setMetadata] = useState<ProductPostMetadata>(() => ({
    productName: post?.product_name ?? "",
    brand: post?.brand ?? "",
    platform: post?.platform ?? "",
    orderPrice: post?.order_price == null ? "" : String(post.order_price),
    lessPrice: post?.less_price == null ? "" : String(post.less_price),
    rating: post?.rating == null ? "" : String(post.rating),
  }));
  const [selectedStatus, setSelectedStatus] = useState<"draft" | "live" | "over">(post?.status ?? "live");
  const [imageUrl, setImageUrl] = useState(post?.image_url ?? "");
  const [previewUrl, setPreviewUrl] = useState<string | null>(post?.image_url ?? null);
  const [uploadState, setUploadState] = useState(post ? "ready" : "idle");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const captionRef = useRef<HTMLTextAreaElement>(null);
  const submissionInProgressRef = useRef(false);
  const imageUploadInProgressRef = useRef(false);
  const uploadedImagesRef = useRef(new Map<string, string>());
  const publishIdRef = useRef<string | null>(null);
  const slotRequestRef = useRef(0);
  const slotAutoStatusAppliedRef = useRef(false);
  const safeState = normalizeCreateDealState(state);
  const storageBucket = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET;
  const editingPostId = post?.id;
  const submittedLinks = productOrderLinksInDescription(description);
  const serialNumbers = assignProductSerialNumbers(posts);
  const duplicateMatch = posts
    .filter((candidate) => candidate.id !== post?.id)
    .flatMap((candidate) => {
      const existingLinks = productOrderLinksInDescription(candidate.description);
      return submittedLinks.flatMap((link) => {
        const existingLink = existingLinks.find((candidateLink) => candidateLink.identity === link.identity);
        return existingLink ? [{ post: candidate, link: existingLink }] : [];
      });
    })[0] ?? null;

  const resetFormState = useCallback(() => {
    formRef.current?.reset();
    setDescription("");
    setMetadata(emptyMetadata);
    setSelectedStatus("live");
    setImageUrl("");
    setPreviewUrl(null);
    setUploadState("idle");
    publishIdRef.current = null;
    slotAutoStatusAppliedRef.current = false;
    setClientError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  useEffect(() => {
    if (!previewUrl?.startsWith("blob:")) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  useEffect(() => {
    const formUrl = getJayShakthiOrderFormUrl(description);
    const requestId = slotRequestRef.current + 1;
    slotRequestRef.current = requestId;

    if (!formUrl) {
      const resetTimer = window.setTimeout(() => {
        if (slotRequestRef.current !== requestId) return;
        if (slotAutoStatusAppliedRef.current) setSelectedStatus(post?.status ?? "live");
        slotAutoStatusAppliedRef.current = false;
      }, 0);
      return () => window.clearTimeout(resetTimer);
    }

    const controller = new AbortController();
    const requestedFormUrl = formUrl;

    async function checkOrderFormSlots() {
      const timingLabel = `product-slot-detection:${crypto.randomUUID()}`;
      console.time(timingLabel);
      try {
        const response = await fetch(
          `/api/product-post-slots?url=${encodeURIComponent(requestedFormUrl)}`,
          { signal: controller.signal },
        );
        if (!response.ok) return;

        const result = (await response.json()) as {
          slots: OrderFormSlotAvailability | null;
        };
        if (slotRequestRef.current !== requestId) return;

        const status = getOrderFormPostStatus(result.slots);
        if (!status || !result.slots) return;

        setSelectedStatus(status);
        slotAutoStatusAppliedRef.current = true;
      } catch {
        // Slot detection is optional and must not interrupt publishing.
      } finally {
        console.timeEnd(timingLabel);
      }
    }

    const timeoutId = window.setTimeout(() => {
      if (slotRequestRef.current !== requestId) return;
      if (slotAutoStatusAppliedRef.current) setSelectedStatus(post?.status ?? "live");
      slotAutoStatusAppliedRef.current = false;
      void checkOrderFormSlots();
    }, 350);
    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [description, post?.status]);

  useEffect(() => {
    if (!editingPostId) return;
    const timer = window.setTimeout(() => {
      captionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      captionRef.current?.focus({ preventScroll: true });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [editingPostId]);

  async function uploadImage(file: File) {
    setClientError(null);
    if (imageUploadInProgressRef.current || submissionInProgressRef.current) return;
    if (!acceptedTypes.includes(file.type)) {
      setClientError("Choose a JPG, PNG, or WebP image.");
      return;
    }
    if (file.size > maxImageSize) {
      setClientError("Images must be 5 MB or smaller.");
      return;
    }

    setPreviewUrl(URL.createObjectURL(file));
    if (fileInputRef.current) fileInputRef.current.value = "";
    setImageUrl("");
    if (!storageBucket) {
      setUploadState("missing-config");
      setClientError("Image upload is unavailable until NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET is configured.");
      return;
    }

    imageUploadInProgressRef.current = true;
    setUploadState("uploading");
    const timingId = crypto.randomUUID();
    console.time(`product-image-upload:${timingId}`);
    try {
      const fingerprint = await timeOperation(
        `product-image-fingerprint:${timingId}`,
        () => imageFingerprint(file),
      );
      const existingUrl = uploadedImagesRef.current.get(fingerprint);
      if (existingUrl) {
        setImageUrl(existingUrl);
        setUploadState("ready");
        return;
      }

      const compressedFile = await timeOperation(
        `product-image-compression:${timingId}`,
        () => compressProductImage(file),
      );
      const extension = compressedFile.type === "image/webp"
        ? "webp"
        : compressedFile.type === "image/png"
          ? "png"
          : "jpg";
      const path = `admin-products/${fingerprint}.${extension}`;
      const supabase = createSupabaseBrowserClient(imageUploadTimeoutMs);
      const { error } = await timeOperation(
        `product-image-storage-upload:${timingId}`,
        () => supabase.storage.from(storageBucket).upload(path, compressedFile, {
          contentType: compressedFile.type,
          cacheControl: "31536000",
          upsert: true,
        }),
      );
      if (error) {
        throw new Error(error.message);
      }

      const { data } = supabase.storage.from(storageBucket).getPublicUrl(path);
      uploadedImagesRef.current.set(fingerprint, data.publicUrl);
      setImageUrl(data.publicUrl);
      setUploadState("ready");
    } catch (error) {
      setUploadState("error");
      const message = error instanceof Error ? error.message : "Unknown image upload error.";
      console.error("Unable to process or upload product image.", error);
      setClientError(`Image upload failed: ${message}`);
    } finally {
      imageUploadInProgressRef.current = false;
      console.timeEnd(`product-image-upload:${timingId}`);
    }
  }

  function updateDescription(nextDescription: string) {
    setDescription(nextDescription);
    setMetadata(nextDescription.trim() ? parseProductPostMessage(nextDescription) : emptyMetadata);
  }

  async function submitProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPublishing || submissionInProgressRef.current) return;

    submissionInProgressRef.current = true;
    setIsPublishing(true);
    setIsTakingLong(false);
    setClientError(null);
    setState(initialCreateDealState);
    const timingId = crypto.randomUUID();
    console.time(`product-publish-client:${timingId}`);
    const slowRequestTimer = window.setTimeout(() => setIsTakingLong(true), 8_000);

    try {
      const formData = new FormData(event.currentTarget);
      publishIdRef.current ??= crypto.randomUUID();
      formData.set("publishId", publishIdRef.current);
      const action = isEditing ? updateProductPostAction : createProductPostAction;
      const result = await action(state, formData);
      setState(result);
      if (result.successMessage) {
        if (isEditing) {
          onSaved?.();
        } else {
          if (result.publishedPost) onPublished?.();
          resetFormState();
        }
      }
    } catch (error) {
      console.error("Unable to submit product post.", error);
      setState({
        errorMessage: "The publishing request could not be completed. Check your connection and try again.",
        successMessage: null,
        fieldErrors: {},
      });
    } finally {
      window.clearTimeout(slowRequestTimer);
      submissionInProgressRef.current = false;
      setIsPublishing(false);
      setIsTakingLong(false);
      console.timeEnd(`product-publish-client:${timingId}`);
    }
  }

  const hasImage = Boolean(imageUrl);
  const hasDescription = Boolean(description.trim());

  return (
    <>
    <form
      ref={formRef}
      className="space-y-8"
      onSubmit={submitProduct}
    >
      {(clientError || safeState.errorMessage) && <p aria-live="polite" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">{clientError || safeState.errorMessage}</p>}
      {safeState.successMessage && <p aria-live="polite" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{safeState.successMessage}</p>}
      <div>
        <label className="text-sm font-bold text-slate-800" htmlFor="productImage">Product image</label>
        <button
          className="mt-2 flex min-h-56 w-full flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50 px-5 text-center transition hover:border-emerald-500 hover:bg-emerald-50/30 focus:outline-none focus:ring-4 focus:ring-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-60"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file) void uploadImage(file); }}
          disabled={isPublishing || uploadState === "uploading"}
          type="button"
        >
          {previewUrl ? <img alt="Selected product preview" className="h-36 max-w-full rounded-xl object-contain" src={previewUrl} /> : <span className="text-4xl">&#128444;</span>}
          <span className="mt-3 text-base font-semibold text-slate-800">{uploadState === "uploading" ? "Uploading image..." : imageUrl ? "Image ready" : "Drag a product image here"}</span>
          <span className="mt-1 text-sm text-slate-500">or tap to choose from your phone</span>
        </button>
        <input ref={fileInputRef} accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={isPublishing || uploadState === "uploading"} id="productImage" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadImage(file); }} type="file" />
        <input name="imageUrl" type="hidden" value={imageUrl} />
        {!storageBucket && <p className="mt-2 text-xs font-medium text-amber-700">Uploads are disabled until a Supabase Storage bucket is configured.</p>}
        {safeState.fieldErrors.imageUrl && <p className="mt-2 text-xs font-medium text-rose-700">{safeState.fieldErrors.imageUrl}</p>}
      </div>

      {post && <input name="postId" type="hidden" value={post.id} />}

      <div>
        <label className="text-sm font-bold text-slate-800" htmlFor="details">Original product description</label>
        <textarea
          ref={captionRef}
          className="mt-2 min-h-44 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/10"
          id="details"
          name="details"
          disabled={isPublishing}
          required
          placeholder="Paste the product links or details here (brand, code, platform, price, mediator, links...)"
          onChange={(event) => {
            updateDescription(event.target.value);
          }}
          value={description}
        />
        {duplicateMatch && (
          <p aria-live="polite" className="mt-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
            ⚠️ A matching product/order link exists below. You can still publish this product.
          </p>
        )}
        {safeState.fieldErrors.details && <p className="mt-2 text-xs font-medium text-rose-700">{safeState.fieldErrors.details}</p>}
      </div>

      <input name="productName" type="hidden" value={metadata.productName} />
      <input name="brand" type="hidden" value={metadata.brand} />
      <input name="platform" type="hidden" value={metadata.platform} />
      <input name="orderPrice" type="hidden" value={metadata.orderPrice} />
      <input name="lessPrice" type="hidden" value={metadata.lessPrice} />
      <input name="rating" type="hidden" value={metadata.rating} />

      <input name="status" type="hidden" value={selectedStatus} />

      <button className="inline-flex h-14 w-full items-center justify-center rounded-2xl bg-slate-950 px-4 text-base font-extrabold uppercase text-white shadow-lg shadow-slate-950/15 transition hover:bg-slate-700 focus:outline-none focus:ring-4 focus:ring-slate-950/20 disabled:cursor-not-allowed disabled:opacity-60" disabled={isPublishing || uploadState === "uploading" || uploadState === "error" || !hasImage || !hasDescription} type="submit">{isPublishing ? (isEditing ? "Saving changes..." : "Publishing...") : (isEditing ? "Save Changes" : "Publish Product")}</button>
      {isPublishing && isTakingLong && <p aria-live="polite" className="text-center text-sm font-medium text-slate-600">{isEditing ? "Saving the product changes" : "Publishing the product"} is taking longer than expected.</p>}
    </form>
    {duplicateMatch && (
      <DuplicateProductCard
        platform={duplicateMatch.link.platform || "Platform not specified"}
        post={duplicateMatch.post}
        serialNumber={serialNumbers.get(duplicateMatch.post.id)!}
        url={duplicateMatch.link.url}
      />
    )}
    </>
  );
}
