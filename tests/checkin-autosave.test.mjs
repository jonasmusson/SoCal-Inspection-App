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
  assert.match(hookSource, /\.update\(payload\)[\s\S]*?\.eq\('id', id\)/s);
});

test('hook persist function handles both insert and update paths', () => {
  const persistFn = hookSource.slice(
    hookSource.indexOf('const persist = useCallback'),
    hookSource.indexOf('}, []);', hookSource.indexOf('const persist = useCallback'))
  );
  assert.match(persistFn, /hasMinimumMeaningfulData/);
  assert.match(persistFn, /if \(id\)/);
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
  // lastSavedRef is updated inside doSave after successful persist
  assert.match(hookSource, /lastSavedRef\.current = JSON\.stringify\(data\)/);
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
  assert.match(hookSource, /doSave\(data, createdBy, seq\)/);
});

test('hook exposes hasMediaErrors including video failure', () => {
  assert.match(hookSource, /savedPhotos\.some\(p => p\.upload_status === 'failed'\)/);
  assert.match(hookSource, /videoUploadStatus === 'failed'/);
});

// ─── Hardening: visibility/beforeunload flush ─────────────────────────────

test('hook flushes pending save on visibilitychange to hidden', () => {
  assert.match(hookSource, /visibilitychange/);
  assert.match(hookSource, /document\.visibilityState === 'hidden'/);
  assert.match(hookSource, /doSave\(data, createdByRef\.current, seq\)/);
});

