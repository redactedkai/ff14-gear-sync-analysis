/* The Sheets tab's dialogs (elements/sheets/sheet-dialogs-model.ts) over a real sheet store on stand-in storage: what each dialog
   starts from, what the actions of the dialog element do to its fields, what the main button does, and where the focus goes back. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DeleteView, FormView } from '../../../../../src/ui/elements/sheets/sheet-dialogs-model.ts';
import { SheetDialogs } from '../../../../../src/ui/elements/sheets/sheet-dialogs-model.ts';
import { EMPTY_NAME_TEXT, JOB_REQUIRED_TEXT } from '../../../../../src/ui/sheets/store-shared.ts';
import { WHM_CANE, fakeStorage, piece, sageSet } from '../../../helpers/fixtures/sheet-fixtures.ts';
import { mustFind } from '../../../helpers/fixtures/common.ts';
import { createSheetsFacade, idOf, openSheetOf } from '../../../helpers/fixtures/stores.ts';

/* The dialogs over a fresh store; `changes` counts the calls of the page's draw-again callback. */
function bind() {
  let next = 0;
  const sheets = createSheetsFacade({ storage: fakeStorage(), makeId: prefix => `${prefix}${++next}` });
  const state = { changes: 0 };
  const dialogs = new SheetDialogs({
    sheets,
    onChange: () => {
      state.changes++;
    },
  });
  return { dialogs, sheets, state };
}

/* The open dialog's view, whatever its kind, or a failed test when none is open. */
function anyView(dialogs: SheetDialogs) {
  return mustFind(dialogs.view(), 'the open dialog');
}

/* The open form dialog's view (New, Copy or Edit), or a failed test when none is open or it is a Delete question. */
function formView(dialogs: SheetDialogs): FormView {
  const view = anyView(dialogs);
  assert.ok(view.kind !== 'delete', 'a form was expected, not a Delete question');
  return view;
}

/* The open Delete question's view, or a failed test when another dialog is open. */
function deleteView(dialogs: SheetDialogs): DeleteView {
  const view = anyView(dialogs);
  assert.ok(view.kind === 'delete', 'a Delete question was expected');
  return view;
}

/* A control to give the focus back to: records its focus() calls. */
function opener() {
  const control = { isConnected: true, focusCount: 0, focus: () => control.focusCount++ };
  return control;
}

test('New sheet: the name follows the job until typed; Create opens the new, empty sheet', () => {
  const { dialogs, sheets } = bind();
  dialogs.openNewSheet();
  assert.equal(formView(dialogs).name, '');
  dialogs.act({ action: 'job', id: 'BLU' });
  dialogs.act({ action: 'sync', on: true });
  dialogs.act({ action: 'cap', value: 530 });
  assert.deepEqual(
    [formView(dialogs).name, mustFind(formView(dialogs).settings, 'the level field').level.value],
    ['Blue Mage Lv 80 ilvl 530', 80],
    'the level is held to the job',
  );
  dialogs.act({ action: 'name', value: 'Mine' });
  dialogs.act({ action: 'job', id: 'SGE' });
  assert.equal(formView(dialogs).name, 'Mine', 'a typed name stays');
  dialogs.act({ action: 'submit' });
  assert.equal(dialogs.isOpen, false);
  assert.deepEqual([sheets.screen, openSheetOf(sheets).name, openSheetOf(sheets).level], ['sheet', 'Mine', 80]);
});

test('a refused form keeps what was typed and puts the reason at its field; an edit clears it', () => {
  const { dialogs, sheets } = bind();
  dialogs.openNewSheet();
  dialogs.act({ action: 'submit' });
  assert.equal(formView(dialogs).errors.job, JOB_REQUIRED_TEXT, 'no job: the reason is at the Job label');
  dialogs.act({ action: 'job', id: 'PLD' });
  assert.equal(formView(dialogs).error, '', 'picking a job clears it');
  dialogs.act({ action: 'name', value: '   ' });
  dialogs.act({ action: 'submit' });
  assert.equal(formView(dialogs).errors.name, EMPTY_NAME_TEXT, 'a blank name: the reason is at the Name label');
  assert.equal(formView(dialogs).name.trim(), '', 'the box is not refilled');
  assert.equal(sheets.list().sheets.length, 0);
  dialogs.act({ action: 'name', value: 'Mine' });
  assert.equal(formView(dialogs).error, '', 'typing clears it');
  dialogs.act({ action: 'submit' });

  // Edit sheet: the same rule, then the new name and description are saved
  dialogs.openEditSheet(openSheetOf(sheets).id);
  dialogs.act({ action: 'name', value: '' });
  dialogs.act({ action: 'submit' });
  assert.deepEqual([formView(dialogs).errors.name, formView(dialogs).name], [EMPTY_NAME_TEXT, '']);
  dialogs.act({ action: 'name', value: 'Tank' });
  dialogs.act({ action: 'description', value: 'Week 1' });
  dialogs.act({ action: 'submit' });
  assert.deepEqual([openSheetOf(sheets).name, openSheetOf(sheets).description], ['Tank', 'Week 1']);
});

