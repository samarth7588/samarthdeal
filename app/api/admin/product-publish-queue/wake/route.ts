import { NextResponse } from "next/server";

import { getAdminSession } from "../../../../_lib/admin-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { user, isAuthorized } = await getAdminSession(AbortSignal.timeout(15_000));
  if (!user || !isAuthorized) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "The publishing worker is not configured." }, { status: 503 });
  }

  try {
    const workerUrl = new URL("/api/cron/process-product-publish-queue", request.url);
    const response = await fetch(workerUrl, {
      headers: { authorization: `Bearer ${cronSecret}` },
      cache: "no-store",
      signal: AbortSignal.timeout(55_000),
    });
    const body: unknown = await response.json();
    return NextResponse.json(body, { status: response.status });
  } catch (error) {
    console.error("Unable to wake the product publishing worker.", error);
    return NextResponse.json({ error: "Unable to start the product publishing worker." }, { status: 503 });
  }
}
