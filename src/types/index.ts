export type UserRole = 'owner' | 'manager' | 'tech';
export type InspectionStatus = 'not_started' | 'in_progress' | 'pending_review' | 'approved' | 'sent';
export type ItemCondition = 'good' | 'monitor' | 'needs_attention';
export type InspectionItemStatus = ItemCondition | 'not_inspected';
export type PriorityLevel = 'immediate' | 'short_term' | 'long_term' | 'upgrade';
export type MediaMode = 'hidden' | 'optional' | 'required';

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  role: UserRole;
  status: 'pending' | 'active';
  phone: string | null;
  created_at: string;
  updated_at: string;
}

export interface CheckinPhoto {
  id: string;
  inspection_id: string;
  photo_url: string;
  created_at: string;
}

export interface ShopSetting {
  id: string;
  key: string;
  value: string;
  updated_at: string;
}

export interface EmailTemplate {
  id: string;
  type: string;
  subject: string;
  body: string;
  updated_at: string;
}

export interface Inspection {
  id: string;
  customer_first_name: string;
  customer_last_name: string;
  customer_phone: string;
  customer_email: string;
  customer_address: string | null;
  customer_city: string | null;
  customer_state: string | null;
  customer_zip: string | null;
  vehicle_year: number;
  vehicle_make: string;
  vehicle_model: string;
  vehicle_vin: string | null;
  vehicle_mileage: number;
  vehicle_color: string | null;
  status: InspectionStatus;
  progress_percent: number;
  assigned_tech_id: string | null;
  created_by: string;
  manager_notes: string | null;
  executive_summary: string | null;
  primary_recommendation: string | null;
  tech_notes: string | null;
  overall_condition: ItemCondition | null;
  investment_guidance: string | null;
  report_approved: boolean;
  report_sent: boolean;
  report_sent_at: string | null;
  report_access_token?: string;
  checkin_notes: string | null;
  checkin_video_url: string | null;
  checkin_complete: boolean;
  work_started_at: string | null;
  work_completed_at: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  approved_at: string | null;
  template_id: string | null;
  archived: boolean;
  archived_at: string | null;
  paused_at: string | null;
  paused_duration_seconds: number;
}

