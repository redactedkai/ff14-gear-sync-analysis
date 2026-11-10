/* The Sheets tab's dialogs (src/ui/views/sheet-forms.js): New sheet with its default name and ranges, Copy sheet's jobs
   from the gear group and its list of pieces to clear (a real White Mage cane), "Name and description", and the
   Delete questions. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_REAL } from '../../src/core/tables.js';
import { DESCRIPTION_MAX_LENGTH, NAME_MAX_LENGTH } from '../../src/ui/sheet-ops.js';
import { copySheetFormView, deleteQuestionView, editFormView, newSheetFormView } from '../../src/ui/views/sheet-forms.js';
import { WHM_CANE, piece, sageSet, sheetOf } from './helpers/sheet-fixtures.js';

const form = (patch = {}) => ({
  name: '',
  nameTyped: false,
  description: '',
  job: '',
  level: 100,
  sync: { on: false, cap: 795 },
  ...patch,
});

test('New sheet: the name follows the job, level and sync until typed; the ranges follow the job', () => {
  const none = newSheetFormView(form());
  assert.deepEqual(
    [none.title, none.name, none.namePlaceholder, none.jobText, none.level.rangeText, none.cap.rangeText, none.buttonText],
    ['New sheet', '', 'Choose a job for a default name', 'none chosen', '1–100', `1–${MAX_REAL}`, 'Create sheet'],
  );
  assert.deepEqual([none.nameMax, none.descriptionMax], [NAME_MAX_LENGTH, DESCRIPTION_MAX_LENGTH]);
  const blu = newSheetFormView(form({ job: 'BLU', level: 80, sync: { on: true, cap: 530 } }));
  assert.deepEqual([blu.name, blu.jobText, blu.level.max], ['Blue Mage Lv 80 ilvl 530', 'Blue Mage', 80]);
  const typed = newSheetFormView(form({ job: 'SGE', name: 'Mine', nameTyped: true, error: 'x' }));
  assert.deepEqual([typed.name, typed.error], ['Mine', 'x']);
});

test('Copy sheet: the jobs of the gear group, its own included; Blue Mage copies to no other job', () => {
  const sage = copySheetFormView(sheetOf('SGE', [], { name: 'Bahamut' }), { name: 'Bahamut (1)', job: 'SGE', ack: false });
  assert.equal(sage.title, 'Copy “Bahamut”');
  assert.deepEqual(
    sage.jobs.map(j => [j.id, j.checked]),
    [
      ['WHM', false],
      ['SCH', false],
      ['AST', false],
      ['SGE', true],
    ],
  );
  assert.deepEqual(
    [sage.jobNote, sage.warning, sage.disabled, sage.buttonText],
    ['Healers: the jobs that share Sage’s gear', null, false, 'Copy sheet'],
  );
  const blu = copySheetFormView(sheetOf('BLU', [], { level: 80 }), { name: 'x', job: 'BLU' });
  assert.deepEqual(
    blu.jobs.map(j => j.id),
    ['BLU'],
  );
  assert.deepEqual([blu.jobNote, blu.level.rangeText], ['a Blue Mage sheet copies to no other job', '1–80']);
  // melee is three groups: Samurai copies to Monk only
  assert.deepEqual(
    copySheetFormView(sheetOf('SAM', []), { name: 'x', job: 'SAM' }).jobs.map(j => j.id),
    ['MNK', 'SAM'],
  );
});

test('Copy sheet: the pieces the chosen job cannot wear are listed, and Copy waits for the box', () => {
  const whmSet = sageSet({ name: 'Week 1' });
  whmSet.pieces[0] = piece('weapon', WHM_CANE);
  const sheet = sheetOf('WHM', [whmSet], { name: 'White' });
  const asked = copySheetFormView(sheet, { name: 'White (1)', job: 'AST', ack: false });
  assert.deepEqual(asked.warning, {
    title: 'Astrologian cannot wear 1 piece.',
    text: 'In the copy its slot is cleared and unpinned:',
    items: [{ key: 'g_1:0', setName: 'Week 1', slotLabel: 'Weapon', name: 'Ironworks Magitek Cane' }],
    ackText: 'Clear this piece in the copy',
  });
  assert.equal(asked.disabled, true);
  assert.equal(copySheetFormView(sheet, { name: 'x', job: 'AST', ack: true }).disabled, false);
  assert.equal(copySheetFormView(sheet, { name: 'x', job: 'WHM', ack: false }).warning, null);
});

test('Name and description, and the Delete questions', () => {
  assert.deepEqual(editFormView(), {
    title: 'Name and description',
    nameMax: NAME_MAX_LENGTH,
    descriptionMax: DESCRIPTION_MAX_LENGTH,
    buttonText: 'Save',
  });
  assert.equal(
    deleteQuestionView('sheet', sheetOf('SGE', [sageSet(), sageSet({ id: 'g_2' })], { name: 'UwU' })).question,
    'Delete the sheet “UwU” and its 2 gear sets?',
  );
  assert.equal(deleteQuestionView('sheet', sheetOf('SGE', [], { name: 'UwU' })).question, 'Delete the sheet “UwU” (it has no gear sets)?');
  const set = deleteQuestionView('set', sageSet({ name: 'Mine' }));
  assert.deepEqual(set, { question: 'Delete the gear set “Mine”?', note: 'It cannot be undone.', buttonText: 'Delete' });
  assert.equal(
    deleteQuestionView('unreadable', { id: 's_x', cause: 'not valid JSON' }).question,
    'Delete the saved sheet that could not be read (not valid JSON)?',
  );
});
