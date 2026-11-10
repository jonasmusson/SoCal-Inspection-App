import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("Project Photos is routed for authenticated and no-write review modes",()=>{
  const app=read("src/App.tsx");
  const pilot=read("src/pages/HubPilotPage.tsx");
  assert.ok(app.includes("HubProjectPhotosPage"));
  assert.ok(app.includes("location.pathname === '/review/hub/photos'"));
  assert.ok(app.includes("<HubProjectPhotosPage demoMode />"));
  assert.ok(app.includes('path="/hub/photos"'));
  assert.ok(pilot.includes("Photos"));
  assert.ok(pilot.includes("photoPath"));
});

test("Photo pilot reserves with checksum, uploads to private bucket and finalizes verification",()=>{
  const page=read("src/pages/HubProjectPhotosPage.tsx");
  for(const text of [
    "crypto.subtle.digest('SHA-256'",
    "uploads/reserve",
    ".from('hub-pilot-private')",
    "uploads/finalize",
    "sha256: checksum",
    "category: 'Progress'",
    "Photo saved, verified and archived.",
  ]) assert.ok(page.includes(text),text);
});

test("Photo pilot accepts only the backend-supported image types and 24 MB boundary",()=>{
  const page=read("src/pages/HubProjectPhotosPage.tsx");
  for(const type of ["image/jpeg","image/png","image/webp","image/heic","image/heif","image/avif"])
    assert.ok(page.includes(type),type);
  assert.ok(page.includes("const MAX_BYTES = 25_165_824"));
  assert.ok(page.includes("Photo must be smaller than 24 MB."));
});

test("Failed upload keeps the same item available for Retry instead of encouraging recapture",()=>{
  const page=read("src/pages/HubProjectPhotosPage.tsx");
  assert.ok(page.includes("Keep this screen open and tap Retry; do not recapture the photo."));
  assert.ok(page.includes("item.state === 'error' ? 'Retry' : 'Save'"));
  assert.ok(page.includes("/already exists/i"));
});

test("Photo demo returns before any reservation or storage write",()=>{
  const page=read("src/pages/HubProjectPhotosPage.tsx");
  const start=page.indexOf("async function savePhoto");
  const end=page.indexOf("if (loading)",start);
  const block=page.slice(start,end);
  const demo=block.indexOf("if (demoMode)");
  const reserve=block.indexOf("uploads/reserve");
  const storage=block.indexOf(".from('hub-pilot-private')");
  assert.ok(demo>=0);
  assert.ok(reserve>demo);
  assert.ok(storage>demo);
  assert.ok(block.slice(demo,reserve).includes("return;"));
  assert.ok(block.includes("Demo only — photo flow completed, but nothing was uploaded or saved."));
});

test("In-app camera capture does not require saving a photo to the device library",()=>{
  const page=read("src/pages/HubProjectPhotosPage.tsx");
  const camera=read("src/components/common/CameraComponents.tsx");
  assert.ok(page.includes("<CameraView"));
  assert.ok(camera.includes("canvas.toBlob"));
  assert.ok(camera.includes("onCapture(new File"));
  assert.ok(!camera.includes("showSaveFilePicker"));
});
