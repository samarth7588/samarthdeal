import { createPublicSupabaseClient } from "./supabase.ts";
import {
  getOrderFormPostStatus,
  getJayShakthiOrderFormSlots,
  getJayShakthiOrderFormUrl,
  type OrderFormSlotAvailability,
} from "./order-form-slots.ts";
import {
  cleanProductTitle,
  deriveProductNameFromUrl,
  inferProductNameFromMessage,
  isValidProductName,
  nullablePrice,
  parseProductPostMessage,
} from "./product-post-parser.ts";
import { resolveProductPostMetadata } from "./product-post-metadata.ts";
import { firstProductOrderLink } from "./product-links.ts";

export type ProductPost = {
  id: string;
  image_url: string;
  description: string;
  product_name: string | null;
  brand: string | null;
  platform: string | null;
  order_price: number | string | null;
  less_price: number | string | null;
  rating: number | string | null;
  serial_number: number | null;
  published_at: string | null;
  status: "live" | "over";
  created_at: string;
  updated_at: string;
  order_form_url: string | null;
  order_form_slots: OrderFormSlotAvailability | null;
};

export type ProductPostsResult = {
  posts: ProductPost[];
  errorMessage: string | null;
};

const baseSelect =
  "id, image_url, description, status, created_at, updated_at";
const baseSelectWithSerial =
  `${baseSelect}, serial_number`;

const metadataSelect =
  "id, image_url, description, product_name, brand, platform, order_price, less_price, status, created_at, updated_at, serial_number";
const metadataSelectWithoutSerial =
  "id, image_url, description, product_name, brand, platform, order_price, less_price, status, created_at, updated_at";

type SupabaseQueryError = {
  code?: string;
  message?: string;
} | null;

function missingOptionalProductPostSchema(
  error: SupabaseQueryError,
) {
  const message = error?.message?.toLowerCase() ?? "";

  return (
    error?.code === "PGRST204" ||
    error?.code === "PGRST205" ||
    error?.code === "42P01" ||
    message.includes("product_name") ||
    message.includes("published_at") ||
    message.includes("rating") ||
    message.includes("serial_number") ||
    (message.includes("relation") &&
      message.includes("product_posts"))
  );
}

async function normalizePost(
  row: Record<string, unknown>,
  options: {
    resolveRemoteMetadata?: boolean;
    includeOrderFormSlots?: boolean;
  } = {},
): Promise<ProductPost> {
  const description = String(row.description);

  const parsed = parseProductPostMessage(description);

  const productLink = firstProductOrderLink(description);
  const productUrl = productLink?.url;

  /*
   * ------------------------------------------------------------
   * 1. STORED PRODUCT NAME
   * ------------------------------------------------------------
   *
   * Only use the database product_name if it is genuinely
   * a valid product name.
   */
  const storedNameCandidate =
    typeof row.product_name === "string"
      ? cleanProductTitle(row.product_name)
      : "";

  const storedName = isValidProductName(
    storedNameCandidate,
  )
    ? storedNameCandidate
    : "";
  const brandCandidate =
    typeof row.brand === "string"
      ? cleanProductTitle(row.brand)
      : "";
  const validBrand = isValidProductName(brandCandidate)
    ? brandCandidate
    : "";

  /*
   * ------------------------------------------------------------
   * 2. PARSED PRODUCT NAME
   * ------------------------------------------------------------
   *
   * IMPORTANT:
   * Never trust parsed.productName blindly.
   * Validate it again before displaying it.
   */
  const parsedNameCandidate = cleanProductTitle(
    parsed.productName || "",
  );

  const parsedName = isValidProductName(
    parsedNameCandidate,
  )
    ? parsedNameCandidate
    : "";

  /*
   * ------------------------------------------------------------
   * 3. PRODUCT NAME FROM URL
   * ------------------------------------------------------------
   *
   * Works for URLs such as:
   *
   * Amazon search:
   * Winter Jacket for Man
   *
   * Amazon product URL:
   * UNIGEN Bluetooth Wireless Compatible Receiver
   */
  const urlNameCandidate = cleanProductTitle(
    deriveProductNameFromUrl(productUrl ?? ""),
  );

  const urlName = isValidProductName(
    urlNameCandidate,
  )
    ? urlNameCandidate
    : "";

  /*
   * ------------------------------------------------------------
   * 4. PRODUCT NAME INFERRED FROM MESSAGE
   * ------------------------------------------------------------
   */
  const inferredNameCandidate = cleanProductTitle(
    inferProductNameFromMessage(description),
  );

  const inferredName = isValidProductName(
    inferredNameCandidate,
  )
    ? inferredNameCandidate
    : "";

  /*
   * ------------------------------------------------------------
   * 5. LOCAL NAME PRIORITY
   * ------------------------------------------------------------
   *
   * We always prefer a valid name already available locally.
   */
  let localName =
    storedName ||
    parsedName ||
    urlName;

  /*
   * ------------------------------------------------------------
   * 6. REMOTE PRODUCT PAGE FALLBACK
   * ------------------------------------------------------------
   *
   * If none of the local sources gives us a valid product name,
   * inspect the actual product/order webpage.
   *
   * The resolver checks:
   *   JSON-LD Product.name
   *   og:title
   *   <title>
   *
   * This is especially important for short URLs such as:
   * https://bitli.in/...
   */
  if (!localName && productUrl && options.resolveRemoteMetadata) {
    try {
      const resolved =
        await resolveProductPostMetadata(description);

      const resolvedNameCandidate = cleanProductTitle(
        resolved.productName || "",
      );

      if (
        isValidProductName(
          resolvedNameCandidate,
        )
      ) {
        localName = resolvedNameCandidate;
      }
    } catch {
      // If remote metadata lookup fails, keep the post usable.
    }
  }

  if (!localName) {
    localName = validBrand || inferredName;
  }

  const storedLessPrice =
    typeof row.less_price === "number" ||
    typeof row.less_price === "string"
      ? row.less_price
      : null;

  const orderFormUrl = getJayShakthiOrderFormUrl(description);
  const orderFormSlots = options.includeOrderFormSlots
    ? await getJayShakthiOrderFormSlots(description)
    : null;
  const detectedStatus = getOrderFormPostStatus(orderFormSlots);

  return {
    id: String(row.id),

    serial_number: validSerialNumber(row.serial_number),

    image_url: String(row.image_url),

    description,

    product_name: localName || null,

    brand:
      validBrand || null,

    platform:
      productLink?.platform || null,

    order_price:
      nullablePrice(parsed.orderPrice) ??
      (typeof row.order_price === "number" ||
      typeof row.order_price === "string"
        ? row.order_price
        : null),

    less_price:
      nullablePrice(parsed.lessPrice) ?? storedLessPrice,

    rating: validRating(row.rating),

    published_at:
      typeof row.published_at === "string"
        ? row.published_at
        : null,

    status:
      detectedStatus ??
      (row.status === "over" ? "over" : "live"),

    created_at: String(row.created_at),

    updated_at: String(row.updated_at),

    order_form_url: orderFormUrl,

    order_form_slots: orderFormSlots,
  };
}

