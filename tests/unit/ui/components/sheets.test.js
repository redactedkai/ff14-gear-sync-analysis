/* The Sheets tab's component (src/ui/components/sheets.js) bound to a real sheet store over a stand-in storage, as
   Alpine binds it: the screen to draw, the dialogs (New sheet with its default name, Copy sheet, Name and
   description, Delete), refused names left empty with their error, and the answers to the two island elements' events. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sheetsTab } from '../../../../src/ui/components/sheets.js';
import { FORM_FIELD } from '../../../../src/ui/sheets/ops.js';
import { EMPTY_NAME_TEXT, JOB_REQUIRED_TEXT } from '../../../../src/ui/sheets/store-shared.js';
import { pageMagics } from '../../helpers/page-magics.js';
import { fakeStorage } from '../../helpers/sheet-fixtures.js';
import { createSheetsFacade } from '../../helpers/stores.js';

/* The component over a fresh store; Alpine's magics are the shared stand-ins (helpers/page-magics.js: $nextTick runs at
   once, $refs holds the dialog) and $watch keeps its callbacks for the test to call. */
function bind() {
  let next = 0;
  const sheets = createSheetsFacade({ storage: fakeStorage(), makeId: prefix => `${prefix}${++next}` });
  const watchers = {};
  const app = { sheetFigures: 'effects', setSheetFigures: mode => (app.sheetFigures = mode) };
  const c = Object.assign(sheetsTab(), {
    $store: { sheets, app },
    ...pageMagics(['dialog']),
    $watch: (path, fn) => {
      watchers[path] = fn;
    },
  });
  c.init();
  return { c, sheets, watchers, magics: { calls: c.calls } };
}
test('New sheet: the name follows the job until typed; Create opens the new, empty sheet', () => {
  const { c, sheets } = bind();
  assert.equal(c.screen, 'sheets');
  assert.equal(c.manager.empty, true);
  c.openNewSheet();
  assert.equal(c.dialog.kind, 'new');
  assert.equal(c.dialogName, '');
  c.chooseJob('BLU');
  assert.deepEqual([c.dialogName, c.dialog.level], ['Blue Mage Lv 80', 80], 'the level is held to the job');
  c.dialog.sync.on = true;
  c.dialog.sync.cap = 530;
  assert.equal(c.dialogName, 'Blue Mage Lv 80 ilvl 530');
  c.typeName('Mine');
  c.chooseJob('SGE');
  assert.equal(c.dialogName, 'Mine', 'a typed name stays');
  c.submitDialog();
  assert.equal(c.dialog, null);
  assert.deepEqual([c.screen, c.page.name, c.page.empty, c.page.level.value], ['sheet', 'Mine', true, 80]);
  assert.equal(sheets.list().sheets.length, 1);
});

test('a refused form keeps what was typed: a blank name stays blank with its error on the Name field; an edit clears the error', () => {
  const { c, sheets } = bind();
  c.openNewSheet();
  c.submitDialog();
  assert.deepEqual([c.dialog.error, c.dialog.errorField], [JOB_REQUIRED_TEXT, FORM_FIELD.job]);
  assert.equal(c.dialogView.errors.job, JOB_REQUIRED_TEXT, 'the view puts it at the Job label');
  c.chooseJob('PLD');
  assert.deepEqual([c.dialog.error, c.dialog.errorField], ['', ''], 'picking a job clears the error');
  c.typeName('   ');
  c.submitDialog();
  assert.deepEqual([c.dialog.error, c.dialog.errorField], [EMPTY_NAME_TEXT, FORM_FIELD.name]);
  assert.equal(c.dialogView.errors.name, EMPTY_NAME_TEXT, 'the view puts it at the Name label');
  assert.equal(c.dialogName.trim(), '', 'the box is not refilled');
  assert.equal(sheets.list().sheets.length, 0);
  c.typeName('Mine');
  assert.equal(c.dialog.error, '', 'typing clears the error');
  c.submitDialog();
  const id = sheets.sheetId;
  assert.equal(c.page.name, 'Mine');
  c.openEditSheet(id);
  assert.equal(c.dialog.kind, 'edit-sheet');
  c.dialog.name = '';
  c.submitDialog();
  assert.deepEqual([c.dialog.error, c.dialog.errorField, c.dialog.name], [EMPTY_NAME_TEXT, FORM_FIELD.name, '']);
  c.dialog.name = 'Tank';
  c.dialog.description = 'Week 1';
  c.submitDialog();
  assert.deepEqual([c.page.name, c.page.description.text], ['Tank', 'Week 1']);
});

