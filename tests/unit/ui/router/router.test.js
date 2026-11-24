/* The router (src/ui/router/router.js) over stand-ins: a history that delivers its moves when the test says so, the app store's
   open tab as plain fields, a real sheet store over a stand-in storage, and a watch that runs by hand. The sheet and set ids
   are the fixtures' ('s_1', 'g_1'). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRouter } from '../../../../src/ui/router/router.js';
import { DEFAULT_ROUTE, formatRoute, titleOf } from '../../../../src/ui/router/routes.js';
import { fakeStorage, sageSet, sheetOf } from '../../helpers/sheet-fixtures.js';
import { saveSheet } from '../../../../src/ui/sheets/storage.js';
import { restoreOpen } from '../../helpers/common.js';
import { createStores } from '../../helpers/stores.js';

/* A browser history: `entries` ({hash, state}), `at` (the current one). A move the page asks for (go) and one the player
   makes (back, forward, type) are delivered to the router's popstate listener when the test calls `deliver()`; a move past
   either end of the history goes nowhere, as in a browser, and a go(0) (which reloads a page) is an error. `start` is the
   state of the first entry (null: a page opened by a link). */
function fakeHistory(startHash = '', startState = null) {
  const history = {
    entries: [{ hash: startHash, state: startState }],
    at: 0,
    queue: [],
    listener: null,
    read: () => history.entries[history.at].hash,
    state: () => history.entries[history.at].state,
    length: () => history.entries.length,
    push(hash, entry) {
      history.entries.splice(history.at + 1, Infinity, { hash, state: entry });
      history.at += 1;
    },
    replace(hash, entry) {
      history.entries[history.at] = { hash, state: entry };
    },
    go(distance) {
      if (distance === 0) throw new Error('history.go(0) reloads the page');
      history.queue.push(distance);
    },
    onPop(callback) {
      history.listener = callback;
    },
    // the player's moves: Back and Forward by entries, a typed address as a new entry with no state
    jump: distance => history.queue.push(distance),
    back: () => history.queue.push(-1),
    forward: () => history.queue.push(1),
    type(hash) {
      history.entries.splice(history.at + 1, Infinity, { hash, state: null });
      history.at += 1;
      history.queue.push('typed');
    },
    /* Deliver the moves waiting: each moves `at` (a typed address already did) and tells the router. */
    deliver() {
      while (history.queue.length) {
        const move = history.queue.shift();
        if (move !== 'typed') {
          const target = history.at + move;
          if (target < 0 || target >= history.entries.length) continue;
          history.at = target;
        }
        const { hash, state } = history.entries[history.at];
        history.listener({ hash, state });
      }
    },
  };
  return history;
}

/* The page's real store (the state, the actions and the two facades the router reads) over the defaults, with the tab and math view
   open, the sheets over `storage`, and openTab opening at once (the real one waits for a painted frame). */
function fakeStores(storage, tab = 'sheets', mathTab = 'piece') {
  const stores = createStores(restoreOpen({ tab, mathTab }), { storage });
  stores.app.openTab = next => stores.app.showTab(next);
  return stores;
}

/* A watch that runs by hand: `fire()` re-reads every getter and calls the callback of those whose value changed. */
function fakeWatch() {
  const watches = [];
  return {
    watch(getter, callback) {
      watches.push({ getter, callback, last: getter() });
    },
    fire() {
      for (const w of watches) {
        const value = w.getter();
        if (value !== w.last) {
          w.last = value;
          w.callback(value);
        }
      }
    },
  };
}

/* The router started on `startHash`, over a store with the sheet 's_1' holding the gear set 'g_1' (and 'g_2'). `prepare(app)`
   sets the app's settings before the router starts (what the reader had saved). */
function setup(startHash = '', prepare = () => {}, routerOptions = {}, history = fakeHistory(startHash)) {
  const storage = fakeStorage();
  saveSheet(sheetOf('SGE', [sageSet(), sageSet({ id: 'g_2', name: 'Set 2' })], { name: 'Sage 123' }), storage);
  const { store, app, sheets } = fakeStores(storage);
  const clock = fakeWatch();
  prepare(app);
  const titles = [];
  const focused = [];
  const router = createRouter({
    app,
    sheets,
    port: history,
    watch: clock.watch,
    setTitle: text => titles.push(text),
    focusScreen: scrollY => focused.push(scrollY),
    ...routerOptions,
  });
  router.start();
  const hash = () => history.read();
  return { store, app, sheets, history, router, clock, titles, focused, hash, storage };
}

