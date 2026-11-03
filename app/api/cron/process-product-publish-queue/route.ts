import { NextResponse } from "next/server";

import { hasValidCronSecret } from "../../../_lib/jobs/cron-auth";
import { runProductPublishQueue } from "../../../_lib/jobs/product-publish-queue";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!hasValidCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const { status, body } = await runProductPublishQueue();
  return NextResponse.json(body, { status });
}
