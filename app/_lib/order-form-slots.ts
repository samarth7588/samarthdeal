export type OrderFormSlot = {
  dealType: string;
  availableSlots: number;
};

export type OrderFormSlotAvailability = {
  formUrl: string;
  slots: OrderFormSlot[];
};

export function getOrderFormPostStatus(
  availability: OrderFormSlotAvailability | null,
): "live" | "over" | null {
  if (!availability || availability.slots.length === 0) return null;
  return availability.slots.some((slot) => slot.availableSlots > 0)
    ? "live"
    : "over";
}

const jayShakthiOrderFormHost = "deal.jayshakthimarketing.com";
const requestTimeoutMs = 5_000;
const maximumResponseLength = 1_000_000;

function decodeText(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&(?:apos|#0*39);/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 10)));
}

function normalizeUrl(value: string) {
  return decodeText(value)
    .replace(/\\([&()[\]])/g, "$1")
    .replace(/[.,!?;:]+$/, "")
    .replace(/[\])}*]+$/, "");
}

function isJayShakthiOrderForm(url: URL) {
  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  const pathname = url.pathname.replace(/\/+$/, "");
  return url.protocol === "https:" && hostname === jayShakthiOrderFormHost && pathname === "/orderform";
}

export function isJayShakthiOrderFormUrl(value: string) {
  try {
    return isJayShakthiOrderForm(new URL(value));
  } catch {
    return false;
  }
}

function isExplicitOrderFormLabel(description: string, url: string) {
  let index = description.indexOf(url);
  while (index >= 0) {
    const prefix = description.slice(Math.max(0, index - 180), index);
    const recentLines = prefix.split(/\r?\n/).slice(-2).join(" ");
    const labelContext = recentLines
      .replace(/\[\s*[^\]]+\s*\]\(\s*$/i, "")
      .replace(/[*_`]/g, " ");
    if (/\b(?:order\s*form(?:\s+link)?|order\s+link)\s*[:：-]?\s*$/i.test(labelContext.trim())) {
      return true;
    }
    index = description.indexOf(url, index + url.length);
  }
  return false;
}

function productCodesInDescription(description: string) {
  const codes = [...description.matchAll(/^\s*[*_`]*\s*(?:product\s+)?code\s*[*_`]*\s*[:：-]\s*([^\r\n]+)/gim)]
    .map((match) => match[1].trim().replace(/[*_`]+$/g, "").trim().toLowerCase())
    .filter(Boolean);
  return new Set(codes);
}

