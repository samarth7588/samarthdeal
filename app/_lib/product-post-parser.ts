export type ProductPostMetadata = {
  productName: string;
  brand: string;
  platform: string;
  orderPrice: string;
  lessPrice: string;
  rating: string;
};

const genericProductNames = new Set([
  "review",
  "review deal",
  "review 29",
  "deal",
  "offer",
  "order",
  "order links",
  "order link",
  "order form",
  "orderform",
  "fill order form",
  "general form",
  "exchange",
  "exchange deal",
  "ratings",
  "ratings deal",
  "rating",
  "product",
  "product details",
  "product detail",
  "click here",
  "open",
  "buy",
  "shop",
  "amazon",
  "firstcry",
  "flipkart",
  "myntra",
  "meesho",
  "any size",
  "any color",
  "any colour",
]);

const nonProductLinePattern =
  /^(?:code|product code|brand(?: name)?|platform(?: name)?|store|website|deal(?: type)?|mediator(?: name)?|order price|order amount|deal price|final price|less(?: price)?|savings?|discount|order\s+links?|refund links?|track(?:ing)? links?|forms?|ratings?|rating|review|review\s+deal|review\s+29|(?:don't|do not)\s+(?:change|modify)\s+link)\b/i;

const instructionOnlyWords = new Set([
  "a",
  "after",
  "and",
  "before",
  "be",
  "by",
  "complete",
  "do",
  "else",
  "fill",
  "form",
  "forms",
  "here",
  "in",
  "join",
  "link",
  "links",
  "mandatory",
  "minutes",
  "minute",
  "must",
  "next",
  "no",
  "of",
  "offer",
  "offers",
  "only",
  "or",
  "order",
  "passed",
  "please",
  "rating",
  "ratings",
  "refund",
  "review",
  "reviews",
  "slot",
  "slots",
  "the",
  "to",
  "track",
  "tracking",
  "whatsapp",
  "when",
  "within",
  "will",
  "fast",
  "thank",
  "you",
]);

const instructionCategoryWords = new Set([
  "complete",
  "fill",
  "form",
  "forms",
  "join",
  "link",
  "links",
  "mandatory",
  "must",
  "offer",
  "offers",
  "order",
  "passed",
  "rating",
  "ratings",
  "refund",
  "review",
  "reviews",
  "slot",
  "slots",
  "track",
  "tracking",
  "whatsapp",
  "thank",
]);

const operationalSentenceStarters = new Set([
  "add",
  "check",
  "click",
  "complete",
  "contact",
  "do",
  "mandatory",
  "fill",
  "follow",
  "join",
  "place",
  "please",
  "send",
  "submit",
  "track",
  "use",
  "wait",
  "within",
  "write",
]);

function isInstructionOnlyName(normalized: string) {
  const words = normalized.match(/[\p{L}\p{N}]+/gu) ?? [];

  return (
    words.length > 0 &&
    words.some((word) => instructionCategoryWords.has(word)) &&
    words.every((word) => instructionOnlyWords.has(word) || /^\d+$/.test(word))
  );
}

function isOperationalInstructionSentence(normalized: string) {
  const words =
    normalized.match(/[\p{L}\p{N}]+/gu) ?? [];

  const firstWord = words[0] ?? "";

  const hasInstructionCategory = words.some((word) =>
    instructionCategoryWords.has(word),
  );

  const hasUrgencyOrTemporalStructure =
    /\b(?:else\s+slot|slot\s+will)\b/i.test(normalized) ||
    /\b(?:within|in\s+next|order\s+in|order\s+within)\b[\s\S]*\b(?:\d+\s*)?(?:min(?:ute)?s?|hours?|days?)\b/i.test(
      normalized,
    );

  const hasConditionalInstruction =
    /^(?:if|when)\b/i.test(normalized) &&
    hasInstructionCategory &&
    /\b(?:fill(?:ing|ed)?|complete|submit(?:ting|ted)?|send(?:ing|sent)?|join(?:ing|ed)?|track(?:ing|ed)?|order(?:ing|ed)?|review(?:ing|ed)?|refund(?:ing|ed)?|use|write|add|place|wait|share|provide)\b/i.test(
      normalized,
    );

  const hasImperativeInstruction =
    /^(?:(?:please\s+)?(?:don't|dont|do\s+not)|please)\b/i.test(
      normalized,
    ) && hasInstructionCategory;

  /*
   * Catches instruction sentences such as:
   *
   * Refund form needs to be filled in 20
   * Refund form needs to be filled in 20 minutes
   * Order form needs to be filled
   * Review needs to be submitted
   * Order link needs to be opened
   * Rating needs to be submitted
   */
  const operationalInstructionPattern =
    /\b(?:refund|order|review|rating|form|link|whatsapp|slot|payment|reference|tracking)\b[\s\S]*\b(?:needs?|need|must|should|has\s+to|have\s+to)\b[\s\S]*\b(?:filled|fill|submitted|submit|opened|open|completed|complete|joined|join|sent|send|shared|share|required|passed)\b/i;

  if (operationalInstructionPattern.test(normalized)) {
    return true;
  }

  if (hasConditionalInstruction || hasImperativeInstruction) {
    return true;
  }

  /*
   * Specifically catches refund-form instructions.
   */
  if (
    /\brefund\s+form\b[\s\S]*\b(?:needs?|need|must|should|has\s+to|have\s+to)\b/i.test(
      normalized,
    )
  ) {
    return true;
  }

  /*
   * Existing instruction detection.
   */
  return (
    hasInstructionCategory &&
    (
      operationalSentenceStarters.has(firstWord) ||
      hasUrgencyOrTemporalStructure
    )
  );
}

const labels = {
  productName: [
    "product name",
    "product title",
    "item name",
    "product",
    "item",
    "title",
  ],
  brand: ["brand name", "brand"],
  platform: ["platform name", "platform", "store", "website"],
  orderPrice: [
    "order price",
    "order amount",
    "deal price",
    "final price",
  ],
  lessPrice: ["less price", "less"],
} as const;

export function nullablePrice(value: string) {
  const normalized = value.trim();

  if (!normalized) return null;

  const parsed = Number(normalized);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function isValidProductName(value: string) {
  const cleanedLine = cleanLine(value);

  if (/:\s*$/.test(cleanedLine)) return false;

  const normalized = cleanedLine
    .replace(/[:;]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  const genericNameKey = normalized
    .replace(/[\s\-–—/,]+/g, " ")
    .trim();

  if (!normalized) return false;

  if (genericProductNames.has(genericNameKey)) return false;

  if (
    /\bpayment\s+updates?\b|\bregular\s+rat(?:ing|ting)s?\b/i.test(
      normalized,
    ) ||
    /\b(?:delete\s*\/\s*error|error\s*\/\s*delete)\b|\bunverified\b/i.test(
      normalized,
    ) ||
    inlineLessPrice(cleanedLine)
  ) {
    return false;
  }

  if (isInstructionOnlyName(normalized)) return false;

  if (isOperationalInstructionSentence(normalized)) return false;

  if (
    /^(?:review(?:\s+deal|\s+29)?|deal|offer|order(?:\s+link|\s+links)?|order\s*form|fill\s+order\s+form|general\s+form|exchange(?:\s+deal)?|ratings?(?:\s+deal)?|rating|amazon|firstcry|flipkart|myntra|meesho|any\s+size|any\s+color|any\s+colour)$/i.test(
      normalized,
    )
  ) {
    return false;
  }

  if (nonProductLinePattern.test(normalized)) return false;

  if (/^product(?:\s+name)?$/.test(normalized)) return false;

  if (/^https?:\/\//i.test(normalized)) return false;

  if (/\b\d+\s*\/\s*\d+\s+(?:star\s+)?reviews?\b|\bstar reviews?\b|\breviews? required\b/i.test(normalized)) {
    return false;
  }

  // Amazon ASINs such as B0F53TTJF5.
  if (/^b0[a-z0-9]{8}$/i.test(normalized)) return false;

  // Reject obvious product-code-only values.
  if (
    /^[a-z0-9_-]+$/i.test(normalized) &&
    (normalized.includes("_") || normalized.includes("-"))
  ) {
    return false;
  }

  // Opaque shortener slugs / hashes such as QyeGq8Q.
  if (
    !/\s/.test(normalized) &&
    /^[a-z0-9]+$/i.test(normalized) &&
    /[a-z]/i.test(normalized) &&
    /\d/.test(normalized) &&
    normalized.length >= 6
  ) {
    return false;
  }

  return true;
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#x2F;/gi, "/")
    .replace(/&#47;/gi, "/");
}

function cleanLine(line: string) {
  return decodeHtmlEntities(line)
    .replace(/\uFFFD/g, "")
    .replace(/\\\*{1,2}/g, "")
    .replace(/[*_`]/g, "")
    .replace(/^[\s>*#•▪◦-]+/, "")
    .replace(/^[\p{Extended_Pictographic}\p{Emoji_Modifier}\uFE0F\u200D\u{1F1E6}-\u{1F1FF}\s]+/gu, "")
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Modifier}\uFE0F\u200D\u{1F1E6}-\u{1F1FF}\s]+$/gu, "")
    .trim();
}
function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function valueAfterLabel(
  line: string,
  possibleLabels: readonly string[],
  options?: { rejectGeneric?: boolean },
) {
  const normalizedLine = cleanLine(line);

  const labelPattern = possibleLabels
    .map(escapeRegExp)
    .join("|");

  const match = normalizedLine.match(
    new RegExp(
      `^(?:${labelPattern})\\s*(?::|-|=)\\s*(.+)$`,
      "i",
    ),
  );

  const value = match?.[1]?.trim() ?? "";

  if (
    options?.rejectGeneric !== false &&
    genericProductNames.has(value.toLowerCase())
  ) {
    return "";
  }

  return value;
}

const priceAmountPattern = String.raw`(?:₹|rs\.?|inr)?\s*(\d[\d,]*(?:\.\d{1,2})?)\s*(?:\/\s*[-−–])?`;
const lessKeywordPattern = /\bless(?:\s+price)?\b/gi;
const orderPriceKeywordPattern =
  /\b(?:order\s+price|order\s+amount|product\s+price|deal\s+price|final\s+price|order|product)\b/gi;
const nonPriceSuffixPattern =
  /^\s*(?:%|slots?\b|minutes?\b|mins?\b|hours?\b|days?\b|stars?\b|\/\s*\d)/i;

function amountNearKeyword(line: string, keywordPattern: RegExp) {
  const normalized = cleanLine(line);
  keywordPattern.lastIndex = 0;

  for (const match of normalized.matchAll(keywordPattern)) {
    const keywordStart = match.index ?? 0;
    const keywordEnd = keywordStart + match[0].length;
    const afterKeyword = normalized.slice(keywordEnd, keywordEnd + 32);
    const afterMatch = afterKeyword.match(
      new RegExp(`^[\\s:;=.,!\\-–—]*${priceAmountPattern}`, "i"),
    );
    if (afterMatch && !nonPriceSuffixPattern.test(afterKeyword.slice(afterMatch[0].length))) {
      return afterMatch[1].replace(/,/g, "");
    }

    const beforeKeyword = normalized.slice(Math.max(0, keywordStart - 32), keywordStart);
    const beforeMatch = beforeKeyword.match(
      new RegExp(`${priceAmountPattern}[\\s:;=.,!\\-–—]*$`, "i"),
    );
    const precedingText = beforeMatch
      ? beforeKeyword.slice(0, beforeMatch.index)
      : "";
    const isLabeledNonPrice =
      /\b(?:rating|slots?|available|date|product\s+code|sku|reference|id)\b/i.test(
        precedingText,
      );
    const looksLikeDate = /[\d]\s*[/-]\s*$/.test(precedingText);
    if (
      beforeMatch &&
      !isLabeledNonPrice &&
      !looksLikeDate &&
      !nonPriceSuffixPattern.test(normalized.slice(keywordEnd))
    ) {
      return beforeMatch[1].replace(/,/g, "");
    }
  }

  return "";
}

export function extractProductPrices(message: string) {
  const prices = { orderPrice: "", lessPrice: "" };

  for (const line of message.split(/\r?\n/)) {
    if (!prices.lessPrice) {
      prices.lessPrice = amountNearKeyword(line, lessKeywordPattern);
    }
    if (!prices.orderPrice) {
      prices.orderPrice = amountNearKeyword(line, orderPriceKeywordPattern);
    }
    if (prices.orderPrice && prices.lessPrice) break;
  }

  return prices;
}

function inlineLessPrice(line: string) {
  return amountNearKeyword(line, lessKeywordPattern);
}

/**
 * Extract product/order URLs from the complete original message.
 *
 * Supports:
 * - plain URLs
 * - Markdown URLs
 * - bold Markdown links
 */
export function extractProductUrls(message: string) {
  const matches = [
    ...message.matchAll(
      /https?:\/\/[^\s<>"')\]]+/gi,
    ),
  ];

  const urls = matches
    .map((match) => match[0].replace(/[),.;]+$/, ""))
    .filter((value) => {
      try {
        const hostname = new URL(value)
          .hostname
          .toLowerCase();

        // Do not treat communication links as product links.
        return !/(forms\.gle|wa\.me|whatsapp|t\.me|telegram)/i.test(
          hostname,
        );
      } catch {
        return false;
      }
    });

  return [...new Set(urls)];
}

export function platformFromUrl(value: string) {
  try {
    const hostname = new URL(value)
      .hostname
      .toLowerCase()
      .replace(/^www\./, "");

    const platforms: Array<[string, string]> = [
      ["fkrt.it", "Flipkart"],
      ["flipkart.com", "Flipkart"],
      ["myntr.it", "Myntra"],
      ["myntra.com", "Myntra"],
      ["meesho.com", "Meesho"],
      ["ajio.com", "AJIO"],
      ["nykaa.com", "Nykaa"],
      ["snapdeal.com", "Snapdeal"],
      ["croma.com", "Croma"],
      ["tatacliq.com", "Tata Cliq"],
      ["jiomart.com", "JioMart"],
      ["reliancedigital.in", "Reliance Digital"],
      ["firstcry.com", "FirstCry"],
      ["purplle.com", "Purplle"],
      ["shopclues.com", "ShopClues"],
      ["blinkit.com", "Blinkit"],
      ["bigbasket.com", "BigBasket"],
      ["zeptonow.com", "Zepto"],
      ["swiggy.com", "Swiggy Instamart"],
    ];

    return (
      platforms.find(
        ([domain]) =>
          hostname === domain ||
          hostname.endsWith(`.${domain}`),
      )?.[1] ?? ""
    );
  } catch {
    return "";
  }
}

/**
 * Clean a webpage/product title.
 *
 * Important:
 * We do NOT aggressively remove phrases such as
 * "for Man" because they can be part of the actual product name.
 */
export function cleanProductTitle(value: string) {
  let cleaned = decodeHtmlEntities(value)
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/^\s*[*_#]+/, "")
    .replace(/\*+/g, "")
    .replace(/_+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Remove common store prefixes.
  cleaned = cleaned.replace(
    /^(?:amazon\.(?:in|com)|flipkart|firstcry(?:\.com)?|myntra|meesho|ajio|nykaa|snapdeal)\s*(?::|-|\|)\s*/i,
    "",
  );

  // Remove store/category suffixes such as ": Amazon.in: Electronics".
  cleaned = cleaned.replace(
    /\s*[:|\-]\s*(?:amazon\.(?:in|com)|flipkart|firstcry(?:\.com)?|myntra|meesho|ajio|nykaa|snapdeal)(?:\s*[:|\-]\s*[^|:]+)?$/i,
    "",
  );

  // Remove common store suffixes.
  cleaned = cleaned.replace(
    /\s*(?:from\s+)?(?:amazon\.(?:in|com)|flipkart|firstcry(?:\.com)?|myntra|meesho|ajio|nykaa|snapdeal)\s*$/i,
    "",
  );

  // Remove common marketing phrases.
  cleaned = cleaned.replace(
    /\b(?:online in india|buy at best price|buy online|shop online|best price|official store)\b/gi,
    "",
  );

  // Remove generic deal/instruction labels from otherwise meaningful titles.
  cleaned = cleaned.replace(
    /\b(?:order\s+link(?:s)?|fill\s+order\s+form|general\s+form|review(?:\s+deal)?|ratings?(?:\s+deal)?|deal|offer|exchange(?:\s+deal)?)\b/gi,
    "",
  );

  // Remove obvious SKU/ASIN/Product Code fragments.
  cleaned = cleaned.replace(
    /\b(?:asin|sku|item number|product code|model)\s*[:#-]?\s*[A-Za-z0-9_-]+\b/gi,
    "",
  );

  cleaned = cleaned
    .replace(/\s+\|\s*$/g, "");

  cleaned = cleaned.replace(
    /\s+del\/err\b.*$/i,
    "",
  );

  cleaned = cleaned
    .replace(/\s+/g, " ")
    .trim();
  // A pipe generally separates the real product title from
  // additional marketing/category information.
  if (cleaned.includes("|")) {
    cleaned = cleaned.split(/\s*\|\s*/)[0].trim();
  }

  // Remove trailing ecommerce boilerplate.
  cleaned = cleaned.replace(
    /\s+(?:online|buy|shop)\s+(?:in\s+india|online).*$/i,
    "",
  );

  cleaned = cleaned.trim();

  /*
   * Keep the title reasonably short, but DO NOT blindly truncate
   * "Winter Jacket for Man" into "Winter Jacket".
   */
  const words = cleaned.split(/\s+/).filter(Boolean);

  if (words.length > 8) {
    cleaned = words.slice(0, 8).join(" ");
  }

  return cleaned;
}

/**
 * Convert a Product Code into a candidate only for diagnostic/testing
 * purposes. It is intentionally NOT used as the final product name.
 */
export function deriveProductCodeTitle(message: string) {
  const code = message.match(
    /^\s*(?:product\s+code|code)\s*[:=-]\s*([A-Za-z0-9_-]+)/im,
  )?.[1];

  if (!code) return "";

  const words = code
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .replace(/(\d)([A-Za-z])/g, "$1 $2")
    .replace(/\b(?:fc|in|com)\b/gi, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length < 2) return "";

  return words
    .map((word) => {
      if (/^wifi$/i.test(word)) return "WiFi";
      if (/^g$/i.test(word)) return "G";

      return (
        word.charAt(0).toUpperCase() +
        word.slice(1).toLowerCase()
      );
    })
    .join(" ")
    .replace(/\bWi Fi\b/g, "WiFi")
    .replace(/\b(\d+) G\b/g, "$1G");
}

/**
 * Convert search parameters such as:
 *
 * Winter+Jacket+for+man
 *
 * into:
 *
 * Winter Jacket for Man
 */
function titleFromSearchTerm(value: string) {
  const decoded = decodeURIComponent(value)
    .replace(/\+/g, " ")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!decoded) return "";

  const words = decoded
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      if (/^(for|and|with|of|the|a|an)$/i.test(word)) {
        return word.toLowerCase();
      }

      return (
        word.charAt(0).toUpperCase() +
        word.slice(1).toLowerCase()
      );
    });

  return cleanProductTitle(words.join(" "));
}

export function deriveProductNameFromUrl(value: string) {
  try {
    const url = new URL(value);

    /*
     * Amazon and other stores commonly use a search parameter
     * such as ?k=...
     */
    const searchTerm = [
      "k",
      "q",
      "query",
      "search",
      "keyword",
      "keywords",
    ]
      .map((key) => url.searchParams.get(key))
      .find(
        (term): term is string =>
          Boolean(term?.trim()),
      );

    if (searchTerm) {
      const title = titleFromSearchTerm(searchTerm);

      if (isValidProductName(title)) {
        return title;
      }
    }

    /*
     * Try meaningful URL slugs.
     *
     * Example:
     * /products/samsung-galaxy-s24/dp/...
     */
    const pathSegments = url.pathname
      .split("/")
      .filter(Boolean);

    const productIdentifier = pathSegments.findIndex(
      (segment) =>
        /^(?:dp|product|products|item)$/i.test(segment),
    );

    let productSlug = "";

    if (productIdentifier > 0) {
      productSlug =
        pathSegments[productIdentifier - 1];
    }

    if (!productSlug) {
      productSlug = pathSegments
        .filter(
          (segment) =>
            !/^(?:dp|product|products|item|p)$/i.test(
              segment,
            ),
        )
        .at(-1) ?? "";
    }

    const title = cleanProductTitle(
      productSlug.replace(/[-_]+/g, " "),
    );

    return isValidProductName(title) ? title : "";
  } catch {
    return "";
  }
}

export function inferProductNameFromMessage(
  message: string,
) {
  const candidate = message
    .split(/\r?\n/)
    .map(cleanLine)
    .find((line) => {
      if (!line || !isValidProductName(line)) {
        return false;
      }

      // Never use a URL as the product name.
      if (/https?:\/\//i.test(line)) {
        return false;
      }

      // Never use price lines.
      if (
        inlineLessPrice(line) ||
        /^\s*(?:₹|rs\.?|inr|\$|€|£)?\s*\d[\d,]*(?:\.\d{1,2})?\s*(?:only|\/-)?\s*$/i.test(
          line,
        )
      ) {
        return false;
      }

      // Ignore obvious labelled metadata lines.
      if (nonProductLinePattern.test(line)) {
        return false;
      }

      return /[A-Za-z]{2,}/.test(line);
    });

  const cleaned = candidate
    ? cleanProductTitle(candidate)
    : "";

  return isValidProductName(cleaned)
    ? cleaned
    : "";
}

export function parseProductPostMessage(
  message: string,
): ProductPostMetadata {
  const metadata: ProductPostMetadata = {
    productName: "",
    brand: "",
    platform: "",
    orderPrice: "",
    lessPrice: "",
    rating: "",
  };

  const lines = message.split(/\r?\n/);
  const detectedPrices = extractProductPrices(message);

  for (const line of lines) {
    if (!metadata.productName) {
      const labeledName = valueAfterLabel(
        line,
        labels.productName,
      );

      metadata.productName = isValidProductName(
        labeledName,
      )
        ? cleanProductTitle(labeledName)
        : "";
    }

    if (!metadata.brand) {
      metadata.brand = valueAfterLabel(
        line,
        labels.brand,
        { rejectGeneric: false },
      );
    }

    if (!metadata.platform) {
      metadata.platform = valueAfterLabel(
        line,
        labels.platform,
        { rejectGeneric: false },
      );
    }

  }

  metadata.orderPrice = detectedPrices.orderPrice;
  metadata.lessPrice = detectedPrices.lessPrice;

  if (/^amazon(?:\b|\.)/i.test(metadata.platform.trim())) {
    metadata.platform = "";
  }

  if (!metadata.productName) {
    metadata.productName =
      inferProductNameFromMessage(message);
  }

  return metadata;
}