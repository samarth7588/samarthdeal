import { createSupabaseServerClient } from "./supabase-server.ts";
import { classifySupabaseError, logSupabaseError } from "./supabase-error.ts";
import { cleanProductTitle, deriveProductNameFromUrl, inferProductNameFromMessage, isValidProductName, parseProductPostMessage } from "./product-post-parser.ts";
import { firstProductOrderLink } from "./product-links.ts";

export type AdminProductPost = {
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
  status: "draft" | "live" | "over";
  created_at: string;
  updated_at: string;
};

export type AdminProductPostsResult = {
  posts: AdminProductPost[];
  errorMessage: string | null;
};

const baseSelect = "id, image_url, description, status, created_at, updated_at";
const baseSelectWithSerial = `${baseSelect}, serial_number`;
const metadataSelectWithoutSerial = "id, image_url, description, product_name, brand, platform, order_price, less_price, status, created_at, updated_at, published_at, rating";
const metadataSelect = "id, image_url, description, product_name, brand, platform, order_price, less_price, status, created_at, updated_at, published_at, rating, serial_number";

async function normalizePost(row: Record<string, unknown>): Promise<AdminProductPost> {
  const description = String(row.description);
  const parsed = parseProductPostMessage(description);
  const productLink = firstProductOrderLink(description);
  const productUrl = productLink?.url;
  const storedNameCandidate = typeof row.product_name === "string" ? cleanProductTitle(row.product_name) : "";
  const storedName = isValidProductName(storedNameCandidate) ? storedNameCandidate : "";
  const brandCandidate = typeof row.brand === "string" ? cleanProductTitle(row.brand) : "";
  const brand = isValidProductName(brandCandidate) ? brandCandidate : null;
  const parsedNameCandidate = cleanProductTitle(parsed.productName || "");
  const parsedName = isValidProductName(parsedNameCandidate) ? parsedNameCandidate : "";
  const urlNameCandidate = cleanProductTitle(deriveProductNameFromUrl(productUrl ?? ""));
  const urlName = isValidProductName(urlNameCandidate) ? urlNameCandidate : "";
  const inferredNameCandidate = cleanProductTitle(inferProductNameFromMessage(description));
  const inferredName = isValidProductName(inferredNameCandidate) ? inferredNameCandidate : "";
  const localName =
    storedName ||
    parsedName ||
    urlName ||
    brand ||
    inferredName;
  return {
    id: String(row.id),
    image_url: String(row.image_url),
    description,
    product_name: localName || null,
    brand,
    platform: productLink?.platform || null,
    order_price: typeof row.order_price === "number" || typeof row.order_price === "string" ? row.order_price : null,
    less_price: typeof row.less_price === "number" || typeof row.less_price === "string" ? row.less_price : null,
    rating: validRating(row.rating),
    serial_number: validSerialNumber(row.serial_number),
    published_at: typeof row.published_at === "string" ? row.published_at : null,
    status: row.status === "live" || row.status === "over" ? row.status : "draft",
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function validSerialNumber(value: unknown) {
  const serialNumber = typeof value === "number" || typeof value === "string" ? Number(value) : NaN;
  return Number.isSafeInteger(serialNumber) && serialNumber > 0 ? serialNumber : null;
}

function validRating(value: unknown) {
  const rating = typeof value === "number" || typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(rating) && rating >= 0 && rating <= 5 ? rating : null;
}

function userFacingError(error: unknown) {
  const category = classifySupabaseError(error);
  if (category === "missing-table") return "The product_posts table is missing. Review and apply 20261002_create_product_posts.sql.";
  if (category === "rls") return "Supabase denied access to product_posts. Verify the active-admin RLS policy and your signed-in session.";
  if (category === "network") return "Supabase could not be reached. Verify NEXT_PUBLIC_SUPABASE_URL and network connectivity.";
  return "Product posts could not be loaded. Check the Supabase error details in the server log.";
}

export async function getAdminProductPosts(): Promise<AdminProductPostsResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const primary = await supabase
      .from("product_posts")
      .select(metadataSelect)
      .order("created_at", { ascending: false });
    let rows: unknown[] = (primary.data ?? []) as unknown[];
    let queryError: unknown = primary.error;

    if (queryError && classifySupabaseError(queryError) === "missing-column") {
      logSupabaseError("Optional product post columns are unavailable; trying a compatible selection.", queryError, "warn");
      const fallbackMetadata = await supabase
        .from("product_posts")
        .select(metadataSelectWithoutSerial)
        .order("created_at", { ascending: false });
      rows = (fallbackMetadata.data ?? []) as unknown[];
      queryError = fallbackMetadata.error;
      if (queryError && classifySupabaseError(queryError) === "missing-column") {
        const fallbackWithSerial = await supabase
          .from("product_posts")
          .select(baseSelectWithSerial)
          .order("created_at", { ascending: false });
        rows = (fallbackWithSerial.data ?? []) as unknown[];
        queryError = fallbackWithSerial.error;
        if (queryError && classifySupabaseError(queryError) === "missing-column") {
          const fallback = await supabase
            .from("product_posts")
            .select(baseSelect)
            .order("created_at", { ascending: false });
          rows = (fallback.data ?? []) as unknown[];
          queryError = fallback.error;
        }
      }
    }

    if (queryError) {
      logSupabaseError("Unable to load admin product posts.", queryError);
      return { posts: [], errorMessage: userFacingError(queryError) };
    }

    return { posts: await Promise.all(rows.map((row) => normalizePost(row as Record<string, unknown>))), errorMessage: null };
  } catch (error) {
    logSupabaseError("Unable to load admin product posts.", error);
    return {
      posts: [],
      errorMessage: userFacingError(error),
    };
  }
}

export async function getAdminProductPost(id: string): Promise<{ post: AdminProductPost | null; errorMessage: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const primary = await supabase
      .from("product_posts")
      .select(metadataSelect)
      .eq("id", id)
      .maybeSingle();
    let row: unknown = primary.data;
    let queryError: unknown = primary.error;

    if (queryError && classifySupabaseError(queryError) === "missing-column") {
      logSupabaseError("Optional product post columns are unavailable; trying a compatible selection.", queryError, "warn");
      const fallbackMetadata = await supabase
        .from("product_posts")
        .select(metadataSelectWithoutSerial)
        .eq("id", id)
        .maybeSingle();
      row = fallbackMetadata.data;
      queryError = fallbackMetadata.error;
      if (queryError && classifySupabaseError(queryError) === "missing-column") {
        const fallbackWithSerial = await supabase
          .from("product_posts")
          .select(baseSelectWithSerial)
          .eq("id", id)
          .maybeSingle();
        row = fallbackWithSerial.data;
        queryError = fallbackWithSerial.error;
        if (queryError && classifySupabaseError(queryError) === "missing-column") {
          const fallback = await supabase
            .from("product_posts")
            .select(baseSelect)
            .eq("id", id)
            .maybeSingle();
          row = fallback.data;
          queryError = fallback.error;
        }
      }
    }

    if (queryError) {
      logSupabaseError("Unable to load admin product post.", queryError);
      return { post: null, errorMessage: userFacingError(queryError) };
    }

    return {
      post: row ? await normalizePost(row as Record<string, unknown>) : null,
      errorMessage: null,
    };
  } catch (error) {
    logSupabaseError("Unable to load admin product post.", error);
    return { post: null, errorMessage: userFacingError(error) };
  }
}