test('a bare address opens the Sheets list and becomes #/sheets', () => {
  const { hash, app, sheets } = setup('');
  assert.equal(hash(), formatRoute(DEFAULT_ROUTE));
  assert.deepEqual([app.tab, sheets.screen], ['sheets', 'sheets']);
});

test('an address that names nothing opens the Sheets list', () => {
  const { hash, sheets } = setup('#/nope/nothing');
  assert.equal(hash(), '#/sheets');
  assert.equal(sheets.screen, 'sheets');
});

test('the Gear browser and a math view open from their addresses; #/math becomes its first view', () => {
  const gear = setup('#/gear');
  assert.equal(gear.app.tab, 'browse');
  const math = setup('#/math/tiers');
  assert.deepEqual([math.app.tab, math.app.mathTab], ['math', 'tiers']);
  const bare = setup('#/math');
  assert.equal(bare.hash(), '#/math/piece');
  assert.equal(bare.app.mathTab, 'piece');
});

test('a set address opens the set page', () => {
  const { sheets, hash } = setup('#/sheets/s_1/sets/g_1');
  assert.deepEqual([sheets.screen, sheets.sheetId, sheets.setId], ['set', 's_1', 'g_1']);
  assert.equal(hash(), '#/sheets/s_1/sets/g_1');
});

test('a sheet or gear set that is not saved opens the not found screen and keeps its address', () => {
  const noSheet = setup('#/sheets/s_gone');
  assert.deepEqual(noSheet.sheets.missing, { sheetId: 's_gone', setId: null });
  assert.equal(noSheet.hash(), '#/sheets/s_gone');
  const noSet = setup('#/sheets/s_1/sets/g_gone');
  assert.deepEqual(noSet.sheets.missing, { sheetId: 's_1', setId: 'g_gone' });
  assert.equal(noSet.hash(), '#/sheets/s_1/sets/g_gone');
  assert.equal(noSet.titles.at(-1), titleOf({ tab: 'sheets', screen: 'set', sheetId: 's_1', setId: 'g_gone' }, { missing: true }));
});

test('opening screens pushes an entry for each; the address shows where the page is', () => {
  const { sheets, history, clock, hash } = setup('');
  sheets.openSheet('s_1');
  clock.fire();
  sheets.openSet('g_1');
  clock.fire();
  assert.deepEqual(
    history.entries.map(entry => entry.hash),
    ['#/sheets', '#/sheets/s_1', '#/sheets/s_1/sets/g_1'],
  );
  sheets.closeSet();
  clock.fire();
  assert.equal(hash(), '#/sheets/s_1');
  assert.equal(history.entries.length, 4);
});

test('a tab link pushes the tab; the Sheets tab returns to the screen it was left on', () => {
  const { app, sheets, history, clock, hash } = setup('');
  sheets.openSheet('s_1');
  clock.fire();
  app.openTab('browse');
  clock.fire();
  assert.equal(hash(), '#/gear');
  app.openTab('sheets');
  clock.fire();
  assert.equal(hash(), '#/sheets/s_1', 'the sheet stays open in the store, so its address comes back');
  assert.equal(history.entries.length, 4);
});

test('a tab being opened counts as open, so the address does not lag behind a click', () => {
  const { store, clock, hash } = setup('');
  store.update('screen/openTab', state => {
    state.screen.pendingTab = 'math';
  });
  clock.fire();
  assert.equal(hash(), '#/math/piece');
});

test('the address is not written when it already names the screen', () => {
  const { sheets, history, clock } = setup('');
  sheets.openManager();
  clock.fire();
  assert.equal(history.entries.length, 1);
});

test('deleting the open set replaces its dead address; Back does not return to it', () => {
  const { sheets, history, clock, hash } = setup('#/sheets/s_1/sets/g_1');
  assert.equal(sheets.deleteSet('g_1').ok, true);
  clock.fire();
  assert.equal(hash(), '#/sheets/s_1');
  assert.equal(history.entries.length, 1, 'replaced, not pushed');
});

test('leaving a not found address replaces it', () => {
  const { sheets, history, clock, hash } = setup('#/sheets/s_gone');
  sheets.openManager();
  clock.fire();
  assert.equal(hash(), '#/sheets');
  assert.equal(history.entries.length, 1);
});

