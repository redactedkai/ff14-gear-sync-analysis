/* Setting a sheet's clan and party bonus through the Sheets actions (src/ui/store/sheets-actions.ts setClan, setPartyRoles): saved
   with the sheet, a second store reads them back, an unknown clan and out-of-range roles are held to none and 0..5, a
   change of nothing writes nothing, the edit lock refuses, a full storage keeps the edit in memory, and the tagged best
   meals of the sets stay (the bonuses are not part of the search). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sheetKey } from '../../../../src/ui/sheets/storage.js';
import { LOCKED_TEXT } from '../../../../src/ui/sheets/store-shared.js';
import { createSheetStore } from '../../helpers/store-adapters.ts';
import { fakeStorage, quotaError } from '../../helpers/sheet-fixtures.js';

/* A store over `storage` with a new Sage sheet open; the clock ticks 1 ms per call. */
function openStore(storage = fakeStorage()) {
  let next = 0;
  const store = createSheetStore({ storage, now: () => 1762700000000 + ++next, makeId: prefix => `${prefix}${++next}` });
  const { id } = store.createSheet({ name: 'Bahamut', job: 'SGE', level: 100, sync: { on: true, cap: 123 } });
  return { store, storage, id };
}

test('the clan and the party bonus are saved with the sheet and read back by a second store', () => {
  const { store, storage, id } = openStore();
  assert.deepEqual([store.setClan('Midlander').ok, store.setPartyRoles(5).ok], [true, true]);
  assert.deepEqual([store.currentSheet.clan, store.currentSheet.partyRoles], ['Midlander', 5]);
  const again = createSheetStore({ storage }).sheet(id);
  assert.deepEqual([again.clan, again.partyRoles], ['Midlander', 5]);
  // back to none: null for the clan, 0 for the roles
  store.setClan(null);
  store.setPartyRoles(0);
  const none = createSheetStore({ storage }).sheet(id);
  assert.deepEqual([none.clan, none.partyRoles], [null, 0]);
});

test('an unknown clan is no clan; party roles are held to a whole number from 0 to 5', () => {
  const { store } = openStore();
  store.setClan('Midlander');
  store.setClan('Gridanian');
  assert.equal(store.currentSheet.clan, null);
  for (const [typed, held] of [
    ['3', 3],
    [9, 5],
    [-2, 0],
    [2.7, 2],
    ['x', 0],
  ]) {
    store.setPartyRoles(typed);
    assert.equal(store.currentSheet.partyRoles, held, String(typed));
  }
});

test('setting what is already set writes nothing', () => {
  const { store, storage, id } = openStore();
  store.setClan('Highlander');
  const before = storage.getItem(sheetKey(id));
  const rev = store.rev;
  assert.deepEqual(store.setClan('Highlander'), { ok: true });
  assert.deepEqual(store.setPartyRoles(0), { ok: true });
  assert.deepEqual([store.rev, storage.getItem(sheetKey(id))], [rev, before]);
});

test('the edit lock refuses both and leaves the sheet as it was', () => {
  const { store } = openStore();
  store.busy = true;
  assert.deepEqual(store.setClan('Midlander'), { ok: false, error: LOCKED_TEXT });
  assert.deepEqual(store.setPartyRoles(3), { ok: false, error: LOCKED_TEXT });
  assert.deepEqual([store.currentSheet.clan, store.currentSheet.partyRoles], [null, 0]);
});

test('a full storage keeps the edit in memory and says so, like the other settings', () => {
  const { store, storage, id } = openStore();
  // the same records in a storage that refuses every write
  const full = fakeStorage({ failWith: quotaError() });
  for (const [key, text] of storage.data) full.data.set(key, text);
  const failing = createSheetStore({ storage: full });
  failing.openSheet(id);
  const result = failing.setPartyRoles(4);
  assert.deepEqual([result.ok, result.reason], [false, 'quota']);
  assert.equal(failing.currentSheet.partyRoles, 4);
  assert.notEqual(failing.saveMessage, '');
  assert.equal(store.currentSheet.partyRoles, 0);
});

test('the tagged best meals of the sets are kept (a level change drops them, a bonus does not)', () => {
  const { store } = openStore();
  const { id } = store.newSet();
  store.updateSet(id, { bestMeals: ['a'] });
  store.setClan('Seeker of the Sun');
  store.setPartyRoles(2);
  assert.deepEqual(store.currentSheet.sets[0].bestMeals, ['a']);
  store.setLevel(90);
  assert.equal(store.currentSheet.sets[0].bestMeals, null);
});
