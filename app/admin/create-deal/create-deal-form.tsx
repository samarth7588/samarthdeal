"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";

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

const acceptedTypes = ["image/jpeg", "image/png", "image/webp"];
const maxImageSize = 5 * 1024 * 1024;
const emptyMetadata: ProductPostMetadata = {
  productName: "",
  brand: "",
  platform: "",
  orderPrice: "",
  lessPrice: "",
  rating: "",
};

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
        <span className="font-bold">{post.product_name || "Product"}</span>
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
}: {
  post?: AdminProductPost;
  posts?: AdminProductPost[];
  onSaved?: () => void;
}) {
  const isEditing = Boolean(post);
  const [state, formAction, isPending] = useActionState(
    isEditing ? updateProductPostAction : createProductPostAction,
    initialCreateDealState,
  );
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
  const [slotDetectionState, setSlotDetectionState] = useState<"idle" | "checking" | "ready" | "unavailable">("idle");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const captionRef = useRef<HTMLTextAreaElement>(null);
  const publishButtonRef = useRef<HTMLButtonElement>(null);
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
    setSlotDetectionState("idle");
    slotAutoStatusAppliedRef.current = false;
    setClientError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  useEffect(() => {
    const formUrl = getJayShakthiOrderFormUrl(description);
    const requestId = slotRequestRef.current + 1;
    slotRequestRef.current = requestId;

    if (!formUrl) {
      const resetTimer = window.setTimeout(() => {
        if (slotRequestRef.current !== requestId) return;
        setSlotDetectionState("idle");
        if (slotAutoStatusAppliedRef.current) setSelectedStatus(post?.status ?? "live");
        slotAutoStatusAppliedRef.current = false;
      }, 0);
      return () => window.clearTimeout(resetTimer);
    }

    const controller = new AbortController();
    const requestedFormUrl = formUrl;

    async function checkOrderFormSlots() {
      try {
        const response = await fetch(
          `/api/product-post-slots?url=${encodeURIComponent(requestedFormUrl)}`,
          { signal: controller.signal },
        );
        if (!response.ok) {
          if (slotRequestRef.current === requestId) {
            setSlotDetectionState("unavailable");
          }
          return;
        }

        const result = (await response.json()) as {
          slots: OrderFormSlotAvailability | null;
        };
        if (slotRequestRef.current !== requestId) return;

        const status = getOrderFormPostStatus(result.slots);
        if (!status || !result.slots) {
          setSlotDetectionState("unavailable");
          return;
        }

        setSelectedStatus(status);
        slotAutoStatusAppliedRef.current = true;
        setSlotDetectionState("ready");
      } catch {
        if (!controller.signal.aborted && slotRequestRef.current === requestId) {
          setSlotDetectionState("unavailable");
        }
      }
    }

    const timeoutId = window.setTimeout(() => {
      if (slotRequestRef.current !== requestId) return;
      setSlotDetectionState("checking");
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
    if (!safeState.successMessage || isEditing) return;
    const resetTimer = window.setTimeout(resetFormState, 0);
    return () => window.clearTimeout(resetTimer);
  }, [isEditing, resetFormState, safeState.successMessage]);

  useEffect(() => {
    if (!safeState.successMessage || !isEditing) return;
    onSaved?.();
  }, [isEditing, onSaved, safeState.successMessage]);

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
    if (!acceptedTypes.includes(file.type)) {
      setClientError("Choose a JPG, PNG, or WebP image.");
      return;
    }
    if (file.size > maxImageSize) {
      setClientError("Images must be 5 MB or smaller.");
      return;
    }

    setPreviewUrl(URL.createObjectURL(file));
    if (!storageBucket) {
      setUploadState("missing-config");
      setClientError("Image upload is unavailable until NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET is configured.");
      return;
    }

    const supabase = createSupabaseBrowserClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      setClientError("Your session has expired. Please sign in again.");
      return;
    }

    const { data: adminUser, error: authorizationError } = await supabase
      .from("admin_users")
      .select("user_id")
      .eq("user_id", authData.user.id)
      .eq("is_active", true)
      .maybeSingle();
    if (authorizationError || !adminUser) {
      setClientError("You are not authorized to upload product images.");
      return;
    }

    setUploadState("uploading");
    const path = `admin-products/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
    const { error } = await supabase.storage.from(storageBucket).upload(path, file, { contentType: file.type, upsert: false });
    if (error) {
      setUploadState("error");
      setClientError(`Image upload failed: ${error.message}`);
      return;
    }

    const { data } = supabase.storage.from(storageBucket).getPublicUrl(path);
    setImageUrl(data.publicUrl);
    setUploadState("ready");
  }

  function updateDescription(nextDescription: string) {
    setDescription(nextDescription);
    setMetadata(nextDescription.trim() ? parseProductPostMessage(nextDescription) : emptyMetadata);
  }

  const hasImage = Boolean(imageUrl);
  const hasDescription = Boolean(description.trim());

  return (
    <>
    <form
      ref={formRef}
      action={formAction}
      className="space-y-8"
      onSubmit={(event) => {
        if (event.nativeEvent.submitter !== publishButtonRef.current) event.preventDefault();
      }}
    >
      {(clientError || safeState.errorMessage) && <p aria-live="polite" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">{clientError || safeState.errorMessage}</p>}
      {safeState.successMessage && <p aria-live="polite" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{safeState.successMessage}</p>}
      <div>
        <label className="text-sm font-bold text-slate-800" htmlFor="productImage">Product image</label>
        <button
          className="mt-2 flex min-h-56 w-full flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50 px-5 text-center transition hover:border-emerald-500 hover:bg-emerald-50/30 focus:outline-none focus:ring-4 focus:ring-emerald-500/15"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file) void uploadImage(file); }}
          type="button"
        >
          {previewUrl ? <img alt="Selected product preview" className="h-36 max-w-full rounded-xl object-contain" src={previewUrl} /> : <span className="text-4xl">&#128444;</span>}
          <span className="mt-3 text-base font-semibold text-slate-800">{uploadState === "uploading" ? "Uploading image..." : "Drag a product image here"}</span>
          <span className="mt-1 text-sm text-slate-500">or tap to choose from your phone</span>
        </button>
        <input ref={fileInputRef} accept="image/jpeg,image/png,image/webp" className="sr-only" id="productImage" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadImage(file); }} type="file" />
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

      <button ref={publishButtonRef} className="inline-flex h-14 w-full items-center justify-center rounded-2xl bg-slate-950 px-4 text-base font-extrabold uppercase text-white shadow-lg shadow-slate-950/15 transition hover:bg-slate-700 focus:outline-none focus:ring-4 focus:ring-slate-950/20 disabled:cursor-not-allowed disabled:opacity-60" disabled={isPending || uploadState === "uploading" || slotDetectionState === "checking" || !hasImage || !hasDescription} type="submit">{isPending ? (isEditing ? "Saving changes..." : "Publishing product...") : (isEditing ? "Save Changes" : "Publish Product")}</button>
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