export interface InspectionSection {
  id: string;
  inspection_id: string;
  section_number: number;
  section_name: string;
  overall_status: ItemCondition | null;
  notes: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface InspectionItem {
  id: string;
  section_id: string;
  item_name: string;
  item_key: string;
  status: InspectionItemStatus | null;
  notes: string | null;
  impact: string | null;
  recommended_action: string | null;
  not_inspected_reason: string | null;
  labor_hours_low: number | null;
  labor_hours_high: number | null;
  parts_cost_low: number | null;
  parts_cost_high: number | null;
  priority: PriorityLevel | null;
  photo_required: boolean;
  video_required: boolean;
  notes_required: boolean;
  photo_mode: MediaMode;
  video_mode: MediaMode;
  notes_mode: MediaMode;
  created_at: string;
  updated_at: string;
}

export interface InspectionVideo {
  id: string;
  item_id: string;
  video_url: string;
  caption: string | null;
  created_at: string;
}

export interface InspectionTemplate {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface TemplateSection {
  id: string;
  template_id: string;
  section_name: string;
  sort_order: number;
  is_active: boolean;
  is_checkin: boolean;
  created_at: string;
}

export interface TemplateItem {
  id: string;
  section_id: string;
  item_name: string;
  item_key: string;
  sort_order: number;
  is_active: boolean;
  photo_required: boolean;
  video_required: boolean;
  notes_required: boolean;
  photo_mode: MediaMode;
  video_mode: MediaMode;
  notes_mode: MediaMode;
  created_at: string;
}

export interface InspectionPhoto {
  id: string;
  item_id: string;
  photo_url: string;
  caption: string | null;
  priority: PriorityLevel | null;
  created_at: string;
}

export const INSPECTION_SECTIONS: SectionConfig[] = [
  { number: 1, name: 'Body & Paint', items: [
    { key: 'paint_condition', name: 'Paint Condition' },
    { key: 'rust', name: 'Rust' },
    { key: 'panel_fit', name: 'Panel Fit' },
    { key: 'glass', name: 'Glass' },
    { key: 'trim', name: 'Trim' },
  ]},
  { number: 2, name: 'Undercarriage', items: [
    { key: 'frame', name: 'Frame' },
    { key: 'floor_pans', name: 'Floor Pans' },
    { key: 'leaks', name: 'Leaks' },
    { key: 'exhaust', name: 'Exhaust' },
    { key: 'rust_severity', name: 'Rust Severity' },
  ]},
  { number: 3, name: 'Suspension & Steering', items: [
    { key: 'ball_joints', name: 'Ball Joints' },
    { key: 'bushings', name: 'Bushings' },
    { key: 'shocks', name: 'Shocks' },
    { key: 'steering', name: 'Steering' },
    { key: 'ride_height', name: 'Ride Height' },
    { key: 'clearance', name: 'Clearance' },
  ]},
  { number: 4, name: 'Engine', items: [
    { key: 'cold_start', name: 'Cold Start' },
    { key: 'oil_condition', name: 'Oil Condition' },
    { key: 'oil_leaks', name: 'Oil Leaks' },
    { key: 'noise', name: 'Noise' },
    { key: 'throttle', name: 'Throttle' },
    { key: 'belts', name: 'Belts' },
    { key: 'compression', name: 'Compression' },
  ]},
  { number: 5, name: 'Cooling', items: [
    { key: 'radiator', name: 'Radiator' },
    { key: 'hoses', name: 'Hoses' },
    { key: 'coolant', name: 'Coolant' },
    { key: 'water_pump', name: 'Water Pump' },
    { key: 'fan', name: 'Fan' },
  ]},
  { number: 6, name: 'Brakes', items: [
    { key: 'pads', name: 'Pads' },
    { key: 'rotors', name: 'Rotors' },
    { key: 'lines', name: 'Lines' },
    { key: 'master_cylinder', name: 'Master Cylinder' },
    { key: 'pedal', name: 'Pedal' },
    { key: 'emergency_brake', name: 'Emergency Brake' },
  ]},
  { number: 7, name: 'Wheels & Tires', items: [
    { key: 'tire_condition', name: 'Tire Condition' },
    { key: 'tread', name: 'Tread' },
    { key: 'wear', name: 'Wear' },
    { key: 'wheels', name: 'Wheels' },
  ]},
  { number: 8, name: 'Fuel System', items: [
    { key: 'tank', name: 'Tank' },
    { key: 'fuel_lines', name: 'Lines' },
    { key: 'pump', name: 'Pump' },
    { key: 'filter', name: 'Filter' },
  ]},
  { number: 9, name: 'Exhaust', items: [
    { key: 'exhaust_leaks', name: 'Leaks' },
    { key: 'fitment', name: 'Fitment' },
    { key: 'exhaust_rust', name: 'Rust' },
    { key: 'mounting', name: 'Mounting' },
  ]},
  { number: 10, name: 'Transmission', items: [
    { key: 'shift_quality', name: 'Shift Quality' },
    { key: 'engagement', name: 'Engagement' },
    { key: 'fluid', name: 'Fluid' },
    { key: 'trans_leaks', name: 'Leaks' },
  ]},
  { number: 11, name: 'Driveline', items: [
    { key: 'differential', name: 'Differential' },
    { key: 'driveshaft', name: 'Driveshaft' },
    { key: 'u_joints', name: 'U-Joints' },
  ]},
  { number: 12, name: 'Electrical', items: [
    { key: 'battery', name: 'Battery' },
    { key: 'charging', name: 'Charging' },
    { key: 'wiring', name: 'Wiring' },
    { key: 'lights', name: 'Lights' },
    { key: 'gauges', name: 'Gauges' },
  ]},
  { number: 13, name: 'Test Drive', items: [
    { key: 'acceleration', name: 'Acceleration' },
    { key: 'shifting', name: 'Shifting' },
    { key: 'braking', name: 'Braking' },
    { key: 'test_steering', name: 'Steering' },
    { key: 'vibration', name: 'Vibration' },
    { key: 'temperature', name: 'Temperature' },
  ]},
];

export interface SectionConfig {
  number: number;
  name: string;
  items: { key: string; name: string }[];
}

export const STATUS_LABELS: Record<InspectionStatus, string> = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  pending_review: 'Pending Review',
  approved: 'Approved',
  sent: 'Sent',
};

export const CONDITION_LABELS: Record<ItemCondition, string> = {
  good: 'Good',
  monitor: 'Monitor',
  needs_attention: 'Needs Attention',
};
