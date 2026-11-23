/* The Sheets tab's dialogs (src/ui/views/sheet-forms.js): New sheet with its default name and ranges, Copy sheet's jobs
   from the gear group and its list of pieces to clear (a real White Mage cane), "Edit sheet" and "Edit gear set", and the
   Delete questions. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_REAL } from '../../../../src/core/tables.js';
import { DESCRIPTION_MAX_LENGTH, FORM_FIELD, NAME_MAX_LENGTH } from '../../../../src/ui/sheets/ops.js';
import { ACK_REQUIRED_TEXT, EMPTY_NAME_TEXT, JOB_REQUIRED_TEXT, SHEET_GONE_TEXT } from '../../../../src/ui/sheets/store.js';
import {
  copySheetFormView,
  deleteQuestionView,
  editFormView,
  errorPlaces,
  newSheetFormView,
  copyHelpView,
} from '../../../../src/ui/views/sheet-forms.js';
import { hasNumber, hasParts } from '../../helpers/common.js';
import { WHM_CANE, piece, sageSet, sheetOf } from '../../helpers/sheet-fixtures.js';

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
    [none.title, none.name, none.namePlaceholder, none.level.rangeText, none.cap.rangeText, none.buttonText],
    ['New sheet', '', 'Choose a job for a default name', '1–100', `1–${MAX_REAL}`, 'Create sheet'],
  );
  assert.deepEqual([none.nameMax, none.descriptionMax], [NAME_MAX_LENGTH, DESCRIPTION_MAX_LENGTH]);
  const blu = newSheetFormView(form({ job: 'BLU', level: 80, sync: { on: true, cap: 530 } }));
  assert.deepEqual([blu.name, blu.level.max], ['Blue Mage Lv 80 ilvl 530', 80]);
  const typed = newSheetFormView(form({ job: 'SGE', name: 'Mine', nameTyped: true, error: 'x' }));
  assert.deepEqual([typed.name, typed.error], ['Mine', 'x']);
  assert.equal(typed.namePlaceholder, '', 'no hint once a job is chosen');
});

test('Copy sheet: the jobs of the gear group, its own included; Blue Mage copies to no other job', () => {
  const sage = copySheetFormView(sheetOf('SGE', [], { name: 'Bahamut' }), { name: 'Bahamut (1)', job: 'SGE', ack: false });
  assert.ok(sage.title.includes('Bahamut'), sage.title); // the sheet copied
  assert.deepEqual(
    sage.jobs.map(j => [j.id, j.checked]),
    [
      ['WHM', false],
      ['SCH', false],
      ['AST', false],
      ['SGE', true],
    ],
  );
  assert.deepEqual([sage.warning, sage.disabled, sage.buttonText], [null, false, 'Copy sheet']);
  const blu = copySheetFormView(sheetOf('BLU', [], { level: 80 }), { name: 'x', job: 'BLU' });
  assert.deepEqual(
    blu.jobs.map(j => j.id),
    ['BLU'],
  );
  assert.equal(blu.level.rangeText, '1–80');
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

test('Edit sheet and Edit gear set, and the Delete questions', () => {
  const editSheet = editFormView('edit-sheet', {});
  assert.deepEqual([editSheet.nameMax, editSheet.descriptionMax], [NAME_MAX_LENGTH, DESCRIPTION_MAX_LENGTH]);
  assert.notEqual(editFormView('edit-set', {}).title, editSheet.title, 'a sheet and a gear set are titled apart');
  const full = deleteQuestionView('sheet', sheetOf('SGE', [sageSet(), sageSet({ id: 'g_2' })], { name: 'UwU' }), {}).question;
  assert.ok(full.includes('UwU') && hasNumber(full, 2), full); // the name and the count of gear sets lost
  const empty = deleteQuestionView('sheet', sheetOf('SGE', [], { name: 'UwU' }), {}).question;
  assert.ok(empty.includes('UwU') && empty !== full, empty);
  const set = deleteQuestionView('set', sageSet({ name: 'Mine' }), {});
  assert.ok(set.question.includes('Mine') && set.buttonText.length > 0, set.question);
  const unreadable = deleteQuestionView('unreadable', { id: 's_x', cause: 'not valid JSON' }, {}).question;
  assert.ok(unreadable.includes('not valid JSON'), unreadable); // the cause shown to the owner
});

test('the Copy sheet help: the groups of jobs that copy to each other, the own group marked, Blue Mage and Beastmaster alone', () => {
  const help = copyHelpView('SGE');
  assert.deepEqual(
    help.groups.map(g => [g.label, g.jobs, g.own]),
    [
      ['Tanks (Fending)', 'Paladin, Warrior, Dark Knight, Gunbreaker', false],
      ['Healers (Healing)', 'White Mage, Scholar, Astrologian, Sage', true],
      ['Melee (Striking)', 'Monk, Samurai', false],
      ['Melee (Maiming)', 'Dragoon, Reaper', false],
      ['Melee (Scouting)', 'Ninja, Viper', false],
      ['Physical ranged (Aiming)', 'Bard, Machinist, Dancer', false],
      ['Magical ranged (Casting)', 'Black Mage, Summoner, Red Mage, Pictomancer', false],
    ],
  );
  assert.equal(help.outcomes.length, 2, 'what is kept and what is not');
  assert.ok(hasParts(help.footText, 'Blue Mage', 'Beastmaster'), help.footText);
  assert.deepEqual(copySheetFormView(sheetOf('SGE', []), { name: 'x', job: 'SGE' }).help, help);
});

/* The place of each reason: the four messages a New sheet or Copy sheet press can give, as the store gives them. */
test('errorPlaces: a reason shows only under the field it is about; a reason about no field shows in the title row', () => {
  const none = { name: '', job: '', ack: '', title: '' };
  assert.deepEqual(errorPlaces({}), { error: '', errors: none });
  assert.deepEqual(errorPlaces({ error: '', errorField: FORM_FIELD.name }).errors, none, 'no reason, nothing shown');
  const cases = [
    [EMPTY_NAME_TEXT, FORM_FIELD.name, 'name'],
    [JOB_REQUIRED_TEXT, FORM_FIELD.job, 'job'],
    [ACK_REQUIRED_TEXT, FORM_FIELD.ack, 'ack'],
    [SHEET_GONE_TEXT, '', 'title'],
  ];
  for (const [text, field, place] of cases) {
    assert.deepEqual(errorPlaces({ error: text, errorField: field }), { error: text, errors: { ...none, [place]: text } }, place);
  }
});

