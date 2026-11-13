import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const root = process.cwd();
const read = (p) => readFileSync(join(root, p), 'utf8');

const reportComponent = read('src/components/report/InspectionReport.tsx');
const publicReportPage = read('src/pages/PublicReportPage.tsx');
const reviewPage = read('src/pages/ReviewInspectionPage.tsx');
const publicReportMigration = read('supabase/migrations/20260905030000_030_public_customer_reports.sql');
const videoMigration = read('supabase/migrations/20261113052102_20261113060000_032_public_report_include_videos.sql.sql');
const typesFile = read('src/types/index.ts');
const indexCss = read('src/index.css');

// ─── A. Report component structure ───────────────────────────────────────────

test('InspectionReport component file exists', () => {
  assert.ok(reportComponent.length > 0);
});

test('Report accepts items array (not pre-split needsAttention/monitor/good)', () => {
  assert.ok(reportComponent.includes('items: InspectionItem[]'));
  assert.ok(/needsAttention\s*=\s*items\.filter/.test(reportComponent));
  assert.ok(/monitor\s*=\s*items\.filter/.test(reportComponent));
  assert.ok(/good\s*=\s*items\.filter/.test(reportComponent));
  assert.ok(/notInspected\s*=\s*items\.filter/.test(reportComponent));
});

test('Report accepts videos array', () => {
  assert.ok(reportComponent.includes('videos: InspectionVideo[]'));
});

test('Report accepts checkinPhotos array', () => {
  assert.ok(reportComponent.includes('checkinPhotos: CheckinPhoto[]'));
});

test('Report accepts priorities map', () => {
  assert.ok(reportComponent.includes('priorities?: Record<string, PriorityLevel>'));
});

// ─── B. Report sections present ──────────────────────────────────────────────

test('Report has Immediate Attention section', () => {
  assert.ok(reportComponent.includes('Immediate Attention'));
});

test('Report has Future Attention section', () => {
  assert.ok(reportComponent.includes('Future Attention'));
});

test('Report has Complete Inspection by System section', () => {
  assert.ok(reportComponent.includes('Complete Inspection by System'));
});

test('Report has Satisfactory Items section', () => {
  assert.ok(reportComponent.includes('Satisfactory Items'));
});

test('Report has Not Inspected / Unable to Verify section', () => {
  assert.ok(reportComponent.includes('Not Inspected / Unable to Verify'));
});

test('Report has Vehicle Check-In Photos section', () => {
  assert.ok(reportComponent.includes('Vehicle Check-In Photos'));
});

test('Report has Vehicle / Inspection Overview header', () => {
  assert.ok(reportComponent.includes('data-report-cover'));
  assert.ok(/VIN/.test(reportComponent));
  assert.ok(/Mileage/.test(reportComponent));
  assert.ok(/reportDate/.test(reportComponent));
});

// ─── C. Photos inline with findings ──────────────────────────────────────────

test('Photos are rendered with each finding, not capped at 3', () => {
  assert.ok(reportComponent.includes('photosForItem(photos, item.id)'));
  // Must NOT have slice(0, 3) on item photos
  assert.ok(!/itemPhotos\.slice\(0,\s*3\)/.test(reportComponent));
});

test('Photo captions are displayed', () => {
  assert.ok(reportComponent.includes('photo.caption'));
});

test('Good items can show their photos', () => {
  assert.ok(/good.*itemPhotos/s.test(reportComponent));
});

// ─── D. Video evidence ───────────────────────────────────────────────────────

test('Videos are rendered inline with findings', () => {
  assert.ok(reportComponent.includes('videosForItem(videos, item.id)'));
  assert.ok(reportComponent.includes('<video'));
  assert.ok(reportComponent.includes('controls'));
});

test('Video has print fallback text', () => {
  assert.ok(reportComponent.includes('Video evidence recorded'));
  assert.ok(reportComponent.includes('print:hidden'));
  assert.ok(reportComponent.includes('print:block'));
});

