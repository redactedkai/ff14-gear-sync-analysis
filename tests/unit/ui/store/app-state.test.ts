/* The app state (src/ui/store/app-state.ts) and its actions: the slices each action bumps, the selectors, the gear set pages, and the
   address of the screen (routeOf) against the routes the router formats. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatRoute, parseRoute } from '../../../../src/ui/router/routes.js';
import { restoreState } from '../../../../src/ui/state.js';
import { createAppActions } from '../../../../src/ui/store/app-actions.ts';
import { createSetPageActions } from '../../../../src/ui/store/set-page-actions.ts';
import {
  createAppStore,
  currentSheet,
  emptySetPage,
  panelOf,
  persisted,
  routeOf,
  setPageOf,
  sheetHref,
  syncSettingsOf,
  unsettled,
  unsettledKind,
} from '../../../../src/ui/store/app-state.ts';
import type { RestoredState } from '../../../../src/ui/store/app-state.ts';
import { createSheetsActions } from '../../../../src/ui/store/sheets-actions.ts';
import { fakeStorage, sageSet, sheetOf } from '../../helpers/sheet-fixtures.js';
import { readSheets } from '../../../../src/ui/sheets/store-shared.js';
import { saveSheet } from '../../../../src/ui/sheets/storage.js';
import { restoreOpen } from '../../helpers/common.js';

const NO_SHEETS = { available: false, sheets: [], unreadable: [], indexProblem: null };
const start = (saved: unknown = null) => createAppStore(restoreOpen(saved) as RestoredState, NO_SHEETS);

test('the five slices, each with a revision at 0', () => {
  const store = start();
  assert.deepEqual(Object.keys(store.state), ['settings', 'screen', 'math', 'sheets', 'setPages']);
  assert.deepEqual({ ...store.revs }, { settings: 0, screen: 0, math: 0, sheets: 0, setPages: 0 });
});

test('each action bumps its own slice only', () => {
  const store = start();
  const actions = createAppActions(store);
  const sheets = createSheetsActions(store, { storage: null });
  const pages = createSetPageActions(store);
  actions.editBrowse({ q: 'axe' });
  actions.showTab('math');
  actions.setTiersLevel(60);
  sheets.setNote('hello');
  pages.openPage('g_1');
  assert.deepEqual({ ...store.revs }, { settings: 1, screen: 1, math: 1, sheets: 1, setPages: 1 });
  assert.deepEqual(store.log, ['settings/editBrowse', 'screen/showTab', 'math/setTiersLevel', 'sheets/setNote', 'setPages/openPage']);
});

test('an action that changes nothing is not counted: the same tab, the same job, the same figures, a refused edit', () => {
  const store = start({ tab: 'browse' });
  const actions = createAppActions(store);
  const sheets = createSheetsActions(store, { storage: null });
  const pages = createSetPageActions(store);
  actions.showTab('browse');
  actions.setJob('PLD');
  actions.setSheetFigures('effects');
  actions.setTiersLevel(null);
  actions.setTiersJob('PLD');
  actions.followLevelSync(); // the Gear browser is open: the math panel is not held
  pages.closePage('g_none'); // no such page
  sheets.setBusy(false);
  sheets.setBusy(true);
  assert.equal(sheets.createSheet({ name: 'x', job: 'SGE', level: 100, sync: { on: false, cap: 1 } }).ok, false, 'the lock refuses');
  assert.equal(store.rev, 1, 'only setBusy(true)');
});

test('1,000 actions in a tick are one notification', async () => {
  const store = start();
  const actions = createAppActions(store);
  let notified = 0;
  store.subscribe(() => {
    notified += 1;
  });
  for (let i = 0; i < 1000; i++) actions.editBrowse({ q: `axe ${i}` });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(notified, 1);
  assert.equal(store.revs.settings, 1000);
  assert.equal(store.log.length, 50);
});

test('panelOf: a tab with a panel, Substat tiers (a job only, at its level cap) and a tab with none', () => {
  const store = start({ browse: { job: 'WAR', cap: 705, sync: true, level: 100 }, tiers: { job: 'BLU' }, tab: 'browse' });
  assert.deepEqual((({ job, cap, sync, level }) => ({ job, cap, sync, level }))(panelOf(store.state, 'browse')), {
    job: 'WAR',
    cap: 705,
    sync: true,
    level: 100,
  });
  const tiers = panelOf(store.state, 'tiers');
  assert.deepEqual([tiers.job, tiers.cap, tiers.sync, tiers.level, tiers.jobCtx.jobId], ['BLU', null, false, 80, 'BLU']);
  assert.throws(() => panelOf(store.state, 'sheets'), /no Job and sync panel/);
  assert.deepEqual(syncSettingsOf(store.state, 'browse'), { cap: 705, sync: true, level: 100 });
});

test('persisted is the old shape: the groups hold their panels, nothing else of the state is in it', () => {
  const store = start({
    browse: { job: 'WAR', cap: 705, sync: false, level: 90, q: 'axe' },
    piece: { job: 'BLM', cap: 300, sync: true, level: 70 },
  });
  const saved = persisted(store.state);
  assert.deepEqual(Object.keys(saved), ['sheetFigures', 'piece', 'browse', 'tiers']);
  assert.deepEqual([saved.browse.job, saved.browse.q, saved.piece.job, saved.piece.cap], ['WAR', 'axe', 'BLM', 300]);
  assert.deepEqual(Object.keys(saved.browse).slice(0, 4), ['job', 'cap', 'sync', 'level']);
  // it restores to the same panels
  const again = start(JSON.parse(JSON.stringify(saved)));
  assert.deepEqual(persisted(again.state), saved);
});

test('gear set pages: a page not open is one frozen page at rest; unsettled sees a draft, a running search and a waiting result', () => {
  const store = start();
  const pages = createSetPageActions(store);
  assert.equal(setPageOf(store.state, 'g_1'), setPageOf(store.state, 'g_2'));
  assert.ok(Object.isFrozen(setPageOf(store.state, 'g_1')));
  assert.equal(unsettled(store.state), false);
  pages.openPage('g_1');
  assert.ok(Object.isFrozen(setPageOf(store.state, 'g_1')), 'an open page is frozen too');
  assert.equal(unsettled(store.state), false, 'a page at rest holds nothing');
  const id = pages.startFill('g_1');
  assert.deepEqual([setPageOf(store.state, 'g_1').fill, setPageOf(store.state, 'g_1').fillId], ['running', id]);
  assert.equal(unsettled(store.state), true);
  assert.equal(unsettledKind(setPageOf(store.state, 'g_1')), 'running');
  pages.endFill('g_1');
  assert.equal(unsettled(store.state), false);
  pages.setSuggestion('g_1', Object.freeze({ suggested: Object.freeze({}), declined: Object.freeze({ rows: [], meal: false }) }));
  assert.equal(unsettled(store.state), true);
  assert.equal(unsettledKind(setPageOf(store.state, 'g_1')), 'result');
  pages.setDraft('g_1', Object.freeze({ id: 'g_1', name: 'Set 1' }));
  assert.equal(unsettledKind(setPageOf(store.state, 'g_1')), 'draft', 'a draft comes first');
  pages.closePage('g_1');
  assert.deepEqual(store.state.setPages, {});
  assert.equal(unsettled(store.state), false);
});

test('a suggestion goes in by reference: the frozen object the solver returned is the one stored', () => {
  const store = start();
  const pages = createSetPageActions(store);
  pages.openPage('g_1');
  const suggestion = Object.freeze({
    suggested: Object.freeze({ rows: Object.freeze(Array.from({ length: 100_000 }, (_, index) => Object.freeze({ index }))) }),
    declined: Object.freeze({ rows: Object.freeze([]), meal: false }),
  });
  pages.setSuggestion('g_1', suggestion);
  assert.equal(setPageOf(store.state, 'g_1').suggestion, suggestion);
  assert.equal(emptySetPage().suggestion, null);
});

test('routeOf: the screen as an address names it, for every screen the router formats', () => {
  const storage = fakeStorage() as unknown as Storage; // a stand-in with the methods the sheets' storage uses
  const sheet = sheetOf('SGE', [sageSet()], { id: 's_1', name: 'Bahamut' });
  saveSheet(sheet, storage);
  const store = createAppStore(restoreState(null) as RestoredState, readSheets(storage));
  const actions = createAppActions(store);
  const sheets = createSheetsActions(store, { storage });
  assert.equal(formatRoute(routeOf(store.state)), '#/sheets');
  sheets.openSheet('s_1');
  assert.deepEqual(routeOf(store.state), { tab: 'sheets', screen: 'sheet', sheetId: 's_1' });
  assert.equal(formatRoute(routeOf(store.state)), sheetHref('s_1'));
  const setId = currentSheet(store.state)?.sets[0].id ?? '';
  sheets.openSet(setId);
  assert.equal(formatRoute(routeOf(store.state)), sheetHref('s_1', setId));
  assert.deepEqual(parseRoute(sheetHref('s_1', setId)), { tab: 'sheets', screen: 'set', sheetId: 's_1', setId });
  sheets.showMissing('s_gone', null);
  assert.deepEqual(routeOf(store.state), { tab: 'sheets', screen: 'sheet', sheetId: 's_gone' });
  actions.showTab('gcd');
  assert.deepEqual(routeOf(store.state), { tab: 'math', mathTab: 'gcd' });
  actions.showTab('browse');
  assert.deepEqual(routeOf(store.state), { tab: 'browse' });
});

test('routeOf: a tab being opened counts as open', () => {
  const store = start({ tab: 'sheets' });
  store.state.screen.pendingTab = 'math';
  assert.deepEqual(routeOf(store.state), { tab: 'math', mathTab: 'piece' });
});
