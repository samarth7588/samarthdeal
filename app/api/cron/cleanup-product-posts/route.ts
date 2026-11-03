import { NextResponse } from "next/server";

import { hasValidCronSecret } from "../../../_lib/jobs/cron-auth";
import { runProductPostCleanup } from "../../../_lib/jobs/product-post-cleanup";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!hasValidCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const { status, body } = await runProductPostCleanup();
  return NextResponse.json(body, { status });
}
