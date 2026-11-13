/*
# Add inspection videos to public report RPC

## Purpose
The get_public_inspection_report RPC previously returned inspection, sections,
items, photos, checkin_photos, and laborRate — but NOT inspection_videos.
Technicians can record video evidence during inspection, but that video never
reached the customer report. This migration updates the RPC to include videos.

## Changes
1. Replaces the existing get_public_inspection_report function with a version
   that also aggregates inspection_videos joined through inspection_items →
   inspection_sections, returning them as a "videos" array.
2. Each video row includes: id, item_id, video_url, caption, created_at.

## Security
- SECURITY DEFINER, same as before.
- REVOKE from PUBLIC, GRANT to anon + authenticated — unchanged.
- Only returns data for inspections where report_approved = true AND status
  IN ('approved', 'sent') — unchanged.
- No new tables, no new columns, no RLS policy changes.

## Idempotency
- CREATE OR REPLACE FUNCTION is idempotent.
- GRANT/REVOKE are repeated for safety.
*/

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
    'videos', COALESCE((
      SELECT jsonb_agg(to_jsonb(vid) ORDER BY vid.created_at)
      FROM public.inspection_videos vid
      JOIN public.inspection_items item ON item.id = vid.item_id
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
