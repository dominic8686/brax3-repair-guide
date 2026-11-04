import assert from 'node:assert/strict';
import fs from 'node:fs';
import {stateBefore} from './guide-steps.js';
const data=JSON.parse(fs.readFileSync(new URL('./guide-data.json',import.meta.url),'utf8'));
assert.equal(data.steps.length,18);
assert.ok(!/glyph|nothing|torx/i.test(JSON.stringify(data.steps)));
assert.equal(new Set(data.steps.map(s=>s.id)).size,data.steps.length);
for (const step of data.steps) {
  assert.ok(step.instructions.length>0);
  for (const i of step.stage.tools) assert.ok(data.tools[i]);
  for (const frame of step.stage.frames) assert.ok(frame.length===3 && frame.every(Number.isFinite));
}
assert.deepEqual(stateBefore(1,data.steps),{});
assert.equal(stateBefore(5,data.steps).cover,1);
assert.equal(stateBefore(7,data.steps).carrier,1);
assert.equal(stateBefore(9,data.steps).batteryFlex,1);
assert.equal(stateBefore(10,data.steps).battery,1);
assert.equal(stateBefore(11,data.steps).battery,0);
assert.equal(stateBefore(13,data.steps).carrier,0);
assert.equal(stateBefore(14,data.steps).screws,0);
assert.equal(stateBefore(18,data.steps).cover,0);
for (const tool of data.tools) assert.ok(fs.existsSync(new URL('.'+tool.image, import.meta.url)));
console.log('PASS: 18 steps, no foreign hardware steps, valid tools/cameras, deterministic removal/reassembly state.');
