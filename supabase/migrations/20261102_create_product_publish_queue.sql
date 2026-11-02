-- Review only. Do not run this file until the schema and policy design are approved.

BEGIN;

CREATE TABLE IF NOT EXISTS public.product_publish_jobs (
  id uuid PRIMARY KEY,
  image_url text NOT NULL,
  description text NOT NULL CHECK (char_length(trim(description)) BETWEEN 1 AND 10000),
  product_status text NOT NULL CHECK (product_status IN ('draft', 'live', 'over')),
  product_name text,
  brand text,
  platform text,
  order_price numeric,
  less_price numeric,
  rating numeric,
  state text NOT NULL DEFAULT 'queued'
    CHECK (state IN ('queued', 'processing', 'published', 'failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);

CREATE INDEX IF NOT EXISTS product_publish_jobs_queue_idx
  ON public.product_publish_jobs (next_attempt_at, created_at)
  WHERE state IN ('queued', 'processing');

ALTER TABLE public.product_publish_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Active admins can read product publish jobs"
  ON public.product_publish_jobs;
CREATE POLICY "Active admins can read product publish jobs"
  ON public.product_publish_jobs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.admin_users
      WHERE user_id = (SELECT auth.uid())
        AND is_active = true
    )
  );

DROP POLICY IF EXISTS "Active admins can enqueue product publish jobs"
  ON public.product_publish_jobs;
CREATE POLICY "Active admins can enqueue product publish jobs"
  ON public.product_publish_jobs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    state = 'queued'
    AND attempts = 0
    AND EXISTS (
      SELECT 1
      FROM public.admin_users
      WHERE user_id = (SELECT auth.uid())
        AND is_active = true
    )
  );

REVOKE ALL ON public.product_publish_jobs FROM anon;
GRANT SELECT, INSERT ON public.product_publish_jobs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.product_publish_jobs TO service_role;

CREATE OR REPLACE FUNCTION public.claim_product_publish_job(max_concurrent integer DEFAULT 3)
RETURNS SETOF public.product_publish_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF max_concurrent < 1 OR max_concurrent > 5 THEN
    RAISE EXCEPTION 'max_concurrent must be between 1 and 5';
  END IF;

  PERFORM pg_advisory_xact_lock(901527415);
  IF (
    SELECT count(*)
    FROM public.product_publish_jobs
    WHERE state = 'processing'
      AND locked_until > now()
  ) >= max_concurrent THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH candidate AS (
    SELECT id
    FROM public.product_publish_jobs
    WHERE (
      state = 'queued'
      AND next_attempt_at <= now()
    ) OR (
      state = 'processing'
      AND locked_until < now()
    )
    ORDER BY created_at, id
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  UPDATE public.product_publish_jobs AS job
  SET state = 'processing',
      attempts = job.attempts + 1,
      locked_until = now() + interval '5 minutes',
      last_error = NULL,
      updated_at = now()
  FROM candidate
  WHERE job.id = candidate.id
  RETURNING job.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_product_publish_job(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_product_publish_job(integer) TO service_role;

COMMIT;
