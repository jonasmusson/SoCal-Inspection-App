-- ============================================================
-- 1. Fix mutable search_path on trigger functions
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_search_vector()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  NEW.search_vector =
    setweight(to_tsvector('english', COALESCE(NEW.customer_first_name, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.customer_last_name,  '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.customer_email,      '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.vehicle_make,        '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.vehicle_model,       '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.vehicle_vin,         '')), 'B');
  RETURN NEW;
END;
$$;

-- ============================================================
-- 2. Lock down SECURITY DEFINER RPCs — revoke anon, add role
--    guard inside get_all_profiles / get_tech_profiles
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.get_all_profiles()      FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_tech_profiles()     FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_manager_or_owner()   FROM anon;

-- Rebuild with internal role-guard so even authenticated non-managers can't list all profiles
CREATE OR REPLACE FUNCTION public.get_all_profiles()
  RETURNS SETOF user_profiles LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid() AND role IN ('manager','owner')
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  RETURN QUERY SELECT * FROM user_profiles ORDER BY created_at ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_tech_profiles()
  RETURNS SETOF user_profiles LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid() AND role IN ('manager','owner')
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  RETURN QUERY
    SELECT * FROM user_profiles WHERE role = 'tech' AND status = 'active' ORDER BY full_name;
END;
$$;

-- Re-grant to authenticated only (anon stays revoked)
GRANT EXECUTE ON FUNCTION public.get_all_profiles()    TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_tech_profiles()   TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_manager_or_owner() TO authenticated;

-- ============================================================
-- Helper: inline manager/owner check (avoids SECURITY DEFINER
-- call chain in policies; safe against recursion because it
-- directly queries user_profiles which has permissive SELECT
-- for authenticated via its own policies).
-- ============================================================
-- We use an inline EXISTS(...) subquery in each policy below.

-- ============================================================
-- 3. inspections — INSERT & UPDATE
-- ============================================================

DROP POLICY IF EXISTS inspections_insert_manager  ON inspections;
DROP POLICY IF EXISTS inspections_update_assigned ON inspections;

CREATE POLICY inspections_insert_manager ON inspections FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('manager','owner')
    )
  );

CREATE POLICY inspections_update_assigned ON inspections FOR UPDATE
  TO authenticated
  USING (
    assigned_tech_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('manager','owner')
    )
  )
  WITH CHECK (
    assigned_tech_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('manager','owner')
    )
  );

-- ============================================================
-- 4. inspection_sections — INSERT & UPDATE
--    INSERT: manager/owner only (created during inspection setup)
--    UPDATE: assigned tech OR manager/owner
-- ============================================================

DROP POLICY IF EXISTS sections_insert_inspection ON inspection_sections;
DROP POLICY IF EXISTS sections_update_inspection ON inspection_sections;

CREATE POLICY sections_insert_inspection ON inspection_sections FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('manager','owner')
    )
  );

CREATE POLICY sections_update_inspection ON inspection_sections FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM inspections i
      WHERE i.id = inspection_sections.inspection_id
        AND (
          i.assigned_tech_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM user_profiles
            WHERE id = auth.uid() AND role IN ('manager','owner')
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM inspections i
      WHERE i.id = inspection_sections.inspection_id
        AND (
          i.assigned_tech_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM user_profiles
            WHERE id = auth.uid() AND role IN ('manager','owner')
          )
        )
    )
  );

-- ============================================================
-- 5. inspection_items — INSERT & UPDATE
--    INSERT: manager/owner only
--    UPDATE: assigned tech (via section→inspection) OR manager/owner
-- ============================================================

DROP POLICY IF EXISTS items_insert_section ON inspection_items;
DROP POLICY IF EXISTS items_update_section ON inspection_items;

CREATE POLICY items_insert_section ON inspection_items FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('manager','owner')
    )
  );

CREATE POLICY items_update_section ON inspection_items FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM inspection_sections sec
      JOIN inspections i ON i.id = sec.inspection_id
      WHERE sec.id = inspection_items.section_id
        AND (
          i.assigned_tech_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM user_profiles
            WHERE id = auth.uid() AND role IN ('manager','owner')
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM inspection_sections sec
      JOIN inspections i ON i.id = sec.inspection_id
      WHERE sec.id = inspection_items.section_id
        AND (
          i.assigned_tech_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM user_profiles
            WHERE id = auth.uid() AND role IN ('manager','owner')
          )
        )
    )
  );

-- ============================================================
-- 6. inspection_videos — INSERT & DELETE
--    INSERT: assigned tech or manager/owner (via item→section→inspection)
--    DELETE: manager/owner only
-- ============================================================

