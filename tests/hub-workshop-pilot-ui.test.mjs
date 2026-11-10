import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("Technician defaults to the Workshop pilot and has one-tap Workshop navigation",()=>{
  const app=read("src/App.tsx");
  const layout=read("src/components/Layout.tsx");
  assert.ok(app.includes("profile?.role === 'tech' ? '/hub/pilot' : '/dashboard'"));
  assert.ok(app.includes('path="/hub/pilot"'));
  assert.ok(layout.includes("path: '/hub/pilot'"));
  assert.ok(layout.includes("label: 'Workshop'"));
});

test("Public Workshop pilot demo bypasses auth/config and is explicitly no-write",()=>{
  const app=read("src/App.tsx");
  const page=read("src/pages/HubPilotPage.tsx");
  assert.ok(app.includes("location.pathname === '/review/hub/pilot'"));
  assert.ok(app.includes("<HubPilotPage demoMode />"));
  assert.ok(app.includes("window.location.pathname === '/review/hub/pilot'"));
  assert.ok(page.includes("Demo · No Writes"));
});

test("Workshop pilot exposes the core technician loop",()=>{
  const page=read("src/pages/HubPilotPage.tsx");
  for(const text of [
    "Clock In",
    "Clock Out",
    "Current work",
    "Start Work",
    "Stop Work",
    "Add Work",
    "Parts",
    "Other Time",
    "Next",
    "Ready to Claim",
    "Blocked / Waiting",
    "Need Work",
  ]) assert.ok(page.includes(text),text);
});

test("Real technician actions use the guarded HUB backend operations",()=>{
  const page=read("src/pages/HubPilotPage.tsx");
  for(const operation of [
    "timeclock/punch",
    "task/claim",
    "work-session/start",
    "work-session/stop",
    "capacity/create",
    "parts/create",
    "tech/home",
  ]) assert.ok(page.includes(operation),operation);
});

test("Demo handlers return before every write operation",()=>{
  const page=read("src/pages/HubPilotPage.tsx");
  const functions=[
    ["async function punch()", "async function claim(", "timeclock/punch"],
    ["async function claim(", "async function startWork(", "task/claim"],
    ["async function startWork(", "async function stopWork()", "work-session/start"],
    ["async function stopWork()", "async function submitCapacity()", "work-session/stop"],
    ["async function submitCapacity()", "async function submitPart()", "capacity/create"],
    ["async function submitPart()", "if (!home && busy", "parts/create"],
  ];
  for(const [startText,endText,operation] of functions){
    const start=page.indexOf(startText);
    const end=page.indexOf(endText,start);
    const block=page.slice(start,end);
    const demo=block.indexOf("if (demoMode)");
    const live=block.indexOf(operation);
    assert.ok(demo>=0,startText+" demo guard");
    assert.ok(live>demo,startText+" live action follows demo guard");
    assert.ok(block.slice(demo,live).includes("return;"),startText+" demo returns before live action");
  }
});

test("Other Time explains that management approval controls productive credit",()=>{
  const page=read("src/pages/HubPilotPage.tsx");
  assert.ok(page.includes("This starts Pending Review. Management decides whether it becomes productive credit, constrained time, or remains unaccounted."));
  assert.ok(page.includes("No ready work available"));
  assert.ok(page.includes("Waiting for parts"));
  assert.ok(page.includes("Vehicle transport / customer support"));
  assert.ok(page.includes("Shop operations"));
});

test("Need Work is framed as a management/work-availability signal",()=>{
  const page=read("src/pages/HubPilotPage.tsx");
  assert.ok(page.includes("This is a management/work-availability signal—not automatic technician downtime."));
});
