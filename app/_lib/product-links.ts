import { extractProductUrls, platformFromUrl } from "./product-post-parser.ts";

const trackingParameter = /^(?:utm_.+|fbclid|gclid|dclid|msclkid|yclid|gbraid|wbraid|irclickid|igshid|mc_cid|mc_eid|spm|ref|ref_.+|tag|aff|affid|aff_id|affcode|campaign|source)$/i;
const productParameterNames = [
  "product_code",
  "product_id",
  "productid",
  "sku",
  "skuid",
  "asin",
  "pid",
  "item_id",
  "itemid",
  "variant",
  "variant_id",
];
const nonProductHosts = [
  "whatsapp.com",
  "wa.me",
  "facebook.com",
  "instagram.com",
  "tiktok.com",
  "twitter.com",
  "x.com",
  "youtube.com",
  "youtu.be",
  "t.me",
  "telegram.org",
  "forms.gle",
];

export type ProductOrderLink = {
  url: string;
  platform: string;
  identity: string;
};

function isDomainOrSubdomain(hostname: string, domain: string) {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function decodedPathSegments(url: URL) {
  return url.pathname
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    });
}

function normalizeProductUrl(value: string) {
  try {
    const url = new URL(value.trim().replace(/&amp;/gi, "&").replace(/\\&/g, "&"));
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;

    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    if (
      (url.protocol === "http:" && url.port === "80") ||
      (url.protocol === "https:" && url.port === "443")
    ) {
      url.port = "";
    }

    url.hash = "";
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    for (const key of [...url.searchParams.keys()]) {
      if (trackingParameter.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    return url;
  } catch {
    return null;
  }
}

function queryProductIdentity(url: URL) {
  for (const name of productParameterNames) {
    const value = url.searchParams.get(name);
    if (value?.trim()) return `${name}:${value.trim().toLowerCase()}`;
  }
  return null;
}

function pathProductIdentity(url: URL) {
  const segments = decodedPathSegments(url).map((segment) => segment.toLowerCase());
  if (url.hostname === "blinkit.com" && segments[0] === "prn" && segments[1]) {
    const productIdIndex = segments.indexOf("p", 2);
    return `path:${segments[productIdIndex + 1] || segments[1]}`;
  }

  const productSegmentNames = new Set([
    "product",
    "products",
    "item",
    "items",
    "p",
    "dp",
    "orderform",
    "order",
    "checkout",
  ]);

  for (let index = 0; index < segments.length - 1; index += 1) {
    if (!productSegmentNames.has(segments[index])) continue;
    const identifier = segments[index + 1];
    if (identifier && !["new", "search", "category"].includes(identifier)) {
      return `path:${identifier}`;
    }
  }

  const buyIndex = segments.lastIndexOf("buy");
  if (buyIndex > 0) return `path:${segments[buyIndex - 1]}`;

  if (
    (url.hostname === "amzn.in" && segments[0] === "d" && segments[1]) ||
    (url.hostname === "fkrt.it" && segments.length === 1 && segments[0])
  ) {
    return `path:${segments[1] ?? segments[0]}`;
  }

  if (url.hostname === "bitli.in" && segments.length === 1 && segments[0]) {
    return `short-link:${segments[0]}`;
  }

  return null;
}

export function identifyProductOrderUrl(value: string): ProductOrderLink | null {
  const url = normalizeProductUrl(value);
  if (!url) return null;

  const hostname = url.hostname;
  if (nonProductHosts.some((domain) => isDomainOrSubdomain(hostname, domain))) {
    return null;
  }

  const pathname = url.pathname.toLowerCase().replace(/\/+$/, "") || "/";
  const queryIdentity = queryProductIdentity(url);
  const isKnownOrderForm =
    hostname === "deal.jayshakthimarketing.com" &&
    pathname === "/orderform" &&
    Boolean(queryIdentity);
  const hasOrderRoute = /\/(?:orderform|order|checkout)(?:\/|$)/i.test(pathname);
  const pathIdentity = pathProductIdentity(url);
  const hasStructuredProductPath =
    /\/(?:dp|gp\/product|products?|items?|p|product-detail|product-details)(?:\/|$)/i.test(pathname) ||
    /\/buy\/?$/i.test(pathname) ||
    (hostname === "blinkit.com" && /^\/prn\/[^/]+(?:\/|$)/i.test(pathname));
  const isKnownShortProductLink =
    (hostname === "amzn.in" && /^\/d\/[^/]+$/i.test(pathname)) ||
    (hostname === "fkrt.it" && /^\/[^/]+$/i.test(pathname)) ||
    (hostname === "bitli.in" && /^\/[^/]+$/i.test(pathname));
  const identity = queryIdentity ?? pathIdentity;

  if (!identity || (!isKnownOrderForm && !hasOrderRoute && !hasStructuredProductPath && !isKnownShortProductLink)) {
    return null;
  }

  return {
    url: url.toString(),
    platform: platformFromUrl(url.toString()),
    identity: `${hostname}:${identity}`,
  };
}

export function productOrderLinksInDescription(description: string) {
  const seen = new Set<string>();
  return extractProductUrls(description).flatMap((url) => {
    const link = identifyProductOrderUrl(url);
    if (!link || seen.has(link.identity)) return [];
    seen.add(link.identity);
    return [link];
  });
}

export function firstProductOrderLink(description: string) {
  return productOrderLinksInDescription(description)[0] ?? null;
}
