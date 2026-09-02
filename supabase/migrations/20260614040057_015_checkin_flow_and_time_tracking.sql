-- ─── user_profiles: add phone ────────────────────────────────────────────────
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS phone TEXT;

-- ─── inspections: check-in and time-tracking fields ──────────────────────────
ALTER TABLE inspections
  ADD COLUMN IF NOT EXISTS checkin_notes     TEXT,
  ADD COLUMN IF NOT EXISTS checkin_video_url TEXT,
  ADD COLUMN IF NOT EXISTS checkin_complete  BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS work_started_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS work_completed_at TIMESTAMPTZ;

-- ─── checkin_photos table ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS checkin_photos (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id  UUID NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  photo_url      TEXT NOT NULL,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE checkin_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "checkin_photos_select" ON checkin_photos FOR SELECT TO authenticated USING (true);
CREATE POLICY "checkin_photos_insert" ON checkin_photos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "checkin_photos_delete" ON checkin_photos FOR DELETE TO authenticated USING (true);

-- ─── shop_settings table ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shop_settings (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key        TEXT NOT NULL UNIQUE,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE shop_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shop_settings_select" ON shop_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "shop_settings_update" ON shop_settings FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "shop_settings_insert" ON shop_settings FOR INSERT TO authenticated WITH CHECK (true);

INSERT INTO shop_settings (key, value) VALUES
  ('checkin_required_photos', '3'),
  ('checkin_video_required',  'true'),
  ('app_url',                 'https://your-app-url.com'),
  ('shop_name',               'SoCal Autoworks')
ON CONFLICT (key) DO NOTHING;

-- ─── Storage buckets ──────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public) VALUES ('checkin-photos', 'checkin-photos', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('checkin-videos', 'checkin-videos', true) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "checkin_media_select" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id IN ('checkin-photos', 'checkin-videos'));
CREATE POLICY "checkin_media_insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id IN ('checkin-photos', 'checkin-videos'));
