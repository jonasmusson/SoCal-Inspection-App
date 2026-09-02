-- ─── Template tables ─────────────────────────────────────────────────────────
CREATE TABLE inspection_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT,
  is_active   BOOLEAN DEFAULT true,
  sort_order  INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE template_sections (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id  UUID NOT NULL REFERENCES inspection_templates(id) ON DELETE CASCADE,
  section_name TEXT NOT NULL,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  is_active    BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE template_items (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id     UUID NOT NULL REFERENCES template_sections(id) ON DELETE CASCADE,
  item_name      TEXT NOT NULL,
  item_key       TEXT NOT NULL,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  is_active      BOOLEAN DEFAULT true,
  photo_required BOOLEAN DEFAULT false,
  video_required BOOLEAN DEFAULT false,
  notes_required BOOLEAN DEFAULT false,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Extend existing tables ───────────────────────────────────────────────────
ALTER TABLE inspections
  ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES inspection_templates(id);

ALTER TABLE inspection_items
  ADD COLUMN IF NOT EXISTS photo_required BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS video_required BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS notes_required BOOLEAN DEFAULT false;

-- ─── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE inspection_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_sections    ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_items       ENABLE ROW LEVEL SECURITY;

CREATE POLICY "templates_select"  ON inspection_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "templates_insert"  ON inspection_templates FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "templates_update"  ON inspection_templates FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "templates_delete"  ON inspection_templates FOR DELETE TO authenticated USING (true);

CREATE POLICY "tsections_select"  ON template_sections FOR SELECT TO authenticated USING (true);
CREATE POLICY "tsections_insert"  ON template_sections FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "tsections_update"  ON template_sections FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "tsections_delete"  ON template_sections FOR DELETE TO authenticated USING (true);

CREATE POLICY "titems_select"  ON template_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "titems_insert"  ON template_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "titems_update"  ON template_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "titems_delete"  ON template_items FOR DELETE TO authenticated USING (true);

-- ─── Seed: Standard (13-section) ─────────────────────────────────────────────
DO $$
DECLARE
  t_std     UUID; t_quick UUID; t_porsche UUID;
  s1 UUID; s2 UUID; s3 UUID; s4 UUID; s5 UUID;
  s6 UUID; s7 UUID; s8 UUID; s9 UUID; s10 UUID; s11 UUID; s12 UUID; s13 UUID;
BEGIN

-- Standard template
INSERT INTO inspection_templates (name, description, sort_order)
  VALUES ('Standard Inspection', 'Full 13-section inspection covering all major vehicle systems', 0)
  RETURNING id INTO t_std;

INSERT INTO template_sections (template_id, section_name, sort_order) VALUES (t_std, 'Body & Paint',           0)  RETURNING id INTO s1;
INSERT INTO template_items (section_id, item_name, item_key, sort_order) VALUES
  (s1, 'Paint Condition', 'paint_condition', 0),
  (s1, 'Rust',            'rust',            1),
  (s1, 'Panel Fit',       'panel_fit',       2),
  (s1, 'Glass',           'glass',           3),
  (s1, 'Trim',            'trim',            4);

INSERT INTO template_sections (template_id, section_name, sort_order) VALUES (t_std, 'Undercarriage', 1) RETURNING id INTO s2;
INSERT INTO template_items (section_id, item_name, item_key, sort_order) VALUES
  (s2, 'Frame',         'frame',         0),
  (s2, 'Floor Pans',    'floor_pans',    1),
  (s2, 'Leaks',         'leaks',         2),
  (s2, 'Exhaust',       'exhaust',       3),
  (s2, 'Rust Severity', 'rust_severity', 4);

INSERT INTO template_sections (template_id, section_name, sort_order) VALUES (t_std, 'Suspension & Steering', 2) RETURNING id INTO s3;
INSERT INTO template_items (section_id, item_name, item_key, sort_order) VALUES
  (s3, 'Ball Joints',  'ball_joints',  0),
  (s3, 'Bushings',     'bushings',     1),
  (s3, 'Shocks',       'shocks',       2),
  (s3, 'Steering',     'steering',     3),
  (s3, 'Ride Height',  'ride_height',  4),
  (s3, 'Clearance',    'clearance',    5);

INSERT INTO template_sections (template_id, section_name, sort_order) VALUES (t_std, 'Engine', 3) RETURNING id INTO s4;
INSERT INTO template_items (section_id, item_name, item_key, sort_order) VALUES
  (s4, 'Cold Start',       'cold_start',    0),
  (s4, 'Oil Condition',    'oil_condition', 1),
  (s4, 'Oil Leaks',        'oil_leaks',     2),
  (s4, 'Noise',            'noise',         3),
  (s4, 'Throttle',         'throttle',      4),
  (s4, 'Belts',            'belts',         5),
  (s4, 'Compression',      'compression',   6);

INSERT INTO template_sections (template_id, section_name, sort_order) VALUES (t_std, 'Cooling', 4) RETURNING id INTO s5;
INSERT INTO template_items (section_id, item_name, item_key, sort_order) VALUES
  (s5, 'Radiator',    'radiator',   0),
  (s5, 'Hoses',       'hoses',      1),
  (s5, 'Coolant',     'coolant',    2),
  (s5, 'Water Pump',  'water_pump', 3),
  (s5, 'Fan',         'fan',        4);

INSERT INTO template_sections (template_id, section_name, sort_order) VALUES (t_std, 'Brakes', 5) RETURNING id INTO s6;
INSERT INTO template_items (section_id, item_name, item_key, sort_order) VALUES
  (s6, 'Pads',              'pads',              0),
  (s6, 'Rotors',            'rotors',            1),
  (s6, 'Lines',             'lines',             2),
  (s6, 'Master Cylinder',   'master_cylinder',   3),
  (s6, 'Pedal',             'pedal',             4),
  (s6, 'Emergency Brake',   'emergency_brake',   5);

INSERT INTO template_sections (template_id, section_name, sort_order) VALUES (t_std, 'Wheels & Tires', 6) RETURNING id INTO s7;
INSERT INTO template_items (section_id, item_name, item_key, sort_order) VALUES
  (s7, 'Tire Condition', 'tire_condition', 0),
  (s7, 'Tread',          'tread',          1),
  (s7, 'Wear',           'wear',           2),
  (s7, 'Wheels',         'wheels',         3);

INSERT INTO template_sections (template_id, section_name, sort_order) VALUES (t_std, 'Fuel System', 7) RETURNING id INTO s8;
INSERT INTO template_items (section_id, item_name, item_key, sort_order) VALUES
  (s8, 'Tank',   'tank',       0),
  (s8, 'Lines',  'fuel_lines', 1),
  (s8, 'Pump',   'pump',       2),
  (s8, 'Filter', 'filter',     3);

INSERT INTO template_sections (template_id, section_name, sort_order) VALUES (t_std, 'Exhaust', 8) RETURNING id INTO s9;
INSERT INTO template_items (section_id, item_name, item_key, sort_order) VALUES
  (s9, 'Leaks',    'exhaust_leaks', 0),
  (s9, 'Fitment',  'fitment',       1),
  (s9, 'Rust',     'exhaust_rust',  2),
  (s9, 'Mounting', 'mounting',      3);

INSERT INTO template_sections (template_id, section_name, sort_order) VALUES (t_std, 'Transmission', 9) RETURNING id INTO s10;
INSERT INTO template_items (section_id, item_name, item_key, sort_order) VALUES
  (s10, 'Shift Quality', 'shift_quality', 0),
  (s10, 'Engagement',    'engagement',    1),
  (s10, 'Fluid',         'fluid',         2),
  (s10, 'Leaks',         'trans_leaks',   3);

INSERT INTO template_sections (template_id, section_name, sort_order) VALUES (t_std, 'Driveline', 10) RETURNING id INTO s11;
INSERT INTO template_items (section_id, item_name, item_key, sort_order) VALUES
  (s11, 'Differential', 'differential', 0),
  (s11, 'Driveshaft',   'driveshaft',   1),
  (s11, 'U-Joints',     'u_joints',     2);

INSERT INTO template_sections (template_id, section_name, sort_order) VALUES (t_std, 'Electrical', 11) RETURNING id INTO s12;
INSERT INTO template_items (section_id, item_name, item_key, sort_order) VALUES
  (s12, 'Battery',  'battery',  0),
  (s12, 'Charging', 'charging', 1),
  (s12, 'Wiring',   'wiring',   2),
  (s12, 'Lights',   'lights',   3),
  (s12, 'Gauges',   'gauges',   4);

INSERT INTO template_sections (template_id, section_name, sort_order) VALUES (t_std, 'Test Drive', 12) RETURNING id INTO s13;
INSERT INTO template_items (section_id, item_name, item_key, sort_order) VALUES
  (s13, 'Acceleration', 'acceleration',  0),
  (s13, 'Shifting',     'shifting',      1),
  (s13, 'Braking',      'braking',       2),
  (s13, 'Steering',     'test_steering', 3),
  (s13, 'Vibration',    'vibration',     4),
  (s13, 'Temperature',  'temperature',   5);

-- ─── Seed: Quick Inspection (5 sections) ─────────────────────────────────────
INSERT INTO inspection_templates (name, description, sort_order)
  VALUES ('Quick Inspection', 'Streamlined 5-section walkthrough for fast pre-purchase assessments', 1)
  RETURNING id INTO t_quick;

INSERT INTO template_sections (template_id, section_name, sort_order) VALUES (t_quick, 'Exterior & Glass', 0) RETURNING id INTO s1;
INSERT INTO template_items (section_id, item_name, item_key, sort_order, photo_required) VALUES
  (s1, 'Paint Condition', 'paint_condition', 0, true),
  (s1, 'Rust',            'rust',            1, true),
  (s1, 'Glass',           'glass',           2, false),
  (s1, 'Trim',            'trim',            3, false);

INSERT INTO template_sections (template_id, section_name, sort_order) VALUES (t_quick, 'Under Hood', 1) RETURNING id INTO s2;
INSERT INTO template_items (section_id, item_name, item_key, sort_order) VALUES
  (s2, 'Oil Condition', 'oil_condition', 0),
  (s2, 'Oil Leaks',     'oil_leaks',     1),
  (s2, 'Belts',         'belts',         2),
  (s2, 'Coolant',       'coolant',       3),
  (s2, 'Hoses',         'hoses',         4);

INSERT INTO template_sections (template_id, section_name, sort_order) VALUES (t_quick, 'Undercarriage', 2) RETURNING id INTO s3;
INSERT INTO template_items (section_id, item_name, item_key, sort_order, photo_required) VALUES
  (s3, 'Frame',         'frame',      0, true),
  (s3, 'Floor Pans',    'floor_pans', 1, true),
  (s3, 'Leaks',         'leaks',      2, false),
  (s3, 'Exhaust',       'exhaust',    3, false);

INSERT INTO template_sections (template_id, section_name, sort_order) VALUES (t_quick, 'Brakes & Wheels', 3) RETURNING id INTO s4;
INSERT INTO template_items (section_id, item_name, item_key, sort_order) VALUES
  (s4, 'Pads',           'pads',           0),
  (s4, 'Rotors',         'rotors',         1),
  (s4, 'Tire Condition', 'tire_condition', 2),
  (s4, 'Tread',          'tread',          3);

INSERT INTO template_sections (template_id, section_name, sort_order) VALUES (t_quick, 'Test Drive', 4) RETURNING id INTO s5;
INSERT INTO template_items (section_id, item_name, item_key, sort_order) VALUES
  (s5, 'Acceleration', 'acceleration', 0),
  (s5, 'Braking',      'braking',      1),
  (s5, 'Steering',     'steering',     2),
  (s5, 'Vibration',    'vibration',    3);

-- ─── Seed: Air-Cooled Porsche (10 sections) ───────────────────────────────────
INSERT INTO inspection_templates (name, description, sort_order)
  VALUES ('Air-Cooled Porsche', 'Specialized inspection for air-cooled Porsche vehicles — 911, 912, 914, 356 and variants', 2)
  RETURNING id INTO t_porsche;

INSERT INTO template_sections (template_id, section_name, sort_order) VALUES (t_porsche, 'Exterior & Body', 0) RETURNING id INTO s1;
INSERT INTO template_items (section_id, item_name, item_key, sort_order, photo_required) VALUES
  (s1, 'Paint Condition',         'paint_condition', 0, true),
  (s1, 'Rust',                    'rust',            1, true),
  (s1, 'Panel Fit & Alignment',   'panel_fit',       2, true),
  (s1, 'Glass',                   'glass',           3, false),
  (s1, 'Trim & Brightwork',       'trim',            4, false),
  (s1, 'Door Fit',                'door_fit',        5, false);

INSERT INTO template_sections (template_id, section_name, sort_order) VALUES (t_porsche, 'Undercarriage & Chassis', 1) RETURNING id INTO s2;
INSERT INTO template_items (section_id, item_name, item_key, sort_order, photo_required, notes_required) VALUES
  (s2, 'Floor Pans',                'floor_pans',          0, true,  true),
  (s2, 'Chassis Rails',             'chassis_rails',       1, true,  false),
  (s2, 'Torsion Bar Tubes',         'torsion_bar_tubes',   2, true,  false),
  (s2, 'Heat Exchanger Condition',  'heat_exchangers',     3, true,  true),
  (s2, 'Undercarriage Leaks',       'undercarriage_leaks', 4, false, false),
  (s2, 'Jack Points',               'jack_points',         5, false, false);

INSERT INTO template_sections (template_id, section_name, sort_order) VALUES (t_porsche, 'Engine Bay', 2) RETURNING id INTO s3;
INSERT INTO template_items (section_id, item_name, item_key, sort_order, photo_required) VALUES
  (s3, 'Tin Ware Completeness', 'tin_ware',      0, true),
  (s3, 'Fan Shroud',            'fan_shroud',    1, true),
  (s3, 'Oil Leaks',             'oil_leaks',     2, true),
  (s3, 'Wiring Condition',      'bay_wiring',    3, false),
  (s3, 'Hoses & Clamps',        'bay_hoses',     4, false);

INSERT INTO template_sections (template_id, section_name, sort_order) VALUES (t_porsche, 'Air-Cooled Engine', 3) RETURNING id INTO s4;
INSERT INTO template_items (section_id, item_name, item_key, sort_order, notes_required) VALUES
  (s4, 'Fan Belt',              'fan_belt',           0, false),
  (s4, 'Oil Cooler',            'oil_cooler',         1, false),
  (s4, 'Compression',           'compression',        2, true),
  (s4, 'Engine Noise',          'engine_noise',       3, true),
  (s4, 'Cold Start Behavior',   'cold_start',         4, true),
  (s4, 'Oil Consumption',       'oil_consumption',    5, true),
  (s4, 'Cooling Effectiveness', 'cooling',            6, false);

INSERT INTO template_sections (template_id, section_name, sort_order) VALUES (t_porsche, 'Fuel System', 4) RETURNING id INTO s5;
INSERT INTO template_items (section_id, item_name, item_key, sort_order) VALUES
  (s5, 'Carbs / Fuel Injection', 'carbs_injection', 0),
  (s5, 'Fuel Delivery',          'fuel_delivery',   1),
  (s5, 'Fuel Lines',             'fuel_lines',      2),
  (s5, 'Filter',                 'fuel_filter',     3);

INSERT INTO template_sections (template_id, section_name, sort_order) VALUES (t_porsche, 'Transmission', 5) RETURNING id INTO s6;
INSERT INTO template_items (section_id, item_name, item_key, sort_order, notes_required) VALUES
  (s6, 'Shift Quality', 'shift_quality', 0, false),
  (s6, 'Synchros',      'synchros',      1, true),
  (s6, 'Engagement',    'engagement',    2, false),
  (s6, 'Fluid',         'trans_fluid',   3, false),
  (s6, 'Leaks',         'trans_leaks',   4, false);

INSERT INTO template_sections (template_id, section_name, sort_order) VALUES (t_porsche, 'Suspension', 6) RETURNING id INTO s7;
INSERT INTO template_items (section_id, item_name, item_key, sort_order) VALUES
  (s7, 'Torsion Bars',    'torsion_bars',   0),
  (s7, 'Front Suspension','front_susp',     1),
  (s7, 'Ball Joints',     'ball_joints',    2),
  (s7, 'Wheel Bearings',  'wheel_bearings', 3),
  (s7, 'Ride Height',     'ride_height',    4),
  (s7, 'Alignment',       'alignment',      5);

INSERT INTO template_sections (template_id, section_name, sort_order) VALUES (t_porsche, 'Brakes', 7) RETURNING id INTO s8;
INSERT INTO template_items (section_id, item_name, item_key, sort_order) VALUES
  (s8, 'Pads',              'pads',              0),
  (s8, 'Rotors',            'rotors',            1),
  (s8, 'Calipers',          'calipers',          2),
  (s8, 'Lines',             'brake_lines',       3),
  (s8, 'Master Cylinder',   'master_cylinder',   4),
  (s8, 'Emergency Brake',   'emergency_brake',   5);

INSERT INTO template_sections (template_id, section_name, sort_order) VALUES (t_porsche, 'Electrical', 8) RETURNING id INTO s9;
INSERT INTO template_items (section_id, item_name, item_key, sort_order) VALUES
  (s9, 'Battery',             'battery',          0),
  (s9, 'Charging System',     'charging',         1),
  (s9, 'Gauges & Instruments','gauges',           2),
  (s9, 'Interior Electronics','interior_electrics',3),
  (s9, 'Lights',              'lights',           4),
  (s9, 'Wiring Condition',    'wiring',           5);

INSERT INTO template_sections (template_id, section_name, sort_order) VALUES (t_porsche, 'Test Drive', 9) RETURNING id INTO s10;
INSERT INTO template_items (section_id, item_name, item_key, sort_order, notes_required) VALUES
  (s10, 'Cold Idle',       'cold_idle',     0, true),
  (s10, 'Warm Idle',       'warm_idle',     1, false),
  (s10, 'Acceleration',    'acceleration',  2, false),
  (s10, 'Shifting',        'shifting',      3, false),
  (s10, 'Braking',         'braking',       4, false),
  (s10, 'Handling',        'handling',      5, false),
  (s10, 'Oil Temperature', 'oil_temp',      6, true),
  (s10, 'Unusual Noises',  'unusual_noises',7, true);

END $$;