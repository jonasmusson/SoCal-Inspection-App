import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const hookSource = readFileSync(resolve(root, 'src/hooks/useCheckinDraft.ts'), 'utf8');
const pageSource = readFileSync(resolve(root, 'src/pages/CheckInPage.tsx'), 'utf8');
const migrationSource = readFileSync(resolve(root, 'supabase/migrations/20261113044008_20261113000000_031_checkin_draft_autosave.sql.sql'), 'utf8');
const dashboardSource = readFileSync(resolve(root, 'src/pages/DashboardPage.tsx'), 'utf8');
const typesSource = readFileSync(resolve(root, 'src/types/index.ts'), 'utf8');

// ─── Migration tests ──────────────────────────────────────────────────────

test('migration adds checkin_step column to inspections', () => {
  assert.match(migrationSource, /ADD COLUMN IF NOT EXISTS checkin_step smallint DEFAULT 1/i);
});

test('migration adds upload_status column to checkin_photos', () => {
  assert.match(migrationSource, /ADD COLUMN IF NOT EXISTS upload_status text NOT NULL DEFAULT 'saved'/i);
});

test('migration constrains upload_status to valid values', () => {
  assert.match(migrationSource, /upload_status IN \('uploading', 'saved', 'failed'\)/i);
});

test('migration adds creator UPDATE policy on inspections', () => {
  assert.match(migrationSource, /inspections_update_creator/i);
  assert.match(migrationSource, /created_by = auth\.uid\(\)/i);
});

test('migration adds creator UPDATE policy on checkin_photos via parent inspection', () => {
  assert.match(migrationSource, /checkin_photos_update_creator/i);
  assert.match(migrationSource, /inspections\.id = checkin_photos\.inspection_id/i);
  assert.match(migrationSource, /inspections\.created_by = auth\.uid\(\)/i);
});

test('migration grants UPDATE on checkin_photos to authenticated', () => {
  assert.match(migrationSource, /GRANT UPDATE ON checkin_photos TO authenticated/i);
});

test('migration is additive only — no DROP TABLE or DROP COLUMN', () => {
  assert.doesNotMatch(migrationSource, /DROP TABLE/i);
  assert.doesNotMatch(migrationSource, /DROP COLUMN/i);
});

// ─── Types tests ──────────────────────────────────────────────────────────

test('Inspection type includes checkin_step', () => {
  assert.match(typesSource, /checkin_step: number \| null/);
});

test('CheckinPhoto type includes upload_status', () => {
  assert.match(typesSource, /upload_status: 'uploading' \| 'saved' \| 'failed'/);
});

// ─── Autosave hook tests ──────────────────────────────────────────────────

test('hook creates inspection record early (not only on final submit)', () => {
  assert.match(hookSource, /\.insert\(payload\)/s);
  assert.match(hookSource, /await supabase[\s\S]*?\.update\(payload\)[\s\S]*?\.eq\('id', id\)/s);
});

test('hook uses debounced autosave (800ms timer)', () => {
  assert.match(hookSource, /setTimeout[\s\S]*?800/s);
  assert.match(hookSource, /clearTimeout\(saveTimerRef\.current\)/);
});

test('hook tracks save status as idle/saving/saved/error', () => {
  assert.match(hookSource, /SaveStatus = 'idle' \| 'saving' \| 'saved' \| 'error'/);
  assert.match(hookSource, /setSaveStatus\('saving'\)/);
  assert.match(hookSource, /setSaveStatus\('saved'\)/);
  assert.match(hookSource, /setSaveStatus\('error'\)/);
});

test('hook deduplicates saves — skips if data unchanged', () => {
  assert.match(hookSource, /snapshot === lastSavedRef\.current/);
  assert.match(hookSource, /lastSavedRef\.current = snapshot/);
});

test('hook loads existing draft from DB for resume', () => {
  assert.match(hookSource, /from\('inspections'\)/);
  assert.match(hookSource, /\.eq\('id', draftId\)/);
  assert.match(hookSource, /\.maybeSingle\(\)/);
});

test('hook loads saved photos on resume', () => {
  assert.match(hookSource, /from\('checkin_photos'\)/);
  assert.match(hookSource, /upload_status/);
});

