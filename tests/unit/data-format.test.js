/* The generated data must match src/core/item-format.json, the format shared by the page and the generators. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ITEM_FORMAT from '../../src/core/item-format.json' with { type: 'json' };
import { JOBS, ITEM_STAT_ORDER, DB_SLOT_TYPE, SLOT_TYPES } from '../../src/core/constants.js';
import { IL, PG, ITEMS } from '../../src/core/tables.js';

test('job bit order, stat order and slot codes come from item-format.json', () => {
  assert.deepEqual(
    JOBS.map(j => j[0]),
    ITEM_FORMAT.jobs,
  );
  assert.deepEqual(
    ITEM_STAT_ORDER,
    ITEM_FORMAT.stats.map(s => s.key),
  );
  assert.deepEqual(
    ITEM_FORMAT.slots.map(s => s.code),
    ITEM_FORMAT.slots.map((_, i) => i),
  );
  DB_SLOT_TYPE.forEach(t => {
    assert.ok(SLOT_TYPES.includes(t), t);
  });
});

test('ItemLevel table has one column per stat, all the same length', () => {
  assert.deepEqual(Object.keys(IL).sort(), ITEM_STAT_ORDER.slice().sort());
  const lengths = new Set(Object.values(IL).map(c => c.length));
  assert.equal(lengths.size, 1);
  assert.equal(PG.length, 100);
});

test('every item row has the documented shape', () => {
  const maxMask = 2 ** ITEM_FORMAT.jobs.length;
  for (const r of ITEMS) {
    const where = JSON.stringify(r).slice(0, 80);
    assert.equal(r.length, 7, where);
    assert.ok(Number.isInteger(r[1]) && r[1] >= 0 && r[1] < ITEM_FORMAT.slots.length, 'slot code ' + where);
    assert.ok(r[4] > 0 && r[4] < maxMask, 'job mask ' + where);
    assert.equal(r[5].split(',').length, ITEM_STAT_ORDER.length, 'stat count ' + where);
    assert.ok(r[6] === 0 || r[6] === 1, 'unique flag ' + where);
  }
});
