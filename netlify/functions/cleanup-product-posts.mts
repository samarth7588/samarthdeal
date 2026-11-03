import type { Config } from "@netlify/functions";

import { runProductPostCleanup } from "../../app/_lib/jobs/product-post-cleanup.ts";

const handler = async () => {
  const { status, body } = await runProductPostCleanup();
  if (status >= 400) console.error("Product post cleanup failed.", body);
  else console.info("Product post cleanup finished.", body);
};

export default handler;

export const config: Config = {
  schedule: "0 3 * * *",
};
