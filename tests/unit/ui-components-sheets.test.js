/* The Sheets tab's component (src/ui/components/sheets.js) bound to a real sheet store over a stand-in storage, as
   Alpine binds it: the screens it draws, the dialogs (New sheet with its default name, Copy sheet, Name and
   description, Delete), refused names put back, keyboard and drag reordering, and the note that clears itself. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_REAL } from '../../src/core/tables.js';
import { NOTE_MS, sheetsTab } from '../../src/ui/components/sheets.js';
import { createSheetStore } from '../../src/ui/sheet-store.js';
import { pageMagics } from './helpers/page-magics.js';
import { fakeStorage } from './helpers/sheet-fixtures.js';

/* The component over a fresh store; Alpine's magics are the shared stand-ins (helpers/page-magics.js: $nextTick runs at
   once, $refs holds the dialog) and $watch keeps its callbacks for the test to call. */
function bind() {
  let next = 0;
  const sheets = createSheetStore({ storage: fakeStorage(), makeId: prefix => `${prefix}${++next}` });
  const watchers = {};
  const c = Object.assign(sheetsTab(), {
    $store: { sheets },
    ...pageMagics(['dialog']),
    $watch: (path, fn) => {
      watchers[path] = fn;
    },
  });
  c.init();
  return { c, sheets, watchers, magics: { calls: c.calls } };
}
/* A key event on a handle in row `index` of a list, as the browser hands it. */
const key = (k, extra = {}) => ({ key: k, preventDefault() {}, target: { closest: () => null }, ...extra });

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

test('a refused name goes back to the default (New) or the old name (Edit), with the reason', () => {
  const { c, sheets } = bind();
  c.openNewSheet();
  c.submitDialog();
  assert.equal(c.dialog.error, 'Choose a job.');
  c.chooseJob('PLD');
  c.typeName('   ');
  c.submitDialog();
  assert.deepEqual([c.dialog.error, c.dialogName], ['A name cannot be empty: the default name is back in the box.', 'Paladin Lv 100']);
  c.submitDialog();
  const id = sheets.sheetId;
  c.openEditSheet(id);
  assert.equal(c.dialog.kind, 'edit-sheet');
  c.dialog.name = '';
  c.submitDialog();
  assert.deepEqual([c.dialog.error, c.dialog.name], ['A name cannot be empty: the old name is back in the box.', 'Paladin Lv 100']);
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
  assert.equal(c.setHeader.settingsText, 'Sage · Level 100 · Item level sync off');
  c.goCrumb('sheet');
  assert.equal(c.screen, 'sheet');
  c.openEditSet(sheets.currentSheet.sets[0].id);
  c.dialog.description = 'My own set\nsecond line';
  c.submitDialog();
  assert.deepEqual([c.page.rows[0].descriptionLine, c.page.rows[0].description], ['My own set', 'My own set\nsecond line']);
  c.goCrumb('sheets');
  assert.equal(c.screen, 'sheets');
});

test('Copy and Delete through their dialogs; Delete of a sheet from its page lands on the manager', () => {
  const { c, sheets } = bind();
  sheets.createSheet({ name: 'Heal', job: 'WHM', level: 70, sync: { on: true, cap: 375 } });
  c.openCopy(sheets.sheetId);
  assert.deepEqual([c.dialog.name, c.dialogView.jobText], ['Heal (1)', 'White Mage']);
  c.chooseJob('SCH');
  c.submitDialog();
  assert.equal(c.screen, 'sheets');
  assert.deepEqual(
    c.manager.rows.map(r => [r.name, r.jobName, r.settingsText]),
    [
      ['Heal (1)', 'Scholar', 'Lv 70, ilvl 375'],
      ['Heal', 'White Mage', 'Lv 70, ilvl 375'],
    ],
  );
  sheets.openSheet(c.manager.rows[1].id);
  c.askDelete('sheet', sheets.sheetId);
  assert.equal(c.dialogView.question, 'Delete the sheet “Heal” (it has no gear sets)?');
  c.submitDialog();
  assert.equal(c.screen, 'sheets');
  assert.deepEqual(
    c.manager.rows.map(r => r.name),
    ['Heal (1)'],
  );
});

test('Escape cancels a dialog; nothing opens while a Fill runs', () => {
  const { c, sheets } = bind();
  c.openNewSheet();
  c.dialogKey(key('Escape'));
  assert.equal(c.dialog, null);
  sheets.busy = true;
  c.openNewSheet();
  assert.equal(c.dialog, null);
});

