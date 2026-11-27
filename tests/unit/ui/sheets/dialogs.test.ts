/* ui/sheets/dialogs.ts over a real sheet store on stand-in storage: the dialog fields reach the store call of each kind,
   a refused form gets the store's reason and the field it is about, and is left as it is (a blank name stays blank). */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ACK_REQUIRED_TEXT, EMPTY_NAME_TEXT, JOB_REQUIRED_TEXT, SHEET_GONE_TEXT } from '../../../../src/ui/sheets/store-shared.ts';
import { FORM_FIELD } from '../../../../src/ui/sheets/ops.ts';
import { shownName, submitDialog } from '../../../../src/ui/sheets/dialogs.ts';
import { WHM_CANE, fakeStorage, piece, sageSet } from '../../helpers/fixtures/sheet-fixtures.ts';
import { mustFind } from '../../helpers/fixtures/common.ts';
import { createSheetsFacade, idOf, openSetOf, savedSheet } from '../../helpers/fixtures/stores.ts';
import type { DialogForm } from '../../../../src/ui/elements/sheets/sheet-dialogs-model.ts';

/* The forms the dialogs hold, whole: every field of the kind, `fields` over the defaults. */
type FormOf<Kind extends DialogForm['kind']> = Extract<DialogForm, { kind: Kind }>;
const REFUSAL_NONE = { error: '', errorField: '' };
const newForm = (fields: Partial<FormOf<'new'>> = {}): FormOf<'new'> => ({
  kind: 'new',
  name: '',
  nameTyped: false,
  description: '',
  job: 'SGE',
  level: 100,
  sync: { on: true, cap: 123 },
  capLowered: null,
  ...REFUSAL_NONE,
  ...fields,
});
const copyForm = (fields: Partial<FormOf<'copy'>> = {}): FormOf<'copy'> => ({
  kind: 'copy',
  id: '',
  name: '',
  job: 'SGE',
  level: 100,
  sync: { on: true, cap: 123 },
  capLowered: null,
  ack: false,
  helpOpen: false,
  ...REFUSAL_NONE,
  ...fields,
});
const editForm = (
  kind: 'edit-sheet' | 'edit-set',
  fields: Partial<FormOf<'edit-sheet' | 'edit-set'>> = {},
): FormOf<'edit-sheet' | 'edit-set'> => ({
  kind,
  id: '',
  name: '',
  description: '',
  ...REFUSAL_NONE,
  ...fields,
});
const deleteForm = (what: 'sheet' | 'set', id: string, target: FormOf<'delete'>['target']): FormOf<'delete'> => ({
  kind: 'delete',
  what,
  id,
  target,
  ...REFUSAL_NONE,
});

function makeStore() {
  let next = 0;
  return createSheetsFacade({ storage: fakeStorage(), makeId: prefix => `${prefix}${++next}` });
}
const SAGE = { name: 'Bahamut T13', job: 'SGE', level: 100, sync: { on: true, cap: 123 } };

test('shownName: the New sheet form shows the default name until one is typed', () => {
  const form = newForm();
  assert.equal(shownName(form), 'Sage Lv 100 ilvl 123');
  assert.equal(shownName({ ...form, nameTyped: true, name: 'Mine' }), 'Mine');
  assert.equal(shownName(editForm('edit-set', { name: 'Set 1' })), 'Set 1');
});

test('New sheet: no job is refused with the reason and its field; a blank typed name is refused and stays blank', () => {
  const store = makeStore();
  const form = newForm({ job: '', sync: { on: false, cap: 795 } });
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
  const id = mustFind(store.sheetId, 'the open sheet id');
  const form = copyForm({ id });
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
  const setId = idOf(canes.newSet());
  canes.updateSet(setId, { pieces: sageSet().pieces.map((row, i) => (i === 0 ? piece('weapon', WHM_CANE) : row)) });
  const caneForm = copyForm({ id: mustFind(canes.sheetId, 'the open sheet id'), name: 'Astro', job: 'AST', sync: { on: false, cap: 795 } });
  assert.deepEqual(submitDialog(canes, caneForm), { ok: false, error: ACK_REQUIRED_TEXT, field: FORM_FIELD.ack });
  caneForm.ack = true;
  assert.equal(submitDialog(canes, caneForm).ok, true);
});

test('Copy sheet of a sheet that is gone: the reason has no field', () => {
  const store = makeStore();
  const form = copyForm({ id: 'gone', name: 'x', sync: { on: false, cap: 795 } });
  assert.deepEqual(submitDialog(store, form), { ok: false, error: SHEET_GONE_TEXT, field: '' });
});

test('Edit sheet and Edit gear set: a blank name is refused with its field and the form keeps what was typed', () => {
  const store = makeStore();
  store.createSheet(SAGE);
  store.newSet();
  const sheetId = mustFind(store.sheetId, 'the open sheet id');
  const sheetForm = editForm('edit-sheet', { id: sheetId });
  assert.deepEqual(submitDialog(store, sheetForm), { ok: false, error: EMPTY_NAME_TEXT, field: FORM_FIELD.name });
  assert.equal(sheetForm.name, '');
  assert.equal(savedSheet(store, sheetId).name, 'Bahamut T13', 'the saved name is unchanged');
  const setForm = editForm('edit-set', { id: mustFind(store.setId, 'the open set id') });
  assert.deepEqual(submitDialog(store, setForm), { ok: false, error: EMPTY_NAME_TEXT, field: FORM_FIELD.name });
  assert.equal(setForm.name, '');
  setForm.name = 'Raid';
  assert.equal(submitDialog(store, setForm).ok, true);
  assert.equal(openSetOf(store).name, 'Raid');
});

test('Delete: a set, then a sheet; a thing already gone is refused', () => {
  const store = makeStore();
  store.createSheet(SAGE);
  store.newSet();
  const setId = mustFind(store.setId, 'the open set id');
  assert.equal(submitDialog(store, deleteForm('set', setId, openSetOf(store))).ok, true);
  assert.equal(store.list().sheets[0].sets.length, 0);
  const sheetId = mustFind(store.sheetId, 'the open sheet id');
  const sheet = savedSheet(store, sheetId);
  assert.equal(submitDialog(store, deleteForm('sheet', sheetId, sheet)).ok, true);
  assert.equal(store.list().sheets.length, 0);
  assert.deepEqual(submitDialog(store, deleteForm('sheet', 'gone', sheet)), { ok: false, error: SHEET_GONE_TEXT, field: '' });
});