test('Back and Forward open the screens they name and move the focus', () => {
  const { sheets, history, clock, focused } = setup('');
  sheets.openSheet('s_1');
  clock.fire();
  sheets.openSet('g_1');
  clock.fire();
  history.back();
  history.deliver();
  assert.deepEqual([sheets.screen, sheets.setId], ['sheet', null]);
  history.back();
  history.deliver();
  assert.equal(sheets.screen, 'sheets');
  history.forward();
  history.deliver();
  assert.equal(sheets.screen, 'sheet');
  assert.equal(focused.length, 3);
  clock.fire();
  assert.equal(history.entries.length, 3, 'following the browser writes no new entry');
});

test('Back from a tab to the Gear browser to a sheet page restores each tab and screen', () => {
  const { app, sheets, history, clock } = setup('');
  sheets.openSheet('s_1');
  clock.fire();
  app.openTab('browse');
  clock.fire();
  history.back();
  history.deliver();
  assert.equal(app.tab, 'sheets');
  assert.equal(sheets.screen, 'sheet');
});

test('a typed address with no counter opens its screen; an address that names nothing opens the Sheets list', () => {
  const { sheets, history, hash } = setup('');
  history.type('#/sheets/s_1');
  history.deliver();
  assert.equal(sheets.screen, 'sheet');
  history.type('#/math/gcd/extra');
  history.deliver();
  assert.equal(hash(), '#/sheets');
  assert.equal(sheets.screen, 'sheets');
});

test('a typed #/math is made #/math/piece', () => {
  const { history, hash, app } = setup('');
  history.type('#/math');
  history.deliver();
  assert.equal(hash(), '#/math/piece');
  assert.equal(app.tab, 'math');
});

/* The set page's leave guard: holds the move back and keeps it for the answer. */
function holdingGuard(sheets) {
  const state = { asked: 0, held: null };
  sheets.setLeaveGuard(move => {
    state.asked += 1;
    state.held = move;
    return true;
  });
  return state;
}

test('Back from a set page that holds a draft is undone; "leave" does the move again', () => {
  const { sheets, history, clock, hash } = setup('');
  sheets.openSheet('s_1');
  clock.fire();
  sheets.openSet('g_1');
  clock.fire();
  const guard = holdingGuard(sheets);
  history.back();
  history.deliver();
  assert.equal(guard.asked, 1);
  assert.equal(sheets.screen, 'set', 'the page stays where it was');
  assert.equal(hash(), '#/sheets/s_1/sets/g_1', 'the address is put back');
  assert.equal(history.at, 2);
  // the player answers "leave": the guard clears and the held move runs
  sheets.setLeaveGuard(null);
  guard.held();
  history.deliver();
  assert.equal(sheets.screen, 'sheet');
  assert.equal(hash(), '#/sheets/s_1');
  assert.equal(history.at, 1);
  clock.fire();
  assert.equal(history.entries.length, 3, 'no entry was added by the undo and the replay');
});

test('"keep editing" leaves the page and the address as they were', () => {
  const { sheets, history, clock, hash } = setup('');
  sheets.openSheet('s_1');
  clock.fire();
  sheets.openSet('g_1');
  clock.fire();
  const guard = holdingGuard(sheets);
  history.back();
  history.deliver();
  assert.ok(guard.held);
  clock.fire();
  assert.equal(sheets.screen, 'set');
  assert.equal(hash(), '#/sheets/s_1/sets/g_1');
  assert.equal(history.entries.length, 3);
});

test('a typed address off a set page that holds a draft is refused: the browser goes back, and "leave" goes to the typed entry', () => {
  const { sheets, history, clock, hash } = setup('');
  sheets.openSheet('s_1');
  clock.fire();
  sheets.openSet('g_1');
  clock.fire();
  const guard = holdingGuard(sheets);
  history.type('#/gear');
  history.deliver();
  assert.equal(guard.asked, 1);
  assert.equal(hash(), '#/sheets/s_1/sets/g_1');
  assert.equal(sheets.screen, 'set');
  assert.equal(history.at, 2, 'the browser is back on the set page');
  assert.equal(history.entries.length, 4, 'the typed entry is still ahead');
  sheets.setLeaveGuard(null);
  guard.held();
  history.deliver();
  assert.equal(hash(), '#/gear');
  assert.equal(history.at, 3);
  assert.equal(history.entries.length, 4, 'no entry was added by the undo and the replay');
});

