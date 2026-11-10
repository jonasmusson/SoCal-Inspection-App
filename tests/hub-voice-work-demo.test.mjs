import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("Public review route can render without Supabase configuration or authentication",()=>{
  const app=read("src/App.tsx");
  assert.ok(app.includes("location.pathname === '/review/hub/add-work'"));
  assert.ok(app.includes("<HubVoiceWorkPage demoMode />"));
  assert.ok(app.includes("!supabaseConfigured && !reviewDemo"));
});

test("Demo Add Work loads fake shop data and never loads the live HUB snapshot",()=>{
  const page=read("src/pages/HubVoiceWorkPage.tsx");
  assert.ok(page.includes("const DEMO_SNAPSHOT"));
  assert.ok(page.includes("Review Demo · No Writes"));
  const loadStart=page.indexOf("async function load()");
  const organizeStart=page.indexOf("async function organizeWork()");
  const load=page.slice(loadStart,organizeStart);
  assert.ok(load.includes("if (demoMode)"));
  assert.ok(load.includes("setSnapshot(DEMO_SNAPSHOT)"));
  assert.ok(load.indexOf("if (demoMode)") < load.indexOf("hubWorkspace<Snapshot>('snapshot')"));
});

test("Demo organizer is deterministic and clearly not production AI",()=>{
  const page=read("src/pages/HubVoiceWorkPage.tsx");
  assert.ok(page.includes("function demoDraftFromTranscript"));
  assert.ok(page.includes("Demo organizer only — this is for UX testing and is not the production AI interpretation."));
  assert.ok(page.includes("Demo draft organized. Review and edit it exactly as you would in the live workflow."));
});

test("Demo save exits before any HUB work/create call",()=>{
  const page=read("src/pages/HubVoiceWorkPage.tsx");
  const start=page.indexOf("async function saveWork()");
  const end=page.indexOf("return (",start);
  const block=page.slice(start,end);
  const demoGuard=block.indexOf("if (demoMode)");
  const write=block.indexOf("hubWorkspace('work/create'");
  assert.ok(demoGuard>=0);
  assert.ok(write>demoGuard);
  assert.ok(block.includes("Demo only — nothing was saved, approved, billed, or sent anywhere."));
  assert.ok(block.includes("return;"));
});

test("Demo provides a one-tap sample note and keeps microphone/edit controls",()=>{
  const page=read("src/pages/HubVoiceWorkPage.tsx");
  for(const text of [
    "Load sample shop note",
    "DEMO_EXAMPLE",
    "startListening",
    "value={transcript}",
    "Organize Work",
    "Demo Save · No Write",
  ]) assert.ok(page.includes(text),text);
});