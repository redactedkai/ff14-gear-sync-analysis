/* Every table keyed by character level reaches the level cap (MAX_LEVEL, the highest equip level in the item database).
   A data update that raises the cap (level 110, say) then fails here, naming the table to extend, instead of giving
   undefined and NaN on the page. LEVEL_MAIN, EXPANSIONS and HASTE are written by hand (src/core/constants.js); PG and
   MAX_SPEED are generated (scripts/data/gen_item_level.py, gen_max_speed.mjs). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXPANSIONS, HASTE, JOB_LEVEL_CAPS, LEVEL_MAIN } from '../../src/core/constants.js';
import { levelParams } from '../../src/core/level-params.js';
import { hasteFor } from '../../src/core/speed.js';
import { MAX_LEVEL, MAX_SPEED, PG } from '../../src/core/tables.js';

test('the level cap is read from the items', () => {
  assert.ok(Number.isInteger(MAX_LEVEL) && MAX_LEVEL >= 100, `MAX_LEVEL ${MAX_LEVEL}`);
});

test('LEVEL_MAIN has a main stat base for every level up to MAX_LEVEL', () => {
  assert.ok(LEVEL_MAIN.length >= MAX_LEVEL, `LEVEL_MAIN ends at level ${LEVEL_MAIN.length}: add the new levels in constants.js`);
  for (let level = 1; level <= MAX_LEVEL; level++) assert.ok(LEVEL_MAIN[level - 1] > 0, `level ${level}`);
});

test('the last of EXPANSIONS reaches MAX_LEVEL', () => {
  const [short, , cap] = EXPANSIONS.at(-1);
  assert.ok(cap >= MAX_LEVEL, `${short} caps at ${cap}: add the new expansion to EXPANSIONS in constants.js`);
  for (const [a, b] of EXPANSIONS.slice(1).map((e, i) => [EXPANSIONS[i], e])) assert.ok(a[2] < b[2], `${a[0]} before ${b[0]}`);
});

test('HASTE steps are in level order, within 1 to MAX_LEVEL, and give a percent at every level from the first step', () => {
  for (const [jobId, { steps }] of Object.entries(HASTE)) {
    const levels = steps.map(s => s[0]);
    assert.deepEqual(
      levels,
      [...levels].sort((a, b) => a - b),
      jobId,
    );
    assert.ok(levels[0] >= 1 && levels.at(-1) <= MAX_LEVEL, `${jobId} steps ${levels}`);
    for (let level = levels[0]; level <= MAX_LEVEL; level++) {
      const pct = hasteFor(jobId, level)?.pct;
      assert.ok(pct > 0 && pct < 100, `${jobId} level ${level}: ${pct}`);
    }
  }
});

test('the generated level data (PG) and most-speed table (MAX_SPEED) reach MAX_LEVEL', () => {
  assert.ok(PG.length >= MAX_LEVEL, `PG ends at level ${PG.length}: regenerate (python scripts/data/regen.py)`);
  assert.ok(MAX_SPEED.length >= MAX_LEVEL, `MAX_SPEED ends at level ${MAX_SPEED.length}: regenerate (python scripts/data/regen.py)`);
  for (let level = 1; level <= MAX_LEVEL; level++) {
    const { sub, div, sync } = levelParams(level);
    assert.ok(
      [sub, div, sync].every(v => Number.isInteger(v) && v > 0),
      `level ${level}: ${sub}, ${div}, ${sync}`,
    );
  }
  // the top level reads its own row, not a lower level's (levelParams and statBase clamp to MAX_LEVEL)
  assert.deepEqual(Object.values(levelParams(MAX_LEVEL)), PG[MAX_LEVEL - 1]);
  assert.deepEqual(Object.values(levelParams(MAX_LEVEL + 5)), PG[MAX_LEVEL - 1]);
});

test('limited jobs cap at or below MAX_LEVEL', () => {
  for (const [jobId, cap] of Object.entries(JOB_LEVEL_CAPS)) assert.ok(cap <= MAX_LEVEL, `${jobId} ${cap}`);
});
