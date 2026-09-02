-- Add is_checkin flag to template_sections
ALTER TABLE template_sections ADD COLUMN IF NOT EXISTS is_checkin BOOLEAN NOT NULL DEFAULT FALSE;

-- Shift all existing section sort_orders up by 1 to make room for the check-in section at 0
UPDATE template_sections SET sort_order = sort_order + 1 WHERE is_checkin = FALSE;

-- Insert a Check-In section for every existing template that doesn't already have one
INSERT INTO template_sections (template_id, section_name, sort_order, is_active, is_checkin)
SELECT id, 'Check-In', 0, true, true
FROM inspection_templates
WHERE id NOT IN (SELECT template_id FROM template_sections WHERE is_checkin = true);

-- Insert the 3 default check-in items for each new check-in section
INSERT INTO template_items (section_id, item_name, item_key, sort_order, is_active,
  photo_mode, video_mode, notes_mode, photo_required, video_required, notes_required)
SELECT
  ts.id,
  item_data.item_name,
  item_data.item_key,
  item_data.sort_order,
  true,
  item_data.photo_mode,
  item_data.video_mode,
  item_data.notes_mode,
  false, false, false
FROM template_sections ts
CROSS JOIN (VALUES
  ('Walk-around Photos', 'checkin_photos', 0, 'required'::text, 'hidden'::text, 'hidden'::text),
  ('Walk-around Video',  'checkin_video',  1, 'hidden'::text,  'required'::text, 'hidden'::text),
  ('Customer Concerns',  'checkin_notes',  2, 'hidden'::text,  'hidden'::text,   'optional'::text)
) AS item_data(item_name, item_key, sort_order, photo_mode, video_mode, notes_mode)
WHERE ts.is_checkin = true
  AND ts.id NOT IN (SELECT section_id FROM template_items WHERE item_key IN ('checkin_photos', 'checkin_video', 'checkin_notes'));
