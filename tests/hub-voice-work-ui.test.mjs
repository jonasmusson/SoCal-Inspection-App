import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("Add Work is one tap from the authenticated primary navigation",()=>{
  const app=read("src/App.tsx");
  const layout=read("src/components/Layout.tsx");
  assert.ok(app.includes("HubVoiceWorkPage"));
  assert.ok(app.includes('path="/hub/add-work"'));
  assert.ok(layout.includes("label: \'Add Work\'"));
  assert.ok(layout.includes("icon: Mic"));
});

test("Mobile work screen prioritizes talk-to-text and keeps transcript visible/editable",()=>{
  const page=read("src/pages/HubVoiceWorkPage.tsx");
  for(const text of [
    "Talk it. Check it. Save it.",
    "startListening",
    "stopListening",
    "SpeechRecognition",
    "webkitSpeechRecognition",
    "Tap the microphone and talk. Or tap here and use the iPhone keyboard microphone.",
    "value={transcript}",
    "onChange={event => { setTranscript(event.target.value); setDraft(null); }}",
  ]) assert.ok(page.includes(text),text);
});

test("Unsupported browser speech has an explicit iPhone keyboard dictation fallback",()=>{
  const page=read("src/pages/HubVoiceWorkPage.tsx");
  assert.ok(page.includes("use the iPhone keyboard microphone instead"));
  assert.ok(page.includes("Use iPhone keyboard dictation"));
});

test("Organize Work is review-first and never implies the AI draft was saved",()=>{
  const page=read("src/pages/HubVoiceWorkPage.tsx");
  assert.ok(page.includes("Organize Work"));
  assert.ok(page.includes("Draft organized. Review it before saving anything."));
  assert.ok(page.includes("Review before save"));
  assert.ok(page.includes("Suggestion only — saving this work does not change the task status."));
  assert.ok(page.includes("Suggestions only — parts are not requested automatically."));
});

test("Saving the reviewed draft creates only Pending Review project work",()=>{
  const page=read("src/pages/HubVoiceWorkPage.tsx");
  const start=page.indexOf("async function saveWork()");
  const end=page.indexOf("return (",start);
  const block=page.slice(start,end);
  assert.ok(block.includes("hubWorkspace(\'work/create\'"));
  assert.ok(block.includes("project_id: projectId"));
  assert.ok(block.includes("actual_hours: draft.actual_hours"));
  assert.ok(block.includes("Work saved as Pending Review. Nothing was billed or sent to Shopmonkey."));
  assert.ok(!block.includes("parts/create"));
  assert.ok(!block.includes("task/update"));
});

test("HUB browser client sends the signed-in user JWT, not a secret key",()=>{
  const client=read("src/lib/hubWorkspace.ts");
  assert.ok(client.includes("supabase.auth.getSession()"));
  assert.ok(client.includes("session.access_token"));
  assert.ok(client.includes("apikey: supabaseAnonKey"));
  assert.ok(!client.includes("SERVICE_ROLE"));
  assert.ok(!client.includes("OPENAI_API_KEY"));
  assert.ok(!client.includes("SHOPMONKEY_API_TOKEN"));
});