test('reordering: Up and Down arrow on a handle move the row; a drop moves it above or below the row under it', () => {
  const { c, sheets } = bind();
  for (const name of ['C', 'B', 'A']) sheets.createSheet({ name, job: 'SGE', level: 100, sync: { on: false, cap: 795 } });
  sheets.openManager();
  const names = () => c.manager.rows.map(r => r.name);
  assert.deepEqual(names(), ['A', 'B', 'C']);
  c.handleKey('sheet', 0, key('ArrowDown'));
  assert.deepEqual(names(), ['B', 'A', 'C']);
  assert.equal(sheets.announcement, 'A moved to position 2 of 3.');
  c.handleKey('sheet', 0, key('Enter'));
  assert.deepEqual(names(), ['B', 'A', 'C'], 'other keys do nothing');

  // drag C (row 2) and drop it on the upper half of row 0: it goes first
  const transfer = { setData() {}, setDragImage() {} };
  c.dragStart('sheet', 2, { dataTransfer: transfer, target: { closest: () => null }, preventDefault() {} });
  const over = { clientY: 10, currentTarget: { getBoundingClientRect: () => ({ top: 0, height: 40 }) }, preventDefault() {} };
  c.dragOver('sheet', 0, over);
  assert.equal(c.dropMark('sheet', 0), 'before');
  assert.equal(c.dropMark('set', 0), '', 'only rows of the same list');
  c.drop('sheet', 0, over);
  assert.deepEqual(names(), ['C', 'B', 'A']);
  assert.equal(c.dragging, null);
  // drag B (row 1) onto the lower half of row 2: after it, last
  c.dragStart('sheet', 1, { dataTransfer: transfer, target: { closest: () => null }, preventDefault() {} });
  c.drop('sheet', 2, { ...over, clientY: 30 });
  assert.deepEqual(names(), ['C', 'A', 'B']);
});

test('a note after an action clears itself', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { sheets, watchers } = bind();
  sheets.note = 'Deleted “X”.';
  watchers['$store.sheets.note'](sheets.note);
  t.mock.timers.tick(NOTE_MS - 1);
  assert.equal(sheets.note, 'Deleted “X”.');
  t.mock.timers.tick(1);
  assert.equal(sheets.note, '');
});

test('New sheet: a number typed just before Create does not commit into the closed dialog', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { c, sheets } = bind();
  c.openNewSheet();
  c.chooseJob('BLU');
  for (const value of ['7', '75']) c.formField('level')['@input']({ target: { value }, inputType: 'insertText' });
  c.formField('level')['@change']({ target: { value: '75', classList: { add() {}, remove() {} } } });
  c.formField('cap')['@input']({ target: { value: '300' }, inputType: 'insertText' });
  c.submitDialog();
  assert.equal(c.dialog, null);
  t.mock.timers.tick(1000); // the pending typed cap would have set a field of the closed dialog
  assert.equal(sheets.list().sheets.length, 1);
  assert.equal(sheets.currentSheet.level, 75);
});

/* A number field's commit as the browser hands it: the change event of a box showing `value`. */
const change = (field, value) => field['@change']({ target: { value: String(value), classList: { add() {}, remove() {} } } });

/* The sheet page's cap follows its level with the Job and sync panel's note (owner's report, 2026-11-10). Level 70
   allows item level 405 at most, level 50 allows 135. */
test("a sheet's page: a cap above what the level allows is lowered, with the panel's note", () => {
  const { c, sheets } = bind();
  sheets.createSheet({ name: 'Heal', job: 'SGE', level: 70, sync: { on: true, cap: 300 } });
  assert.equal(c.capLoweredNote, '');
  change(c.capField, 500);
  assert.deepEqual([sheets.currentSheet.sync.cap, c.capLoweredNote], [405, 'Lowered to 405, the highest for level 70.']);
  change(c.levelField, 50);
  assert.deepEqual([sheets.currentSheet.sync.cap, c.capLoweredNote], [135, 'Lowered to 135, the highest for level 50.']);
  change(c.capField, 100);
  assert.equal(c.capLoweredNote, '', 'a cap the level allows clears the note');
  change(c.levelField, 100);
  change(c.capField, 900);
  assert.deepEqual([sheets.currentSheet.sync.cap, c.capLoweredNote], [795, 'Lowered to 795, the highest for level 100.']);
  c.toggleSync(false);
  assert.equal(c.capLoweredNote, '', 'no note while sync is off');
  change(c.levelField, 70);
  c.toggleSync(true);
  assert.deepEqual([sheets.currentSheet.sync.cap, c.capLoweredNote], [405, 'Lowered to 405, the highest for level 70.']);
  // the note belongs to the sheet it was made on
  sheets.createSheet({ name: 'Other', job: 'SGE', level: 70, sync: { on: true, cap: 300 } });
  assert.equal(c.capLoweredNote, '');
});

