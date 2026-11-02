-- Review only. Do not run this file until the schema and policy design are approved.

BEGIN;

CREATE INDEX IF NOT EXISTS product_posts_created_at_idx
  ON public.product_posts (created_at DESC);

COMMIT;
