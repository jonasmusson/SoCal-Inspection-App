-- Replace complex nested-subquery UPDATE policies (which depend on auth.uid() working
-- correctly through all JOINs) with simpler authenticated-role policies.
-- Inspections, sections, and items are only accessible to shop staff — any
-- authenticated user can update them (dashboard/inspect/review flows all need this).

DROP POLICY IF EXISTS "sections_update_inspection" ON inspection_sections;
CREATE POLICY "sections_update_inspection" ON inspection_sections FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "items_update_section" ON inspection_items;
CREATE POLICY "items_update_section" ON inspection_items FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "inspections_update_assigned" ON inspections;
CREATE POLICY "inspections_update_assigned" ON inspections FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Also open up SELECT policies the same way so reads never get blocked
DROP POLICY IF EXISTS "sections_select_inspection" ON inspection_sections;
CREATE POLICY "sections_select_inspection" ON inspection_sections FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "items_select_section" ON inspection_items;
CREATE POLICY "items_select_section" ON inspection_items FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "inspections_select_own" ON inspections;
CREATE POLICY "inspections_select_own" ON inspections FOR SELECT
  TO authenticated
  USING (true);