test('"keep editing" after a typed address: the next Back is a Back, not a duplicate of the page', () => {
  const { sheets, history, clock, hash } = setup('');
  sheets.openSheet('s_1');
  clock.fire();
  sheets.openSet('g_1');
  clock.fire();
  const guard = holdingGuard(sheets);
  history.type('#/gear?job=WAR');
  history.deliver(); // refused; the player keeps editing
  assert.equal(history.at, 2);
  history.back();
  history.deliver();
  assert.equal(guard.asked, 2, 'Back asks again');
  sheets.setLeaveGuard(null);
  guard.held();
  history.deliver();
  assert.equal(hash(), '#/sheets/s_1', 'and leaves to the sheet page');
  assert.equal(history.at, 1);
});

test('a reload keeps the entries: Back from a set page with a draft is undone to the same entry', () => {
  // the page was loaded again on the set page; the entries were written by the page before, with their positions
  const entries = [
    { hash: '#/sheets', state: { id: 'a', pos: 0 } },
    { hash: '#/sheets/s_1', state: { id: 'b', pos: 1 } },
    { hash: '#/sheets/s_1/sets/g_1', state: { id: 'c', pos: 2 } },
  ];
  const history = fakeHistory();
  history.entries = entries;
  history.at = 2;
  const { sheets, hash } = setup('', undefined, undefined, history);
  assert.equal(sheets.screen, 'set');
  const guard = holdingGuard(sheets);
  history.back();
  history.deliver();
  assert.equal(guard.asked, 1);
  assert.equal(history.at, 2, 'back on the set page');
  assert.equal(hash(), '#/sheets/s_1/sets/g_1');
  assert.deepEqual(history.entries[2].state, { id: 'c', pos: 2 }, 'the entry keeps its state');
  sheets.setLeaveGuard(null);
  guard.held();
  history.deliver();
  assert.equal(history.at, 1);
  assert.equal(hash(), '#/sheets/s_1');
});

test('history that branched: a jump of two entries over a held move is undone by two', () => {
  const { sheets, history, clock, hash } = setup('');
  sheets.openSheet('s_1');
  clock.fire();
  sheets.openSet('g_1');
  clock.fire();
  history.back();
  history.back();
  history.deliver(); // the list again; the entries ahead go when the page pushes
  sheets.openSheet('s_1');
  clock.fire();
  sheets.openSet('g_1');
  clock.fire();
  assert.equal(history.at, 2);
  const guard = holdingGuard(sheets);
  history.jump(-2);
  history.deliver();
  assert.equal(guard.asked, 1);
  assert.equal(history.at, 2, 'the browser went back by the same two');
  assert.equal(hash(), '#/sheets/s_1/sets/g_1');
  sheets.setLeaveGuard(null);
  guard.held();
  history.deliver();
  assert.equal(history.at, 0);
  assert.equal(hash(), '#/sheets');
});

test('two Backs in one task over a held move end on the entry the page shows', () => {
  const { sheets, history, clock, hash } = setup('');
  sheets.openSheet('s_1');
  clock.fire();
  sheets.openSet('g_1');
  clock.fire();
  const guard = holdingGuard(sheets);
  history.back();
  history.back();
  history.deliver();
  assert.equal(sheets.screen, 'set');
  assert.equal(history.at, 2);
  assert.equal(hash(), '#/sheets/s_1/sets/g_1');
  // the player answers "leave": the move the question was about (the first Back) is made
  sheets.setLeaveGuard(null);
  guard.held();
  history.deliver();
  assert.equal(sheets.screen, 'sheet');
  assert.equal(history.at, 1);
  assert.equal(hash(), '#/sheets/s_1');
});

test('a screen left by a typed address keeps its own scroll position', () => {
  const { sheets, history, clock, router, focused } = setup('');
  sheets.openSheet('s_1');
  clock.fire();
  sheets.openSet('g_1');
  clock.fire();
  router.noteScroll(400, 1000);
  history.type('#/sheets/s_1/sets/g_2');
  history.deliver();
  assert.equal(sheets.setId, 'g_2');
  router.noteScroll(0, 1000);
  history.back();
  history.deliver();
  assert.equal(sheets.setId, 'g_1');
  assert.equal(focused.at(-1), 400);
});

test('a link of the same page that is a typed entry becomes an entry of the router at once', () => {
  const { history } = setup('');
  history.type('#/sheets/s_1');
  history.deliver();
  const state = history.entries[history.at].state;
  assert.equal(typeof state.id, 'string');
  assert.equal(state.pos, history.at);
});

