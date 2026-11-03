import type { Config } from "@netlify/functions";

import { runProductPublishQueue } from "../../app/_lib/jobs/product-publish-queue.ts";

const handler = async () => {
  const { status, body } = await runProductPublishQueue();
  if (status >= 400) console.error("Product publish queue run failed.", body);
};

export default handler;

export const config: Config = {
  schedule: "* * * * *",
};
