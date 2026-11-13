import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';

const root = process.cwd();
const read = (p) => readFileSync(join(root, p), 'utf8');

const useAuth = read('src/hooks/useAuth.tsx');
const appFile = read('src/App.tsx');
const reviewPage = read('src/pages/ReviewInspectionPage.tsx');
const settingsPage = read('src/pages/SettingsPage.tsx');
const typesFile = read('src/types/index.ts');
const detailPage = read('src/pages/InspectionDetailPage.tsx');
const dashboardPage = read('src/pages/DashboardPage.tsx');
const pendingMigration = read('docs/PENDING-security-hardening-migration.sql');

// ─── 1. Deactivation Enforcement ─────────────────────────────────────────────

test('useAuth tracks isDeactivated state', () => {
  assert.ok(useAuth.includes('isDeactivated'));
  assert.ok(useAuth.includes('setIsDeactivated'));
});

test('useAuth auto-signs out when deactivated_at is detected on profile load', () => {
  assert.ok(/deactivated_at.*signOut|signOut.*deactivated_at/s.test(useAuth));
});

test('useAuth has realtime subscription for deactivation/role changes', () => {
  assert.ok(useAuth.includes('postgres_changes'));
  assert.ok(useAuth.includes('user_profiles'));
  assert.ok(useAuth.includes('deactivated_at'));
  assert.ok(/channel.*profile-watch|removeChannel/i.test(useAuth));
});

test('useAuth signs out and shows deactivated screen when realtime detects deactivation', () => {
  assert.ok(/payload.*new.*deactivated_at|updated.*deactivated_at.*signOut/s.test(useAuth));
});

test('App.tsx renders DeactivatedScreen when isDeactivated is true', () => {
  assert.ok(appFile.includes('DeactivatedScreen'));
  assert.ok(appFile.includes('isDeactivated'));
});

test('DeactivatedScreen has sign-out button', () => {
  assert.ok(/DeactivatedScreen[\s\S]*signOut/s.test(appFile));
});

test('useAuth resets isDeactivated on sign-out', () => {
  assert.ok(/signOut[\s\S]*setIsDeactivated\(false\)/s.test(useAuth));
});

test('UserProfile type includes deactivated_at field', () => {
  assert.ok(typesFile.includes('deactivated_at: string | null'));
});

// ─── 2. Role Permission Enforcement ──────────────────────────────────────────

test('Settings prevents owner self-demotion (client-side)', () => {
  assert.ok(/profile.*id.*userId.*role.*owner|demote.*self|cannot.*demote/i.test(settingsPage));
});

test('Settings prevents last-owner lockout (client-side)', () => {
  assert.ok(/last.*owner|ownerCount.*1|owner.*count.*<=.*1/i.test(settingsPage));
});

test('Pending migration has can_modify_role SECURITY DEFINER function for DB-level last-owner protection', () => {
  assert.ok(pendingMigration.includes('can_modify_role'));
  assert.ok(pendingMigration.includes('SECURITY DEFINER'));
  assert.ok(pendingMigration.includes('active_owner_count'));
  assert.ok(pendingMigration.includes("role = 'owner'"));
  assert.ok(pendingMigration.includes('REVOKE ALL ON FUNCTION'));
});

test('Pending migration has approve_inspection SECURITY DEFINER function', () => {
  assert.ok(pendingMigration.includes('approve_inspection'));
  assert.ok(pendingMigration.includes("caller_role = 'tech'"));
  assert.ok(pendingMigration.includes('RAISE EXCEPTION'));
});

test('Pending migration has send_inspection_report_fn SECURITY DEFINER function', () => {
  assert.ok(pendingMigration.includes('send_inspection_report_fn'));
  assert.ok(pendingMigration.includes("caller_role = 'tech'"));
});

test('Pending migration revokes PUBLIC/anon EXECUTE on all SECURITY DEFINER functions', () => {
  const revokeCount = (pendingMigration.match(/REVOKE ALL ON FUNCTION/g) || []).length;
  assert.ok(revokeCount >= 3, `Expected at least 3 REVOKE statements, got ${revokeCount}`);
});

test('Pending migration restricts user_profiles SELECT to authenticated only', () => {
  assert.ok(pendingMigration.includes('REVOKE SELECT ON user_profiles FROM anon'));
  assert.ok(pendingMigration.includes('select_user_profiles_authenticated'));
  assert.ok(pendingMigration.includes('TO authenticated'));
});

test('Pending migration scopes inspections SELECT to authorized users (not USING true)', () => {
  assert.ok(pendingMigration.includes('inspections_select_authorized'));
  assert.ok(pendingMigration.includes('assigned_tech_id = auth.uid()'));
  assert.ok(pendingMigration.includes('created_by = auth.uid()'));
  // Old permissive policy must be dropped (not just left in place)
  assert.ok(pendingMigration.includes('DROP POLICY IF EXISTS "inspections_select_own"'));
  // Must not re-create it with USING(true)
  assert.ok(!/CREATE POLICY "inspections_select_own"[\s\S]*USING \(true\)/.test(pendingMigration));
});

test('Pending migration adds status=active AND deactivated_at IS NULL checks to all UPDATE policies', () => {
  assert.ok(pendingMigration.includes("up.status = 'active'"));
  assert.ok(pendingMigration.includes('up.deactivated_at IS NULL'));
  assert.ok(pendingMigration.includes('managers_update_active_profiles'));
  assert.ok(pendingMigration.includes('inspections_update_authorized'));
  assert.ok(pendingMigration.includes('items_update_authorized'));
});