test('Edit gear set saves a name and notes', () => {
  const { dialogs, sheets } = bind();
  sheets.createSheet({ name: 'S', job: 'SGE', level: 100, sync: { on: false, cap: 795 } });
  sheets.newSet();
  sheets.closeSet();
  const setId = openSheetOf(sheets).sets[0].id;
  dialogs.openEditSet(setId);
  assert.deepEqual([formView(dialogs).title, formView(dialogs).name], ['Edit gear set', 'Set 1']);
  dialogs.act({ action: 'description', value: 'My own set\nsecond line' });
  dialogs.act({ action: 'submit' });
  assert.equal(openSheetOf(sheets).sets[0].description, 'My own set\nsecond line');
});

test('Copy sheet starts from the sheet; Delete asks first and removes the sheet', () => {
  const { dialogs, sheets } = bind();
  sheets.createSheet({ name: 'Heal', job: 'WHM', level: 70, sync: { on: true, cap: 375 } });
  const healId = openSheetOf(sheets).id;
  dialogs.openCopy(healId);
  assert.deepEqual([formView(dialogs).name, formView(dialogs).job], ['Heal (1)', 'WHM']);
  assert.ok(formView(dialogs).jobs.some(job => job.id === 'SCH'));
  dialogs.act({ action: 'job', id: 'SCH' });
  dialogs.act({ action: 'submit' });
  assert.deepEqual(
    sheets.list().sheets.map(sheet => [sheet.name, sheet.job]),
    [
      ['Heal (1)', 'SCH'],
      ['Heal', 'WHM'],
    ],
  );
  dialogs.askDelete('sheet', healId);
  assert.equal(anyView(dialogs).kind, 'delete');
  assert.ok(deleteView(dialogs).question.includes('Heal'), 'the question names the sheet');
  dialogs.act({ action: 'submit' });
  assert.deepEqual(
    sheets.list().sheets.map(sheet => sheet.name),
    ['Heal (1)'],
  );
});

test('Escape closes the "?" panel of Copy sheet first, then the dialog; nothing opens while an Auto-fill runs', () => {
  const { dialogs, sheets } = bind();
  sheets.createSheet({ name: 'Heal', job: 'WHM', level: 70, sync: { on: false, cap: 795 } });
  dialogs.openCopy(openSheetOf(sheets).id);
  dialogs.act({ action: 'help', open: true });
  assert.equal(formView(dialogs).helpOpen, true);
  dialogs.act({ action: 'escape' });
  assert.deepEqual([dialogs.isOpen, formView(dialogs).helpOpen], [true, false]);
  dialogs.act({ action: 'escape' });
  assert.equal(dialogs.isOpen, false);
  sheets.setBusy(true);
  dialogs.openNewSheet();
  assert.equal(dialogs.isOpen, false);
});

test('a number entered just before Create does not commit into the closed dialog', () => {
  const { dialogs, sheets } = bind();
  dialogs.openNewSheet();
  dialogs.act({ action: 'job', id: 'BLU' });
  dialogs.act({ action: 'level', value: 75 });
  dialogs.act({ action: 'submit' });
  assert.equal(dialogs.isOpen, false);
  dialogs.act({ action: 'cap', value: 300 }); // the field's pause ends after Create: nothing is left to edit
  dialogs.act({ action: 'level', value: 20 });
  assert.equal(sheets.list().sheets.length, 1);
  assert.equal(openSheetOf(sheets).level, 75);
});