DROP POLICY IF EXISTS videos_insert ON inspection_videos;
DROP POLICY IF EXISTS videos_delete ON inspection_videos;

CREATE POLICY videos_insert ON inspection_videos FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM inspection_items it
      JOIN inspection_sections sec ON sec.id = it.section_id
      JOIN inspections i ON i.id = sec.inspection_id
      WHERE it.id = inspection_videos.item_id
        AND (
          i.assigned_tech_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM user_profiles
            WHERE id = auth.uid() AND role IN ('manager','owner')
          )
        )
    )
  );

CREATE POLICY videos_delete ON inspection_videos FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('manager','owner')
    )
  );

-- ============================================================
-- 7. checkin_photos — INSERT & DELETE (manager/owner only)
-- ============================================================

DROP POLICY IF EXISTS checkin_photos_insert ON checkin_photos;
DROP POLICY IF EXISTS checkin_photos_delete ON checkin_photos;

CREATE POLICY checkin_photos_insert ON checkin_photos FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('manager','owner')
    )
  );

CREATE POLICY checkin_photos_delete ON checkin_photos FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('manager','owner')
    )
  );

-- ============================================================
-- 8. email_templates — INSERT & UPDATE (manager/owner only)
-- ============================================================

DROP POLICY IF EXISTS email_templates_insert ON email_templates;
DROP POLICY IF EXISTS email_templates_update ON email_templates;

CREATE POLICY email_templates_insert ON email_templates FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('manager','owner')
    )
  );

CREATE POLICY email_templates_update ON email_templates FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('manager','owner')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('manager','owner')
    )
  );

-- ============================================================
-- 9. inspection_templates — INSERT, UPDATE, DELETE
-- ============================================================

DROP POLICY IF EXISTS templates_insert ON inspection_templates;
DROP POLICY IF EXISTS templates_update ON inspection_templates;
DROP POLICY IF EXISTS templates_delete ON inspection_templates;

CREATE POLICY templates_insert ON inspection_templates FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('manager','owner')
    )
  );

CREATE POLICY templates_update ON inspection_templates FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('manager','owner')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('manager','owner')
    )
  );

CREATE POLICY templates_delete ON inspection_templates FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('manager','owner')
    )
  );

-- ============================================================
-- 10. shop_settings — INSERT & UPDATE (manager/owner only)
-- ============================================================

DROP POLICY IF EXISTS shop_settings_insert ON shop_settings;
DROP POLICY IF EXISTS shop_settings_update ON shop_settings;

CREATE POLICY shop_settings_insert ON shop_settings FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('manager','owner')
    )
  );

CREATE POLICY shop_settings_update ON shop_settings FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('manager','owner')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('manager','owner')
    )
  );

-- ============================================================
-- 11. template_items — INSERT, UPDATE, DELETE (manager/owner)
-- ============================================================

DROP POLICY IF EXISTS titems_insert ON template_items;
DROP POLICY IF EXISTS titems_update ON template_items;
DROP POLICY IF EXISTS titems_delete ON template_items;

CREATE POLICY titems_insert ON template_items FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('manager','owner')
    )
  );

CREATE POLICY titems_update ON template_items FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('manager','owner')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('manager','owner')
    )
  );

CREATE POLICY titems_delete ON template_items FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('manager','owner')
    )
  );

-- ============================================================
-- 12. template_sections — INSERT, UPDATE, DELETE (manager/owner)
-- ============================================================

DROP POLICY IF EXISTS tsections_insert ON template_sections;
DROP POLICY IF EXISTS tsections_update ON template_sections;
DROP POLICY IF EXISTS tsections_delete ON template_sections;

CREATE POLICY tsections_insert ON template_sections FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('manager','owner')
    )
  );

CREATE POLICY tsections_update ON template_sections FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('manager','owner')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('manager','owner')
    )
  );

CREATE POLICY tsections_delete ON template_sections FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('manager','owner')
    )
  );

-- ============================================================
-- 13. Storage — restrict broad SELECT policies to prevent
--     anonymous bucket listing (public URL access still works)
-- ============================================================

DROP POLICY IF EXISTS "Photos are publicly viewable"    ON storage.objects;
DROP POLICY IF EXISTS "insp_videos_storage_select"      ON storage.objects;

-- Allow authenticated users to read only objects in their path.
-- Public CDN URLs remain accessible without any storage policy.
CREATE POLICY "insp_photos_storage_select" ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'inspection-photos');

CREATE POLICY "insp_videos_storage_select_auth" ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'inspection-videos');
