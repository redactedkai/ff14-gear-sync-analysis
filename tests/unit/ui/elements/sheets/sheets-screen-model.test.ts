/* The Sheets screen's model (src/ui/elements/sheets/sheets-screen-model.ts) over the page's real store on stand-in storage: the screen
   to draw, the properties of the three screen elements, the answers to their events, the dialog closing when the page moves away, and
   which store parts the screen follows (the dialogs' own logic is tested in sheet-dialogs-model.test.ts). */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SheetsScreenModel, sheetsSelection } from '../../../../../src/ui/elements/sheets/sheets-screen-model.ts';
import { shallowEq } from '../../../../../src/ui/store/select.ts';
import { fakeStorage } from '../../../helpers/sheet-fixtures.ts';
import { createStores } from '../../../helpers/stores.ts';

/* The model over a fresh store. */
function bind() {
  let next = 0;
  const { store, app, sheets } = createStores(undefined, { storage: fakeStorage(), makeId: prefix => `${prefix}${++next}` });
  const model = new SheetsScreenModel({ app, sheets, setPagePorts: { store, sheets } }, () => {});
  return { model, store, app, sheets };
}

/* A sheet with the given name, opened. */
function addSheet(sheets, name = 'S') {
  sheets.createSheet({ name, job: 'SGE', level: 100, sync: { on: false, cap: 795 } });
}

test('the set page header is built once per change of the sheets, and frozen', () => {
  const { model, sheets } = bind();
  addSheet(sheets);
  sheets.newSet();
  assert.equal(model.screen, 'set');
  const first = model.setHeader;
  assert.equal(model.setHeader, first, 'a second read gives the same object');
  assert.ok(Object.isFrozen(first));
  sheets.editSet(sheets.setId, { name: 'Raid', description: '' });
  assert.deepEqual(
    model.setHeader.crumbs.map(crumb => crumb.text),
    ['Sheets', 'S', 'Raid'],
  );
});

test('each action of an element reaches the store or dialog it names, and a step or an edit hands back the answer', () => {
  const { model, sheets, app } = bind();
  for (const name of ['C', 'B', 'A']) {
    sheets.createSheet({ name, job: 'SGE', level: 70, sync: { on: true, cap: 300 } });
  }
  sheets.openManager();
  const names = () => model.manager.rows.map(row => row.name);
  assert.deepEqual(names(), ['A', 'B', 'C']);
  const step = { action: 'step', kind: 'sheet', index: 0, step: 1, result: 0 };
  model.onSheetAction(step);
  assert.deepEqual([step.result, names()], [1, ['B', 'A', 'C']], 'the row moved one place, and the element is told where it is now');
  model.onSheetAction({ action: 'move', kind: 'sheet', from: 2, to: 0 });
  assert.deepEqual(names(), ['C', 'B', 'A']);
  // a dialog opens with the button that asked as the opener of its focus
  const opener = { isConnected: true, focus() {} };
  model.onSheetAction({ action: 'new', kind: 'sheet', opener });
  assert.equal(model.dialogs.view().kind, 'new');
  model.dialogs.close();
  model.onSheetAction({ action: 'delete', kind: 'sheet', id: model.manager.rows[0].id, opener });
  assert.equal(model.dialogs.view().kind, 'delete');
  model.dialogs.close();
  // a sheet page: its edits answer with the store result, and open the sheet first
  model.onSheetAction({ action: 'open', kind: 'sheet', id: model.manager.rows[1].id });
  assert.equal(model.screen, 'sheet');
  const level = { action: 'level', value: 50, result: null };
  model.onSheetAction(level);
  assert.deepEqual([level.result.ok, sheets.currentSheet.level, sheets.currentSheet.sync.cap], [true, 50, 135]);
  assert.deepEqual(level.result.lowered, { from: 300, to: 135, level: 50 });
  model.onSheetAction({ action: 'clan', name: '' });
  model.onSheetAction({ action: 'party', value: '2' });
  assert.deepEqual([sheets.currentSheet.clan ?? null, sheets.currentSheet.partyRoles], [null, 2]);
  model.onSheetAction({ action: 'figures', mode: 'points' });
  assert.equal(app.sheetFigures, 'points');
  model.onSheetAction({ action: 'to-manager' });
  assert.equal(model.screen, 'sheets');
});

test('the caret menu after a sheet name: the manager, another sheet, or a New sheet dialog over the manager', () => {
  const { model, sheets } = bind();
  addSheet(sheets, 'First');
  const firstId = sheets.sheetId;
  addSheet(sheets, 'Second');
  const opener = { isConnected: true, focus() {} };
  model.onSwitchPick({ kind: 'item', id: firstId, opener });
  assert.equal(sheets.sheetId, firstId);
  model.onSwitchPick({ kind: 'new', id: null, opener });
  assert.deepEqual([model.screen, model.dialogs.kind], ['sheets', 'new']);
  model.dialogs.close();
  model.onSwitchPick({ kind: 'item', id: firstId, opener });
  model.onSwitchPick({ kind: 'all', id: null, opener });
  assert.equal(model.screen, 'sheets');
});