test('a reload of an entry the router wrote keeps the saved settings and rewrites the address to them', () => {
  const history = fakeHistory('#/gear?job=SGE&sort=det&min=700', { id: 'own', pos: 0 });
  const { app, hash } = setup(
    '',
    page => {
      page.browse.sort = 'dh';
      page.browse.type = 'ring';
    },
    {},
    history,
  );
  assert.equal(app.browse.sort, 'dh', "not the address's");
  assert.equal(app.browse.min, '');
  assert.equal(hash(), '#/gear?slot=ring&sort=dh');
});

test('a search text waiting for its pause goes into the entry when a tab link leaves it', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { app, history, clock } = setup('#/gear');
  app.editBrowse({ q: 'Moon' });
  clock.fire();
  assert.equal(history.entries[0].hash, '#/gear');
  app.openTab('sheets');
  clock.fire();
  assert.equal(history.entries[0].hash, '#/gear?q=Moon', 'the entry that was left has the text');
  assert.equal(history.entries.length, 2);
});

test('a search text waiting for its pause is kept for the entry when Back leaves it, and used when the page returns', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { app, history, clock, hash } = setup('#/sheets');
  app.openTab('browse');
  clock.fire();
  app.editBrowse({ q: 'Moon' });
  clock.fire();
  history.back();
  history.deliver();
  assert.equal(app.tab, 'sheets');
  t.mock.timers.tick(1000);
  history.forward();
  history.deliver();
  assert.equal(app.tab, 'browse');
  assert.equal(app.browse.q, 'Moon');
  assert.equal(hash(), '#/gear?q=Moon');
});

test('changes of settings are written at most once in the cooldown, and the last one always is', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { app, history, clock, hash } = setup('#/gear');
  let writes = 0;
  const replace = history.replace;
  history.replace = (...args) => {
    writes += 1;
    replace(...args);
  };
  for (let min = 1; min <= 250; min += 1) {
    app.editBrowse({ min });
    clock.fire();
    t.mock.timers.tick(5);
  }
  t.mock.timers.tick(200);
  assert.ok(writes <= 14, `${writes} writes for 250 changes in 1.25 s`);
  assert.equal(hash(), '#/gear?min=250', 'the address ends at the last value');
});
test('the page title follows the screen and the names the player gave', () => {
  const { sheets, clock, titles } = setup('');
  assert.equal(titles.at(-1), titleOf(DEFAULT_ROUTE));
  sheets.openSheet('s_1');
  sheets.openSet('g_2');
  clock.fire();
  assert.equal(titles.at(-1), titleOf({ tab: 'sheets', screen: 'set', sheetId: 's_1', setId: 'g_2' }, { sheet: 'Sage 123', set: 'Set 2' }));
});

test('Back and Forward return to where the page was scrolled on each screen', () => {
  const { sheets, history, clock, router, focused } = setup('');
  router.noteScroll(40); // the list, scrolled
  sheets.openSheet('s_1');
  clock.fire();
  router.noteScroll(300); // the sheet page, scrolled
  history.back();
  history.deliver();
  assert.equal(focused.at(-1), 40);
  history.forward();
  history.deliver();
  assert.equal(focused.at(-1), 300);
  history.type('#/gear'); // an entry the router did not make has no scroll to return to
  history.deliver();
  assert.equal(focused.at(-1), 0);
});

test('a scroll the browser makes because the page got shorter is not remembered as where the player left it', () => {
  const { sheets, history, clock, router, focused } = setup('');
  router.noteScroll(300, 900); // the player scrolled the list to 300
  router.noteScroll(0, 0); // the screen is changing: the page is shorter and the browser holds the position to its end
  sheets.openSheet('s_1');
  clock.fire();
  history.back();
  history.deliver();
  assert.equal(focused.at(-1), 300);
  // the player scrolling back to the top of a long page is remembered
  router.noteScroll(0, 900);
  history.forward();
  history.deliver();
  history.back();
  history.deliver();
  assert.equal(focused.at(-1), 0);
});

test('the scroll events of a placement and of the browser clamping a page are not remembered as where an entry was left', () => {
  let placing = false;
  const placed = [];
  const { sheets, history, clock, router } = setup('', undefined, {
    isPlacing: () => placing,
    focusScreen: scrollY => {
      placed.push(scrollY);
      placing = true; // the page starts to be put at the position
    },
  });
  sheets.openSheet('s_1');
  clock.fire();
  router.noteScroll(393, 800); // the player scrolled the sheet page
  history.back(); // to the list, left at the top
  history.deliver();
  assert.equal(placed.at(-1), 0);
  router.noteScroll(214, 214); // the browser clamps the position to the end of the list: its scroll event comes after the move
  history.forward(); // a quick second move, before the page is placed
  history.deliver();
  assert.equal(placed.at(-1), 393);
  router.noteScroll(214, 214);
  history.back();
  history.deliver();
  assert.equal(placed.at(-1), 0, 'the list is still left at the top, not where the browser clamped it');

  // once the page is placed, the player's scrolling is remembered again
  placing = false;
  router.noteScroll(120, 214);
  history.forward();
  history.deliver();
  history.back();
  history.deliver();
  assert.equal(placed.at(-1), 120);
});