test('Pending migration blocks inspection status approval for technicians', () => {
  assert.ok(pendingMigration.includes('approve_inspection'));
  assert.ok(pendingMigration.includes("caller_role = 'tech'"));
  assert.ok(pendingMigration.includes('RAISE EXCEPTION'));
});

// ─── 3. Correction Workflow Hardening ────────────────────────────────────────

test('validateReport blocks approval when correction_requested_at is set', () => {
  assert.ok(/validateReport[\s\S]*correction_requested_at/s.test(reviewPage));
});

test('Review page has Request Correction function that sets correction_notes and correction_requested_at', () => {
  assert.ok(reviewPage.includes('requestCorrection'));
  assert.ok(reviewPage.includes('correction_notes'));
  assert.ok(reviewPage.includes('correction_requested_at'));
  assert.ok(reviewPage.includes("status: 'in_progress'"));
});

test('Review page has dismissCorrection that clears correction fields', () => {
  assert.ok(reviewPage.includes('dismissCorrection'));
  assert.ok(/correction_notes: null/s.test(reviewPage));
  assert.ok(/correction_requested_at: null/s.test(reviewPage));
});

test('Review page shows Correction Requested banner with notes and timestamp', () => {
  assert.ok(reviewPage.includes('Correction Requested'));
  assert.ok(reviewPage.includes('correction_notes'));
  assert.ok(reviewPage.includes('correction_requested_at'));
});

test('InspectionDetailPage shows correction banner to techs and managers', () => {
  assert.ok(detailPage.includes('correction_notes'));
  assert.ok(detailPage.includes('correction_requested_at'));
  assert.ok(detailPage.includes('Correction Requested'));
});

test('Review page preserves technician notes separately from manager notes', () => {
  assert.ok(reviewPage.includes('manager_note'));
  assert.ok(reviewPage.includes('saveManagerNote'));
  assert.ok(reviewPage.includes('item.notes'));
  // No line should assign one field to the other (they are independent fields)
  assert.ok(!/manager_note\s*=\s*item\.notes/.test(reviewPage));
  assert.ok(!/item\.notes\s*=\s*manager_note/.test(reviewPage));
});

test('Review page records approved_by on approval', () => {
  assert.ok(reviewPage.includes('approved_by'));
  assert.ok(/profile.*id|profile\?\.id/i.test(reviewPage));
});

test('Pending migration blocks approval when correction is unresolved (approve_inspection checks correction_requested_at)', () => {
  assert.ok(pendingMigration.includes('correction_requested_at IS NOT NULL'));
  assert.ok(/Cannot approve.*correction|unresolved correction/i.test(pendingMigration));
});

// ─── 4. Report Access Control ────────────────────────────────────────────────

test('Public report route is separate from auth-protected routes', () => {
  assert.ok(appFile.includes('/report/:token'));
  assert.ok(appFile.includes('PublicReportPage'));
});

test('Dashboard requires manager or owner (route guard)', () => {
  assert.ok(/dashboard.*isManager.*isOwner.*Navigate/i.test(dashboardPage) || /dashboard.*isManager.*\|\|.*isOwner/s.test(appFile));
});

test('Review page requires manager or owner (route guard in App.tsx)', () => {
  assert.ok(/review.*isManager.*isOwner.*Navigate/i.test(appFile));
});

test('Templates page requires owner (route guard in App.tsx)', () => {
  assert.ok(/templates.*isOwner.*Navigate/i.test(appFile));
});

test('Check-in page requires manager or owner (route guard in App.tsx)', () => {
  assert.ok(/checkin.*isManager.*isOwner.*Navigate/i.test(appFile));
});

// ─── 5. Pending Migration Safety ─────────────────────────────────────────────

test('Pending migration is stored in docs/, NOT in supabase/migrations/ (not auto-applied)', () => {
  assert.ok(existsSync(join(root, 'docs/PENDING-security-hardening-migration.sql')));
  assert.ok(!existsSync(join(root, 'supabase/migrations/20261113100000_034_security_hardening.sql')));
});

test('Pending migration does NOT drop any tables or columns', () => {
  assert.ok(!/DROP TABLE/i.test(pendingMigration));
  assert.ok(!/DROP COLUMN/i.test(pendingMigration));
  assert.ok(!/ALTER TABLE.*DROP/i.test(pendingMigration));
});

test('Pending migration uses IF EXISTS for idempotent policy drops', () => {
  const dropCount = (pendingMigration.match(/DROP POLICY IF EXISTS/g) || []).length;
  assert.ok(dropCount >= 8, `Expected at least 8 DROP POLICY IF EXISTS, got ${dropCount}`);
});

test('Pending migration does NOT use top-level transaction control statements', () => {
  // PL/pgSQL BEGIN...END blocks are fine; top-level BEGIN/COMMIT/ROLLBACK are not
  assert.ok(!/^\s*BEGIN\s*;\s*$/m.test(pendingMigration));
  assert.ok(!/^\s*COMMIT\s*;\s*$/m.test(pendingMigration));
  assert.ok(!/^\s*ROLLBACK\s*;\s*$/m.test(pendingMigration));
});

// ─── 6. TypeScript Build Verification ────────────────────────────────────────

test('TypeScript compiles without errors (typecheck passes)', () => {
  try {
    execSync('npx tsc --noEmit -p tsconfig.app.json', { cwd: root, stdio: 'pipe', timeout: 60000 });
    assert.ok(true);
  } catch (err) {
    assert.fail(`TypeScript compilation failed: ${err.stdout?.toString() || err.message}`);
  }
});
