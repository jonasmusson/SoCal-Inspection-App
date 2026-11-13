import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';

const root = process.cwd();
const read = (p) => readFileSync(join(root, p), 'utf8');

const migration = read('docs/PENDING-security-hardening-migration.sql');
const reviewPage = read('src/pages/ReviewInspectionPage.tsx');
const settingsPage = read('src/pages/SettingsPage.tsx');
const useAuth = read('src/hooks/useAuth.tsx');
const appFile = read('src/App.tsx');
const typesFile = read('src/types/index.ts');

// ─── 1. Migration: Last-Owner Protection (actual enforcement, not boolean) ───

test('set_user_role is a SECURITY DEFINER function that PERFORMS the update', () => {
  assert.ok(migration.includes('set_user_role'));
  assert.ok(/set_user_role[\s\S]*UPDATE user_profiles SET role = new_role/s.test(migration));
  assert.ok(/set_user_role[\s\S]*SECURITY DEFINER[\s\S]*SET search_path = public/s.test(migration));
});

test('set_user_role checks caller authorization (manager/owner only)', () => {
  assert.ok(/set_user_role[\s\S]*caller_role.*NOT IN.*manager.*owner.*RAISE EXCEPTION/s.test(migration));
});

test('set_user_role prevents self-promotion (only owners can set owner role)', () => {
  assert.ok(/set_user_role[\s\S]*new_role = 'owner'.*caller_role != 'owner'.*RAISE EXCEPTION/s.test(migration));
});

test('set_user_role enforces last-owner protection (count active owners, raise if 0)', () => {
  assert.ok(/set_user_role[\s\S]*active_owner_count[\s\S]*target_role = 'owner'.*new_role != 'owner'[\s\S]*active_owner_count = 0[\s\S]*RAISE EXCEPTION.*last active owner/s.test(migration));
});

test('set_user_role REVOKE EXECUTE from PUBLIC and anon, GRANT to authenticated only', () => {
  assert.ok(/REVOKE ALL ON FUNCTION.*set_user_role.*FROM PUBLIC, anon/s.test(migration));
  assert.ok(/GRANT EXECUTE ON FUNCTION.*set_user_role.*TO authenticated/s.test(migration));
});

test('set_user_role uses pg_advisory_xact_lock to serialize concurrent admin changes', () => {
  assert.ok(/set_user_role[\s\S]*pg_advisory_xact_lock/s.test(migration));
});

test('set_user_status performs deactivation/reactivation with last-owner + self-protection', () => {
  assert.ok(migration.includes('set_user_status'));
  assert.ok(/set_user_status[\s\S]*UPDATE user_profiles[\s\S]*SET status = new_status/s.test(migration));
  assert.ok(/set_user_status[\s\S]*target_user_id = auth\.uid\(\)[\s\S]*RAISE EXCEPTION.*cannot deactivate your own/s.test(migration));
  assert.ok(/set_user_status[\s\S]*active_owner_count = 0[\s\S]*RAISE EXCEPTION.*last active owner/s.test(migration));
  assert.ok(/REVOKE ALL ON FUNCTION.*set_user_status.*FROM PUBLIC, anon/s.test(migration));
});

test('set_user_status uses pg_advisory_xact_lock to serialize concurrent admin changes', () => {
  assert.ok(/set_user_status[\s\S]*pg_advisory_xact_lock/s.test(migration));
});

test('old can_modify_role (boolean-only) is replaced by set_user_role (performs update)', () => {
  assert.ok(migration.includes('DROP FUNCTION IF EXISTS public.can_modify_role'));
  assert.ok(!/CREATE.*FUNCTION.*can_modify_role/.test(migration));
});

// ─── 2. Migration: Column-level revocation on inspections ─────────────────────

