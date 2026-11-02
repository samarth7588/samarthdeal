import Link from "next/link";
import { notFound } from "next/navigation";

import DescriptionWithLinks from "../../_components/description-with-links";
import { extractDealInformation, getDealActions } from "../../_lib/deal-detail";
import { formatDate, formatPrice } from "../../_lib/formatters";
import { getPublishedProductPost } from "../../_lib/product-posts";
import { identifyProductOrderUrl, productRetailerLinks } from "../../_lib/product-links";
import { getJayShakthiOrderFormUrl } from "../../_lib/order-form-slots";
import { numericPrice } from "../../_lib/pricing";
import { whatsappGroupLink } from "../../_lib/whatsapp-group-link";

export const dynamic = "force-dynamic";

function sameUrl(first: string, second: string) {
  try {
    const firstUrl = new URL(first);
    const secondUrl = new URL(second);
    firstUrl.hash = "";
    secondUrl.hash = "";
    firstUrl.searchParams.sort();
    secondUrl.searchParams.sort();
    return firstUrl.toString() === secondUrl.toString();
  } catch {
    return false;
  }
}

function QuickActions({
  description,
  productName,
  brand,
  platform,
  orderPrice,
  lessPrice,
  mediator,
  productUrl,
  orderFormUrl,
}: {
  description: string;
  productName: string | null;
  brand: string | null;
  platform: string | null;
  orderPrice: number | string | null;
  lessPrice: number | string | null;
  mediator: string | null;
  productUrl: string | null;
  orderFormUrl: string | null;
}) {
  const actions = getDealActions(description, {
    productName,
    brand,
    platform,
    orderPrice,
    lessPrice,
    mediator,
  }).filter((action) => {
    if (action.type === "product" && productUrl) {
      if (sameUrl(action.url, productUrl)) return true;
      const actionLink = identifyProductOrderUrl(action.url);
      const selectedLink = identifyProductOrderUrl(productUrl);
      return Boolean(actionLink && selectedLink && actionLink.identity === selectedLink.identity);
    }
    return action.type === "order" && orderFormUrl !== null && sameUrl(action.url, orderFormUrl);
  });

  if (actions.length === 0) return null;

  return (
    <section className="mt-6 border-t border-slate-100 pt-5 sm:mt-8 sm:pt-6">
      <h2 className="text-sm font-black uppercase tracking-[0.14em] text-slate-500">Quick actions</h2>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:gap-3">
        {actions.map((action) => (
          <a
            className="flex min-h-10 min-w-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs font-bold text-slate-900 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-400 hover:shadow-md focus:outline-none focus:ring-4 focus:ring-slate-950/10 sm:min-h-14 sm:gap-3 sm:rounded-2xl sm:px-4 sm:py-3 sm:text-sm"
            href={action.url}
            key={action.url}
            rel="noopener noreferrer"
            target="_blank"
          >
            <span
              aria-hidden="true"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-sm sm:h-9 sm:w-9 sm:rounded-xl sm:text-base"
            >
              {action.icon}
            </span>
            <span className="min-w-0 break-words">{action.label}</span>
          </a>
        ))}
      </div>
    </section>
  );
}

