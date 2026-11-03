import { createClient } from "@supabase/supabase-js";

import { removeProductImage } from "../product-image-storage";
import type { JobResult } from "./product-publish-queue";

export async function runProductPostCleanup(): Promise<JobResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const storageBucket = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET;
  if (!supabaseUrl || !serviceRoleKey || !storageBucket) {
    return { status: 500, body: { error: "Cleanup is not configured." } };
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 4);
  const { data: posts, error: lookupError } = await supabase
    .from("product_posts")
    .select("id, image_url")
    .lte("published_at", cutoff.toISOString());
  if (lookupError) {
    return { status: 500, body: { error: "Unable to load expired product posts." } };
  }

  let deleted = 0;
  for (const post of posts ?? []) {
    const imageError = await removeProductImage(supabase, post.image_url, storageBucket);
    if (imageError) continue;
    const { error: deleteError } = await supabase.from("product_posts").delete().eq("id", post.id);
    if (!deleteError) deleted += 1;
  }

  return { status: 200, body: { deleted } };
}