test('each element is given its view while its screen is open and null otherwise, and a page is locked while a dialog is open', () => {
  const { model, sheets } = bind();
  assert.deepEqual(
    [model.managerProps().view === model.manager, model.pageProps().view, model.managerProps().dialogOpen],
    [true, null, false],
  );
  addSheet(sheets);
  assert.deepEqual(
    [model.managerProps().view, model.pageProps().view === model.page, model.pageProps().sheetId],
    [null, true, sheets.sheetId],
  );
  model.dialogs.openEditSheet(sheets.sheetId);
  assert.equal(model.pageProps().dialogOpen, true);
  assert.equal(model.setPageProps().dialogIsOpen(), true, 'the set page asks the dialogs, so its Escape leaves a waiting result alone');
  assert.deepEqual(
    model.pageProps().switcher.items.map(item => [item.name, item.current]),
    [['S', true]],
  );
  sheets.openManager();
  assert.deepEqual(model.managerProps().notFound, null);
});

test('a dialog stays open through any change but one of the tab, the sheet or the gear set, which closes it without taking the focus', () => {
  const { model, app, sheets } = bind();
  addSheet(sheets);
  model.follow();
  const focused = [];
  model.dialogs.openEditSheet(sheets.sheetId, { isConnected: true, focus: () => focused.push('opener') });
  sheets.setNote('Saved.');
  model.follow();
  assert.equal(model.dialogs.isOpen, true, 'a note is no change of page');
  sheets.newSet();
  model.follow();
  assert.equal(model.dialogs.isOpen, false, 'a new gear set opened');
  model.dialogs.openNewSheet();
  app.showTab('browse');
  model.follow();
  assert.equal(model.dialogs.isOpen, false, 'a change of tab');
  model.dialogs.afterClosed();
  assert.deepEqual(focused, [], 'the router owns the focus after a change of page');
});

test('the screen follows what it draws from: an edit, the open page, the edit lock, the tab or the figures; not a note', () => {
  const { store, app, sheets } = bind();
  addSheet(sheets);
  const read = () => sheetsSelection(store.state);
  const changes = change => {
    const before = read();
    change();
    return !shallowEq(before, read());
  };
  assert.equal(
    changes(() => sheets.setNote('Saved.')),
    false,
  );
  assert.equal(
    changes(() => sheets.setLevel(50)),
    true,
    'a sheet edit',
  );
  assert.equal(
    changes(() => sheets.setBusy(true)),
    true,
    'the edit lock',
  );
  assert.equal(
    changes(() => sheets.setBusy(false)),
    true,
  );
  assert.equal(
    changes(() => app.setSheetFigures('points')),
    true,
    'the figures choice',
  );
  assert.equal(
    changes(() => sheets.newSet()),
    true,
    'the open gear set',
  );
  assert.equal(
    changes(() => app.showTab('browse')),
    true,
    'the tab',
  );
});

test('New sheet in the caret menu opens its dialog over the manager and the redraw that follows keeps it open', () => {
  const { model, sheets } = bind();
  addSheet(sheets);
  model.follow();
  assert.equal(sheets.screen, 'sheet');
  model.onSwitchPick({ kind: 'new', id: null, opener: { isConnected: true, focus() {} } });
  assert.equal(sheets.screen, 'sheets', 'the manager is behind the dialog');
  assert.equal(model.dialogs.isOpen, true);
  model.follow();
  assert.equal(model.dialogs.isOpen, true, 'the move to the manager is the pick itself, not a change that closes the dialog');
  sheets.createSheet({ name: 'T', job: 'SGE', level: 100, sync: { on: false, cap: 795 } });
  model.follow();
  assert.equal(model.dialogs.isOpen, false, 'a later change of page still closes it');
});

test('New sheet in the caret menu opens no dialog while the leave question holds the move to the manager', () => {
  const { model, sheets } = bind();
  addSheet(sheets);
  sheets.newSet();
  model.follow();
  const asked = [];
  sheets.setLeaveGuard(move => {
    asked.push(move);
    return true;
  });
  model.onSwitchPick({ kind: 'new', id: null, opener: { isConnected: true, focus() {} } });
  assert.equal(asked.length, 1, 'the leave question was asked');
  assert.equal(sheets.screen, 'set', 'still on the set page');
  assert.equal(model.dialogs.isOpen, false);
});
