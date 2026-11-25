/* The Sheets tab's component (src/ui/components/sheets.js) bound to a real sheet store over a stand-in storage, as
   Alpine binds it: the screen to draw, the views and properties of the island elements, the answers to their events and the bridge to
   the dialogs (the dialogs' own logic is tested in elements/sheets/sheet-dialogs-model.test.js). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sheetsTab } from '../../../../src/ui/components/sheets.js';
import { fakeStorage } from '../../helpers/sheet-fixtures.js';
import { createSheetsFacade } from '../../helpers/stores.js';

/* The component over a fresh store; $watch keeps its callbacks for the test to call. */
function bind() {
  let next = 0;
  const sheets = createSheetsFacade({ storage: fakeStorage(), makeId: prefix => `${prefix}${++next}` });
  const watchers = {};
  const app = { sheetFigures: 'effects', setSheetFigures: mode => (app.sheetFigures = mode) };
  const c = Object.assign(sheetsTab(), {
    $store: { sheets, app },
    $watch: (path, fn) => {
      watchers[path] = fn;
    },
  });
  c.init();
  return { c, sheets, watchers };
}
test('the set page header is built once per change of the sheets, and frozen', () => {
  const { c, sheets } = bind();
  sheets.createSheet({ name: 'S', job: 'SGE', level: 100, sync: { on: false, cap: 795 } });
  sheets.newSet();
  assert.equal(c.screen, 'set');
  const first = c.setHeader;
  assert.equal(c.setHeader, first, 'a second read gives the same object');
  assert.ok(Object.isFrozen(first));
  sheets.editSet(sheets.setId, { name: 'Raid', description: '' });
  assert.deepEqual(
    c.setHeader.crumbs.map(crumb => crumb.text),
    ['Sheets', 'S', 'Raid'],
  );
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
  assert.equal(c.dialogProps.view.kind, 'new');
  c.closeDialog();
  c.onSheetAction({ action: 'delete', kind: 'sheet', id: c.manager.rows[0].id, opener });
  assert.equal(c.dialogProps.view.kind, 'delete');
  c.closeDialog();
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
      'dialogOpen',
      'dialogProps',
      'manager',
      'managerProps',
      'notFound',
      'page',
      'pageProps',
      'screen',
      'setHeader',
      'setPageProps',
      'sheets',
    ],
    method: [
      'afterDialogClosed',
      'askDelete',
      'closeDialog',
      'goMissing',
      'init',
      'onDialogAction',
      'onSheetAction',
      'openCopy',
      'openEditSet',
      'openEditSheet',
      'openNewSheet',
      'pickSheet',
    ],
    field: ['dialogRev'],
  };
  const actual = { getter: [], method: [], field: [] };
  for (const name of Object.keys(descriptors).sort()) {
    actual[kind(name)].push(name);
  }
  assert.deepEqual(actual, expected);
});
