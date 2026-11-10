import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("Stop Work carries project, task and suggested elapsed hours into Add Work",()=>{
  const pilot=read("src/pages/HubPilotPage.tsx");
  assert.ok(pilot.includes("lastStopped"));
  assert.ok(pilot.includes("project_id: activeSession.project_id"));
  assert.ok(pilot.includes("task_id: activeSession.task_id"));
  assert.ok(pilot.includes("suggested_hours: result.suggested_actual_hours"));
  assert.ok(pilot.includes("params.set('hours', String(addWorkContext.suggested_hours))"));
  assert.ok(pilot.includes("lastStopped ? 'Document Work' : 'Add Work'"));
});

test("Add Work accepts valid stopped-work context from query parameters",()=>{
  const page=read("src/pages/HubVoiceWorkPage.tsx");
  assert.ok(page.includes("query.get('project_id')"));
  assert.ok(page.includes("query.get('task_id')"));
  assert.ok(page.includes("query.get('hours')"));
  assert.ok(page.includes("data.projects.some(project => project.id === requestedProject)"));
  assert.ok(page.includes("data.project_tasks.some(task => task.id === requestedTask && task.project_id === nextProject)"));
});

test("Stopped-session hours remain an explicit suggestion rather than automatic truth",()=>{
  const page=read("src/pages/HubVoiceWorkPage.tsx");
  assert.ok(page.includes("Stopped-session suggestion:"));
  assert.ok(page.includes("Use time"));
  assert.ok(page.includes("onClick={() => setDraft({ ...draft, actual_hours: sessionSuggestedHours })}"));
  const initializer=page.slice(page.indexOf("const [sessionSuggestedHours]"),page.indexOf("const recognitionRef"));
  assert.ok(!initializer.includes("setDraft"));
});

test("Changing project clears stale task and draft context",()=>{
  const page=read("src/pages/HubVoiceWorkPage.tsx");
  assert.ok(page.includes("setProjectId(event.target.value); setTaskId(''); setDraft(null);"));
});