test('gear sets: Edit names a set and its notes, which the list shows as one line', () => {
  const { c, sheets } = bind();
  sheets.createSheet({ name: 'S', job: 'SGE', level: 100, sync: { on: false, cap: 795 } });
  sheets.newSet();
  assert.equal(c.screen, 'set');
  assert.deepEqual(
    c.setHeader.crumbs.map(crumb => crumb.text),
    ['Sheets', 'S', 'Set 1'],
  );
  assert.ok(
    ['Sage', '100'].every(part => c.setHeader.settingsText.includes(part)),
    c.setHeader.settingsText,
  );
  c.goCrumb('sheet', { button: 0, preventDefault() {} });
  assert.equal(c.screen, 'sheet');
  c.openEditSet(sheets.currentSheet.sets[0].id);
  c.dialog.description = 'My own set\nsecond line';
  c.submitDialog();
  assert.deepEqual([c.page.rows[0].descriptionLine, c.page.rows[0].description], ['My own set', 'My own set\nsecond line']);
  c.goCrumb('sheets', { button: 0, preventDefault() {} });
  assert.equal(c.screen, 'sheets');
});

test('Copy and Delete through their dialogs; Delete of a sheet from its page lands on the manager', () => {
  const { c, sheets } = bind();
  sheets.createSheet({ name: 'Heal', job: 'WHM', level: 70, sync: { on: true, cap: 375 } });
  c.openCopy(sheets.sheetId);
  assert.deepEqual([c.dialog.name, c.dialog.job], ['Heal (1)', 'WHM']);
  c.chooseJob('SCH');
  c.submitDialog();
  assert.equal(c.screen, 'sheets');
  assert.deepEqual(
    c.manager.rows.map(r => [r.name, r.jobName, r.settingsText]),
    [
      ['Heal (1)', 'Scholar', 'Lv 70 / IL 375'],
      ['Heal', 'White Mage', 'Lv 70 / IL 375'],
    ],
  );
  sheets.openSheet(c.manager.rows[1].id);
  c.askDelete('sheet', sheets.sheetId);
  assert.ok(c.dialogView.question.includes('Heal'), c.dialogView.question); // the sheet's name
  c.submitDialog();
  assert.equal(c.screen, 'sheets');
  assert.deepEqual(
    c.manager.rows.map(r => r.name),
    ['Heal (1)'],
  );
});

test('Escape cancels a dialog; nothing opens while an Auto-fill runs', () => {
  const { c, sheets } = bind();
  c.openNewSheet();
  c.cancelDialog(); // the dialog's cancel event, which the browser raises for Escape
  assert.equal(c.dialog, null);
  sheets.setBusy(true);
  c.openNewSheet();
  assert.equal(c.dialog, null);
});

test('New sheet: a number entered just before Create does not commit into the closed dialog', () => {
  const { c, sheets } = bind();
  c.openNewSheet();
  c.chooseJob('BLU');
  c.setFormLevel(75);
  c.submitDialog();
  assert.equal(c.dialog, null);
  c.setFormCap(300); // the field's pause ends after Create: nothing is left to edit
  c.setFormLevel(20);
  assert.equal(sheets.list().sheets.length, 1);
  assert.equal(sheets.currentSheet.level, 75);
});

test('New sheet and Copy sheet forms: the cap follows the level, the job and the sync switch, and the field is told what was lowered', () => {
  const { c, sheets } = bind();
  c.openNewSheet();
  c.chooseJob('SGE');
  c.setFormSync(true);
  assert.deepEqual([c.dialog.sync.cap, c.formCapProps.lowered], [795, null], 'level 100 allows every real item level');
  c.setFormLevel(70);
  assert.deepEqual([c.dialog.sync.cap, c.formCapProps.lowered], [405, { from: 795, to: 405, level: 70 }]);
  assert.equal(c.dialogName, 'Sage Lv 70 ilvl 405');
  c.setFormCap(380);
  assert.equal(c.formCapProps.lowered, null);
  c.setFormCap(600);
  assert.deepEqual([c.dialog.sync.cap, c.formCapProps.lowered], [405, { from: 600, to: 405, level: 70 }]);
  c.submitDialog();
  assert.deepEqual(sheets.currentSheet.sync, { on: true, cap: 405 });

  // Copy: the form starts from the sheet; a lower level lowers its cap
  c.openCopy(sheets.sheetId);
  assert.equal(c.formCapProps.lowered, null);
  c.setFormLevel(50);
  assert.deepEqual([c.dialog.sync.cap, c.formCapProps.lowered], [135, { from: 405, to: 135, level: 50 }]);
  c.setFormSync(false);
  assert.equal(c.formCapProps.lowered, null, 'no note while sync is off');
  assert.equal(c.formCapProps.disabled, true);
  c.submitDialog();
  assert.deepEqual(sheets.list().sheets[0].sync, { on: false, cap: 135 });
});

test('the set page header is built once per change of the sheets, and frozen', () => {
  const { c, sheets } = bind();
  sheets.createSheet({ name: 'S', job: 'SGE', level: 100, sync: { on: false, cap: 795 } });
  sheets.newSet();
  const first = c.setHeader;
  assert.equal(c.setHeader, first, 'a second read gives the same object');
  assert.ok(Object.isFrozen(first));
  sheets.editSet(sheets.setId, { name: 'Raid', description: '' });
  assert.deepEqual(
    c.setHeader.crumbs.map(crumb => crumb.text),
    ['Sheets', 'S', 'Raid'],
  );
});

