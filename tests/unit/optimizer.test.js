import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeJobContext } from '../../src/core/job-context.js';
import { browseItems, poolItemFromRow, genericItems } from '../../src/core/items.js';
import { optimize } from '../../src/core/optimizer/index.js';
import { gcdFor } from '../../src/core/speed.js';

const sge = makeJobContext('SGE');
const dreadwyrm = browseItems(sge, { q: 'Dreadwyrm', type: 'any', ilvlMin: 130, ilvlMax: 130, lvlMax: 50 })
  .filter(r => /of Healing$/.test(r.name))
  .map(r => poolItemFromRow(sge, r));

test('Dreadwyrm healing pieces found', () => {
  assert.equal(dreadwyrm.length, 9);
});

test('Dreadwyrm synced Spell Speed (ring is Unique, so only one)', () => {
  assert.equal(optimize(sge, dreadwyrm, { cap: 123, sync: true }, { target: 'spd' }).totals.spd, 171);
});

test('Dreadwyrm unsynced Spell Speed (one ring)', () => {
  assert.equal(optimize(sge, dreadwyrm, { cap: 123, sync: false }, { target: 'spd' }).totals.spd, 176);
});

test('generic maximum under a 123 cap is 296 Spell Speed, 2.22 s GCD', () => {
  const gen = genericItems(sge, 475, sge.substats, false, ['head', 'body', 'hands', 'legs', 'feet', 'ear', 'neck', 'wrist', 'ring']);
  const r = optimize(sge, gen, { cap: 123, sync: true }, { target: 'spd' });
  assert.deepEqual([r.totals.spd, gcdFor(r.totals.spd, 50)], [296, 2.22]);
});
