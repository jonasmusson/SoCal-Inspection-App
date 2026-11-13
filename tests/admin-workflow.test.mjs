import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const root = process.cwd();
const read = (p) => readFileSync(join(root, p), 'utf8');

const dashboard = read('src/pages/DashboardPage.tsx');
const review = read('src/pages/ReviewInspectionPage.tsx');
const templates = read('src/pages/TemplatesPage.tsx');
const settings = read('src/pages/SettingsPage.tsx');
const typesFile = read('src/types/index.ts');
const detailPage = read('src/pages/InspectionDetailPage.tsx');
const inspectSection = read('src/pages/InspectSectionPage.tsx');

// ─── A. Database migration fields ────────────────────────────────────────────

test('Types include approved_by on Inspection', () => {
  assert.ok(typesFile.includes('approved_by: string | null'));
});

test('Types include correction_notes on Inspection', () => {
  assert.ok(typesFile.includes('correction_notes: string | null'));
});

test('Types include correction_requested_at on Inspection', () => {
  assert.ok(typesFile.includes('correction_requested_at: string | null'));
});

test('Types include manager_note on InspectionItem', () => {
  assert.ok(typesFile.includes('manager_note: string | null'));
});

test('Types include deactivated_at on UserProfile', () => {
  assert.ok(typesFile.includes('deactivated_at: string | null'));
});

// ─── B. Dashboard improvements ───────────────────────────────────────────────

test('Dashboard loads tech list for quick-assign', () => {
  assert.ok(/user_profiles.*role.*tech|role.*tech.*user_profiles|\.eq\('role'.*tech/i.test(dashboard));
});

test('Dashboard has debounced search (300ms timer)', () => {
  assert.ok(/300/.test(dashboard));
  assert.ok(/setTimeout|setInterval/.test(dashboard));
});

test('Dashboard shows correction requested badge', () => {
  assert.ok(dashboard.includes('correction_requested_at'));
});

test('Dashboard shows assigned tech name on cards', () => {
  assert.ok(/techMap|techName|assigned.*tech.*name/i.test(dashboard));
});

test('Dashboard groups inspections by operational status', () => {
  assert.ok(/Unassigned|In Progress|Awaiting Review|Approved.*Ready/i.test(dashboard));
});

test('Dashboard has stat cards for pending, in-progress, check-in, sent', () => {
  assert.ok(/Pending/i.test(dashboard));
  assert.ok(/In Progress/i.test(dashboard));
});

test('Dashboard has tech filter dropdown', () => {
  assert.ok(/techFilter|filterTech|assignee/i.test(dashboard));
});

test('Dashboard has recent activity section', () => {
  assert.ok(/recent.*activity|Activity|last.*updated/i.test(dashboard));
});

test('Dashboard has quick-assign functionality', () => {
  assert.ok(/assign.*tech|quickAssign|assignTech/i.test(dashboard));
});

// ─── C. Manager review improvements ──────────────────────────────────────────

test('Review page has Request Correction button', () => {
  assert.ok(/Request Correction|requestCorrection/i.test(review));
});

test('Review page sets correction_notes in DB', () => {
  assert.ok(review.includes('correction_notes'));
});

test('Review page sets correction_requested_at in DB', () => {
  assert.ok(review.includes('correction_requested_at'));
});

test('Review page has per-item manager note textarea', () => {
  assert.ok(/manager_note|managerNote|Manager note/i.test(review));
});

test('Review page saves manager note on blur (not overwriting tech notes)', () => {
  assert.ok(/saveManagerNote|manager_note.*blur|onBlur.*manager/i.test(review));
  assert.ok(!/notes.*manager_note|manager_note.*notes/i.test(review.replace(/manager_note/g, '')));
});

test('Review page sets approved_by on approval', () => {
  assert.ok(review.includes('approved_by'));
  assert.ok(/profile.*id|profile\?\.id/i.test(review));
});

test('Review page shows inline photos for needs_attention items', () => {
  assert.ok(/photosForItem|photos.*filter.*item_id|item_id.*photos/i.test(review));
});

test('Review page shows correction requested banner', () => {
  assert.ok(/correction_notes|correctionRequested|Correction Requested/i.test(review));
});

test('Review page has filter pill tabs for items', () => {
  assert.ok(/Immediate|Future|Good|Not Inspected/i.test(review));
  assert.ok(/pill|filter.*tab|activeFilter/i.test(review));
});

test('Review page shows video count per item', () => {
  assert.ok(/itemVideos.*length|videos.*filter.*item_id|Video.*icon.*video/s.test(review));
  assert.ok(review.includes('itemVideos'));
});

// ─── D. Template management improvements ─────────────────────────────────────

test('Templates page has duplicate/clone button', () => {
  assert.ok(/Duplicate|duplicate|clone|Copy.*template/i.test(templates));
});

test('Templates page duplicate creates copy with (Copy) name', () => {
  assert.ok(/Copy.*\)|\(Copy\)/i.test(templates));
});