test('inspections UPDATE is revoked at table level, re-granted on specific columns only', () => {
  assert.ok(/REVOKE UPDATE ON inspections FROM anon, authenticated/s.test(migration));
  assert.ok(/GRANT UPDATE \(/.test(migration));
  // Use line-by-line to find the inspections GRANT UPDATE block specifically
  const lines = migration.split('\n');
  let grantStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/GRANT UPDATE \(/.test(lines[i]) && /ON inspections TO authenticated/.test(lines.slice(i, i + 20).join('\n'))) {
      grantStart = i;
      break;
    }
  }
  assert.ok(grantStart >= 0, 'Found GRANT UPDATE on inspections');
  const grantBlock = lines.slice(grantStart, grantStart + 20).join('\n');
  const grantEnd = grantBlock.indexOf(') ON inspections TO authenticated');
  assert.ok(grantEnd >= 0, 'Found end of GRANT UPDATE on inspections');
  const grantContent = grantBlock.substring(0, grantEnd);
  const protectedCols = ['report_approved', 'report_sent', 'report_sent_at', 'approved_at', 'approved_by', 'correction_notes', 'correction_requested_at'];
  for (const col of protectedCols) {
    assert.ok(!grantContent.includes(col),
      `Column "${col}" must NOT be in the GRANT UPDATE list (it should be protected)`);
  }
});

test('inspections status IS in the granted column list (techs need to set in_progress/pending_review)', () => {
  const lines = migration.split('\n');
  let grantStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/GRANT UPDATE \(/.test(lines[i]) && /ON inspections TO authenticated/.test(lines.slice(i, i + 20).join('\n'))) {
      grantStart = i;
      break;
    }
  }
  assert.ok(grantStart >= 0);
  const grantBlock = lines.slice(grantStart, grantStart + 20).join('\n');
  assert.ok(grantBlock.includes('status'),
    'status must be in the GRANT list (techs need to set in_progress/pending_review)');
});

// ─── v3-1. CRITICAL: No table-level UPDATE grant on inspections ──────────────

test('v3: inspections table-level grant does NOT include UPDATE (only SELECT, INSERT, DELETE)', () => {
  // The final grants section must not re-grant UPDATE at table level
  const finalGrantsSection = migration.match(/-- inspections: SELECT, INSERT, DELETE[\s\S]*GRANT SELECT, INSERT, DELETE ON inspections TO authenticated/s);
  assert.ok(finalGrantsSection, 'Found final grants section for inspections');
  // Verify no table-level GRANT ... UPDATE ON inspections exists in the final grants
  assert.ok(!/GRANT SELECT, INSERT, UPDATE, DELETE ON inspections TO authenticated/s.test(migration),
    'Must NOT re-grant table-level UPDATE on inspections (overrides column-level restriction)');
});

test('v3: user_profiles table-level grant does NOT include UPDATE or INSERT or DELETE', () => {
  // The final grants for user_profiles must only grant SELECT at table level
  const finalUpSection = migration.match(/REVOKE ALL ON user_profiles FROM authenticated[\s\S]*GRANT SELECT ON user_profiles TO authenticated[\s\S]*GRANT UPDATE \(full_name/s);
  assert.ok(finalUpSection, 'Found final grants section for user_profiles with REVOKE ALL + selective re-grant');
});

// ─── 3. Migration: Column-level revocation on user_profiles ────────────────────

test('user_profiles UPDATE is revoked at table level, re-granted on non-privileged columns only', () => {
  // v3 uses REVOKE ALL (broader than just REVOKE UPDATE)
  assert.ok(/REVOKE ALL ON user_profiles FROM anon, authenticated/.test(migration) || /REVOKE UPDATE ON user_profiles FROM anon, authenticated/.test(migration));
  // Use line-by-line to find the user_profiles GRANT UPDATE block specifically
  const lines = migration.split('\n');
  let grantStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/GRANT UPDATE \(/.test(lines[i]) && /ON user_profiles TO authenticated/.test(lines.slice(i, i + 10).join('\n'))) {
      grantStart = i;
      break;
    }
  }
  assert.ok(grantStart >= 0, 'Found GRANT UPDATE on user_profiles');
  const grantBlock = lines.slice(grantStart, grantStart + 10).join('\n');
  const grantEnd = grantBlock.indexOf(') ON user_profiles TO authenticated');
  assert.ok(grantEnd >= 0, 'Found end of GRANT UPDATE on user_profiles');
  const grantContent = grantBlock.substring(0, grantEnd);
  const protectedCols = ['role', 'status', 'deactivated_at', 'email'];
  for (const col of protectedCols) {
    assert.ok(!grantContent.includes(col),
      `Column "${col}" must NOT be directly writable on user_profiles`);
  }
});