test('the cap follows the level, the job and the sync switch, and the cap field is told what was lowered', () => {
  const { dialogs, sheets } = bind();
  const settings = () => mustFind(formView(dialogs).settings, 'the level and item level fields');
  dialogs.openNewSheet();
  dialogs.act({ action: 'job', id: 'SGE' });
  dialogs.act({ action: 'sync', on: true });
  assert.deepEqual([settings().cap.value, settings().cap.lowered], [795, null], 'level 100 allows every real item level');
  dialogs.act({ action: 'level', value: 70 });
  assert.deepEqual([settings().cap.value, settings().cap.lowered], [405, { from: 795, to: 405, level: 70 }]);
  assert.equal(formView(dialogs).name, 'Sage Lv 70 ilvl 405');
  dialogs.act({ action: 'cap', value: 380 });
  assert.equal(settings().cap.lowered, null);
  dialogs.act({ action: 'cap', value: 600 });
  assert.deepEqual([settings().cap.value, settings().cap.lowered], [405, { from: 600, to: 405, level: 70 }]);
  dialogs.act({ action: 'submit' });
  assert.deepEqual(openSheetOf(sheets).sync, { on: true, cap: 405 });

  // Copy: the form starts from the sheet; a lower level lowers its cap, and no note shows while sync is off
  dialogs.openCopy(openSheetOf(sheets).id);
  assert.equal(settings().cap.lowered, null);
  dialogs.act({ action: 'level', value: 50 });
  assert.deepEqual([settings().cap.value, settings().cap.lowered], [135, { from: 405, to: 135, level: 50 }]);
  dialogs.act({ action: 'sync', on: false });
  assert.deepEqual([settings().cap.lowered, settings().cap.syncOn], [null, false]);
  dialogs.act({ action: 'submit' });
  assert.deepEqual(sheets.list().sheets[0].sync, { on: false, cap: 135 });
});

test('Copy sheet to a job that cannot wear a piece waits for the box before it copies', () => {
  const { dialogs, sheets } = bind();
  sheets.createSheet({ name: 'Canes', job: 'WHM', level: 100, sync: { on: false, cap: 795 } });
  const setId = idOf(sheets.newSet());
  sheets.updateSet(setId, { pieces: sageSet().pieces.map((row, i) => (i === 0 ? piece('weapon', WHM_CANE) : row)) });
  dialogs.openCopy(openSheetOf(sheets).id);
  assert.equal(formView(dialogs).warning, null, 'the White Mage can wear its own cane');
  dialogs.act({ action: 'job', id: 'AST' });
  assert.deepEqual(
    [Boolean(formView(dialogs).warning), formView(dialogs).disabled],
    [true, true],
    'the main button waits for the tick box',
  );
  dialogs.act({ action: 'submit' });
  assert.equal(formView(dialogs).errors.ack.length > 0, true, 'Enter in the name box without the tick: the reason is at the tick box');
  dialogs.act({ action: 'ack', checked: true });
  assert.deepEqual([formView(dialogs).disabled, formView(dialogs).error], [false, ''], 'ticking clears the reason');
  dialogs.act({ action: 'submit' });
  assert.equal(sheets.list().sheets.length, 2);
});

test('focus goes back to the opener once the box is gone, except after a change of page', () => {
  const { dialogs } = bind();
  const button = opener();
  dialogs.openNewSheet(button);
  dialogs.act({ action: 'close' });
  assert.equal(button.focusCount, 0, 'not before the element has removed the box');
  dialogs.afterClosed();
  assert.equal(button.focusCount, 1);
  dialogs.afterClosed();
  assert.equal(button.focusCount, 1, 'once');

  dialogs.openNewSheet(button);
  dialogs.close(false); // a change of page: the router owns the focus
  dialogs.afterClosed();
  assert.equal(button.focusCount, 1);

  dialogs.openNewSheet(button);
  dialogs.close();
  button.isConnected = false;
  dialogs.afterClosed();
  assert.equal(button.focusCount, 1, 'an opener that left the page is not focused');
});

test('a delete question opens with the focus on Cancel, so a stray Enter does not delete; a form opens on its first field', () => {
  const { dialogs, sheets } = bind();
  sheets.createSheet({ name: 'S', job: 'SGE', level: 100, sync: { on: false, cap: 795 } });
  dialogs.askDelete('sheet', openSheetOf(sheets).id);
  assert.equal(anyView(dialogs).firstFocus, '#sh-dlg-cancel');
  dialogs.close();
  for (const open of [
    () => dialogs.openNewSheet(),
    () => dialogs.openCopy(openSheetOf(sheets).id),
    () => dialogs.openEditSheet(openSheetOf(sheets).id),
  ]) {
    open();
    assert.match(anyView(dialogs).firstFocus, /^input:not\(\[disabled\]\)/);
    dialogs.close();
  }
});

test('every change of the dialog tells the page to draw it again, and closing a closed dialog does not', () => {
  const { dialogs, state } = bind();
  dialogs.close(false);
  assert.equal(state.changes, 0);
  dialogs.openNewSheet();
  dialogs.act({ action: 'name', value: 'A' });
  dialogs.close();
  assert.equal(state.changes, 3);
});