export default async function ProductPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = await getPublishedProductPost(id);

  if (!post) notFound();

  const orderPrice = numericPrice(post.order_price);
  const lessPrice = numericPrice(post.less_price);
  const isLive = post.status === "live";
  const dealInformation = extractDealInformation(post.description);
  const productLink = productRetailerLinks(post.description)[0] ?? null;
  const orderFormUrl = getJayShakthiOrderFormUrl(post.description);
  const structuredInformation = [
    ...(productLink?.platform ? [["Platform", productLink.platform] as [string, string]] : []),
    ["Brand", post.brand ?? dealInformation.brand],
    ["Mediator", dealInformation.mediator],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));
  const caption = post.description;
  const hasGroupLink = /https?:\/\/chat\.whatsapp\.com\//i.test(caption);
  const hasMediator = /^\s*mediator(?:\s+name)?\s*[:-]/im.test(caption);
  const additionalWhatsAppDetails = [
    !hasMediator ? `Mediator: ${dealInformation.mediator ?? "Samarth"}` : null,
    !hasGroupLink ? whatsappGroupLink : null,
  ].filter((line): line is string => Boolean(line));
  const whatsappMessage = [caption, ...(additionalWhatsAppDetails.length ? ["", ...additionalWhatsAppDetails] : [])].join("\n");
  const whatsappUrl = new URL("https://wa.me/917588424031");
  whatsappUrl.searchParams.set("text", whatsappMessage);
  return (
    <main className="min-h-screen bg-[#f4f5f9] px-3 py-4 text-slate-950 sm:px-6 sm:py-10 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <Link className="inline-flex min-h-10 items-center text-sm font-bold text-slate-600 transition hover:text-slate-950 focus:outline-none focus:ring-4 focus:ring-slate-950/10" href="/">
          <span aria-hidden="true" className="mr-2">←</span> Back to deals
        </Link>
        <article className="mt-4 overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-xl shadow-slate-900/5 sm:mt-8">
          <div className="relative flex min-h-64 items-center justify-center bg-gradient-to-br from-slate-100 via-[#f8f7fb] to-[#eef5f5] p-5 sm:min-h-[34rem] sm:p-8">
            <img alt="Product image" className="max-h-[32rem] w-full object-contain" src={post.image_url} />
            <div className="absolute left-5 top-5 flex flex-wrap gap-2">
              <span className="rounded-full bg-white/95 px-3 py-1.5 text-[10px] font-black text-slate-800">#{post.serial_number ?? "—"}</span>
              <span className={`rounded-full px-3 py-1.5 text-[10px] font-black tracking-[0.13em] ${isLive ? "bg-emerald-500 text-white" : "bg-slate-800 text-white"}`}>{isLive ? "LIVE" : "OVER"}</span>
              {productLink?.platform && (
                <a
                  aria-label={`Open ${productLink.platform} product link`}
                  className="inline-flex items-center gap-1 rounded-full bg-white/95 px-3 py-1.5 text-[10px] font-black text-slate-800"
                  href={productLink.url}
                  rel="noopener noreferrer"
                  target="_blank"
                  title={`Open ${productLink.platform} product link`}
                >
                  {productLink.platform} <span aria-hidden="true">🔥</span>
                </a>
              )}
            </div>
          </div>
          <div className="min-w-0 p-4 sm:p-10">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">{isLive ? "Available now" : "Deal ended"}</p>
                <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">{post.product_name || "Product deal"}</h1>
              </div>
            </div>
            {(orderPrice !== null || lessPrice !== null) && <dl className="mt-6 grid grid-cols-2 gap-2 border-y border-slate-100 py-4 sm:mt-8 sm:gap-3 sm:py-5 sm:grid-cols-3">
              {orderPrice !== null && <div className="min-w-0 rounded-2xl bg-slate-50 p-3 sm:p-4"><dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500 sm:text-xs">Order price</dt><dd className="mt-2 break-words text-xl font-black sm:text-2xl">{formatPrice(orderPrice)}</dd></div>}
              {lessPrice !== null && <div className="min-w-0 rounded-2xl bg-emerald-50 p-3 sm:p-4"><dt className="text-[10px] font-black uppercase tracking-wide text-emerald-700 sm:text-xs">Less price</dt><dd className="mt-2 break-words text-2xl font-black text-emerald-700 sm:text-3xl">{formatPrice(lessPrice)}</dd></div>}
            </dl>}
            <QuickActions
              brand={post.brand}
              description={post.description}
              lessPrice={post.less_price}
              orderPrice={post.order_price}
              platform={productLink?.platform ?? null}
              productName={null}
              mediator={dealInformation.mediator}
              productUrl={productLink?.url ?? null}
              orderFormUrl={orderFormUrl}
            />
            {structuredInformation.length > 0 && <section className="mt-6 border-t border-slate-100 pt-5 sm:mt-8 sm:pt-6">
              <h2 className="text-sm font-black uppercase tracking-[0.14em] text-slate-500">Deal information</h2>
              <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                {structuredInformation.map(([label, value]) => <div className="rounded-2xl border border-slate-200 bg-[#f8f9fb] p-4" key={label}><dt className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1 text-base font-bold text-slate-950">{value}</dd></div>)}
              </dl>
            </section>}
            <section className="mt-8 border-t border-slate-100 pt-6">
              <h2 className="text-lg font-black text-slate-950">Original deal details</h2>
              <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                {!hasMediator && <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><dt className="text-xs font-bold uppercase tracking-wide text-slate-500">Mediator</dt><dd className="mt-1 text-sm font-semibold text-slate-900">{dealInformation.mediator ?? "Samarth"}</dd></div>}
                {!hasGroupLink && <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><dt className="text-xs font-bold uppercase tracking-wide text-slate-500">WhatsApp group</dt><dd className="mt-1 text-sm font-semibold"><a className="text-emerald-700 underline underline-offset-2" href={whatsappGroupLink} rel="noopener noreferrer" target="_blank">Join the group</a></dd></div>}
              </dl>
              <a
                className="mt-4 flex min-h-14 w-full items-center justify-center rounded-full bg-[#25D366] px-5 text-center text-sm font-black tracking-wide text-white shadow-md transition hover:bg-[#1da851] focus:outline-none focus:ring-4 focus:ring-emerald-500/25 sm:min-h-16 sm:text-base"
                href={whatsappUrl.toString()}
                rel="noopener noreferrer"
                target="_blank"
              >
                WhatsApp Reference [MANDATORY]
              </a>
              <div className="mt-3 min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-[#fbfbfd] p-2 sm:p-6">
                <DescriptionWithLinks description={caption} />
              </div>
            </section>
            <p className="mt-8 text-sm text-slate-500">Posted {formatDate(post.created_at)}</p>
          </div>
        </article>
      </div>
    </main>
  );
}