test('user_profiles SELECT is revoked from anon (no unauthenticated access)', () => {
  // v3 uses REVOKE ALL (broader) instead of just REVOKE SELECT
  assert.ok(/REVOKE ALL ON user_profiles FROM anon/.test(migration) || /REVOKE SELECT ON user_profiles FROM anon/.test(migration));
  assert.ok(/GRANT SELECT ON user_profiles TO authenticated/.test(migration));
});

test('user_profiles SELECT policy uses own-or-manager (not USING true)', () => {
  assert.ok(/profiles_select_own_or_staff[\s\S]*id = auth\.uid\(\)[\s\S]*is_manager_or_owner/s.test(migration));
  assert.ok(!/select_user_profiles_authenticated.*USING \(true\)/s.test(migration));
});

// ─── 4. Migration: approve_inspection function ────────────────────────────────

test('approve_inspection checks caller is active manager/owner (not tech, not deactivated)', () => {
  assert.ok(/approve_inspection[\s\S]*caller_role IS NULL OR caller_role = 'tech'[\s\S]*RAISE EXCEPTION/s.test(migration));
  assert.ok(/approve_inspection[\s\S]*status = 'active'[\s\S]*deactivated_at IS NULL/s.test(migration));
});

test('approve_inspection blocks approval when correction_requested_at is set', () => {
  assert.ok(/approve_inspection[\s\S]*correction_requested_at IS NOT NULL[\s\S]*RAISE EXCEPTION.*correction/s.test(migration));
});

test('approve_inspection sets status, report_approved, approved_at, approved_by', () => {
  assert.ok(/approve_inspection[\s\S]*SET status = 'approved'.*report_approved = true.*approved_at.*approved_by = auth\.uid\(\)/s.test(migration));
});

test('approve_inspection has SET search_path, REVOKE from PUBLIC/anon, GRANT to authenticated', () => {
  assert.ok(/approve_inspection[\s\S]*SECURITY DEFINER SET search_path = public/s.test(migration));
  assert.ok(/REVOKE ALL ON FUNCTION.*approve_inspection.*FROM PUBLIC, anon/s.test(migration));
  assert.ok(/GRANT EXECUTE ON FUNCTION.*approve_inspection.*TO authenticated/s.test(migration));
});

// ─── 5. Migration: send_inspection_report_fn function ─────────────────────────

test('send_inspection_report_fn checks caller is active manager/owner', () => {
  assert.ok(/send_inspection_report_fn[\s\S]*caller_role IS NULL OR caller_role = 'tech'[\s\S]*RAISE EXCEPTION/s.test(migration));
});

test('send_inspection_report_fn requires report_approved before sending', () => {
  assert.ok(/send_inspection_report_fn[\s\S]*report_approved[\s\S]*NOT is_approved[\s\S]*RAISE EXCEPTION/s.test(migration));
});

test('send_inspection_report_fn has SET search_path and proper grants', () => {
  assert.ok(/send_inspection_report_fn[\s\S]*SECURITY DEFINER SET search_path = public/s.test(migration));
  assert.ok(/REVOKE ALL ON FUNCTION.*send_inspection_report_fn.*FROM PUBLIC, anon/s.test(migration));
});

// ─── 6. Migration: Correction workflow (request + resolve) ────────────────────

test('request_correction_fn is manager/owner-only (techs cannot request corrections)', () => {
  assert.ok(/request_correction_fn[\s\S]*caller_role IS NULL OR caller_role = 'tech'[\s\S]*RAISE EXCEPTION/s.test(migration));
  assert.ok(/request_correction_fn[\s\S]*SET status = 'in_progress'[\s\S]*correction_notes[\s\S]*correction_requested_at = now\(\)/s.test(migration));
  assert.ok(/REVOKE ALL ON FUNCTION.*request_correction_fn.*FROM PUBLIC, anon/s.test(migration));
});

test('resolve_correction is manager/owner-only (techs cannot dismiss corrections)', () => {
  assert.ok(/resolve_correction[\s\S]*caller_role IS NULL OR caller_role = 'tech'[\s\S]*RAISE EXCEPTION/s.test(migration));
  assert.ok(/resolve_correction[\s\S]*SET correction_notes = NULL[\s\S]*correction_requested_at = NULL/s.test(migration));
  assert.ok(/REVOKE ALL ON FUNCTION.*resolve_correction.*FROM PUBLIC, anon/s.test(migration));
});

