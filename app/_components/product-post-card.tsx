import { memo, useCallback } from "react";
import Link from "next/link";

import type { ProductPost } from "../_lib/product-posts";
import { formatDate, formatPrice } from "../_lib/formatters";
import { numericPrice } from "../_lib/pricing";
import { productPlatformLink } from "../_lib/product-links";
import ProductPostSlotCount from "./product-post-slot-count";

function ProductPostCard({
  post,
  serialNumber,
  status = post.status,
  onStatusDetected,
}: {
  post: ProductPost;
  serialNumber: number;
  status?: "live" | "over";
  onStatusDetected?: (postId: string, status: "live" | "over", formUrl: string) => void;
}) {
  const orderPrice = numericPrice(post.order_price);
  const lessPrice = numericPrice(post.less_price);
  const isLive = status === "live";
  const detailUrl = `/products/${post.id}`;
  const productLink = productPlatformLink(post.description, post.platform);
  const hasRatingKeyword = /rating|regular rating|rating deal/i.test(post.description);
  const handleStatusDetected = useCallback((detectedStatus: "live" | "over") => {
    if (post.order_form_url) {
      onStatusDetected?.(post.id, detectedStatus, post.order_form_url);
    }
  }, [onStatusDetected, post.id, post.order_form_url]);

  return (
    <article className="group flex min-h-[132px] flex-row overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm transition duration-300 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lg hover:shadow-slate-900/10 md:min-h-0 md:flex-col">
      <div className="relative flex w-[38%] shrink-0 items-center justify-center overflow-hidden bg-gradient-to-br from-slate-100 via-[#f8f7fb] to-[#eef5f5] p-1.5 sm:p-2 md:aspect-[4/3] md:w-auto md:p-3">
        <Link
          aria-label={`View product ${serialNumber}`}
          className="group/image flex h-full w-full items-center justify-center rounded-2xl focus:outline-none focus:ring-4 focus:ring-slate-950/20"
          href={detailUrl}
        >
          <img
            alt="Product deal"
            className="h-full w-full object-contain transition duration-500 group-hover/image:scale-105"
            decoding="async"
            height={1600}
            loading="lazy"
            src={post.image_url}
            width={1600}
          />
        </Link>

        <span
          className={`absolute left-2 top-2 rounded-full px-2 py-1 text-[9px] font-black tracking-[0.1em] shadow-sm md:left-4 md:top-4 md:px-3 md:py-1.5 md:text-[10px] ${
            isLive ? "bg-emerald-500 text-white" : "bg-slate-800 text-white"
          }`}
        >
          {isLive ? "LIVE" : "OVER"}
        </span>
      </div>

      <div className="flex min-w-0 flex-1 flex-col p-2 sm:p-3 md:p-4">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="shrink-0 rounded-full bg-[#f3f1e8] px-2.5 py-1.5 text-xs font-black text-slate-950 md:px-3 md:py-2 md:text-sm">
            #{serialNumber}
          </span>
          {productLink?.platform && (
            productLink.url ? (
              <a
                aria-label={`Open ${productLink.platform} product link`}
                className="inline-flex max-w-full items-center gap-1 truncate rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold text-blue-800 transition hover:bg-blue-100 focus:outline-none focus:ring-4 focus:ring-blue-500/20 md:text-xs"
                href={productLink.url}
                rel="noopener noreferrer"
                target="_blank"
                title={`Open ${productLink.platform} product link`}
              >
                {productLink.platform} <span aria-hidden="true">🔥</span>
              </a>
            ) : (
              <span className="inline-flex max-w-full items-center gap-1 truncate rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold text-blue-800 md:text-xs">
                {productLink.platform} <span aria-hidden="true">🔥</span>
              </span>
            )
          )}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {orderPrice !== null && (
            <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-black text-emerald-700">
              {formatPrice(orderPrice)}
            </span>
          )}
          {lessPrice !== null && (
            <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-black text-slate-700">
              Less {formatPrice(lessPrice)}
            </span>
          )}
          {hasRatingKeyword && (
            <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-amber-700">
              ⭐ RATING
            </span>
          )}
        </div>

        <div className="mt-2 min-h-5">
          <ProductPostSlotCount
            className="mt-0 md:mt-0"
            currentStatus={status}
            formUrl={post.order_form_url}
            onStatusDetected={handleStatusDetected}
          />
        </div>

        <div className="mt-auto flex flex-col gap-1.5 pt-2 md:pt-3">
          <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500 md:text-[11px]">
            Posted {formatDate(post.created_at)}
          </p>
          <Link
            className="inline-flex min-h-10 w-full items-center justify-center rounded-full bg-gradient-to-r from-orange-500 to-amber-500 px-3 text-xs font-bold text-white shadow-sm transition hover:from-orange-600 hover:to-amber-600 focus:outline-none focus:ring-4 focus:ring-orange-500/25"
            href={detailUrl}
          >
            VIEW PRODUCT
          </Link>
        </div>
      </div>
    </article>
  );
}

export default memo(ProductPostCard);