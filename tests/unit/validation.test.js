import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bandAccuracy, wikiChecks } from '../../src/core/validation.js';
import { MAX_REAL, MAX_ILVL } from '../../src/core/tables.js';

test('formula reproduces the Wiki sync caps at item level 475', () => {
  for (const c of wikiChecks()) assert.equal(c.computed, c.published, c.label);
});

test('formula accuracy against every real piece, by item level band', t => {
  for (const b of bandAccuracy()) {
    const exact = b.exact / b.n,
      within1 = b.within1 / b.n;
    t.diagnostic(`band ${b.label} n=${b.n} exact ${(exact * 100).toFixed(1)}% within1 ${(within1 * 100).toFixed(1)}%`);
    assert.ok(exact >= 0.985, `exact share in band ${b.label}: ${exact}`);
    assert.ok(within1 >= 0.985, `within-1 share in band ${b.label}: ${within1}`);
  }
});

test('highest real item level is inside the ItemLevel table', () => {
  assert.ok(MAX_REAL <= MAX_ILVL);
});

/* Real pieces that the three refinements of the formula reproduce (docs/math.md, section 4): equal substats share the
   higher rank (relic weapon steps with two full substats), every main stat counts (a few pieces carry Strength and
   Dexterity), and an off-hand is the two-handed value minus the one-handed value. */
test('the formula reproduces relic weapons with two full substats, two main stats, and off-hands', async () => {
  const { ITEMS } = await import('../../src/core/tables.js');
  const { predictRaw } = await import('../../src/core/formulas.js');
  for (const name of [
    'Phantom Staff Eclipticum', // 790: Critical Hit and Spell Speed both 443
    'Hyperconductive Draconomicon', // 230: Determination and Spell Speed both 88
    'Gloam Tabard', // 110: Strength and Dexterity both 41
    'Vanguard Shield', // 672: Critical Hit 63 = 218 - 155
    'Ironworks Magitek Shield', // 120: Tenacity 13 = 47 - 34
  ]) {
    const r = ITEMS.find(x => x[0] === name);
    assert.ok(r, name);
    const st = r[5].split(',').map(Number);
    assert.deepEqual(predictRaw(r[2], r[1], st), st, name);
  }
});