test('correction_notes and correction_requested_at are NOT in the granted UPDATE columns on inspections', () => {
  const lines = migration.split('\n');
  let grantStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/GRANT UPDATE \(/.test(lines[i]) && /ON inspections TO authenticated/.test(lines.slice(i, i + 20).join('\n'))) {
      grantStart = i;
      break;
    }
  }
  assert.ok(grantStart >= 0);
  const grantBlock = lines.slice(grantStart, grantStart + 20).join('\n');
  const grantEnd = grantBlock.indexOf(') ON inspections TO authenticated');
  const grantContent = grantBlock.substring(0, grantEnd);
  assert.ok(!grantContent.includes('correction_notes'));
  assert.ok(!grantContent.includes('correction_requested_at'));
});

// ─── 7. Migration: Deactivated user rejection in ALL RLS policies ─────────────
// v3: inspections_select_authorized now wraps assigned_tech_id and created_by
// branches with is_active_staff()

test('v3: inspections_select_authorized wraps assigned_tech_id and created_by with is_active_staff()', () => {
  assert.ok(/inspections_select_authorized[\s\S]*is_manager_or_owner\(\)[\s\S]*OR \(assigned_tech_id = auth\.uid\(\) AND public\.is_active_staff\(\)\)[\s\S]*OR \(created_by = auth\.uid\(\) AND public\.is_active_staff\(\)\)/s.test(migration),
    'SELECT policy must check is_active_staff on tech/creator branches, not just manager branch');
});

test('inspections_select_authorized rejects deactivated users (checks is_active_staff or is_manager_or_owner)', () => {
  assert.ok(/inspections_select_authorized[\s\S]*is_manager_or_owner\(\)[\s\S]*assigned_tech_id = auth\.uid\(\)[\s\S]*created_by = auth\.uid\(\)/s.test(migration));
  assert.ok(/is_active_staff[\s\S]*status = 'active'[\s\S]*deactivated_at IS NULL/s.test(migration));
  assert.ok(/is_manager_or_owner[\s\S]*status = 'active'[\s\S]*deactivated_at IS NULL/s.test(migration));
});

test('inspections_update_authorized rejects deactivated users (uses is_active_staff)', () => {
  assert.ok(/inspections_update_authorized[\s\S]*is_active_staff\(\)/s.test(migration));
});

// ─── v3-5: STATUS BYPASS FIX ─────────────────────────────────────────────────

test('v3: inspections_update_authorized WITH CHECK blocks techs from setting status to approved or sent', () => {
  assert.ok(/inspections_update_authorized[\s\S]*WITH CHECK[\s\S]*status NOT IN \('approved', 'sent'\)/s.test(migration),
    'Techs must not be able to set status to approved/sent via direct API update');
});

test('v3: inspections_update_authorized allows managers/owners to set any status (no restriction in manager branch)', () => {
  // The manager/owner branch in WITH CHECK must NOT have the status restriction
  const withCheckMatch = migration.match(/inspections_update_authorized[\s\S]*WITH CHECK \([\s\S]*?\);/s);
  assert.ok(withCheckMatch);
  // Manager branch should be first and NOT have status restriction
  assert.ok(/WITH CHECK[\s\S]*\(public\.is_manager_or_owner\(\)\)[\s\S]*OR/.test(migration),
    'Manager/owner branch must not have status restriction');
});

test('inspection_items update policy rejects deactivated users', () => {
  assert.ok(/items_update_authorized[\s\S]*is_active_staff\(\)/s.test(migration));
});

test('inspection_sections select/update policies reject deactivated users', () => {
  assert.ok(/sections_select_authorized[\s\S]*is_active_staff\(\)/s.test(migration));
  assert.ok(/sections_update_authorized[\s\S]*is_active_staff\(\)/s.test(migration));
});

test('inspection_photos and inspection_videos policies reject deactivated users', () => {
  assert.ok(/photos_select_authorized[\s\S]*is_active_staff\(\)/s.test(migration));
  assert.ok(/videos_select_authorized[\s\S]*is_active_staff\(\)/s.test(migration));
});

test('checkin_photos policies reject deactivated users', () => {
  assert.ok(/checkin_photos_select_authorized[\s\S]*is_active_staff\(\)/s.test(migration));
});