test('a delete question opens with the focus on Cancel, so a stray Enter does not delete; a form opens on its first field', () => {
  const { c } = bind();
  assert.equal(c.firstFocus('delete'), '#sh-dlg-cancel');
  for (const kind of ['new', 'copy', 'edit-sheet', 'edit-set']) {
    assert.match(c.firstFocus(kind), /^input:not\(\[disabled\]\)/, kind);
  }
});

test('the island elements: each action of their `sheet-action` event reaches the store or dialog it names, and a step or an edit hands back the answer', () => {
  const { c, sheets } = bind();
  for (const name of ['C', 'B', 'A']) {
    sheets.createSheet({ name, job: 'SGE', level: 70, sync: { on: true, cap: 300 } });
  }
  sheets.openManager();
  const names = () => c.manager.rows.map(r => r.name);
  assert.deepEqual(names(), ['A', 'B', 'C']);
  const step = { action: 'step', kind: 'sheet', index: 0, step: 1, result: 0 };
  c.onSheetAction(step);
  assert.deepEqual([step.result, names()], [1, ['B', 'A', 'C']], 'the row moved one place, and the element is told where it is now');
  c.onSheetAction({ action: 'move', kind: 'sheet', from: 2, to: 0 });
  assert.deepEqual(names(), ['C', 'B', 'A']);
  // a dialog opens with the button that asked as the opener of its focus
  const opener = { isConnected: true, focus() {} };
  c.onSheetAction({ action: 'new', kind: 'sheet', opener });
  assert.equal(c.dialog.kind, 'new');
  c.cancelDialog();
  c.onSheetAction({ action: 'delete', kind: 'sheet', id: c.manager.rows[0].id, opener });
  assert.deepEqual([c.dialog.kind, c.dialog.what], ['delete', 'sheet']);
  c.cancelDialog();
  // a sheet's page: its edits answer with the store's result, and open the sheet first
  c.onSheetAction({ action: 'open', kind: 'sheet', id: c.manager.rows[1].id });
  assert.equal(c.screen, 'sheet');
  const level = { action: 'level', value: 50, result: null };
  c.onSheetAction(level);
  assert.deepEqual([level.result.ok, sheets.currentSheet.level, sheets.currentSheet.sync.cap], [true, 50, 135]);
  assert.deepEqual(level.result.lowered, { from: 300, to: 135, level: 50 });
  c.onSheetAction({ action: 'clan', name: '' });
  c.onSheetAction({ action: 'party', value: '2' });
  assert.deepEqual([sheets.currentSheet.clan ?? null, sheets.currentSheet.partyRoles], [null, 2]);
  c.onSheetAction({ action: 'figures', mode: 'points' });
  assert.equal(c.$store.app.sheetFigures, 'points');
  c.onSheetAction({ action: 'to-manager' });
  assert.equal(c.screen, 'sheets');
});

test('the island elements are given their view while their screen is open and null otherwise, with a locked page while a dialog is open', () => {
  const { c, sheets } = bind();
  assert.deepEqual([c.managerProps.view === c.manager, c.pageProps.view, c.managerProps.dialogOpen], [true, null, false]);
  sheets.createSheet({ name: 'S', job: 'SGE', level: 100, sync: { on: false, cap: 795 } });
  assert.deepEqual([c.managerProps.view, c.pageProps.view === c.page, c.pageProps.sheetId], [null, true, sheets.sheetId]);
  c.openEditSheet(sheets.sheetId);
  assert.equal(c.pageProps.dialogOpen, true);
  assert.deepEqual(
    c.pageProps.switcher.items.map(item => [item.name, item.current]),
    [['S', true]],
  );
  sheets.openManager();
  assert.deepEqual(c.managerProps.notFound, null);
});

// A new member of the component that no template reads, or one that two parts define, shows up here: update the lists when a
// part gains or loses a member (compose throws on a double definition, but a rename passes it silently).
test('the component: its parts define every member the templates use, getters as getters', () => {
  const descriptors = Object.getOwnPropertyDescriptors(sheetsTab());
  const kind = name => {
    if (descriptors[name].get) {
      return 'getter';
    }
    return typeof descriptors[name].value === 'function' ? 'method' : 'field';
  };
  const expected = {
    getter: [
      'dialogName',
      'dialogView',
      'formCapProps',
      'formLevelProps',
      'manager',
      'managerProps',
      'notFound',
      'page',
      'pageProps',
      'screen',
      'setHeader',
      'sheets',
    ],
    method: [
      'afterDraw',
      'askDelete',
      'cancelDialog',
      'chooseJob',
      'clearDialogError',
      'closeDialog',
      'dialogKey',
      'firstFocus',
      'goCrumb',
      'goMissing',
      'init',
      'limitFormCap',
      'onSheetAction',
      'openCopy',
      'openDialog',
      'openEditSet',
      'openEditSheet',
      'openNewSheet',
      'pickSheet',
      'setFormCap',
      'setFormLevel',
      'setFormSync',
      'submitDialog',
      'typeName',
    ],
    field: ['dialog', 'jobIcons', 'jobPicker'],
  };
  const actual = { getter: [], method: [], field: [] };
  for (const name of Object.keys(descriptors).sort()) {
    actual[kind(name)].push(name);
  }
  assert.deepEqual(actual, expected);
});
