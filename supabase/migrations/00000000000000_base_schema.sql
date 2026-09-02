-- SoCal Autoworks Inspection App: recoverable base schema.
-- The designated shop owner becomes active owner. Every other signup begins pending.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text NOT NULL DEFAULT '',
  first_name text,
  last_name text,
  phone text,
  role text NOT NULL DEFAULT 'tech' CHECK (role IN ('owner', 'manager', 'tech')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_designated_owner boolean;
  given_first_name text;
  given_last_name text;
  given_full_name text;
BEGIN
  is_designated_owner := lower(COALESCE(NEW.email, '')) = 'jonasmusson@gmail.com';
  given_first_name := COALESCE(NEW.raw_user_meta_data ->> 'first_name', '');
  given_last_name := COALESCE(NEW.raw_user_meta_data ->> 'last_name', '');
  given_full_name := COALESCE(
    NULLIF(NEW.raw_user_meta_data ->> 'full_name', ''),
    NULLIF(trim(given_first_name || ' ' || given_last_name), ''),
    split_part(COALESCE(NEW.email, ''), '@', 1)
  );

  INSERT INTO public.user_profiles (
    id, email, full_name, first_name, last_name, role, status
  ) VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    given_full_name,
    NULLIF(given_first_name, ''),
    NULLIF(given_last_name, ''),
    CASE WHEN is_designated_owner THEN 'owner' ELSE 'tech' END,
    CASE WHEN is_designated_owner THEN 'active' ELSE 'pending' END
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE IF NOT EXISTS public.inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_first_name text NOT NULL,
  customer_last_name text NOT NULL,
  customer_phone text NOT NULL,
  customer_email text NOT NULL,
  vehicle_year integer NOT NULL,
  vehicle_make text NOT NULL,
  vehicle_model text NOT NULL,
  vehicle_vin text,
  vehicle_mileage integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started', 'in_progress', 'pending_review', 'approved', 'sent')),
  progress_percent integer NOT NULL DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
  assigned_tech_id uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_by uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
  manager_notes text,
  tech_notes text,
  overall_condition text CHECK (overall_condition IS NULL OR overall_condition IN ('good', 'monitor', 'needs_attention')),
  investment_guidance text,
  report_approved boolean NOT NULL DEFAULT false,
  report_sent boolean NOT NULL DEFAULT false,
  report_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  approved_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.inspection_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id uuid NOT NULL REFERENCES public.inspections(id) ON DELETE CASCADE,
  section_number integer NOT NULL,
  section_name text NOT NULL,
  overall_status text CHECK (overall_status IS NULL OR overall_status IN ('good', 'monitor', 'needs_attention')),
  notes text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (inspection_id, section_number)
);

CREATE TABLE IF NOT EXISTS public.inspection_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES public.inspection_sections(id) ON DELETE CASCADE,
  item_name text NOT NULL,
  item_key text NOT NULL,
  status text CHECK (status IS NULL OR status IN ('good', 'monitor', 'needs_attention')),
  notes text,
  photo_required boolean NOT NULL DEFAULT false,
  video_required boolean NOT NULL DEFAULT false,
  notes_required boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.inspection_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.inspection_items(id) ON DELETE CASCADE,
  photo_url text NOT NULL,
  caption text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inspections_assigned_tech_idx ON public.inspections(assigned_tech_id);
CREATE INDEX IF NOT EXISTS inspection_sections_inspection_idx ON public.inspection_sections(inspection_id);
CREATE INDEX IF NOT EXISTS inspection_items_section_idx ON public.inspection_items(section_id);
CREATE INDEX IF NOT EXISTS inspection_photos_item_idx ON public.inspection_photos(item_id);

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspection_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspection_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspection_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_select_own ON public.user_profiles;
CREATE POLICY users_select_own ON public.user_profiles FOR SELECT TO authenticated USING (auth.uid() = id);
DROP POLICY IF EXISTS users_update_own ON public.user_profiles;
DROP POLICY IF EXISTS users_insert_own ON public.user_profiles;
DROP POLICY IF EXISTS managers_update_all ON public.user_profiles;
CREATE POLICY managers_update_all ON public.user_profiles FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.role IN ('owner', 'manager') AND up.status = 'active'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.role IN ('owner', 'manager') AND up.status = 'active'));

DROP POLICY IF EXISTS inspections_select_own ON public.inspections;
CREATE POLICY inspections_select_own ON public.inspections FOR SELECT TO authenticated
  USING (
    assigned_tech_id = auth.uid()
    OR created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role IN ('owner', 'manager') AND status = 'active')
  );
DROP POLICY IF EXISTS inspections_insert_manager ON public.inspections;
CREATE POLICY inspections_insert_manager ON public.inspections FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role IN ('owner', 'manager') AND status = 'active'));
DROP POLICY IF EXISTS inspections_update_assigned ON public.inspections;
CREATE POLICY inspections_update_assigned ON public.inspections FOR UPDATE TO authenticated
  USING (assigned_tech_id = auth.uid() OR EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role IN ('owner', 'manager') AND status = 'active'))
  WITH CHECK (assigned_tech_id = auth.uid() OR EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role IN ('owner', 'manager') AND status = 'active'));

