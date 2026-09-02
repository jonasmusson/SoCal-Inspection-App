-- Add 3-state mode columns to template_items
ALTER TABLE template_items
  ADD COLUMN IF NOT EXISTS photo_mode TEXT DEFAULT 'optional' CHECK (photo_mode IN ('hidden', 'optional', 'required')),
  ADD COLUMN IF NOT EXISTS video_mode TEXT DEFAULT 'hidden'   CHECK (video_mode IN ('hidden', 'optional', 'required')),
  ADD COLUMN IF NOT EXISTS notes_mode TEXT DEFAULT 'optional' CHECK (notes_mode IN ('hidden', 'optional', 'required'));

-- Migrate existing boolean flags → mode values
UPDATE template_items SET
  photo_mode = CASE WHEN photo_required THEN 'required' ELSE 'optional' END,
  notes_mode = CASE WHEN notes_required THEN 'required' ELSE 'optional' END;
-- video_mode stays 'hidden' (no video was offered before)

-- ─── Add 3-state mode columns to inspection_items ────────────────────────────
ALTER TABLE inspection_items
  ADD COLUMN IF NOT EXISTS photo_mode TEXT DEFAULT 'optional' CHECK (photo_mode IN ('hidden', 'optional', 'required')),
  ADD COLUMN IF NOT EXISTS video_mode TEXT DEFAULT 'hidden'   CHECK (video_mode IN ('hidden', 'optional', 'required')),
  ADD COLUMN IF NOT EXISTS notes_mode TEXT DEFAULT 'optional' CHECK (notes_mode IN ('hidden', 'optional', 'required'));

UPDATE inspection_items SET
  photo_mode = CASE WHEN photo_required THEN 'required' ELSE 'optional' END,
  notes_mode = CASE WHEN notes_required THEN 'required' ELSE 'optional' END;

-- ─── inspection_videos table ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inspection_videos (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id    UUID NOT NULL REFERENCES inspection_items(id) ON DELETE CASCADE,
  video_url  TEXT NOT NULL,
  caption    TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE inspection_videos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "videos_select" ON inspection_videos FOR SELECT TO authenticated USING (true);
CREATE POLICY "videos_insert" ON inspection_videos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "videos_delete" ON inspection_videos FOR DELETE TO authenticated USING (true);

-- ─── Storage bucket for videos ────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
  VALUES ('inspection-videos', 'inspection-videos', true)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "insp_videos_storage_select" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'inspection-videos');
CREATE POLICY "insp_videos_storage_insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'inspection-videos');
CREATE POLICY "insp_videos_storage_delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'inspection-videos');