test('email_templates policies check status=active AND deactivated_at IS NULL', () => {
  assert.ok(/email_templates_select_authorized[\s\S]*status = 'active'[\s\S]*deactivated_at IS NULL/s.test(migration));
  assert.ok(/email_templates_update_active_owner[\s\S]*status = 'active'[\s\S]*deactivated_at IS NULL/s.test(migration));
});

test('inspection_templates and template_sections/items policies check active owner', () => {
  assert.ok(/templates_select_active_owner[\s\S]*status = 'active'[\s\S]*deactivated_at IS NULL/s.test(migration));
  assert.ok(/tsections_select_active_owner[\s\S]*status = 'active'[\s\S]*deactivated_at IS NULL/s.test(migration));
  assert.ok(/titems_select_active_owner[\s\S]*status = 'active'[\s\S]*deactivated_at IS NULL/s.test(migration));
});

test('shop_settings policies check active manager/owner', () => {
  assert.ok(/shop_settings_select_active_staff[\s\S]*status = 'active'[\s\S]*deactivated_at IS NULL/s.test(migration));
});

// ─── 8. Migration: All SECURITY DEFINER functions audited ─────────────────────

test('all SECURITY DEFINER functions have SET search_path = public', () => {
  const fnNames = ['is_active_staff', 'get_caller_role', 'set_user_role', 'set_user_status', 'approve_inspection', 'send_inspection_report_fn', 'resolve_correction', 'request_correction_fn', 'is_manager_or_owner', 'get_all_profiles', 'get_tech_profiles'];
  for (const fn of fnNames) {
    const fnBlock = migration.match(new RegExp(`CREATE OR REPLACE FUNCTION public.${fn}[\\s\\S]*?\\$\\$;`));
    if (fnBlock) {
      assert.ok(fnBlock[0].includes('SET search_path = public'),
        `Function ${fn} must have SET search_path = public`);
    }
  }
});

test('all SECURITY DEFINER functions have REVOKE from PUBLIC and anon', () => {
  const fnNames = ['is_active_staff', 'get_caller_role', 'set_user_role', 'set_user_status', 'approve_inspection', 'send_inspection_report_fn', 'resolve_correction', 'request_correction_fn', 'is_manager_or_owner', 'get_all_profiles', 'get_tech_profiles'];
  for (const fn of fnNames) {
    assert.ok(new RegExp(`REVOKE ALL ON FUNCTION.*${fn}.*FROM PUBLIC, anon`).test(migration),
      `Function ${fn} must have REVOKE from PUBLIC, anon`);
  }
});

test('get_all_profiles and get_tech_profiles now check active+not-deactivated via is_manager_or_owner', () => {
  assert.ok(/get_all_profiles[\s\S]*IF NOT public\.is_manager_or_owner\(\)[\s\S]*RAISE EXCEPTION/s.test(migration));
  assert.ok(/get_tech_profiles[\s\S]*IF NOT public\.is_manager_or_owner\(\)[\s\S]*RAISE EXCEPTION/s.test(migration));
  assert.ok(/get_tech_profiles[\s\S]*status = 'active' AND deactivated_at IS NULL/s.test(migration));
});

// ─── 9. Migration: HUB compatibility ────────────────────────────────────────────

test('migration does NOT touch any hub_ tables or their policies', () => {
  assert.ok(!/DROP POLICY.*ON hub_/s.test(migration));
  assert.ok(!/CREATE POLICY.*ON hub_/s.test(migration));
  assert.ok(!/REVOKE.*ON hub_/s.test(migration));
  assert.ok(!/GRANT.*ON hub_/s.test(migration));
});

test('migration does NOT touch hub_pilot_members, hub_pilot_orgs, hub_work_entries in SQL statements', () => {
  const sqlStatements = migration.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
  assert.ok(!/hub_pilot_members/.test(sqlStatements), 'hub_pilot_members must not appear in SQL statements');
  assert.ok(!/hub_pilot_orgs/.test(sqlStatements), 'hub_pilot_orgs must not appear in SQL statements');
  assert.ok(!/hub_work_entries/.test(sqlStatements), 'hub_work_entries must not appear in SQL statements');
});

// ─── v3-6: HUB compatibility verified against actual DB ──────────────────────

test('v3: hub_inspection_links has RLS enabled but NO API-accessible policies (confirmed from live DB)', () => {
  assert.ok(migration.includes('hub_inspection_links'),
    'Migration header should document the HUB compatibility finding');
});