function validSerialNumber(value: unknown) {
  const serialNumber =
    typeof value === "number" || typeof value === "string"
      ? Number(value)
      : Number.NaN;

  return Number.isSafeInteger(serialNumber) && serialNumber > 0
    ? serialNumber
    : null;
}

function validRating(value: unknown) {
  const rating =
    typeof value === "number" ||
    typeof value === "string"
      ? Number(value)
      : NaN;

  return Number.isFinite(rating) &&
    rating >= 0 &&
    rating <= 5
    ? rating
    : null;
}

export async function getPublishedProductPosts(): Promise<ProductPostsResult> {
  try {
    const supabase =
      createPublicSupabaseClient();

    const primary = await supabase
      .from("product_posts")
      .select(metadataSelect)
      .in("status", ["live", "over"])
      .order("created_at", {
        ascending: false,
      });

    let rows: unknown[] =
      (primary.data ?? []) as unknown[];

    let error =
      primary.error as SupabaseQueryError;

    if (
      error &&
      missingOptionalProductPostSchema(error)
    ) {
      const fallbackMetadata = await supabase
        .from("product_posts")
        .select(metadataSelectWithoutSerial)
        .in("status", ["live", "over"])
        .order("created_at", {
          ascending: false,
        });
      rows = (fallbackMetadata.data ?? []) as unknown[];
      error = fallbackMetadata.error as SupabaseQueryError;
      if (error && missingOptionalProductPostSchema(error)) {
        const fallbackWithSerial = await supabase
          .from("product_posts")
          .select(baseSelectWithSerial)
          .in("status", ["live", "over"])
          .order("created_at", {
            ascending: false,
          });
        rows = (fallbackWithSerial.data ?? []) as unknown[];
        error = fallbackWithSerial.error as SupabaseQueryError;
        if (error && missingOptionalProductPostSchema(error)) {
          const fallback = await supabase
            .from("product_posts")
            .select(baseSelect)
            .in("status", ["live", "over"])
            .order("created_at", {
              ascending: false,
            });
          rows = (fallback.data ?? []) as unknown[];
          error = fallback.error as SupabaseQueryError;
        }
      }
    }

    if (error) {
      return {
        posts: [],
        errorMessage: "We could not load live deals right now. Please try again shortly.",
      };
    }

    return {
      posts: await Promise.all(
        rows.map((row) =>
          normalizePost(
            row as Record<string, unknown>,
          ),
        ),
      ),
      errorMessage: null,
    };
  } catch (error) {
    console.error("Unable to load live product posts.", error);
    return {
      posts: [],
      errorMessage: "We could not load live deals right now. Please try again shortly.",
    };
  }
}

export async function getPublishedProductPost(
  id: string,
): Promise<ProductPost | null> {
  try {
    const supabase =
      createPublicSupabaseClient();

    const primary = await supabase
      .from("product_posts")
      .select(metadataSelect)
      .eq("id", id)
      .in("status", ["live", "over"])
      .maybeSingle();

    let row: unknown | null =
      primary.data as unknown | null;

    let error =
      primary.error as SupabaseQueryError;

    if (
      error &&
      missingOptionalProductPostSchema(error)
    ) {
      const fallbackMetadata = await supabase
        .from("product_posts")
        .select(metadataSelectWithoutSerial)
        .eq("id", id)
        .in("status", ["live", "over"])
        .maybeSingle();
      row = fallbackMetadata.data as unknown | null;
      error = fallbackMetadata.error as SupabaseQueryError;
      if (error && missingOptionalProductPostSchema(error)) {
        const fallbackWithSerial = await supabase
          .from("product_posts")
          .select(baseSelectWithSerial)
          .eq("id", id)
          .in("status", ["live", "over"])
          .maybeSingle();
        row = fallbackWithSerial.data as unknown | null;
        error = fallbackWithSerial.error as SupabaseQueryError;
        if (error && missingOptionalProductPostSchema(error)) {
          const fallback = await supabase
            .from("product_posts")
            .select(baseSelect)
            .eq("id", id)
            .in("status", ["live", "over"])
            .maybeSingle();
          row = fallback.data as unknown | null;
          error = fallback.error as SupabaseQueryError;
        }
      }
    }

    return error || !row
      ? null
      : await normalizePost(row as Record<string, unknown>, {
          resolveRemoteMetadata: true,
          includeOrderFormSlots: true,
        });
  } catch {
    return null;
  }
}