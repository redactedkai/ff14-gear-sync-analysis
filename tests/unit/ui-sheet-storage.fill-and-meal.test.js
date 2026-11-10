/* The Food-related fields of a saved gear set (src/ui/sheet-storage.js): the set's `meal` (an allMeals key or null) and the
   Fill settings' food, materia and tier switches. A field of the wrong type makes the record unreadable with the cause
   (the manager lists it with Delete) instead of a view breaking on it; a meal key the game data no longer has reads fine
   and the Food row says "missing meal" (ui-views-set-rows.test.js). Replaces the old state test "Food: off by default,
   a wrong type falls back". */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSheet } from '../../src/ui/sheet-storage.js';
import { sageSet, sheetOf } from './helpers/sheet-fixtures.js';

const read = fields => parseSheet(JSON.stringify(sheetOf('SGE', [{ ...sageSet(), ...fields }])), 's_1');

test('a meal that is a key or null reads, even a key the game data lacks; any other type makes the record unreadable', () => {
  assert.ok(read({ meal: null }).sheet);
  assert.ok(read({ meal: 'A meal from an older patch' }).sheet);
  assert.equal(read({ meal: 'f1' }).sheet.sets[0].meal, 'f1');
  for (const meal of [7, true, ['f1'], { key: 'f1' }])
    assert.equal(read({ meal }).cause, 'a gear set with a damaged meal', JSON.stringify(meal));
});

test('the meal pin must be a boolean', () => {
  assert.ok(read({ pinned: { pieces: [], meal: true } }).sheet);
  for (const meal of ['yes', 1, null])
    assert.equal(read({ pinned: { pieces: [], meal } }).cause, 'a gear set with damaged pins', String(meal));
});

test('the Fill settings switches (Food, Materia, Spare points) must be booleans when present', () => {
  for (const field of ['food', 'melds', 'byTier']) {
    assert.ok(read({ fillSettings: { goal: { [field]: true } } }).sheet, `${field} true`);
    for (const value of ['yes', 1, null, 'false']) {
      assert.equal(
        read({ fillSettings: { goal: { [field]: value } } }).cause,
        'a gear set with damaged Fill settings',
        `${field} ${JSON.stringify(value)}`,
      );
    }
  }
  // a save with no Food field at all (older or leaner) is fine: the page then uses the default, off
  assert.ok(read({ fillSettings: { goal: { target: 'mind' } } }).sheet);
});
