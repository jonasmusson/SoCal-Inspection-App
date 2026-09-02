INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('brand', 'brand', true, 1048576, ARRAY['image/png','image/jpeg','image/svg+xml','image/webp'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "brand_public_select" ON storage.objects FOR SELECT
  USING (bucket_id = 'brand');

CREATE POLICY "brand_service_insert" ON storage.objects FOR INSERT
  TO service_role
  WITH CHECK (bucket_id = 'brand');

CREATE POLICY "brand_service_update" ON storage.objects FOR UPDATE
  TO service_role
  USING (bucket_id = 'brand');
