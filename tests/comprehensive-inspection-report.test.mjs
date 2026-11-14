import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const source=readFileSync(new URL("../src/components/report/PremiumInspectionReport.tsx",import.meta.url),"utf8");

test("Executive summary surfaces how much inspection evidence actually exists",()=>{
  for(const text of [
    "Technician notes",
    "Inspection photos",
    "Check-in photos",
    "technicianNotes.length",
    "evidencePhotoCount",
    "checkinPhotos.length",
  ]) assert.ok(source.includes(text),text);
});

test("Detailed findings remain concise but point to the complete record for additional photos",()=>{
  assert.ok(source.includes("itemPhotos.slice(0, 3)"));
  assert.ok(source.includes("additional photo"));
  assert.ok(source.includes("in Complete Inspection Record"));
});

test("Complete Inspection Record preserves every item and technician note",()=>{
  for(const text of [
    "05 · Complete Inspection Record",
    "Every inspected point.",
    "Every recorded note.",
    "fullRecordRows.map",
    "items.map(item =>",
    "item.notes?.trim()",
    "No technician note recorded.",
  ]) assert.ok(source.includes(text),text);
});

test("Complete Inspection Record renders every item photo without a slice limit",()=>{
  const start=source.indexOf("05 · Complete Inspection Record");
  const end=source.indexOf("06 · Vehicle Check-In Evidence",start);
  const appendix=source.slice(start,end);
  assert.ok(appendix.includes("itemPhotos.map"));
  assert.ok(!appendix.includes("itemPhotos.slice"));
});

test("Vehicle Check-In Evidence includes every check-in photo, notes and video",()=>{
  const start=source.indexOf("06 · Vehicle Check-In Evidence");
  const end=source.indexOf("07 · The Decision After the Data",start);
  const section=source.slice(start,end);
  assert.ok(section.includes("checkinPhotos.map"));
  assert.ok(section.includes("inspection.checkin_notes"));
  assert.ok(section.includes("inspection.checkin_video_url"));
  assert.ok(section.includes("Open recorded walk-around video"));
});

test("Report navigation makes the full record and check-in evidence discoverable",()=>{
  assert.ok(source.includes("05 Full Record"));
  assert.ok(source.includes("06 Check-In"));
  assert.ok(source.includes("07 Plan"));
});