test('Good items show video evidence indicator', () => {
  assert.ok(reportComponent.includes('Video evidence available'));
});

// ─── E. Technician notes preserved ───────────────────────────────────────────

test('Item notes displayed as blockquote with original text', () => {
  assert.ok(reportComponent.includes('item.notes'));
  assert.ok(reportComponent.includes('<blockquote'));
});

test('Item impact (why it matters) displayed', () => {
  assert.ok(reportComponent.includes('item.impact'));
  assert.ok(reportComponent.includes('Why it matters'));
});

test('Item recommended_action displayed', () => {
  assert.ok(reportComponent.includes('item.recommended_action'));
  assert.ok(reportComponent.includes('Recommendation'));
});

test('Not inspected reason displayed', () => {
  assert.ok(reportComponent.includes('item.not_inspected_reason'));
});

test('Section notes displayed', () => {
  assert.ok(reportComponent.includes('section.notes'));
});

// ─── F. No marketing/decoration dominating ───────────────────────────────────

test('Report does NOT have 720px hero header', () => {
  assert.ok(!/min-h-\[720px\]/.test(reportComponent));
});

test('Report does NOT use KNOW THE CAR marketing copy', () => {
  assert.ok(!/KNOW THE CAR/.test(reportComponent));
});

test('Report does NOT use sentence() summary function', () => {
  assert.ok(!/function sentence/.test(reportComponent));
});

test('Report does NOT truncate system notes with line-clamp-3', () => {
  assert.ok(!/line-clamp-3/.test(reportComponent));
});

test('Report does NOT have condition index score', () => {
  assert.ok(!/Condition index/.test(reportComponent));
  assert.ok(!/score/.test(reportComponent));
});

test('Report does NOT import vehicle illustrations', () => {
  assert.ok(!/findReportVehicleIllustration/.test(reportComponent));
  assert.ok(!/reportVehicleIllustrations/.test(reportComponent));
});

// ─── G. PublicReportPage uses new component ──────────────────────────────────

test('PublicReportPage imports InspectionReport (not PremiumInspectionReport)', () => {
  assert.ok(publicReportPage.includes("InspectionReport"));
  assert.ok(!publicReportPage.includes('PremiumInspectionReport'));
});

test('PublicReportPage passes videos to report', () => {
  assert.ok(publicReportPage.includes('videos={videos}'));
});

test('PublicReportPage passes items (not pre-split arrays) to report', () => {
  assert.ok(publicReportPage.includes('items={items}'));
});

test('PublicReportPage payload includes videos type', () => {
  assert.ok(publicReportPage.includes('InspectionVideo'));
  assert.ok(publicReportPage.includes('videos: InspectionVideo[]'));
});

// ─── H. ReviewInspectionPage uses new component ──────────────────────────────

test('ReviewInspectionPage imports InspectionReport', () => {
  assert.ok(reviewPage.includes('InspectionReport'));
  assert.ok(!reviewPage.includes('PremiumInspectionReport'));
});

test('ReviewInspectionPage loads inspection_videos from DB', () => {
  assert.ok(reviewPage.includes("inspection_videos"));
  assert.ok(reviewPage.includes('setVideos'));
});

test('ReviewInspectionPage passes videos to report', () => {
  assert.ok(reviewPage.includes('videos={videos}'));
});

test('ReviewInspectionPage passes items to report', () => {
  assert.ok(reviewPage.includes('items={items}'));
});

test('ReviewInspectionPage dead ReportPreview function removed', () => {
  assert.ok(!/export function ReportPreview/.test(reviewPage));
});

test('ReviewInspectionPage no longer imports VEHICLE_COLORS', () => {
  assert.ok(!/VEHICLE_COLORS/.test(reviewPage));
});

test('ReviewInspectionPage no longer imports Printer', () => {
  assert.ok(!/\bPrinter\b/.test(reviewPage));
});

// ─── I. RPC includes videos ──────────────────────────────────────────────────

test('RPC migration includes videos in return payload', () => {
  assert.ok(videoMigration.includes('inspection_videos'));
  assert.ok(videoMigration.includes("'videos'"));
  assert.ok(videoMigration.includes('video_url'));
});