export function getJayShakthiOrderFormUrl(description: string) {
  const normalizedDescription = decodeText(description);
  const candidates = (normalizedDescription.match(/https?:\/\/[^\s<>"'`)\]]+/gi) ?? [])
    .flatMap((raw) => {
      const normalizedUrl = normalizeUrl(raw);
      try {
        const url = new URL(normalizedUrl);
        return isJayShakthiOrderForm(url)
          ? [{ raw, value: url.toString(), url }]
          : [];
      } catch {
        return [];
      }
    });
  const uniqueCandidates = [
    ...new Map(candidates.map((candidate) => [candidate.value, candidate])).values(),
  ];
  const productCodes = productCodesInDescription(normalizedDescription);
  const codeMatches = uniqueCandidates.filter(({ url }) => {
    const formCode = url.searchParams.get("product_code")?.trim().toLowerCase();
    return Boolean(formCode && productCodes.has(formCode));
  });
  if (codeMatches.length === 1) return codeMatches[0].value;
  if (codeMatches.length > 1) return null;

  const labeled = uniqueCandidates.filter(({ raw }) =>
    isExplicitOrderFormLabel(normalizedDescription, raw),
  );
  if (labeled.length === 1) return labeled[0].value;

  return null;
}

function plainTextFromHtml(html: string) {
  return decodeText(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " "),
  ).trim();
}

function slotCount(value: unknown) {
  const count = typeof value === "number" || typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isSafeInteger(count) && count >= 0 ? count : null;
}

function slotsFromAvailableDeals(value: string): OrderFormSlot[] {
  try {
    const deals: unknown = JSON.parse(decodeText(value));
    if (!Array.isArray(deals)) return [];

    const seenDealTypes = new Set<string>();
    return deals.flatMap((deal) => {
      if (!deal || typeof deal !== "object") return [];
      const record = deal as { type_name?: unknown; remaining?: unknown };
      const dealType = typeof record.type_name === "string" ? record.type_name.replace(/\s+/g, " ").trim() : "";
      const availableSlots = slotCount(record.remaining);
      const normalizedDealType = dealType.toLowerCase();
      if (!dealType || availableSlots === null || seenDealTypes.has(normalizedDealType)) return [];
      seenDealTypes.add(normalizedDealType);
      return [{ dealType, availableSlots }];
    });
  } catch {
    return [];
  }
}

function attributeValue(tag: string, name: string) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i"));
  return match ? match[2] : "";
}

function slotsFromOrderFormOption(html: string, productCode: string) {
  for (const match of html.matchAll(/<option\b[^>]*>/gi)) {
    const option = match[0];
    if (decodeText(attributeValue(option, "value")) !== productCode) continue;
    return slotsFromAvailableDeals(attributeValue(option, "data-available-deals"));
  }

  return [];
}

export function parseJayShakthiOrderFormSlots(html: string, productCode?: string): OrderFormSlot[] {
  if (productCode) {
    return slotsFromOrderFormOption(html, productCode);
  }

  const text = plainTextFromHtml(html);
  const availableSlotsMatch = /available\s+slots?\s*:?\s*/i.exec(text);
  if (!availableSlotsMatch) return [];

  const availableSlotsText = text.slice(availableSlotsMatch.index + availableSlotsMatch[0].length, availableSlotsMatch.index + availableSlotsMatch[0].length + 500);
  const seenDealTypes = new Set<string>();
  const slots: OrderFormSlot[] = [];

  for (const match of availableSlotsText.matchAll(/([A-Za-z][A-Za-z /_-]{0,48}?)\s*:\s*(\d+)\b/g)) {
    const dealType = match[1].replace(/\s+/g, " ").trim();
    const availableSlots = Number.parseInt(match[2], 10);
    const normalizedDealType = dealType.toLowerCase();

    if (!dealType || !Number.isSafeInteger(availableSlots) || seenDealTypes.has(normalizedDealType)) continue;
    seenDealTypes.add(normalizedDealType);
    slots.push({ dealType, availableSlots });
  }

  return slots;
}

async function fetchJayShakthiOrderFormSlots(formUrl: string): Promise<OrderFormSlotAvailability | null> {
  try {
    const response = await fetch(formUrl, {
      cache: "no-store",
      headers: { "user-agent": "OrderOnline order-form slot checker/1.0" },
      redirect: "manual",
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
    if (!response.ok) return null;

    const productCode = new URL(formUrl).searchParams.get("product_code") ?? undefined;
    const slots = parseJayShakthiOrderFormSlots((await response.text()).slice(0, maximumResponseLength), productCode);
    return slots.length > 0 ? { formUrl, slots } : null;
  } catch {
    // The product card remains usable when the external order-form site is unavailable.
    return null;
  }
}

export async function getJayShakthiOrderFormSlots(description: string): Promise<OrderFormSlotAvailability | null> {
  const formUrl = getJayShakthiOrderFormUrl(description);
  return formUrl ? fetchJayShakthiOrderFormSlots(formUrl) : null;
}

export async function getJayShakthiOrderFormSlotsForUrl(value: string): Promise<OrderFormSlotAvailability | null> {
  if (!isJayShakthiOrderFormUrl(value)) return null;
  return fetchJayShakthiOrderFormSlots(new URL(value).toString());
}