test('the dialogs carry the places of their error: New sheet (name, job), Copy sheet (the tick box, the title), Edit and Delete', () => {
  const blank = newSheetFormView(form({ job: 'SGE', name: '', nameTyped: true, error: EMPTY_NAME_TEXT, errorField: FORM_FIELD.name }));
  assert.deepEqual([blank.errors.name, blank.errors.job, blank.errors.title], [EMPTY_NAME_TEXT, '', '']);
  const noJob = newSheetFormView(form({ error: JOB_REQUIRED_TEXT, errorField: FORM_FIELD.job }));
  assert.deepEqual([noJob.errors.name, noJob.errors.job], ['', JOB_REQUIRED_TEXT]);
  const sheet = sheetOf('WHM', [], { name: 'Canes' });
  const unticked = copySheetFormView(sheet, {
    name: 'Canes (1)',
    job: 'WHM',
    ack: false,
    error: ACK_REQUIRED_TEXT,
    errorField: FORM_FIELD.ack,
  });
  assert.deepEqual([unticked.errors.ack, unticked.errors.title], [ACK_REQUIRED_TEXT, '']);
  const gone = copySheetFormView(sheet, { name: 'Canes (1)', job: 'WHM', ack: false, error: SHEET_GONE_TEXT, errorField: '' });
  assert.deepEqual([gone.errors.ack, gone.errors.title], ['', SHEET_GONE_TEXT]);
  assert.equal(editFormView('edit-sheet', { error: EMPTY_NAME_TEXT, errorField: FORM_FIELD.name }).errors.name, EMPTY_NAME_TEXT);
  assert.equal(
    deleteQuestionView('sheet', sheet, { error: SHEET_GONE_TEXT }).error,
    SHEET_GONE_TEXT,
    'a refused Delete shows beside its buttons',
  );
});
