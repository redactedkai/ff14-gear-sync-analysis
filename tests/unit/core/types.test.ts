/* The types written by hand in src/core/types.ts and constants.ts agree with item-format.json and the tables they stand
   for. TypeScript reads the JSON file's names only as `string`, so this test holds the other half: the compile-time check
   is the object literals below, typed as the hand-written types; the run-time check is that they equal what the code builds
   from the file. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ITEM_FORMAT from '../../../src/core/item-format.json' with { type: 'json' };
import { DAMAGE_DEFENSE_KEYS, ITEM_STAT_ORDER, ROW, STAT_LABEL } from '../../../src/core/constants.ts';
import type { DamageDefenseKey, ItemRow, RawStatKey, RowIndex } from '../../../src/core/types.ts';

test('RowIndex lists the item row fields at the positions of itemRow.fields in item-format.json', () => {
  const expected: RowIndex = {
    name: 0,
    slotCode: 1,
    ilvl: 2,
    equipLevel: 3,
    jobMask: 4,
    stats: 5,
    unique: 6,
    hq: 7,
    routes: 8,
    kind: 9,
    meldSlots: 10,
    overmeld: 11,
    rarity: 12,
    gameId: 13,
    scales: 14,
    category: 15,
    damagePhys: 16,
    damageMag: 17,
    defensePhys: 18,
    defenseMag: 19,
  };
  assert.deepEqual({ ...ROW }, expected);
  assert.deepEqual(Object.keys(expected), ITEM_FORMAT.itemRow.fields);
  // an ItemRow has one entry per field
  const length: ItemRow['length'] = 20;
  assert.equal(length, ITEM_FORMAT.itemRow.fields.length);
});

test('RawStatKey is the stat keys of item-format.json: STAT_LABEL plus the generic Main and Secondary Attribute', () => {
  const keys: RawStatKey[] = [...(Object.keys(STAT_LABEL) as RawStatKey[]), 'mainAttr', 'secAttr'];
  assert.deepEqual([...keys].sort(), [...ITEM_STAT_ORDER].sort());
});

test('DamageDefenseKey is the keys of damageDefense in item-format.json', () => {
  const keys: DamageDefenseKey[] = ['damagePhys', 'damageMag', 'defensePhys', 'defenseMag'];
  assert.deepEqual(keys, [...DAMAGE_DEFENSE_KEYS]);
});