DROP POLICY IF EXISTS sections_select_inspection ON public.inspection_sections;
CREATE POLICY sections_select_inspection ON public.inspection_sections FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.inspections i
    WHERE i.id = inspection_sections.inspection_id
      AND (i.assigned_tech_id = auth.uid() OR i.created_by = auth.uid() OR EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role IN ('owner', 'manager') AND status = 'active'))
  ));
DROP POLICY IF EXISTS sections_insert_inspection ON public.inspection_sections;
CREATE POLICY sections_insert_inspection ON public.inspection_sections FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role IN ('owner', 'manager') AND status = 'active'));
DROP POLICY IF EXISTS sections_update_inspection ON public.inspection_sections;
CREATE POLICY sections_update_inspection ON public.inspection_sections FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.inspections i WHERE i.id = inspection_sections.inspection_id AND (i.assigned_tech_id = auth.uid() OR EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role IN ('owner', 'manager') AND status = 'active'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.inspections i WHERE i.id = inspection_sections.inspection_id AND (i.assigned_tech_id = auth.uid() OR EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role IN ('owner', 'manager') AND status = 'active'))));

DROP POLICY IF EXISTS items_select_section ON public.inspection_items;
CREATE POLICY items_select_section ON public.inspection_items FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.inspection_sections s
    JOIN public.inspections i ON i.id = s.inspection_id
    WHERE s.id = inspection_items.section_id
      AND (i.assigned_tech_id = auth.uid() OR i.created_by = auth.uid() OR EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role IN ('owner', 'manager') AND status = 'active'))
  ));
DROP POLICY IF EXISTS items_insert_section ON public.inspection_items;
CREATE POLICY items_insert_section ON public.inspection_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role IN ('owner', 'manager') AND status = 'active'));
DROP POLICY IF EXISTS items_update_section ON public.inspection_items;
CREATE POLICY items_update_section ON public.inspection_items FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.inspection_sections s JOIN public.inspections i ON i.id = s.inspection_id WHERE s.id = inspection_items.section_id AND (i.assigned_tech_id = auth.uid() OR EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role IN ('owner', 'manager') AND status = 'active'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.inspection_sections s JOIN public.inspections i ON i.id = s.inspection_id WHERE s.id = inspection_items.section_id AND (i.assigned_tech_id = auth.uid() OR EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role IN ('owner', 'manager') AND status = 'active'))));

DROP POLICY IF EXISTS photos_select_authenticated ON public.inspection_photos;
CREATE POLICY photos_select_authenticated ON public.inspection_photos FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.inspection_items item
    JOIN public.inspection_sections section ON section.id = item.section_id
    JOIN public.inspections inspection ON inspection.id = section.inspection_id
    WHERE item.id = inspection_photos.item_id
      AND (inspection.assigned_tech_id = auth.uid() OR inspection.created_by = auth.uid() OR EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role IN ('owner', 'manager') AND status = 'active'))
  ));
DROP POLICY IF EXISTS photos_insert_authenticated ON public.inspection_photos;
CREATE POLICY photos_insert_authenticated ON public.inspection_photos FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.inspection_items item
    JOIN public.inspection_sections section ON section.id = item.section_id
    JOIN public.inspections inspection ON inspection.id = section.inspection_id
    WHERE item.id = inspection_photos.item_id
      AND (inspection.assigned_tech_id = auth.uid() OR EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role IN ('owner', 'manager') AND status = 'active'))
  ));
DROP POLICY IF EXISTS photos_delete_authenticated ON public.inspection_photos;
CREATE POLICY photos_delete_authenticated ON public.inspection_photos FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role IN ('owner', 'manager') AND status = 'active'));

INSERT INTO storage.buckets (id, name, public)
VALUES ('inspection-photos', 'inspection-photos', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS inspection_photo_objects_select ON storage.objects;
CREATE POLICY inspection_photo_objects_select ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'inspection-photos'
    AND EXISTS (
      SELECT 1 FROM public.inspections inspection
      WHERE inspection.id::text = (storage.foldername(name))[1]
        AND (inspection.assigned_tech_id = auth.uid() OR inspection.created_by = auth.uid() OR EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role IN ('owner', 'manager') AND status = 'active'))
    )
  );
DROP POLICY IF EXISTS inspection_photo_objects_insert ON storage.objects;
CREATE POLICY inspection_photo_objects_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'inspection-photos'
    AND EXISTS (
      SELECT 1 FROM public.inspections inspection
      WHERE inspection.id::text = (storage.foldername(name))[1]
        AND (inspection.assigned_tech_id = auth.uid() OR EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role IN ('owner', 'manager') AND status = 'active'))
    )
  );
DROP POLICY IF EXISTS inspection_photo_objects_delete ON storage.objects;
CREATE POLICY inspection_photo_objects_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'inspection-photos' AND EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role IN ('owner', 'manager') AND status = 'active'));