test('New sheet and Copy sheet forms: the cap follows the level, the job and the sync switch, with the note', () => {
  const { c, sheets } = bind();
  c.openNewSheet();
  c.chooseJob('SGE');
  c.setFormSync(true);
  assert.deepEqual([c.dialog.sync.cap, c.formCapNote], [795, ''], 'level 100 allows every real item level');
  change(c.formField('level'), 70);
  assert.deepEqual([c.dialog.sync.cap, c.formCapNote], [405, 'Lowered to 405, the highest for level 70.']);
  assert.equal(c.dialogName, 'Sage Lv 70 ilvl 405');
  change(c.formField('cap'), 380);
  assert.equal(c.formCapNote, '');
  change(c.formField('cap'), 600);
  assert.deepEqual([c.dialog.sync.cap, c.formCapNote], [405, 'Lowered to 405, the highest for level 70.']);
  c.submitDialog();
  assert.deepEqual(sheets.currentSheet.sync, { on: true, cap: 405 });

  // Copy: the form starts from the sheet; a lower level lowers its cap
  c.openCopy(sheets.sheetId);
  assert.equal(c.formCapNote, '');
  change(c.formField('level'), 50);
  assert.deepEqual([c.dialog.sync.cap, c.formCapNote], [135, 'Lowered to 135, the highest for level 50.']);
  c.setFormSync(false);
  assert.equal(c.formCapNote, '');
  c.submitDialog();
  assert.deepEqual(sheets.list().sheets[0].sync, { on: false, cap: 135 });
});

/* The Job and sync panel's cap field tests (ui-components-page.test.js) on a sheet's page. */
test("a sheet's cap field: text that is no whole item level is an error and the sheet keeps its cap; the field flashes", () => {
  const { c, sheets, watchers } = bind();
  const classes = new Set();
  c.$refs.sheetCap = { classList: { add: k => classes.add(k), remove: k => classes.delete(k) }, offsetWidth: 0 };
  sheets.createSheet({ name: 'Heal', job: 'SGE', level: 50, sync: { on: true, cap: 123 } });
  assert.equal(c.capError, '');
  for (const text of ['0', '12.5', '-3']) {
    c.onCapInput(text);
    assert.equal(c.capError, `Enter a whole item level from 1 to ${MAX_REAL}`, text);
  }
  change(c.capField, '0');
  assert.equal(sheets.currentSheet.sync.cap, 123, 'the sheet keeps its last cap');
  // a whole number above the highest real item level is a cap too: lowered, with the note and a flash
  c.onCapInput(`${MAX_REAL + 100}`);
  assert.equal(c.capError, '');
  change(c.capField, MAX_REAL + 100);
  assert.deepEqual([sheets.currentSheet.sync.cap, c.capLoweredNote], [135, 'Lowered to 135, the highest for level 50.']);
  assert.ok(classes.has('flash'));
  // typed again over a cap already at the limit: the sheet does not change, and the field is put back to 135
  c.$refs.sheetCap.value = '999';
  change(c.capField, 999);
  assert.deepEqual([c.$refs.sheetCap.value, c.capLoweredNote], ['135', 'Lowered to 135, the highest for level 50.']);
  // an error under the field takes the note's place
  c.onCapInput('0');
  assert.equal(c.capLoweredNote, '');
  // level 40 lowers 123 to 43 (the best gear made for level 40); back at level 50 it stays 43, and the note goes
  c.onCapInput('123');
  change(c.capField, 123);
  change(c.levelField, 40);
  assert.deepEqual([sheets.currentSheet.sync.cap, c.capLoweredNote], [43, 'Lowered to 43, the highest for level 40.']);
  change(c.levelField, 50);
  assert.deepEqual([sheets.currentSheet.sync.cap, c.capLoweredNote], [43, '']);
  // no error while sync is off, and another sheet's page starts with none
  c.onCapInput('0');
  c.toggleSync(false);
  assert.equal(c.capError, '');
  c.toggleSync(true);
  watchers['$store.sheets.sheetId']();
  assert.equal(c.capError, '');
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

test('a delete question opens with the focus on Cancel, so a stray Enter does not delete', () => {
  const { c } = bind();
  const asked = [];
  c.$refs.dialog.querySelector = selector => {
    asked.push(selector);
    return { focus() {} };
  };
  c.openDialog({ kind: 'delete', what: 'sheet', id: 's_1', target: { name: 'X' } });
  assert.deepEqual(asked, ['#sh-dlg-cancel']);
});

test('a dialog opens with the focus in its first field; nothing runs once the component is gone', () => {
  const { c } = bind();
  const field = {
    focus() {
      field.focused = true;
    },
  };
  c.$refs.dialog.querySelector = () => field;
  c.openNewSheet();
  assert.equal(field.focused, true);
  field.focused = false;
  c.$el.isConnected = false;
  c.openNewSheet();
  assert.equal(field.focused, false, 'the draw callback is skipped for a page that was left');
});