test('hook creates photo with uploading status before upload', () => {
  assert.match(hookSource, /insert\(\{[^}]*upload_status: 'uploading'/s);
});

test('hook updates photo to saved after successful upload', () => {
  assert.match(hookSource, /update\(\{ photo_url: publicUrl, upload_status: 'saved' \}\)/);
});

test('hook updates photo to failed on upload error', () => {
  assert.match(hookSource, /update\(\{ upload_status: 'failed' \}\)/);
});

test('hook stores original file for retry on failure', () => {
  assert.match(hookSource, /pendingFilesRef/);
  assert.match(hookSource, /pendingFilesRef\.current\.set\(photoRecord\.id, file\)/);
});

test('hook retryPhotoUpload uses stored file or accepts replacement', () => {
  assert.match(hookSource, /replacementFile \|\| pendingFilesRef\.current\.get\(photoId\)/);
});

test('hook deletePhoto removes from state and DB', () => {
  assert.match(hookSource, /from\('checkin_photos'\)\.delete\(\)/);
});

test('hook flushSave clears pending timer and saves immediately', () => {
  assert.match(hookSource, /clearTimeout\(saveTimerRef\.current\)/);
  assert.match(hookSource, /await persist\(draftData, inspectionId, createdBy\)/);
});

test('hook exposes hasMediaErrors based on photo statuses', () => {
  assert.match(hookSource, /savedPhotos\.some\(p => p\.upload_status === 'failed'\)/);
});

// ─── CheckInPage tests ────────────────────────────────────────────────────

test('CheckInPage uses useCheckinDraft hook', () => {
  assert.match(pageSource, /useCheckinDraft/);
});

test('CheckInPage supports resume via draftId route param', () => {
  assert.match(pageSource, /useParams.*draftId/);
});

test('CheckInPage shows SaveStatusBadge in header', () => {
  assert.match(pageSource, /SaveStatusBadge/);
  assert.match(pageSource, /status=\{draft\.saveStatus\}/);
});

test('CheckInPage shows Saving state with spinner', () => {
  assert.match(pageSource, /Loader2.*animate-spin.*Saving/);
});

test('CheckInPage shows Saved state', () => {
  assert.match(pageSource, /Cloud.*Saved/);
});

test('CheckInPage shows Save failed with Retry button', () => {
  assert.match(pageSource, /Save failed.*Retry/);
});

test('CheckInPage uploads photos incrementally (not at final submit)', () => {
  assert.match(pageSource, /draft\.uploadPhoto/);
  // The old code did all uploads in handleSubmit — verify that's gone
  const handleSubmitStart = pageSource.indexOf('async function handleComplete');
  const handleSubmitEnd = pageSource.indexOf('\n}\n', handleSubmitStart);
  const handleSubmitBlock = pageSource.slice(handleSubmitStart, handleSubmitEnd);
  assert.doesNotMatch(handleSubmitBlock, /localPhotos\.map/);
});

test('CheckInPage prevents submit when media has errors', () => {
  assert.match(pageSource, /hasMediaErrors/);
  assert.match(pageSource, /Fix failed uploads to continue/);
});

test('CheckInPage prevents submit while uploads are in progress', () => {
  assert.match(pageSource, /uploadingPhotoCount === 0/);
  assert.match(pageSource, /Waiting for uploads to finish/);
});

test('CheckInPage shows per-photo upload status (uploading/saved/failed)', () => {
  assert.match(pageSource, /upload_status === 'uploading'/);
  assert.match(pageSource, /upload_status === 'failed'/);
});

test('CheckInPage retry button calls draft.retryPhotoUpload', () => {
  assert.match(pageSource, /draft\.retryPhotoUpload\(p\.id\)/);
});

test('CheckInPage handles complete without creating duplicate sections', () => {
  assert.match(pageSource, /existingSections/);
  assert.match(pageSource, /if \(!existingSections\?\.length\)/);
});

test('CheckInPage saves step when navigating between steps', () => {
  assert.match(pageSource, /draft\.saveStep/);
});

// ─── Dashboard tests ──────────────────────────────────────────────────────

test('Dashboard shows Resume Check-In section for incomplete check-ins', () => {
  assert.match(dashboardSource, /Resume Check-In/);
  assert.match(dashboardSource, /checkin_complete/);
});

test('Dashboard resume button navigates to /checkin/:id', () => {
  assert.match(dashboardSource, /navigate\(`\/checkin\/\$\{i\.id\}`\)/);
});

test('Dashboard routes incomplete check-ins to resume instead of inspection detail', () => {
  assert.match(dashboardSource, /checkin_complete === false[\s\S]*?\/checkin\/\$\{i\.id\}/s);
});