test('hook flushes pending save on beforeunload', () => {
  assert.match(hookSource, /beforeunload/);
  assert.match(hookSource, /window\.addEventListener\('beforeunload'/);
});

test('hook flushes on cleanup/unmount', () => {
  // The cleanup function from beforeunload effect should also flush
  const beforeUnloadEffect = hookSource.slice(
    hookSource.indexOf("window.addEventListener('beforeunload'"),
    hookSource.indexOf('}, [doSave]);', hookSource.indexOf("window.addEventListener('beforeunload'"))
  );
  assert.match(beforeUnloadEffect, /handleBeforeUnload\(\)/);
});

// ─── Hardening: out-of-order save protection ──────────────────────────────

test('hook uses sequence numbers to reject stale saves', () => {
  assert.match(hookSource, /saveSeqRef/);
  assert.match(hookSource, /lastSavedSeqRef/);
  assert.match(hookSource, /seq < lastSavedSeqRef\.current/);
  assert.match(hookSource, /\+\+saveSeqRef\.current/);
});

test('hook keeps draftDataRef in sync for flush from event handlers', () => {
  assert.match(hookSource, /draftDataRef\.current = next/);
  assert.match(hookSource, /useEffect\(\(\) => \{ draftDataRef\.current = draftData/);
});

test('hook keeps inspectionIdRef in sync for event-triggered saves', () => {
  assert.match(hookSource, /inspectionIdRef/);
  assert.match(hookSource, /inspectionIdRef\.current = id/);
});

// ─── Hardening: draft creation threshold ──────────────────────────────────

test('hook does not create a draft until minimum meaningful data is entered', () => {
  assert.match(hookSource, /hasMinimumMeaningfulData/);
  assert.match(hookSource, /customer_first_name\.trim\(\)/);
  assert.match(hookSource, /vehicle_make\.trim\(\)/);
  assert.match(hookSource, /if \(!hasMinimumMeaningfulData\(data\)\) return null/);
});

// ─── Hardening: video upload status ───────────────────────────────────────

test('hook tracks video upload status (idle/uploading/saved/failed)', () => {
  assert.match(hookSource, /VideoUploadStatus = 'idle' \| 'uploading' \| 'saved' \| 'failed'/);
  assert.match(hookSource, /setVideoUploadStatus\('uploading'\)/);
  assert.match(hookSource, /setVideoUploadStatus\('saved'\)/);
  assert.match(hookSource, /setVideoUploadStatus\('failed'\)/);
});

test('hook video upload sets failed on storage error', () => {
  const uploadVideoFn = hookSource.slice(
    hookSource.indexOf('const uploadVideo'),
    hookSource.indexOf('const deleteVideo')
  );
  assert.match(uploadVideoFn, /setVideoUploadStatus\('failed'\)/);
});

test('hook video upload sets failed on DB update error', () => {
  const uploadVideoFn = hookSource.slice(
    hookSource.indexOf('const uploadVideo'),
    hookSource.indexOf('const deleteVideo')
  );
  // Should check dbErr and set failed
  assert.match(uploadVideoFn, /dbErr/);
  assert.match(uploadVideoFn, /if \(dbErr\)/);
});

test('hook exposes hasUploadingMedia including video', () => {
  assert.match(hookSource, /hasUploadingMedia/);
  assert.match(hookSource, /videoUploadStatus === 'uploading'/);
});

// ─── Hardening: discard draft ─────────────────────────────────────────────

test('hook provides discardDraft that deletes the inspection', () => {
  assert.match(hookSource, /discardDraft/);
  assert.match(hookSource, /from\('inspections'\)\.delete\(\)\.eq\('id', inspectionId\)/);
});

test('hook discardDraft resets all state', () => {
  const discardFn = hookSource.slice(
    hookSource.indexOf('const discardDraft'),
    hookSource.indexOf('const hasMediaErrors')
  );
  assert.match(discardFn, /setInspectionId\(null\)/);
  assert.match(discardFn, /setSavedPhotos\(\[\]\)/);
  assert.match(discardFn, /setDraftData\(EMPTY_DRAFT\)/);
});

// ─── Hardening: photo has_local_file tracking ─────────────────────────────

test('hook tracks has_local_file on SavedPhoto for reload-aware retry', () => {
  assert.match(hookSource, /has_local_file: boolean/);
  assert.match(hookSource, /has_local_file: true/);
  assert.match(hookSource, /has_local_file: false/);
});

test('hook replaceFailedPhoto delegates to retryPhotoUpload with replacement file', () => {
  assert.match(hookSource, /replaceFailedPhoto/);
  assert.match(hookSource, /await retryPhotoUpload\(photoId, file\)/);
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
  const handleCompleteStart = pageSource.indexOf('async function handleComplete');
  const handleCompleteEnd = pageSource.indexOf('\n}\n', handleCompleteStart);
  const handleCompleteBlock = pageSource.slice(handleCompleteStart, handleCompleteEnd);
  assert.doesNotMatch(handleCompleteBlock, /localPhotos\.map/);
});

test('CheckInPage prevents submit when media has errors', () => {
  assert.match(pageSource, /hasMediaErrors/);
  assert.match(pageSource, /Fix failed uploads to continue/);
});

test('CheckInPage prevents submit while uploads are in progress', () => {
  assert.match(pageSource, /hasUploadingMedia/);
  assert.match(pageSource, /Waiting for uploads to finish/);
});

test('CheckInPage shows per-photo upload status (uploading/saved/failed)', () => {
  assert.match(pageSource, /upload_status === 'uploading'/);
  assert.match(pageSource, /upload_status === 'failed'/);
});

test('CheckInPage retry button calls draft.retryPhotoUpload when local file exists', () => {
  assert.match(pageSource, /draft\.retryPhotoUpload\(p\.id\)/);
  assert.match(pageSource, /p\.has_local_file/);
});

test('CheckInPage shows Re-take button for failed photos without local file', () => {
  assert.match(pageSource, /Re-take/);
  assert.match(pageSource, /setRetakePhotoId/);
  assert.match(pageSource, /setShowCamera\(true\)/);
});

test('CheckInPage shows Remove button on failed photos', () => {
  assert.match(pageSource, /draft\.deletePhoto\(p\.id\)/);
  assert.match(pageSource, /Remove/);
});

test('CheckInPage explains that files are gone after reload', () => {
  assert.match(pageSource, /original files are gone/);
});

test('CheckInPage handles complete without creating duplicate sections', () => {
  assert.match(pageSource, /existingSections/);
  assert.match(pageSource, /if \(!existingSections\?\.length\)/);
});

test('CheckInPage saves step when navigating between steps', () => {
  assert.match(pageSource, /draft\.saveStep/);
});

// ─── Hardening: completion order (checkin_complete LAST) ──────────────────

test('CheckInPage creates sections BEFORE setting checkin_complete=true', () => {
  const handleCompleteStart = pageSource.indexOf('async function handleComplete');
  const handleCompleteEnd = pageSource.indexOf('\n}\n', handleCompleteStart);
  const block = pageSource.slice(handleCompleteStart, handleCompleteEnd);
  const sectionsPos = block.indexOf('inspection_sections');
  const completePos = block.indexOf("checkin_complete: true");
  assert.ok(sectionsPos > -1, 'must reference inspection_sections');
  assert.ok(completePos > -1, 'must set checkin_complete: true');
  assert.ok(sectionsPos < completePos, 'sections must be created BEFORE checkin_complete is set');
});

test('CheckInPage does not show success if section creation fails', () => {
  const handleCompleteStart = pageSource.indexOf('async function handleComplete');
  const handleCompleteEnd = pageSource.indexOf('\n}\n', handleCompleteStart);
  const block = pageSource.slice(handleCompleteStart, handleCompleteEnd);
  assert.match(block, /Failed to create inspection sections/);
  assert.match(block, /setSubmitting\(false\)/);
  assert.match(block, /return/);
});

test('CheckInPage completion error keeps draft resumable (does not delete)', () => {
  const handleCompleteStart = pageSource.indexOf('async function handleComplete');
  const handleCompleteEnd = pageSource.indexOf('\n}\n', handleCompleteStart);
  const block = pageSource.slice(handleCompleteStart, handleCompleteEnd);
  // The old code deleted the inspection on failure; verify that's gone
  assert.doesNotMatch(block, /from\('inspections'\)\.delete\(\)/);
  assert.match(block, /Your check-in data is saved/);
});

// ─── Hardening: discard draft UI ──────────────────────────────────────────

test('CheckInPage shows Discard button when resuming', () => {
  assert.match(pageSource, /Discard/);
  assert.match(pageSource, /showDiscardConfirm/);
});

test('CheckInPage discard confirmation warns about permanent deletion', () => {
  assert.match(pageSource, /permanently deleted/);
  assert.match(pageSource, /cannot be undone/);
});

test('CheckInPage handleDiscard calls draft.discardDraft then navigates', () => {
  assert.match(pageSource, /draft\.discardDraft\(\)/);
  assert.match(pageSource, /navigate\('\/dashboard'\)/);
});

// ─── Hardening: video upload status UI ────────────────────────────────────

test('CheckInPage shows video uploading state', () => {
  assert.match(pageSource, /videoUploadStatus === 'uploading'/);
  assert.match(pageSource, /Uploading video/);
});

test('CheckInPage shows video failed state with Record Again button', () => {
  assert.match(pageSource, /videoUploadStatus === 'failed'/);
  assert.match(pageSource, /Video upload failed/);
  assert.match(pageSource, /Record Again/);
});

test('CheckInPage videoOk checks both URL and saved status', () => {
  assert.match(pageSource, /draft\.savedVideoUrl !== null && draft\.videoUploadStatus === 'saved'/);
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

// ─── Legacy compatibility tests ───────────────────────────────────────────

test('migration uses IF NOT EXISTS for all ALTER TABLE ADD COLUMN', () => {
  assert.match(migrationSource, /ADD COLUMN IF NOT EXISTS checkin_step/i);
  assert.match(migrationSource, /ADD COLUMN IF NOT EXISTS upload_status/i);
});

test('migration upload_status defaults to saved so existing photos are valid', () => {
  assert.match(migrationSource, /upload_status text NOT NULL DEFAULT 'saved'/i);
});

test('migration checkin_step defaults to 1 so existing inspections are valid', () => {
  assert.match(migrationSource, /checkin_step smallint DEFAULT 1/i);
});

test('existing inspection with null checkin_step does not break resume loading', () => {
  assert.match(hookSource, /insp\.checkin_step as 1 \| 2\) \|\| 1/);
});

test('existing inspection completed before migration still has checkin_complete accessible', () => {
  // checkin_complete was already a column before the migration; verify it's still used
  assert.match(hookSource, /checkin_complete: false/);
  assert.match(pageSource, /checkin_complete: true/);
});
