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
const rejectedProductPathSegments = new Set([
  "form",
  "forms",
  "orderform",
  "order",
  "orders",
  "checkout",
  "cart",
  "basket",
  "account",
  "login",
  "register",
  "search",
  "category",
  "categories",
  "about",
  "about-us",
  "help",
  "help-center",
]);

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
  const tataCliqProductId = url.hostname === "tatacliq.com"
    ? segments.find((segment) => segment.startsWith("p-mp"))
    : undefined;
  if (tataCliqProductId) {
    return `path:${tataCliqProductId}`;
  }
  if (url.hostname === "blinkit.com" && segments[0] === "prn" && segments[1]) {
    const productIdIndex = segments.indexOf("p", 2);
    return `path:${segments[productIdIndex + 1] || segments[1]}`;
  }
  if (url.hostname === "dl.flipkart.com" && segments[0] === "dl" && segments[1]) {
    return `path:${segments[1]}`;
  }
  if (
    url.hostname === "dl.flipkart.com" &&
    segments[0] === "s" &&
    segments[1]
  ) {
    return `short-link:${segments[1]}`;
  }
  if (url.hostname === "myntr.it" && segments.length === 1 && segments[0]) {
    return `short-link:${segments[0]}`;
  }

  const productSegmentNames = new Set([
    "product",
    "products",
    "item",
    "items",
    "p",
    "pd",
    "pn",
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
  if (isAmazonUrl(url.toString())) return null;
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
    /\/(?:dp|gp\/product|products?|items?|p|pd|pn|product-detail|product-details)(?:\/|$)/i.test(pathname) ||
    /\/buy\/?$/i.test(pathname) ||
    (hostname === "tatacliq.com" && /(?:^|\/)p-mp[^/]+(?:\/|$)/i.test(pathname)) ||
    (hostname === "dl.flipkart.com" && /^\/dl\/[^/]+(?:\/|$)/i.test(pathname)) ||
    (hostname === "dl.flipkart.com" && /^\/s\/[^/]+(?:\/|$)/i.test(pathname)) ||
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
  const productLink = productRetailerLink(description);
  return productLink ? [productLink] : [];
}

export function firstProductOrderLink(description: string) {
  return productRetailerLink(description);
}

function explicitProductLinkPriority(description: string, url: string) {
  let index = description.indexOf(url);
  while (index >= 0) {
    const prefix = description.slice(Math.max(0, index - 180), index);
    const recentLines = prefix.split(/\r?\n/).slice(-2).join(" ");
    const labelContext = recentLines
      .replace(/\[\s*[^\]]+\s*\]\(\s*$/i, "")
      .replace(/[*_`]/g, " ");

    const label = labelContext.trim();
    if (/\b(?:product(?:\s+(?:link|url))?|buy\s+link|shop(?:ping)?\s+link|store\s+link)\s*[:：-]?\s*$/i.test(label)) return 2;
    if (/\border\s+link\s*[:：-]?\s*$/i.test(label)) return 1;
    index = description.indexOf(url, index + url.length);
  }
  return 0;
}

function isAmazonUrl(value: string) {
  try {
    const hostname = new URL(value).hostname.toLowerCase().replace(/^www\./, "");
    return (
      hostname === "amzn.in" ||
      hostname === "amzn.to" ||
      /(?:^|\.)amazon\.[a-z]{2,3}(?:\.[a-z]{2})?$/.test(hostname)
    );
  } catch {
    return false;
  }
}

function isProductPath(url: URL) {
  const segments = decodedPathSegments(url).map((segment) => segment.toLowerCase());
  if (segments.some((segment) => rejectedProductPathSegments.has(segment))) {
    return false;
  }
  return Boolean(pathProductIdentity(url));
}

export function productRetailerLink(description: string): ProductOrderLink | null {
  const candidates = extractProductUrls(description).flatMap((value) => {
    const url = normalizeProductUrl(value);
    if (!url || url.pathname === "/") return [];
    const pathSegments = decodedPathSegments(url).map((segment) => segment.toLowerCase());
    if (pathSegments.some((segment) => rejectedProductPathSegments.has(segment))) {
      return [];
    }
    const explicitPriority = explicitProductLinkPriority(description, value);
    const explicit = explicitPriority > 0;
    const isAmazon = isAmazonUrl(url.toString());
    const platform = isAmazon ? "Amazon" : platformFromUrl(url.toString());
    if (!explicit && (!platform || !isProductPath(url))) return [];

    const identified = isAmazon ? null : identifyProductOrderUrl(url.toString());
    if (!identified && !explicit && !isAmazon) return [];
    if (!isProductPath(url) && !explicit) return [];

    const identity =
      identified?.identity ??
      `${url.hostname}:${pathProductIdentity(url) ?? `${url.pathname}${url.search}`}`;
    return [{
      url: url.toString(),
      platform,
      identity,
      explicitPriority,
    }];
  });

  const uniqueByIdentity = new Map<string, (typeof candidates)[number]>();
  for (const candidate of candidates) {
    const existing = uniqueByIdentity.get(candidate.identity);
    if (!existing || candidate.explicitPriority > existing.explicitPriority) {
      uniqueByIdentity.set(candidate.identity, candidate);
    }
  }
  const uniqueCandidates = [...uniqueByIdentity.values()];
  const maximumExplicitPriority = Math.max(
    0,
    ...uniqueCandidates.map((candidate) => candidate.explicitPriority),
  );
  const explicitlyLinked = uniqueCandidates.filter(
    (candidate) => candidate.explicitPriority === maximumExplicitPriority && maximumExplicitPriority > 0,
  );
  const selected =
    explicitlyLinked.length === 1
      ? explicitlyLinked[0]
      : explicitlyLinked.length === 0 && uniqueCandidates.length === 1
        ? uniqueCandidates[0]
        : null;

  return !selected || isAmazonUrl(selected.url)
    ? null
    : { url: selected.url, platform: selected.platform, identity: selected.identity };
}

export function productRetailerLinks(description: string): ProductOrderLink[] {
  const productLink = productRetailerLink(description);
  return productLink ? [productLink] : [];
}
