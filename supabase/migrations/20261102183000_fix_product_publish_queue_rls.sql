-- Review before applying to the configured Supabase project.
-- Replaces only the product queue and product image permissions with active-admin policies.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.product_publish_jobs') IS NULL THEN
    RAISE EXCEPTION 'public.product_publish_jobs is missing; apply 20261102_create_product_publish_queue.sql first';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM storage.buckets
    WHERE id = 'product-images'
  ) THEN
    RAISE EXCEPTION 'The configured product-images Storage bucket does not exist';
  END IF;
END;
$$;

-- Product cards use public object URLs; this enables read access only.
UPDATE storage.buckets
SET public = true
WHERE id = 'product-images';

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

DROP POLICY IF EXISTS "Active admins can upload product images" ON storage.objects;
CREATE POLICY "Active admins can upload product images"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'product-images'
    AND EXISTS (
      SELECT 1
      FROM public.admin_users
      WHERE user_id = (SELECT auth.uid())
        AND is_active = true
    )
  );

DROP POLICY IF EXISTS "Active admins can update product images" ON storage.objects;
CREATE POLICY "Active admins can update product images"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'product-images'
    AND EXISTS (
      SELECT 1
      FROM public.admin_users
      WHERE user_id = (SELECT auth.uid())
        AND is_active = true
    )
  )
  WITH CHECK (
    bucket_id = 'product-images'
    AND EXISTS (
      SELECT 1
      FROM public.admin_users
      WHERE user_id = (SELECT auth.uid())
        AND is_active = true
    )
  );

DROP POLICY IF EXISTS "Active admins can read product images" ON storage.objects;
CREATE POLICY "Active admins can read product images"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'product-images'
    AND EXISTS (
      SELECT 1
      FROM public.admin_users
      WHERE user_id = (SELECT auth.uid())
        AND is_active = true
    )
  );

GRANT SELECT, INSERT, UPDATE ON storage.objects TO authenticated;
GRANT INSERT ON public.product_posts TO service_role;

DO $$
BEGIN
  IF to_regclass('public.product_posts_serial_number_seq') IS NOT NULL THEN
    EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE public.product_posts_serial_number_seq TO service_role';
  END IF;
END;
$$;

COMMIT;
