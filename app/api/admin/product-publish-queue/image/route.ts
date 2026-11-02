import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { getAdminSession } from "../../../../_lib/admin-auth";
import { logSupabaseError } from "../../../../_lib/supabase-error";

export const dynamic = "force-dynamic";

const maxImageSize = 5 * 1024 * 1024;
const acceptedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

function storageError(error: { code?: string; message?: string }) {
  const code = error.code ? `${error.code}: ` : "";
  const message = error.message || "Supabase Storage rejected the upload.";
  return NextResponse.json({ error: `${code}${message}` }, { status: 502 });
}

function isSameOriginRequest(request: Request) {
  const originHeader = request.headers.get("origin");
  const hostHeader = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const protocolHeader = request.headers.get("x-forwarded-proto") ??
    new URL(request.url).protocol.slice(0, -1);
  if (!originHeader || !hostHeader) return false;

  try {
    const origin = new URL(originHeader);
    const host = hostHeader.split(",")[0].trim();
    const protocol = protocolHeader.split(",")[0].trim();
    return (
      (origin.protocol === "https:" || origin.protocol === "http:") &&
      origin.host === host &&
      origin.protocol === `${protocol}:`
    );
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Image uploads must come from the admin site." }, { status: 403 });
  }

  let user: Awaited<ReturnType<typeof getAdminSession>>["user"];
  let isAuthorized: boolean;
  try {
    ({ user, isAuthorized } = await getAdminSession(AbortSignal.timeout(15_000)));
  } catch (error) {
    logSupabaseError("Unable to authenticate product image upload.", error);
    return NextResponse.json({ error: "Unable to verify the admin session for image upload." }, { status: 502 });
  }
  if (!user || !isAuthorized) {
    return NextResponse.json({ error: "Sign in with an active admin account before uploading." }, { status: 401 });
  }

  const bucket = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!bucket) {
    return NextResponse.json({ error: "Product image storage bucket is not configured." }, { status: 503 });
  }
  if (!supabaseUrl) {
    return NextResponse.json({ error: "Supabase URL is not configured on the server." }, { status: 503 });
  }
  if (!serviceRoleKey) {
    return NextResponse.json(
      { error: "Server configuration is missing SUPABASE_SERVICE_ROLE_KEY. Add it as a server-only environment variable and redeploy." },
      { status: 503 },
    );
  }
  if (bucket !== "product-images") {
    return NextResponse.json(
      { error: 'Product image storage is configured for an unexpected bucket; expected "product-images".' },
      { status: 503 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "The image upload request is invalid." }, { status: 400 });
  }

  const file = formData.get("image");
  const fingerprint = formData.get("fingerprint");
  if (!(file instanceof File) || !acceptedImageTypes.has(file.type) || file.size > maxImageSize) {
    return NextResponse.json({ error: "Choose a JPG, PNG, or WebP image up to 5 MB." }, { status: 400 });
  }
  if (typeof fingerprint !== "string" || !/^[a-f0-9]{64}$/i.test(fingerprint)) {
    return NextResponse.json({ error: "The image fingerprint is invalid." }, { status: 400 });
  }

  const extension = file.type === "image/webp" ? "webp" : file.type === "image/png" ? "png" : "jpg";
  const path = `admin-products/${fingerprint}.${extension}`;
  try {
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: {
        fetch: (input, init) => fetch(input, {
          ...init,
          signal: init?.signal
            ? AbortSignal.any([init.signal, AbortSignal.timeout(30_000)])
            : AbortSignal.timeout(30_000),
        }),
      },
    });
    const { error } = await supabase.storage.from(bucket).upload(path, file, {
      contentType: file.type,
      cacheControl: "31536000",
      upsert: true,
    });
    if (error) {
      logSupabaseError(`Server-side product image upload failed for bucket "${bucket}".`, error);
      return storageError(error);
    }

    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return NextResponse.json({ imageUrl: data.publicUrl });
  } catch (error) {
    logSupabaseError(`Unable to upload product image to bucket "${bucket}".`, error);
    return NextResponse.json(
      { error: "The server-side product image upload could not reach Supabase Storage." },
      { status: 502 },
    );
  }
}
