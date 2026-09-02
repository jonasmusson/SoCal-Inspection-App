-- ─── user_profiles: add status + name columns ────────────────────────────────
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active' CHECK (status IN ('pending', 'active')),
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name TEXT;

-- Allow managers/owners to UPDATE any user profile (for approvals + role changes)
DROP POLICY IF EXISTS "managers_update_all" ON user_profiles;
CREATE POLICY "managers_update_all" ON user_profiles FOR UPDATE
  TO authenticated
  USING (is_manager_or_owner())
  WITH CHECK (is_manager_or_owner());

-- Only active techs appear in the assignment dropdown
CREATE OR REPLACE FUNCTION get_tech_profiles()
RETURNS SETOF user_profiles
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT * FROM user_profiles WHERE role = 'tech' AND status = 'active' ORDER BY full_name;
$$;

-- ─── email_templates ─────────────────────────────────────────────────────────
CREATE TABLE email_templates (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type       TEXT NOT NULL UNIQUE,
  subject    TEXT NOT NULL,
  body       TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "email_templates_select" ON email_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "email_templates_update" ON email_templates FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "email_templates_insert" ON email_templates FOR INSERT TO authenticated WITH CHECK (true);

-- Seed the welcome email template
INSERT INTO email_templates (type, subject, body) VALUES (
  'welcome_new_user',
  'Welcome to SoCal Autoworks — Your Account Is Approved!',
  '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',sans-serif"><table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:40px 20px"><tr><td><table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto"><tr><td style="background:linear-gradient(135deg,#2563eb,#1d4ed8);padding:40px 32px;border-radius:16px 16px 0 0;text-align:center"><h1 style="margin:0;color:#fff;font-size:26px;font-weight:700">SoCal Autoworks</h1><p style="margin:8px 0 0;color:rgba(255,255,255,.85);font-size:15px">Inspection Management System</p></td></tr><tr><td style="background:#fff;padding:36px 32px;border-radius:0 0 16px 16px;box-shadow:0 4px 12px rgba(0,0,0,.08)"><h2 style="margin:0 0 12px;font-size:22px;color:#111827">Welcome, {{first_name}}!</h2><p style="margin:0 0 20px;color:#374151;line-height:1.65;font-size:15px">Great news — your account has been reviewed and approved. You can now sign in to the SoCal Autoworks Inspection System and get to work.</p><table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:20px;margin:0 0 28px"><tr><td><p style="margin:0 0 10px;font-weight:600;color:#111827;font-size:14px;text-transform:uppercase;letter-spacing:.05em">Your Login Details</p><p style="margin:0 0 6px;color:#374151;font-size:15px">Email: <strong>{{email}}</strong></p><p style="margin:0;color:#6b7280;font-size:14px">Use the password you created when you signed up.</p></td></tr></table><div style="text-align:center;margin:0 0 28px"><a href="{{app_url}}" style="display:inline-block;background:#2563eb;color:#fff;padding:14px 36px;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px">Open the App</a></div><p style="margin:0;color:#9ca3af;font-size:13px;line-height:1.6">Questions? Reach out to your shop manager. This email was sent because your account at SoCal Autoworks was just approved.</p></td></tr></table></td></tr></table></body></html>'
);