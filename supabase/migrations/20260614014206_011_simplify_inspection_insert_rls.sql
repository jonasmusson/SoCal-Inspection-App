-- Simplify INSERT policies to match the SELECT/UPDATE approach.
-- Any authenticated shop staff member can create inspections, sections, and items.
DROP POLICY IF EXISTS "inspections_insert_manager" ON inspections;
CREATE POLICY "inspections_insert_manager" ON inspections FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "sections_insert_inspection" ON inspection_sections;
CREATE POLICY "sections_insert_inspection" ON inspection_sections FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "items_insert_section" ON inspection_items;
CREATE POLICY "items_insert_section" ON inspection_items FOR INSERT
  TO authenticated
  WITH CHECK (true);