/* ---- the settings an address names (query.js): applied when a link opens, written back as they change ---- */

test('a link with a query applies its settings, takes the defaults for the names it leaves out, and is rewritten as the settings', () => {
  const { app, hash } = setup('#/gear?sort=det&min=700&colour=red', page => {
    page.browse.q = 'saved search';
    page.browse.dir = 'asc';
    page.browse.type = 'ring';
  });
  assert.equal(app.browse.sort, 'det');
  assert.equal(app.browse.min, 700);
  assert.equal(app.browse.q, '', "the reader's own search is not kept: a link with a query is the whole description");
  assert.equal(app.browse.dir, 'desc');
  assert.equal(app.browse.type, 'any');
  assert.equal(hash(), '#/gear?min=700&sort=det', 'an unknown name is dropped and the names take their order');
});

test("a link with no query keeps the reader's settings and the address stays bare", () => {
  const { app, hash } = setup('#/gear', page => {
    page.browse.sort = 'det';
  });
  assert.equal(app.browse.sort, 'det');
  assert.equal(hash(), '#/gear');
});

test("a change of settings replaces the address's query and adds no history entry", t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { app, history, clock, hash } = setup('#/gear');
  const entries = history.entries.length;
  app.editBrowse({ sort: 'det' });
  clock.fire();
  assert.equal(hash(), '#/gear?sort=det');
  t.mock.timers.tick(100); // a write is followed by a short cooldown
  app.editBrowse({ type: 'ring' });
  app.editBrowse({ market: false });
  clock.fire();
  assert.equal(hash(), '#/gear?slot=ring&market=0&sort=det');
  t.mock.timers.tick(100);
  app.editBrowse({ sort: 'ilvl' });
  app.editBrowse({ type: 'any' });
  app.editBrowse({ market: true });
  clock.fire();
  assert.equal(hash(), '#/gear', 'every setting back at its default: no query');
  assert.equal(history.entries.length, entries);
});

test('a change of the search text waits until typing pauses; another change writes it at once', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { app, clock, hash } = setup('#/gear');
  app.editBrowse({ q: 'M' });
  clock.fire();
  app.editBrowse({ q: 'Moon' });
  clock.fire();
  assert.equal(hash(), '#/gear', 'still typing');
  t.mock.timers.tick(300);
  app.editBrowse({ q: 'Moon St' });
  clock.fire();
  t.mock.timers.tick(300);
  assert.equal(hash(), '#/gear', 'each key starts the pause again');
  t.mock.timers.tick(150);
  assert.equal(hash(), '#/gear?q=Moon%20St');
  // a filter changed while text waits takes the text with it
  t.mock.timers.tick(100);
  app.editBrowse({ q: 'Moon Staff' });
  clock.fire();
  assert.equal(hash(), '#/gear?q=Moon%20St');
  app.editBrowse({ sort: 'det' });
  clock.fire();
  assert.equal(hash(), '#/gear?q=Moon%20Staff&sort=det');
  t.mock.timers.tick(1000);
  assert.equal(hash(), '#/gear?q=Moon%20Staff&sort=det', 'the waiting write was dropped');
});

test('a tab link to the Gear browser pushes its address with the settings it holds', () => {
  const { app, clock, hash, history } = setup('', page => {
    page.browse.sort = 'dh';
  });
  app.openTab('browse');
  clock.fire();
  assert.equal(hash(), '#/gear?sort=dh');
  assert.equal(history.entries.length, 2);
});

test('a typed link on the open screen applies its settings; a typed link to another screen applies them as it opens it', () => {
  const { app, history, hash } = setup('#/gear');
  history.type('#/gear?slot=ring&sort=det');
  history.deliver();
  assert.deepEqual([app.browse.type, app.browse.sort], ['ring', 'det']);
  assert.equal(hash(), '#/gear?slot=ring&sort=det');
  history.type('#/math/gcd?haste=SAM&speed=300&gcdlevel=90');
  history.deliver();
  assert.equal(app.tab, 'math');
  assert.deepEqual({ ...app.gcd }, { level: 90, haste: 'SAM', speed: 300 });
  assert.equal(hash(), '#/math/gcd?gcdlevel=90&haste=SAM&speed=300');
});