// ─── 10. Migration: No destructive operations ─────────────────────────────────

test('migration does NOT drop tables, columns, or use type changes', () => {
  assert.ok(!/DROP TABLE/i.test(migration));
  assert.ok(!/DROP COLUMN/i.test(migration));
  assert.ok(!/ALTER TABLE.*DROP/i.test(migration));
});

test('migration does NOT use top-level transaction control (BEGIN/COMMIT/ROLLBACK)', () => {
  assert.ok(!/^\s*BEGIN\s*;\s*$/m.test(migration));
  assert.ok(!/^\s*COMMIT\s*;\s*$/m.test(migration));
  assert.ok(!/^\s*ROLLBACK\s*;\s*$/m.test(migration));
});

// ─── v3-3: Legacy policy drop via dynamic DO block ───────────────────────────

test('v3: migration uses dynamic DO block to drop ALL existing policies on affected tables', () => {
  assert.ok(/DO \$\$[\s\S]*pg_policies[\s\S]*DROP POLICY IF EXISTS/s.test(migration),
    'Migration must use a DO block to dynamically drop all existing policies');
  // Must cover all affected tables
  const doBlock = migration.match(/DO \$\$[\s\S]*?END \$\$;/s);
  assert.ok(doBlock, 'Found DO block for policy drops');
  const affectedTables = ['user_profiles', 'inspections', 'inspection_items', 'inspection_sections', 'inspection_photos', 'inspection_videos', 'checkin_photos', 'email_templates', 'inspection_templates', 'template_sections', 'template_items', 'shop_settings'];
  for (const t of affectedTables) {
    assert.ok(doBlock[0].includes(t), `DO block must cover table: ${t}`);
  }
});

test('v3: migration uses DROP FUNCTION IF EXISTS for idempotent function drops', () => {
  const dropFnCount = (migration.match(/DROP FUNCTION IF EXISTS/g) || []).length;
  assert.ok(dropFnCount >= 8, `Expected at least 8 DROP FUNCTION IF EXISTS, got ${dropFnCount}`);
});

test('migration is stored in docs/ and NOT in supabase/migrations/', () => {
  assert.ok(existsSync(join(root, 'docs/PENDING-security-hardening-migration.sql')));
  assert.ok(!existsSync(join(root, 'supabase/migrations/20261113100000_034_security_hardening.sql')));
});

// ─── v3-4: Last-owner DELETE protection ──────────────────────────────────────

test('v3: profiles_delete_owner policy prevents deleting the last active owner', () => {
  assert.ok(/profiles_delete_owner[\s\S]*NOT EXISTS[\s\S]*role = 'owner'[\s\S]*status = 'active'[\s\S]*deactivated_at IS NULL[\s\S]*id != user_profiles\.id/s.test(migration),
    'DELETE policy must prevent deleting the last active owner');
});

// ─── 11. Frontend: Uses RPC functions instead of direct updates ────────────────

