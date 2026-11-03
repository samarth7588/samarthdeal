import { NextResponse } from "next/server";

import { getAdminSession } from "../../../../_lib/admin-auth";
import { runProductPublishQueue } from "../../../../_lib/jobs/product-publish-queue";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  const { user, isAuthorized } = await getAdminSession(AbortSignal.timeout(15_000));
  if (!user || !isAuthorized) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    // Run the worker in-process instead of calling our own public URL, which
    // fails when the site is behind password protection or team-only access.
    const { status, body } = await runProductPublishQueue();
    return NextResponse.json(body, { status });
  } catch (error) {
    console.error("Unable to run the product publishing worker.", error);
    return NextResponse.json({ error: "Unable to start the product publishing worker." }, { status: 503 });
  }
}