test('each math view has its own settings: Stat Allocation and Substat tiers', () => {
  const piece = setup('#/math/piece?slot=ear&item=710&subs=det&meld=1');
  assert.equal(piece.app.piece.slot, 'ear');
  assert.deepEqual([piece.app.piece.ilvl, piece.app.piece.subs, piece.app.piece.slots], [710, ['det', null], 1]);
  assert.equal(piece.hash(), '#/math/piece?slot=ear&item=710&subs=det&meld=1');
  const tiers = setup('#/math/tiers?tierlevel=90');
  assert.equal(tiers.app.tiers.level, 90);
  assert.equal(tiers.hash(), '#/math/tiers?tierlevel=90');
  tiers.app.setTiersLevel(null);
  tiers.clock.fire();
  assert.equal(tiers.hash(), '#/math/tiers');
});

test('Back and Forward move between screens, not settings: the page keeps its settings and the address follows them', () => {
  const { app, history, clock, hash } = setup('#/gear?sort=det');
  app.openTab('sheets');
  clock.fire();
  app.editBrowse({ sort: 'dh' }); // changed while another screen is open: the entry of the Gear browser still says det
  history.back();
  history.deliver();
  assert.equal(app.browse.sort, 'dh');
  assert.equal(hash(), '#/gear?sort=dh', 'the entry is rewritten to the settings');
  // a typed address is a link: its settings are applied
  history.type('#/gear?sort=det');
  history.deliver();
  assert.equal(app.browse.sort, 'det');
});

test('the Sheets screens take no settings from a query', () => {
  const { app, hash, sheets } = setup('#/sheets/s_1?sort=det&slot=ring');
  assert.equal(sheets.screen, 'sheet');
  assert.equal(app.browse.sort, 'ilvl');
  assert.equal(hash(), '#/sheets/s_1', 'the address is the sheet without the query');
});

test('a link with settings that leaves a set page that holds a draft waits for the answer before it applies them', () => {
  const { app, sheets, history, clock, hash } = setup('');
  sheets.openSheet('s_1');
  clock.fire();
  sheets.openSet('g_1');
  clock.fire();
  const guard = holdingGuard(sheets);
  history.type('#/gear?sort=det');
  history.deliver();
  assert.equal(guard.asked, 1);
  assert.equal(app.browse.sort, 'ilvl', 'not applied yet');
  assert.equal(hash(), '#/sheets/s_1/sets/g_1');
  sheets.setLeaveGuard(null);
  guard.held();
  history.deliver();
  assert.equal(app.browse.sort, 'det');
  assert.equal(hash(), '#/gear?sort=det');
});

test('the screen the page leaves keeps the scroll position read as the next screen is pushed, however late its scroll event comes', () => {
  const scrolled = { y: 400, maxY: 800 };
  const { sheets, history, clock, router, focused } = setup('', undefined, { readScroll: () => scrolled });
  sheets.openSheet('s_1'); // pushed while the list is scrolled to 400
  clock.fire();
  router.noteScroll(0, 0); // the scroll event of the list comes after the push, when the page was already shorter
  history.back();
  history.deliver();
  assert.deepEqual(focused, [400]);
});

test('a link names the job, level and item level sync of the tab; what it leaves out is the default, not what the reader had', () => {
  const { app, hash } = setup('#/gear?job=SGE&level=90&il=123&slot=ring');
  assert.deepEqual([app.job, app.level, app.sync, app.cap], ['SGE', 90, true, 123]);
  assert.equal(app.jobCtx.jobId, 'SGE');
  assert.equal(app.browse.type, 'ring');
  assert.equal(hash(), '#/gear?job=SGE&level=90&il=123&slot=ring');
  // the reader had sync on and a cap: a link with no il is sync off, and the held cap is not a setting of the link
  const second = setup('#/gear?job=WAR', page => {
    page.editPanel({ sync: true, cap: 600, level: 70 }, 'browse'); // the Gear browser's own panel, as saved
  });
  assert.deepEqual(
    [second.app.job, second.app.level, second.app.sync, second.app.cap],
    ['WAR', 100, false, 600],
    'sync off; the cap the reader held stays',
  );
});

