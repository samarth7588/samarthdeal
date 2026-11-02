"use client";

import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { AdminProductPost } from "../_lib/admin-product-posts";
import CreateDealForm from "./create-deal/create-deal-form";
import DeleteProductPostButton from "./delete-product-post-button";
import {
  deleteProductPostFormAction,
  setProductPostStatusAction,
} from "./create-deal/product-post-actions";
import { getJayShakthiOrderFormUrl } from "../_lib/order-form-slots";
import { productRetailerLinks } from "../_lib/product-links";
import { assignProductSerialNumbers } from "../_lib/product-post-serial-numbers";
import { formatPrice } from "../_lib/formatters";
import { numericPrice } from "../_lib/pricing";
import ProductPostSlotCount from "../_components/product-post-slot-count";

function StatusButton({
  postId,
  status,
}: {
  postId: string;
  status: "live" | "over";
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function updateStatus() {
    startTransition(async () => {
      const result = await setProductPostStatusAction(postId, status);
      if (result.errorMessage) {
        setErrorMessage(result.errorMessage);
        return;
      }
      setErrorMessage(null);
      router.refresh();
    });
  }

  return (
    <>
      <button
        className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-slate-400 disabled:opacity-50"
        disabled={isPending}
        onClick={updateStatus}
        type="button"
      >
        {isPending ? "Updating..." : status === "over" ? "Make OVER" : "Make LIVE"}
      </button>
      {errorMessage && <span className="w-full text-xs text-rose-700">{errorMessage}</span>}
    </>
  );
}

export default function AdminProductManager({
  posts,
  errorMessage,
}: {
  posts: AdminProductPost[];
  errorMessage: string | null;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [autoStatusError, setAutoStatusError] = useState<string | null>(null);
  const statusUpdatesInProgress = useRef(new Set<string>());
  const normalizedQuery = query.trim().toLowerCase();
  const editingPost = posts.find((post) => post.id === editingPostId) ?? null;
  const serialNumbers = useMemo(() => assignProductSerialNumbers(posts), [posts]);
  const matchesSearch = useCallback((post: AdminProductPost) => {
    if (!normalizedQuery) return true;
    return [
      post.description,
      post.platform,
      post.order_price,
      post.less_price,
      post.image_url,
    ]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery);
  }, [normalizedQuery]);
  const livePosts = useMemo(
    () => posts.filter((post) => post.status === "live" && matchesSearch(post)),
    [matchesSearch, posts],
  );
  const overPosts = useMemo(
    () => posts.filter((post) => post.status === "over" && matchesSearch(post)),
    [matchesSearch, posts],
  );
  const draftPosts = useMemo(
    () => posts.filter((post) => post.status === "draft" && matchesSearch(post)),
    [matchesSearch, posts],
  );
  const onSaved = useCallback(() => {
    setEditingPostId(null);
    router.refresh();
  }, [router]);
  const syncAutoDetectedStatus = useCallback(async (
    postId: string,
    status: "live" | "over",
  ) => {
    if (statusUpdatesInProgress.current.has(postId)) return;
    statusUpdatesInProgress.current.add(postId);
    try {
      const result = await setProductPostStatusAction(postId, status);
      if (result.errorMessage) {
        setAutoStatusError(result.errorMessage);
        return;
      }
      setAutoStatusError(null);
      router.refresh();
    } catch (error) {
      setAutoStatusError(
        error instanceof Error
          ? error.message
          : "The automatically detected product status could not be updated.",
      );
    } finally {
      statusUpdatesInProgress.current.delete(postId);
    }
  }, [router]);

  function renderProducts(products: AdminProductPost[]) {
    return products.map((post) => {
      const formUrl = getJayShakthiOrderFormUrl(post.description);
      const productLink = productRetailerLinks(post.description)[0] ?? null;
      const serialNumber = serialNumbers.get(post.id)!;

      return (
      <article
        className="my-3 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
        key={post.id}
      >
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="relative h-20 w-20 shrink-0">
          <a
            aria-label={`View image for product ${serialNumber}`}
            className="flex h-full w-full items-center justify-center overflow-hidden rounded-xl bg-slate-50 ring-1 ring-inset ring-slate-200 focus:outline-none focus:ring-4 focus:ring-blue-500/20"
            href={post.image_url}
            rel="noopener noreferrer"
            target="_blank"
          >
            <img
              alt={`Product ${serialNumber}`}
              className="h-full w-full object-contain"
              loading="lazy"
              src={post.image_url}
            />
          </a>
          <span
            className={`absolute left-1 top-1 rounded-full px-2 py-1 text-[9px] font-black tracking-[0.1em] shadow-sm ${
              post.status === "live"
                ? "bg-emerald-500 text-white"
                : post.status === "over"
                  ? "bg-slate-800 text-white"
                  : "bg-amber-500 text-white"
            }`}
          >
            {post.status.toUpperCase()}
          </span>
          </div>
          <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-800">
              #{serialNumber}
            </span>
            <h4 className="min-w-0 break-words text-sm font-bold text-slate-950">
              {post.product_name || "Product"}
            </h4>
            {numericPrice(post.order_price) !== null && (
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-800">
                Order {formatPrice(post.order_price)}
              </span>
            )}
            {numericPrice(post.less_price) !== null && (
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">
                Less {formatPrice(post.less_price)}
              </span>
            )}
            {productLink?.platform && (
              <a
                aria-label={`Open ${productLink.platform} product link`}
                className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-800 transition hover:bg-blue-100"
                href={productLink.url}
                rel="noopener noreferrer"
                target="_blank"
                title={`Open ${productLink.platform} product link`}
              >
                {productLink.platform} <span aria-hidden="true">🔥</span>
              </a>
            )}
          </div>
          <ProductPostSlotCount
            className="mt-2"
            currentStatus={post.status}
            formUrl={formUrl}
            onStatusDetected={(status) => void syncAutoDetectedStatus(post.id, status)}
          />
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
            onClick={() => {
              setEditingPostId(post.id);
              window.setTimeout(() => {
                document.getElementById("publish-product-form")?.scrollIntoView({
                  behavior: "smooth",
                  block: "start",
                });
              }, 0);
            }}
            type="button"
          >
            Edit
          </button>
          <StatusButton
            postId={post.id}
            status={post.status === "live" ? "over" : "live"}
          />
          <DeleteProductPostButton
            deleteAction={deleteProductPostFormAction}
            postId={post.id}
            productName={null}
          />
        </div>
      </article>
      );
    });
  }

  const matchCount = livePosts.length + overPosts.length + draftPosts.length;

  return (
    <>
      <section
        className="mt-8 scroll-mt-6 rounded-3xl border border-slate-200/80 bg-white p-6 shadow-xl shadow-slate-900/5 sm:p-8"
        id="publish-product-form"
      >
          <p className="text-xs font-black uppercase tracking-[0.14em] text-emerald-700">{editingPost ? "Edit" : "Publish"}</p>
          <h2 className="mt-3 text-2xl font-black tracking-tight">{editingPost ? "Edit product" : "Publish a product"}</h2>
          {editingPost && (
          <button
            className="mt-2 text-sm font-bold text-slate-600 underline underline-offset-4 hover:text-slate-950"
            onClick={() => setEditingPostId(null)}
            type="button"
          >
            Cancel editing
          </button>
          )}
          <CreateDealForm
            key={editingPost?.id ?? "new-product"}
            onSaved={onSaved}
            post={editingPost ?? undefined}
            posts={posts}
          />
      </section>

      <section className="mt-8 rounded-3xl border border-slate-200/80 bg-white p-6 shadow-xl shadow-slate-900/5 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-emerald-700">Published products</p>
            <h2 className="mt-3 text-2xl font-black tracking-tight">Manage products</h2>
          </div>
        </div>
        {autoStatusError && <p aria-live="polite" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{autoStatusError}</p>}
        <label className="relative mt-5 block w-full">
          <span className="sr-only">Search managed products</span>
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="6" />
            <path strokeLinecap="round" d="m20 20-4.35-4.35" />
          </svg>
          <input
            className="h-12 w-full rounded-2xl border border-slate-300 bg-slate-50 py-3 pl-12 pr-4 text-sm text-slate-950 outline-none transition placeholder:text-slate-500 hover:border-blue-400 focus:border-blue-500 focus:bg-white focus:shadow-[0_0_0_4px_rgba(59,130,246,0.14)]"
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Search captions, links, platforms or prices..."
            type="search"
            value={query}
          />
        </label>
        {errorMessage ? (
          <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">{errorMessage}</p>
        ) : matchCount === 0 ? (
          <p className="mt-5 text-sm text-slate-500">
            {normalizedQuery ? "No products found." : "No product posts have been published yet."}
          </p>
        ) : (
          <div className="mt-6">
            {livePosts.length > 0 && (
              <section>
                <h3 className="border-b border-slate-100 pb-2 text-sm font-black uppercase tracking-wide text-emerald-700">Live Deals</h3>
                {renderProducts(livePosts)}
              </section>
            )}
            {overPosts.length > 0 && (
              <section className="mt-6">
                <h3 className="border-b border-slate-100 pb-2 text-sm font-black uppercase tracking-wide text-slate-600">Over Deals</h3>
                {renderProducts(overPosts)}
              </section>
            )}
            {draftPosts.length > 0 && (
              <section className="mt-6">
                <h3 className="border-b border-slate-100 pb-2 text-sm font-black uppercase tracking-wide text-amber-700">Drafts</h3>
                {renderProducts(draftPosts)}
              </section>
            )}
          </div>
        )}
      </section>
    </>
  );
}
