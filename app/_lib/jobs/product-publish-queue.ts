import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

type PublishJob = {
  id: string;
  image_url: string;
  description: string;
  product_status: "draft" | "live" | "over";
  product_name: string | null;
  brand: string | null;
  platform: string | null;
  order_price: number | null;
  less_price: number | null;
  rating: number | null;
  attempts: number;
};
type QueueSupabaseClient = SupabaseClient;

async function timeWorkerOperation<T>(
  operation: string,
  run: () => PromiseLike<T>,
  jobId?: string,
): Promise<T> {
  const startedAt = performance.now();
  try {
    return await run();
  } finally {
    console.info("Product publishing worker timing", {
      operation,
      jobId,
      durationMs: Math.round(performance.now() - startedAt),
    });
  }
}


function missingColumn(error: { code?: string; message?: string }) {
  return error.code === "PGRST204" || error.code === "42703" ||
    error.message?.toLowerCase().includes("column") === true;
}

function duplicateId(error: { code?: string; details?: string; message?: string }, id: string) {
  return error.code === "23505" && (
    error.details?.includes(`(id)=(${id})`) === true ||
    error.message?.includes("product_posts_pkey") === true
  );
}

function backoff(attempts: number) {
  return Math.min(15 * 60, 15 * (2 ** Math.max(0, attempts - 1)));
}

function configuredConcurrency() {
  const configured = process.env.PRODUCT_PUBLISH_CONCURRENCY ?? "3";
  const concurrency = Number(configured);
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 5) {
    throw new Error("PRODUCT_PUBLISH_CONCURRENCY must be an integer from 1 to 5.");
  }
  return concurrency;
}

async function setJobState(
  supabase: QueueSupabaseClient,
  job: PublishJob,
  state: "published" | "queued" | "failed",
  errorMessage: string | null = null,
) {
  const now = new Date();
  const terminalFailure = state === "queued" && job.attempts >= 6;
  const finalState = terminalFailure ? "failed" : state;
  const { error } = await supabase
    .from("product_publish_jobs")
    .update({
      state: finalState,
      locked_until: null,
      last_error: errorMessage,
      next_attempt_at: finalState === "queued"
        ? new Date(now.getTime() + backoff(job.attempts) * 1000).toISOString()
        : now.toISOString(),
      published_at: finalState === "published" ? now.toISOString() : null,
      updated_at: now.toISOString(),
    })
    .eq("id", job.id);
  if (error) throw error;
}

async function publishJob(
  supabase: QueueSupabaseClient,
  job: PublishJob,
): Promise<"published" | "retrying" | "failed"> {
  const fullPayload = {
    id: job.id,
    image_url: job.image_url,
    description: job.description,
    status: job.product_status,
    product_name: job.product_name,
    brand: job.brand,
    platform: job.platform,
    order_price: job.order_price,
    less_price: job.less_price,
    rating: job.rating,
  };
  let { error } = await timeWorkerOperation(
    "product-insert",
    () => supabase.from("product_posts").insert(fullPayload),
    job.id,
  );

  if (error && missingColumn(error)) {
    const metadataPayload = {
      id: job.id,
      image_url: job.image_url,
      description: job.description,
      status: job.product_status,
      product_name: job.product_name,
      brand: job.brand,
      platform: job.platform,
      order_price: job.order_price,
      less_price: job.less_price,
    };
    ({ error } = await timeWorkerOperation(
      "product-insert-metadata-fallback",
      () => supabase.from("product_posts").insert(metadataPayload),
      job.id,
    ));
  }

  if (error && missingColumn(error)) {
    ({ error } = await timeWorkerOperation(
      "product-insert-base-fallback",
      () => supabase.from("product_posts").insert({
        id: job.id,
        image_url: job.image_url,
        description: job.description,
        status: job.product_status,
      }),
      job.id,
    ));
  }

  if (error && duplicateId(error, job.id)) {
    await setJobState(supabase, job, "published");
    return "published";
  }
  if (error) {
    const message = `${error.code ? `${error.code}: ` : ""}${error.message ?? "Product insert failed."}`.slice(0, 1000);
    await setJobState(supabase, job, "queued", message);
    return job.attempts >= 6 ? "failed" : "retrying";
  }

  await timeWorkerOperation(
    "queue-mark-published",
    () => setJobState(supabase, job, "published"),
    job.id,
  );
  return "published";
}

async function processOne(supabase: QueueSupabaseClient, concurrency: number) {
  const { data: jobs, error } = await timeWorkerOperation(
    "queue-claim",
    () => supabase.rpc("claim_product_publish_job", {
      max_concurrent: concurrency,
    }),
  );
  if (error) throw error;
  const job = (jobs as PublishJob[] | null)?.[0];
  if (!job) return "empty";

  try {
    return await publishJob(supabase, job);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected publishing worker error.";
    try {
      await setJobState(supabase, job, "queued", message.slice(0, 1000));
    } catch (stateError) {
      console.error("Unable to record product publishing worker failure.", stateError);
      throw stateError;
    }
    return job.attempts >= 6 ? "failed" : "retrying";
  }
}

export type JobResult = { status: number; body: Record<string, unknown> };

export async function runProductPublishQueue(): Promise<JobResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return { status: 500, body: { error: "Product queue worker is not configured." } };
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let concurrency: number;
  try {
    concurrency = configuredConcurrency();
  } catch (error) {
    console.error("Product publishing concurrency is misconfigured.", error);
    return { status: 500, body: { error: "Product queue worker concurrency is invalid." } };
  }

  const counts = { published: 0, retrying: 0, failed: 0 };
  const workers = Array.from({ length: concurrency }, async () => {
    for (let claimed = 0; claimed < 8; claimed += 1) {
      const result = await processOne(supabase, concurrency);
      if (result === "empty") break;
      counts[result] += 1;
    }
  });
  const results = await Promise.allSettled(workers);
  const failures = results.filter((result) => result.status === "rejected");
  if (failures.length > 0) {
    console.error("Some product queue worker loops failed.", failures);
    return { status: 500, body: { counts, workerErrors: failures.length } };
  }
  return { status: 200, body: { counts } };
}
