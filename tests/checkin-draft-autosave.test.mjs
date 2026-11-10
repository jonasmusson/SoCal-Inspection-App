import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("Check-in draft state autosaves the wizard step, form and assignment metadata",()=>{
  const page=read("src/pages/CheckInPage.tsx");
  for(const text of [
    "CheckinDraftState<typeof form>",
    "saved_at: Date.now()",
    "step,",
    "form,",
    "assigned_tech_id: assignedTechId",
    "custom_make: customMake",
    "custom_model: customModel",
    "photo_ids: localPhotos.map(photo => photo.id)",
    "video_id: localVideoId",
    "saveCheckinDraftState(profile.id, draft)",
  ]) assert.ok(page.includes(text),text);
});

test("Check-in restore returns to the saved step with customer/vehicle/assignment/media",()=>{
  const page=read("src/pages/CheckInPage.tsx");
  for(const text of [
    "loadCheckinDraftState<typeof form>(profile.id)",
    "setForm(draft.form)",
    "setStep(draft.step)",
    "setAssignedTechId(draft.assigned_tech_id || '')",
    "setCustomMake(Boolean(draft.custom_make))",
    "setCustomModel(Boolean(draft.custom_model))",
    "loadCheckinDraftMedia(profile.id, id, 'photo')",
    "loadCheckinDraftMedia(profile.id, draft.video_id, 'video')",
    "setDraftRestored(true)",
    "Draft restored.",
  ]) assert.ok(page.includes(text),text);
});

test("Captured and imported media are persisted separately from text autosave",()=>{
  const page=read("src/pages/CheckInPage.tsx");
  const helper=read("src/lib/checkinDraft.ts");
  assert.ok(page.includes("saveCheckinDraftMedia(profile.id, id, 'photo', file)"));
  assert.ok(page.includes("saveCheckinDraftMedia(profile.id, id, 'video', file)"));
  assert.ok(helper.includes("indexedDB.open"));
  assert.ok(helper.includes("checkin-media"));
  assert.ok(helper.includes("file: File"));
  assert.ok(helper.includes("localStorage.setItem"));
});

test("Removing photo/video deletes its draft media copy",()=>{
  const page=read("src/pages/CheckInPage.tsx");
  assert.ok(page.includes("removeCheckinDraftMedia(profile.id, target.id, 'photo')"));
  assert.ok(page.includes("removeCheckinDraftMedia(profile.id, localVideoId, 'video')"));
});

test("Successful check-in clears the local recovery draft",()=>{
  const page=read("src/pages/CheckInPage.tsx");
  const submitStart=page.indexOf("async function handleSubmit()");
  const success=page.indexOf("setSuccess({",submitStart);
  const block=page.slice(submitStart,success);
  assert.ok(block.includes("await clearCheckinDraft(profile.id)"));
});

test("Discard Draft explicitly clears local state/media and resets the wizard",()=>{
  const page=read("src/pages/CheckInPage.tsx");
  const start=page.indexOf("async function discardDraft()");
  const end=page.indexOf("const photosRef",start);
  const block=page.slice(start,end);
  assert.ok(block.includes("clearCheckinDraft(profile.id)"));
  assert.ok(block.includes("setLocalPhotos([])"));
  assert.ok(block.includes("setLocalVideo(null)"));
  assert.ok(block.includes("setStep(1)"));
  assert.ok(block.includes("setDraftRestored(false)"));
  assert.ok(page.includes("Discard Draft"));
});

test("Template initialization does not overwrite a restored draft template",()=>{
  const page=read("src/pages/CheckInPage.tsx");
  assert.ok(page.includes("template_id: f.template_id || tmplData[0].id"));
});

test("Stale local drafts expire after seven days",()=>{
  const page=read("src/pages/CheckInPage.tsx");
  assert.ok(page.includes("CHECKIN_DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000"));
  assert.ok(page.includes("Date.now() - draft.saved_at > CHECKIN_DRAFT_MAX_AGE_MS"));
});

test("Incomplete media recovery produces a visible warning instead of silently dropping files",()=>{
  const page=read("src/pages/CheckInPage.tsx");
  assert.ok(page.includes("restoredPhotos.length !== draft.photo_ids.length"));
  assert.ok(page.includes("one or more local media files could not be recovered"));
});
