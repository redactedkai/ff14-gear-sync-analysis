/* ui/sheet-dialogs.js over a real sheet store on stand-in storage: the dialog fields reach the store call of each kind,
   a refused form gets the store's reason, and a blank name is put back. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSheetStore } from '../../src/ui/sheet-store.js';
import { shownName, submitDialog } from '../../src/ui/sheet-dialogs.js';
import { fakeStorage } from './helpers/sheet-fixtures.js';

function makeStore() {
  let next = 0;
  return createSheetStore({ storage: fakeStorage(), makeId: prefix => `${prefix}${++next}` });
}
const SAGE = { name: 'Bahamut T13', job: 'SGE', level: 100, sync: { on: true, cap: 123 } };

test('shownName: the New sheet form shows the default name until one is typed', () => {
  const form = { kind: 'new', name: '', nameTyped: false, job: 'SGE', level: 100, sync: { on: true, cap: 123 } };
  assert.equal(shownName(form), 'Sage Lv 100 ilvl 123');
  assert.equal(shownName({ ...form, nameTyped: true, name: 'Mine' }), 'Mine');
  assert.equal(shownName({ kind: 'edit-set', name: 'Set 1' }), 'Set 1');
});

test('New sheet: no job is refused with the reason; a blank typed name goes back to the default', () => {
  const store = makeStore();
  const form = { kind: 'new', name: '', nameTyped: false, description: '', job: '', level: 100, sync: { on: false, cap: 795 } };
  assert.deepEqual(submitDialog(store, form), { ok: false, error: 'Choose a job.' });
  form.job = 'PLD';
  form.name = '  ';
  form.nameTyped = true;
  assert.deepEqual(submitDialog(store, form), { ok: false, error: 'A name cannot be empty: the default name is back in the box.' });
  assert.equal(form.nameTyped, false);
  assert.equal(shownName(form), 'Paladin Lv 100');
  assert.deepEqual(submitDialog(store, form), { ok: true, error: '' });
  assert.equal(store.list().sheets[0].name, 'Paladin Lv 100');
});

test('Copy sheet: a blank name becomes the next free copy name; a ticked copy is made', () => {
  const store = makeStore();
  store.createSheet(SAGE);
  const id = store.sheetId;
  const form = { kind: 'copy', id, name: '', job: 'SGE', level: 100, sync: { on: true, cap: 123 }, ack: false };
  assert.equal(submitDialog(store, form).ok, false);
  assert.equal(form.name, 'Bahamut T13 (1)');
  assert.deepEqual(submitDialog(store, form), { ok: true, error: '' });
  assert.deepEqual(
    store.list().sheets.map(sheet => sheet.name),
    ['Bahamut T13 (1)', 'Bahamut T13'],
  );
});

test('Name and description: a blank name of a sheet or a gear set takes the saved name back', () => {
  const store = makeStore();
  store.createSheet(SAGE);
  store.newSet();
  const sheetForm = { kind: 'edit-sheet', id: store.sheetId, name: '', description: '' };
  assert.equal(submitDialog(store, sheetForm).error, 'A name cannot be empty: the old name is back in the box.');
  assert.equal(sheetForm.name, 'Bahamut T13');
  const setForm = { kind: 'edit-set', id: store.setId, name: '', description: '' };
  assert.equal(submitDialog(store, setForm).error, 'A name cannot be empty: the old name is back in the box.');
  assert.equal(setForm.name, 'Set 1');
  setForm.name = 'Raid';
  assert.equal(submitDialog(store, setForm).ok, true);
  assert.equal(store.currentSet.name, 'Raid');
});

test('Delete: a set, then a sheet; a thing already gone is refused', () => {
  const store = makeStore();
  store.createSheet(SAGE);
  store.newSet();
  const setId = store.setId;
  assert.equal(submitDialog(store, { kind: 'delete', what: 'set', id: setId }).ok, true);
  assert.equal(store.list().sheets[0].sets.length, 0);
  assert.equal(submitDialog(store, { kind: 'delete', what: 'sheet', id: store.sheetId }).ok, true);
  assert.equal(store.list().sheets.length, 0);
  assert.equal(submitDialog(store, { kind: 'delete', what: 'sheet', id: 'gone' }).ok, false);
});