test('RPC migration is idempotent (CREATE OR REPLACE)', () => {
  assert.ok(videoMigration.includes('CREATE OR REPLACE FUNCTION'));
});

test('RPC migration revokes and re-grants correctly', () => {
  assert.ok(videoMigration.includes('REVOKE ALL ON FUNCTION'));
  assert.ok(videoMigration.includes('GRANT EXECUTE ON FUNCTION'));
  assert.ok(videoMigration.includes('anon, authenticated'));
});

test('Original RPC still has photos and checkinPhotos', () => {
  assert.ok(publicReportMigration.includes("'photos'"));
  assert.ok(publicReportMigration.includes("'checkinPhotos'"));
});

// ─── J. Print CSS ────────────────────────────────────────────────────────────

test('Print CSS no longer forces cover to 10.4 inches', () => {
  assert.ok(!/min-height:\s*10\.4in/.test(indexCss));
});

test('Print CSS still has page break after cover', () => {
  assert.ok(indexCss.includes('break-after: page'));
});

test('Print CSS keeps finding break-inside avoid', () => {
  assert.ok(indexCss.includes('break-inside: avoid'));
  assert.ok(indexCss.includes('[data-report-finding]'));
});

test('Print CSS allows system sections to break across pages', () => {
  assert.ok(/data-report-system\][\s\S]*break-inside:\s*auto/.test(indexCss));
});

// ─── K. Types ────────────────────────────────────────────────────────────────

test('InspectionVideo type exists with required fields', () => {
  assert.ok(typesFile.includes('interface InspectionVideo'));
  assert.ok(/InspectionVideo[\s\S]*item_id:\s*string/.test(typesFile));
  assert.ok(/InspectionVideo[\s\S]*video_url:\s*string/.test(typesFile));
  assert.ok(/InspectionVideo[\s\S]*caption:\s*string \| null/.test(typesFile));
});

test('InspectionPhoto has caption field', () => {
  assert.ok(/interface InspectionPhoto[\s\S]*caption:\s*string \| null/.test(typesFile));
});

// ─── L. Count reconciliation logic ───────────────────────────────────────────

test('Report counts immediate items by priority=immediate', () => {
  assert.ok(/immediateItems[\s\S]*priorityFor[\s\S]*=== 'immediate'/.test(reportComponent));
});

test('Report counts future items by priority short_term/long_term/upgrade', () => {
  assert.ok(/futureItems[\s\S]*'short_term'[\s\S]*'long_term'[\s\S]*'upgrade'/.test(reportComponent));
});

test('Report handles unprioritized attention items', () => {
  assert.ok(reportComponent.includes('unprioritizedItems'));
});

test('Report handles items with no status (not yet answered)', () => {
  assert.ok(reportComponent.includes('noStatus'));
  assert.ok(reportComponent.includes('No inspection result recorded'));
});

test('Summary counts show Immediate, Future, Good, Not Inspected', () => {
  assert.ok(/Immediate.*immediateItems\.length/.test(reportComponent));
  assert.ok(/Future.*futureItems\.length/.test(reportComponent));
  assert.ok(/Good.*good\.length/.test(reportComponent));
  assert.ok(/Not Inspected.*notInspected\.length.*noStatus\.length/.test(reportComponent));
});

// ─── M. Check-in vs inspection photo separation ─────────────────────────────

test('Check-in photos are in a separate section, not mixed with findings', () => {
  assert.ok(reportComponent.includes('Vehicle Check-In Photos'));
  assert.ok(/checkinPhotos[\s\S]*Photographs taken when the vehicle arrived/.test(reportComponent));
});

test('Check-in photos do NOT appear in finding photo grids', () => {
  // photosForItem filters from inspection_photos (item_id linked), not checkin_photos
  assert.ok(/photosForItem\(photos/.test(reportComponent));
  assert.ok(!/checkinPhotos.*photosForItem/.test(reportComponent));
});