test('a link to a tab that is not open sets the panel of that tab and leaves the open tab alone', () => {
  const { app, history, hash } = setup('#/sheets');
  app.editPanel({ job: 'DRK' }, 'math');
  history.type('#/gear?job=SGE&il=123');
  history.deliver();
  assert.equal(app.tab, 'browse');
  assert.deepEqual([app.job, app.sync, app.cap], ['SGE', true, 123], 'the panel of the Gear browser is the open one now');
  assert.equal(app.panel('math').job, 'DRK', 'the math panel is not touched');
  assert.equal(hash(), '#/gear?job=SGE&il=123');
});

test('a link that changes the job of Stat Allocation keeps its settings valid for the job', () => {
  const { app } = setup('#/math/piece?job=WAR');
  assert.equal(app.panel('math').job, 'WAR');
  assert.deepEqual(app.piece.subs, ['crit', 'sks'], 'Spell Speed of a healer is Skill Speed on a tank');
  assert.equal(app.panel('browse').job, 'PLD', 'the Gear browser keeps its own job');
  assert.equal(app.panel('tiers').job, 'PLD', 'and so does Substat tiers');
});

test('Substat tiers has its own job and level in its address; Stat Allocation and the Gear browser are left alone', () => {
  const { app, hash } = setup('#/math/tiers?job=WAR&tierlevel=70');
  assert.equal(app.tiers.job, 'WAR');
  assert.equal(app.tiers.level, 70);
  assert.equal(app.panel('math').job, 'PLD', 'the Stat Allocation job is not touched');
  assert.equal(app.panel('browse').job, 'PLD');
  assert.equal(hash(), '#/math/tiers?job=WAR&tierlevel=70');
  // there is no item level sync on Substat tiers: il and level are not its names
  const ignored = setup('#/math/tiers?job=SGE&il=123&level=90');
  assert.equal(ignored.app.tiers.job, 'SGE');
  assert.equal(ignored.hash(), '#/math/tiers?job=SGE');
});

test('GCD Scaling has no job in its address: a job in it is ignored', () => {
  const { app, hash } = setup('#/math/gcd?job=WAR&il=123&haste=SAM');
  assert.equal(app.panel('math').job, 'PLD');
  assert.equal(app.panel('math').sync, false);
  assert.equal(app.gcd.haste, 'SAM');
  assert.equal(hash(), '#/math/gcd?haste=SAM');
});

test('the address follows the panel: a job, a level and the item level sync switch', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { app, clock, hash, history } = setup('#/gear');
  const entries = history.entries.length;
  app.setJob('SGE');
  clock.fire();
  assert.equal(hash(), '#/gear?job=SGE');
  t.mock.timers.tick(100);
  app.editPanel({ level: 90 });
  app.editPanel({ cap: 123 });
  app.editPanel({ sync: true });
  clock.fire();
  assert.equal(hash(), '#/gear?job=SGE&level=90&il=123');
  t.mock.timers.tick(100);
  app.editPanel({ sync: false }); // the cap stays held, and is no setting
  clock.fire();
  assert.equal(hash(), '#/gear?job=SGE&level=90');
  assert.equal(history.entries.length, entries);
});

test('sync on with no cap yet is an empty il, and opens as sync on', () => {
  const first = setup('#/gear?job=SGE');
  first.app.editPanel({ sync: true });
  first.clock.fire();
  assert.equal(first.hash(), '#/gear?job=SGE&il=');
  const again = setup('#/gear?job=SGE&il=');
  assert.deepEqual([again.app.sync, again.app.cap], [true, null]);
});

test('a reload of an entry scrolled before restores its scroll; the positions are kept for the next reload', () => {
  const restored = [];
  const history = fakeHistory('#/sheets/s_1', { id: 'own', pos: 0 });
  const { router } = setup(
    '',
    undefined,
    {
      savedScroll: { own: 320, other: 90 },
      restoreScroll: y => restored.push(y),
    },
    history,
  );
  assert.deepEqual(restored, [320]);
  assert.deepEqual(router.scrollPositions(), { own: 320, other: 90 });
  router.noteScroll(500, 1000);
  assert.equal(router.scrollPositions().own, 500);
});

test('an entry the router has not seen scrolled, and a first load, restore nothing', () => {
  const restored = [];
  setup(
    '',
    undefined,
    { savedScroll: { elsewhere: 200 }, restoreScroll: y => restored.push(y) },
    fakeHistory('#/sheets/s_1', { id: 'own', pos: 0 }),
  );
  setup('', undefined, {
    savedScroll: { own: 200 },
    restoreScroll: y => restored.push(y),
  });
  assert.deepEqual(restored, []);
});
