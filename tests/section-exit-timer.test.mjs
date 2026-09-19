import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = readFileSync(resolve(root, 'src/pages/InspectSectionPage.tsx'), 'utf8');

test('section header Back uses the same timer-safe exit path as Save & Exit', () => {
  assert.match(source, /aria-label="Back to inspection" onClick=\{saveAndExit\}/);
  assert.doesNotMatch(source, /aria-label="Back to inspection"[^>]*navigate\(/);
});

test('saveAndExit pauses an active inspection timer before navigating away', () => {
  const start = source.indexOf('async function saveAndExit()');
  const end = source.indexOf('\n  async function pauseTimer()', start);
  assert.notEqual(start, -1, 'saveAndExit must exist');
  assert.ok(end > start, 'saveAndExit block must be bounded by pauseTimer');

  const block = source.slice(start, end);
  assert.match(block, /inspection && inspection\.work_started_at && !inspection\.paused_at/);
  assert.match(block, /update\(\{ paused_at: now \}\)\.eq\('id', inspection\.id\)/);

  const pauseUpdate = block.indexOf("update({ paused_at: now })");
  const navigation = block.indexOf('navigate(`/inspection/${id}`)');
  assert.ok(pauseUpdate >= 0 && navigation > pauseUpdate, 'timer pause must be awaited before navigation');
});
