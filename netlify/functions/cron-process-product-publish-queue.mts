// Netlify replacement for the Vercel cron in vercel.json (Vercel crons do not run on Netlify).
export default async function handler(): Promise<Response> {
  const siteUrl = process.env.URL;
  const cronSecret = process.env.CRON_SECRET;
  if (!siteUrl || !cronSecret) {
    console.error("cron-process-product-publish-queue: URL or CRON_SECRET is not configured.");
    return new Response("Not configured", { status: 500 });
  }

  const response = await fetch(new URL("/api/cron/process-product-publish-queue", siteUrl), {
    headers: { authorization: `Bearer ${cronSecret}` },
  });
  const body = await response.text();
  console.log(`cron-process-product-publish-queue: ${response.status} ${body.slice(0, 500)}`);
  return new Response(body, { status: response.status });
}

export const config = {
  schedule: "* * * * *",
};
