-- Secure, tokenized customer access to approved inspection reports.
ALTER TABLE public.inspections
  ADD COLUMN IF NOT EXISTS report_access_token uuid NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS inspections_report_access_token_idx
  ON public.inspections (report_access_token);

CREATE OR REPLACE FUNCTION public.get_public_inspection_report(p_token uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'inspection', to_jsonb(i),
    'sections', COALESCE((
      SELECT jsonb_agg(to_jsonb(s) ORDER BY s.section_number)
      FROM public.inspection_sections s
      WHERE s.inspection_id = i.id
    ), '[]'::jsonb),
    'items', COALESCE((
      SELECT jsonb_agg(to_jsonb(item) ORDER BY section.section_number, item.created_at)
      FROM public.inspection_items item
      JOIN public.inspection_sections section ON section.id = item.section_id
      WHERE section.inspection_id = i.id
    ), '[]'::jsonb),
    'photos', COALESCE((
      SELECT jsonb_agg(to_jsonb(photo) ORDER BY photo.created_at)
      FROM public.inspection_photos photo
      JOIN public.inspection_items item ON item.id = photo.item_id
      JOIN public.inspection_sections section ON section.id = item.section_id
      WHERE section.inspection_id = i.id
    ), '[]'::jsonb),
    'checkinPhotos', COALESCE((
      SELECT jsonb_agg(to_jsonb(photo) ORDER BY photo.created_at)
      FROM public.checkin_photos photo
      WHERE photo.inspection_id = i.id
    ), '[]'::jsonb),
    'laborRate', COALESCE((
      SELECT NULLIF(setting.value, '')::numeric
      FROM public.shop_settings setting
      WHERE setting.key = 'labor_rate'
      LIMIT 1
    ), 175)
  )
  FROM public.inspections i
  WHERE i.report_access_token = p_token
    AND i.report_approved = true
    AND i.status IN ('approved', 'sent')
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_public_inspection_report(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_inspection_report(uuid) TO anon, authenticated;