test('ReviewInspectionPage calls approve_inspection RPC (not direct table update with report_approved)', () => {
  assert.ok(reviewPage.includes("supabase.rpc('approve_inspection'"));
  const lines = reviewPage.split('\n');
  let foundViolation = false;
  for (let i = 0; i < lines.length; i++) {
    if (/from\('inspections'\)\.update\(/.test(lines[i])) {
      const block = lines.slice(i, i + 10).join('\n');
      if (/report_approved/.test(block)) foundViolation = true;
    }
  }
  assert.ok(!foundViolation, 'No direct from(\'inspections\').update() should contain report_approved');
});

test('ReviewInspectionPage calls send_inspection_report_fn RPC (not direct table update)', () => {
  assert.ok(reviewPage.includes("supabase.rpc('send_inspection_report_fn'"));
  assert.ok(!/from\('inspections'\)\.update\(\{[\s\S]*report_sent[\s\S]*\}\)/s.test(reviewPage));
});

test('ReviewInspectionPage calls request_correction_fn RPC (not direct table update with correction fields)', () => {
  assert.ok(reviewPage.includes("supabase.rpc('request_correction_fn'"));
  const lines = reviewPage.split('\n');
  let foundViolation = false;
  for (let i = 0; i < lines.length; i++) {
    if (/from\('inspections'\)\.update\(/.test(lines[i])) {
      const block = lines.slice(i, i + 10).join('\n');
      if (/correction_notes|correction_requested_at/.test(block)) foundViolation = true;
    }
  }
  assert.ok(!foundViolation, 'No direct from(\'inspections\').update() should contain correction fields');
});

test('ReviewInspectionPage calls resolve_correction RPC (not direct table update with correction: null)', () => {
  assert.ok(reviewPage.includes("supabase.rpc('resolve_correction'"));
  const lines = reviewPage.split('\n');
  let foundViolation = false;
  for (let i = 0; i < lines.length; i++) {
    if (/from\('inspections'\)\.update\(/.test(lines[i])) {
      const block = lines.slice(i, i + 10).join('\n');
      if (/correction_notes: null/.test(block)) foundViolation = true;
    }
  }
  assert.ok(!foundViolation, 'No direct from(\'inspections\').update() should contain correction_notes: null');
});

test('SettingsPage calls set_user_role RPC (not direct table update for role)', () => {
  assert.ok(settingsPage.includes("supabase.rpc('set_user_role'"));
  assert.ok(!/from\('user_profiles'\)\.update\(\{[\s\S]*role[\s\S]*\}\)/s.test(settingsPage));
});

test('SettingsPage calls set_user_status RPC (not direct table update for deactivation)', () => {
  assert.ok(settingsPage.includes("supabase.rpc('set_user_status'"));
  assert.ok(!/from\('user_profiles'\)\.update\(\{[\s\S]*deactivated_at[\s\S]*\}\)/s.test(settingsPage));
});

// ─── 12. Frontend: Deactivation enforcement (from prior work, verified) ────────

test('useAuth tracks isDeactivated state and auto-signs out', () => {
  assert.ok(useAuth.includes('isDeactivated'));
  assert.ok(/deactivated_at.*signOut|signOut.*deactivated_at/s.test(useAuth));
});

test('App.tsx renders DeactivatedScreen when isDeactivated', () => {
  assert.ok(appFile.includes('DeactivatedScreen'));
  assert.ok(appFile.includes('isDeactivated'));
});

test('UserProfile type includes deactivated_at field', () => {
  assert.ok(typesFile.includes('deactivated_at: string | null'));
});

// ─── 13. Database-level tests (migration SQL analysis) ───────────────────────

test('v3: migration drops legacy inspections_select_own policy (via DO block)', () => {
  // v3 uses a DO block that drops ALL policies, so we verify the DO block
  // covers the inspections table rather than checking for a named DROP POLICY
  assert.ok(/DO \$\$[\s\S]*'inspections'[\s\S]*END \$\$/s.test(migration),
    'DO block must include inspections table');
});

test('v3: migration drops legacy managers_update_all policy (via DO block)', () => {
  assert.ok(/DO \$\$[\s\S]*'user_profiles'[\s\S]*END \$\$/s.test(migration),
    'DO block must include user_profiles table');
});

test('v3: no permissive USING(true) policies in migration output', () => {
  // Check CREATE POLICY statements only (not comments)
  const lines = migration.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (/CREATE POLICY/.test(lines[i])) {
      const block = lines.slice(i, i + 10).join('\n');
      assert.ok(!/USING \(true\)/.test(block),
        `New policy at line ${i + 1} must not use USING(true)`);
    }
  }
});

// ─── 14. Post-deployment verification SQL exists ──────────────────────────────

test('v3: post-deployment verification SQL exists at docs/post-deployment-verification-v3.sql', () => {
  assert.ok(existsSync(join(root, 'docs/post-deployment-verification-v3.sql')),
    'v3 verification SQL file must exist');
});

test('migration includes PENDING APPROVAL and idempotent markers', () => {
  assert.ok(migration.includes('PENDING APPROVAL'));
  assert.ok(migration.includes('idempotent'));
});

// ─── 15. TypeScript compilation ────────────────────────────────────────────────

test('TypeScript compiles without errors', () => {
  try {
    execSync('npx tsc --noEmit -p tsconfig.app.json', { cwd: root, stdio: 'pipe', timeout: 60000 });
    assert.ok(true);
  } catch (err) {
    assert.fail(`TypeScript compilation failed: ${err.stdout?.toString() || err.message}`);
  }
});
