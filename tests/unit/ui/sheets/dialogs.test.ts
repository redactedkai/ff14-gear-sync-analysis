/* ui/sheets/dialogs.ts over a real sheet store on stand-in storage: the dialog fields reach the store call of each kind,
   a refused form gets the store's reason and the field it is about, and is left as it is (a blank name stays blank). */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ACK_REQUIRED_TEXT, EMPTY_NAME_TEXT, JOB_REQUIRED_TEXT, SHEET_GONE_TEXT } from '../../../../src/ui/sheets/store-shared.ts';
import { FORM_FIELD } from '../../../../src/ui/sheets/ops.ts';
import { shownName, submitDialog } from '../../../../src/ui/sheets/dialogs.ts';
import { WHM_CANE, fakeStorage, piece, sageSet } from '../../helpers/sheet-fixtures.ts';
import { createSheetsFacade } from '../../helpers/stores.ts';

function makeStore() {
  let next = 0;
  return createSheetsFacade({ storage: fakeStorage(), makeId: prefix => `${prefix}${++next}` });
}
const SAGE = { name: 'Bahamut T13', job: 'SGE', level: 100, sync: { on: true, cap: 123 } };

test('shownName: the New sheet form shows the default name until one is typed', () => {
  const form = { kind: 'new', name: '', nameTyped: false, job: 'SGE', level: 100, sync: { on: true, cap: 123 } };
  assert.equal(shownName(form), 'Sage Lv 100 ilvl 123');
  assert.equal(shownName({ ...form, nameTyped: true, name: 'Mine' }), 'Mine');
  assert.equal(shownName({ kind: 'edit-set', name: 'Set 1' }), 'Set 1');
});

test('New sheet: no job is refused with the reason and its field; a blank typed name is refused and stays blank', () => {
  const store = makeStore();
  const form = { kind: 'new', name: '', nameTyped: false, description: '', job: '', level: 100, sync: { on: false, cap: 795 } };
  assert.deepEqual(submitDialog(store, form), { ok: false, error: JOB_REQUIRED_TEXT, field: FORM_FIELD.job });
  form.job = 'PLD';
  form.name = '  ';
  form.nameTyped = true;
  assert.deepEqual(submitDialog(store, form), { ok: false, error: EMPTY_NAME_TEXT, field: FORM_FIELD.name });
  assert.deepEqual([form.name, form.nameTyped], ['  ', true], 'the form is left as typed');
  assert.equal(store.list().sheets.length, 0);
  // untyped, the box follows the default name, so it is never blank once a job is chosen
  assert.equal(submitDialog(store, { ...form, name: '', nameTyped: false }).ok, true);
  assert.equal(store.list().sheets[0].name, 'Paladin Lv 100');
});

test('Copy sheet: a blank name is refused and stays blank; the pieces the job cannot wear need the box; a ticked copy is made', () => {
  const store = makeStore();
  store.createSheet(SAGE);
  const id = store.sheetId;
  const form = { kind: 'copy', id, name: '', job: 'SGE', level: 100, sync: { on: true, cap: 123 }, ack: false };
  assert.deepEqual(submitDialog(store, form), { ok: false, error: EMPTY_NAME_TEXT, field: FORM_FIELD.name });
  assert.equal(form.name, '', 'the box stays empty');
  form.name = 'Bahamut T13 (1)';
  assert.deepEqual(submitDialog(store, form), { ok: true, error: '', field: '' });
  assert.deepEqual(
    store.list().sheets.map(sheet => sheet.name),
    ['Bahamut T13 (1)', 'Bahamut T13'],
  );
  // a cane the Astrologian cannot wear: the box has to be ticked first
  const canes = makeStore();
  canes.createSheet({ ...SAGE, job: 'WHM', name: 'Canes' });
  const set = canes.newSet();
  canes.updateSet(set.id, { pieces: sageSet().pieces.map((row, i) => (i === 0 ? piece('weapon', WHM_CANE) : row)) });
  const caneForm = { kind: 'copy', id: canes.sheetId, name: 'Astro', job: 'AST', level: 100, sync: { on: false, cap: 795 }, ack: false };
  assert.deepEqual(submitDialog(canes, caneForm), { ok: false, error: ACK_REQUIRED_TEXT, field: FORM_FIELD.ack });
  caneForm.ack = true;
  assert.equal(submitDialog(canes, caneForm).ok, true);
});

test('Copy sheet of a sheet that is gone: the reason has no field', () => {
  const store = makeStore();
  const form = { kind: 'copy', id: 'gone', name: 'x', job: 'SGE', level: 100, sync: { on: false, cap: 795 }, ack: false };
  assert.deepEqual(submitDialog(store, form), { ok: false, error: SHEET_GONE_TEXT, field: '' });
});

test('Edit sheet and Edit gear set: a blank name is refused with its field and the form keeps what was typed', () => {
  const store = makeStore();
  store.createSheet(SAGE);
  store.newSet();
  const sheetForm = { kind: 'edit-sheet', id: store.sheetId, name: '', description: '' };
  assert.deepEqual(submitDialog(store, sheetForm), { ok: false, error: EMPTY_NAME_TEXT, field: FORM_FIELD.name });
  assert.equal(sheetForm.name, '');
  assert.equal(store.sheet(store.sheetId).name, 'Bahamut T13', 'the saved name is unchanged');
  const setForm = { kind: 'edit-set', id: store.setId, name: '', description: '' };
  assert.deepEqual(submitDialog(store, setForm), { ok: false, error: EMPTY_NAME_TEXT, field: FORM_FIELD.name });
  assert.equal(setForm.name, '');
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
  assert.deepEqual(submitDialog(store, { kind: 'delete', what: 'sheet', id: 'gone' }), { ok: false, error: SHEET_GONE_TEXT, field: '' });
});