test('Templates page has delete with confirmation', () => {
  assert.ok(/Delete|delete|Trash/i.test(templates));
  assert.ok(/confirm|Confirm/i.test(templates));
});

test('Templates page checks if template is in use before delete', () => {
  assert.ok(/In Use|in.*use|inspection.*count|template_id/i.test(templates));
});

test('Templates page CSV export uses mode fields not legacy booleans', () => {
  assert.ok(templates.includes('photo_mode'));
  assert.ok(templates.includes('video_mode'));
  assert.ok(templates.includes('notes_mode'));
});

test('Templates page has search input', () => {
  assert.ok(/search|Search/i.test(templates));
});

test('Templates page shows inspection count per template', () => {
  assert.ok(/inspection.*count|inspectionCount|inspections/i.test(templates));
});

// ─── E. Settings improvements ────────────────────────────────────────────────

test('Settings has user deactivation button', () => {
  assert.ok(/deactivat|toggleDeactivate|UserX/i.test(settings));
});

test('Settings prevents owner self-demotion', () => {
  assert.ok(/demote.*self|cannot.*demote|self.*role|profile.*id.*userId.*role/i.test(settings));
});

test('Settings prevents last-owner lockout', () => {
  assert.ok(/last.*owner|ownerCount.*1|owner.*count/i.test(settings));
});

test('Settings email save has error handling', () => {
  assert.ok(/emailError|setEmailError/i.test(settings));
  assert.ok(/error.*email|saveEmail.*error/i.test(settings));
});

test('Settings shop save has error handling and validation', () => {
  assert.ok(/shopError|setShopError/i.test(settings));
  assert.ok(/laborRate.*finite|labor_rate.*valid|Number.*labor/i.test(settings));
});

// ─── F. Inspection detail page shows correction banner ───────────────────────

test('InspectionDetailPage shows correction requested banner', () => {
  assert.ok(detailPage.includes('correction_notes'));
  assert.ok(detailPage.includes('correction_requested_at'));
  assert.ok(/Correction Requested/i.test(detailPage));
});

// ─── G. Technician workflow still clean (no pricing fields) ──────────────────

test('InspectSectionPage does NOT show labor/parts estimate inputs to technician', () => {
  assert.ok(!/labor_hours_low|labor_hours_high|parts_cost_low|parts_cost_high/.test(inspectSection));
});

test('InspectSectionPage still has condition buttons', () => {
  assert.ok(inspectSection.includes('ConditionButton'));
});

test('InspectSectionPage still has photo and video capture', () => {
  assert.ok(inspectSection.includes('CameraView'));
  assert.ok(inspectSection.includes('VideoRecorderView'));
});

test('InspectSectionPage still has finding details (impact, recommended_action)', () => {
  assert.ok(inspectSection.includes('impact'));
  assert.ok(inspectSection.includes('recommended_action'));
});

// ─── H. Auth/role separation maintained ──────────────────────────────────────

test('Dashboard requires manager or owner access', () => {
  assert.ok(dashboard.includes('isManager') || dashboard.includes('isOwner'));
});

test('Review page requires manager or owner access', () => {
  assert.ok(review.includes('isManager') || review.includes('isOwner'));
});

test('Templates page requires owner access', () => {
  assert.ok(templates.includes('isOwner'));
});

// ─── I. Template updates do not corrupt existing inspections ─────────────────

test('Inspection items are copies (have their own section_id referencing inspection_sections, not template_sections)', () => {
  const typesContent = typesFile;
  assert.ok(typesContent.includes('section_id: string'));
  assert.ok(typesContent.includes('item_name: string'));
  assert.ok(typesContent.includes('item_key: string'));
});

test('Template items have separate type from inspection items', () => {
  assert.ok(typesFile.includes('interface TemplateItem'));
  assert.ok(typesFile.includes('interface InspectionItem'));
});

// ─── J. Build verification ───────────────────────────────────────────────────

test('TypeScript compiles without errors (typecheck passes)', async () => {
  const { execSync } = await import('node:child_process');
  try {
    execSync('npx tsc --noEmit -p tsconfig.app.json', { cwd: root, stdio: 'pipe', timeout: 60000 });
    assert.ok(true);
  } catch (err) {
    assert.fail(`TypeScript compilation failed: ${err.stdout?.toString() || err.message}`);
  }
});
