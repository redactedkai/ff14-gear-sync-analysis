/* The page root's logic (src/ui/elements/app/app-root-model.ts) over the page's real store: what the Job and sync strip is given,
   the tab links, the loading line, the Gear browser's panel, the test data button, and which store parts the root follows. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_REAL } from '../../../../../src/core/tables.ts';
import { AppRootModel, appRootSelection } from '../../../../../src/ui/elements/app/app-root-model.ts';
import { shallowEq } from '../../../../../src/ui/store/select.ts';
import { restoreOpen } from '../../../helpers/common.js';
import { createStores } from '../../../helpers/stores.js';

/* The root's model over a real store of `saved`; `sheets` replaces the Sheets facade (a stand-in for the leave question). A tab opens
   on the next macrotask, as the page opens it one frame later. */
function opened(saved = {}, sheets = undefined) {
  const stores = createStores(restoreOpen({ tab: 'sheets', ...saved }), { frame: callback => callback() });
  const model = new AppRootModel({ ...stores, sheets: sheets ?? stores.sheets, setPagePorts: {} });
  return { ...stores, model };
}
const settled = () => new Promise(resolve => setTimeout(resolve, 5));

/* A plain click on a tab link (plain-click.ts). */
const plain = { button: 0, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, preventDefault() {} };

test("the Job and sync strip is given the Gear browser's own panel, whichever tab is open", () => {
  const { app, model } = opened({
    tab: 'math',
    job: 'BLU',
    cap: 300,
    sync: true,
    level: 70,
    piece: { job: 'SGE', cap: 123, sync: false, level: 90 },
  });
  const browse = app.panel('browse');
  const strip = model.stripInput();
  assert.deepEqual(
    [strip.job, strip.level, strip.cap, strip.sync, strip.maxLevel, strip.maxReal, strip.tab],
    [browse.job, browse.level, browse.cap, Boolean(browse.sync), browse.jobCtx.maxLevel, MAX_REAL, 'math'],
  );
  assert.notEqual(strip.job, app.panel('math').job, "not the open tab's job");
});

test('the Gear browser is given the same panel object until one of its values changes', () => {
  const { app, model } = opened({ tab: 'browse' });
  const first = model.browsePanel();
  app.showSub('gcd'); // a change elsewhere
  assert.equal(model.browsePanel(), first);
  app.editPanel({ level: 50 });
  assert.notEqual(model.browsePanel(), first);
  assert.equal(model.browsePanel().level, 50);
});

test('tab links: the math link names the open sub-tab; the tab being opened shows as selected; the loading line names it', async () => {
  const { app, model } = opened();
  assert.equal(model.tabHref('math'), '#/math/piece');
  app.showSub('gcd');
  assert.equal(model.tabHref('math'), '#/math/gcd');
  assert.equal(model.tabHref('sheets'), '#/sheets');
  assert.deepEqual([model.isCurrent('sheets'), model.loadingText()], [true, '']);
  model.goTab('browse', plain);
  assert.deepEqual([model.isCurrent('browse'), model.isCurrent('sheets'), model.loadingText()], [true, false, 'Loading the Gear browser…']);
  await settled();
  assert.deepEqual([app.tab, model.loadingText()], ['browse', '']);
});

/* A tab link (goTab): leaving the Sheets tab asks the set page first (ui/store/sheets-actions.ts askLeave); the answer opens the tab.
   Other tabs switch at once. */
test('goTab: leaving the Sheets tab with something to settle asks first; the answer opens the tab', async () => {
  let pending = null;
  const sheets = {
    askLeave: move => {
      pending = move;
      return true;
    },
  };
  const { app, model } = opened({}, sheets);
  model.goTab('browse', plain);
  assert.equal(app.tab, 'sheets', 'the question is open: the tab stays');
  pending();
  assert.equal(app.pendingTab, 'browse', 'the tab is marked while it opens');
  await settled();
  assert.deepEqual([app.tab, app.pendingTab], ['browse', null], 'the answer opens the tab and clears the mark');
  // from another tab nothing is asked
  pending = null;
  model.goTab('math', plain);
  await settled();
  assert.deepEqual([app.tab, pending], ['math', null]);
  // the tab already open (or opening) does nothing
  model.goTab('math', plain);
  assert.equal(app.pendingTab, null);
  // a Ctrl click is the browser's: the page does not move
  model.goTab('browse', { ...plain, ctrlKey: true });
  assert.equal(app.pendingTab, null);
});

test('the test data button loads the example sheets and shows the manager', () => {
  const { app, sheets, store, model } = opened({ tab: 'math' });
  model.loadTestData();
  assert.equal(app.tab, 'sheets');
  assert.equal(sheets.screen, 'sheets');
  assert.ok(store.state.sheets.data.sheets.length > 0, 'the example sheets are in');
});

test("a note's end clears the note", () => {
  const { sheets, model } = opened();
  sheets.setNote('Deleted a sheet.');
  assert.equal(sheets.note, 'Deleted a sheet.');
  model.expireNote();
  assert.equal(sheets.note, '');
});

/* The edits a user can make, each as a function of the stores. */
const EDITS = {
  'the open tab': ({ app }) => app.showTab('math'),
  'the math sub-tab (the math link)': ({ app }) => app.showSub('gcd'),
  "the Gear browser's job": ({ app }) => app.setJob('BLM', 'browse'),
  "the Gear browser's level": ({ app }) => app.editPanel({ level: 80 }),
  "the Gear browser's cap": ({ app }) => app.editPanel({ cap: 200 }),
  "the Gear browser's IL Sync": ({ app }) => app.editPanel({ sync: false }),
  "the Gear browser's filters": ({ app }) => app.editBrowse({ min: 100 }),
  'a note after an action': ({ sheets }) => sheets.setNote('Saved.'),
};

/* What the root draws, as text: every value the model reads. */
const drawn = ({ app, sheets, model }) =>
  JSON.stringify([
    app.tab,
    app.pendingTab,
    model.tabHref('math'),
    app.job,
    model.stripInput(),
    app.panel('browse'),
    app.browse,
    sheets.note,
    sheets.noteSeq,
    sheets.saveMessage,
  ]);

test('the root follows every part it reads: an edit that changes what it draws changes the selection; an edit inside a screen does not', () => {
  for (const [name, edit] of Object.entries(EDITS)) {
    const stores = opened({ tab: 'browse', job: 'BLU', sync: true, level: 70, cap: 300 });
    const select = appRootSelection(stores.store);
    const drawnBefore = drawn(stores);
    const selectionBefore = { ...select(stores.store.state) };
    edit(stores);
    assert.notEqual(drawn(stores), drawnBefore, `${name}: the edit changes nothing drawn (fix the edit)`);
    assert.ok(!shallowEq(select(stores.store.state), selectionBefore), `${name} is not in the selection: the page would show it stale`);
  }
  // what a screen draws from is that screen's business: the example piece, the GCD settings, Substat tiers
  const stores = opened({ tab: 'math' });
  const select = appRootSelection(stores.store);
  const before = { ...select(stores.store.state) };
  stores.app.editPiece({ slot: 'body' });
  stores.app.editGcd({ speed: 1000 });
  stores.app.setTiersJob('WAR');
  assert.ok(shallowEq(select(stores.store.state), before), "a screen's own settings do not draw the root again");
});
