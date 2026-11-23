/* The router: keeps the browser's address and the page's two stores in step, so the Back and Forward buttons, reload and
   bookmarks work. The addresses are routes.js's. The stores stay the one place that says which screen is drawn: the router
   follows them and moves them, it never draws.

   Two directions:
   - Stores to address: when the open tab, math view, sheet or set changes, the new screen's address is pushed as a
     history entry. It replaces the current entry instead when that one names a sheet or set that is gone (a deleted
     set's page, a "not found" address), so Back never returns to a dead address. A change of settings on the same screen
     replaces the entry's query. The address is not written when it already names the screen.
   - Address to stores: Back, Forward, a typed address or a link opens the screen the address names through the stores'
     own actions, so the set page's leave guard (sheets/store.js askLeave) asks first when a draft, a running Auto-fill or a
     waiting result would be lost.

   History entries: every entry the router writes carries a state {id, pos}: `id` is unique to the entry (it keys the scroll
   position kept for the entry) and `pos` is where the entry sits in the browser's history, counted from the first entry. The
   browser can move any number of entries at once and the state of the entry it arrives at says where that is, so the router
   always knows how far it moved; two entries are as far apart as their positions differ (a limit on the history's length drops
   the oldest entries and moves every position alike). An entry that is not the router's (a typed address, a link) has no
   state: it is a new entry just after the one the page was on, and the router gives it a state at once.

   Refusing a move the browser has already made: when the guard holds a Back, Forward or typed address back, the address is
   already the new one. The router moves the browser back to the entry the page shows (history.go by the difference of
   positions) and, if the player answers "leave", opens the screen and moves the browser to the entry again. While it moves
   the page is settling: the stores' changes write no address until the browser arrives (the address is not the screen's
   yet). A further move that comes in meanwhile is refused the same way, so the browser always ends on the entry the page
   shows.

   Settings in the address: an entry the router wrote (a reload of it, Back, Forward) moves between screens, not between
   settings: the page keeps the settings it has and the address follows them. An entry with no state (a typed address, a link
   opened in the page, a link opened in a new tab) names its settings, which the page applies and saves. History pushState and
   replaceState fire no popstate or hashchange event (tested on file:// in Chromium and Firefox), so the router's own writes
   never come back to it.

   The browser is reached through a `port` ({read, state, length, push, replace, go, onPop}; windowPort below), so Node tests
   drive the router with a stand-in history. */
import { queryViewOf, readJobQuery, readPanelQuery, readQuery, writePanelQuery, writeQuery } from './query.js';
import { DEFAULT_ROUTE, formatRoute, parseRoute, samePath, titleOf } from './routes.js';

/* A fresh id for a history entry: unique among the entries of every load of the page. */
let idCount = 0;
function newEntryId() {
  idCount += 1;
  return `${Date.now().toString(36)}${idCount.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/* Whether `state` is the state of an entry the router wrote: {id (text), pos (a whole number)}. */
function isEntry(state) {
  return !!state && typeof state.id === 'string' && Number.isInteger(state.pos);
}

/* The browser's history as the router needs it, over `win` (the window). `read()`: the address's hash. `state()`: the state
   of the entry the page is on. `length()`: how many entries the history holds. `push(hash, entry)` and `replace(hash, entry)`
   write an address with the entry's state. `go(distance)`: move in history. `onPop(callback)`: `callback({hash, state})` after
   each move the browser makes (Back, Forward, a typed address, a link), with the state of the entry it arrived at (null for
   an entry the router did not make). A write the browser refuses (a limit on how often history may change, a sandboxed
   frame) is ignored: the page works without an address. */
export function windowPort(win = window) {
  const safely = action => {
    try {
      action();
    } catch {
      /* the address stays as it was */
    }
  };
  return {
    read: () => win.location.hash,
    state: () => win.history.state,
    length: () => win.history.length,
    push: (hash, entry) => safely(() => win.history.pushState(entry, '', hash)),
    replace: (hash, entry) => safely(() => win.history.replaceState(entry, '', hash)),
    go: distance => safely(() => win.history.go(distance)),
    onPop: callback => win.addEventListener('popstate', event => callback({ hash: win.location.hash, state: event.state })),
  };
}

/* How long the router waits for the browser to arrive at an entry it asked for before it stops settling (ms): a move that
   never arrives (an entry that is gone). */
const SETTLE_MS = 1000;

/* How long the search text must rest before the address takes it (ms): the address is rewritten once typing pauses, not on
   every key. */
const QUERY_PAUSE_MS = 400;

/* The least time between two writes of an address's query (ms): a browser limits how often history may change (Firefox:
   about 200 changes in 10 seconds), and a number box spun fast changes a setting every few milliseconds. A change that comes
   within it is written when it ends. */
const WRITE_COOLDOWN_MS = 100;

/* The router over the app store `app`, the sheets store `sheets`, a history `port` and `watch(getter, callback)` (Alpine's
   watch: calls `callback(value)` after `getter()` changes; the getter's reads are what it watches). `setTitle(text)` sets the
   page title as the screen changes (routes.js titleOf); `focusScreen(scrollY)` moves the focus to the new screen after a Back or
   Forward (a click already places the focus where the player acted) and scrolls to where the player left that screen (`scrollY`,
   0 for an entry the router has not seen scrolled); the page reports its scrolling with `noteScroll(y)`, and `readScroll()`
   gives {y, maxY} where it is scrolled now (null: unknown), read as the router pushes a screen so the screen it leaves keeps
   the position it had however late the scroll event comes. The page lets the router place the scroll (history.scrollRestoration
   is 'manual'), so a reload would lose its place: `savedScroll` ({entry id: y}, from `scrollPositions()` of the page before the
   reload) seeds the positions, and `restoreScroll(y)` scrolls to the one of the entry the reload is on (no focus move).
   Returns {start, noteScroll, scrollPositions, routeFromStores, applyRoute}: `start()` reads the address, opens its screen and
   begins following the stores and the browser; `scrollPositions()` gives {entry id: y} for every entry scrolled; `routeFromStores`
   and `applyRoute` are for tests. */
export function createRouter({
  app,
  sheets,
  port,
  watch,
  setTitle = () => {},
  focusScreen = () => {},
  readScroll = () => null,
  savedScroll = {},
  restoreScroll = () => {},
}) {
  // the entry the browser is on, and the entry whose screen the stores show (they differ while a held move is undone)
  let at = null;
  let shown = null;
  // a move the leave guard holds, {entry, route, hash}, or null; the player's answer "leave" before the browser is back
  // on the shown entry waits for it (leaveWhenSettled)
  let pending = null;
  let leaveWhenSettled = false;
  // the router moved the browser (history.go) and waits for it to arrive; the address to write on the entry it arrives at
  let settling = false;
  let settleTimer = null;
  let canonicalAfter = null;
  // writes of the settings to the address: the route being written, the timer of a search text waiting for its pause, the
  // cooldown between two writes and whether a change came during it
  let pendingRoute = null;
  let pauseTimer = null;
  let coolTimer = null;
  let dirty = false;
  // how far the page was scrolled on each entry the router made, by entry id (kept while the page is open)
  const scrollByEntry = new Map(Object.entries(savedScroll));

  /* The router moved the browser: until it arrives the stores' changes write no address. */
  function startSettling() {
    settling = true;
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      settling = false;
      leaveWhenSettled = false;
    }, SETTLE_MS);
    settleTimer.unref?.();
  }

  /* The browser arrived at the entry the page shows. */
  function endSettling() {
    settling = false;
    clearTimeout(settleTimer);
    if (canonicalAfter !== null) {
      if (port.read() !== canonicalAfter) port.replace(canonicalAfter, at);
      canonicalAfter = null;
    }
    if (leaveWhenSettled) {
      leaveWhenSettled = false;
      leave();
    }
  }

  /* The store's own settings object for the view of `route` (the Gear browser or a math view). */
  function settingsOf(route) {
    return { gear: app.browse, piece: app.piece, gcd: app.gcd, tiers: app.tiers }[queryViewOf(route)];
  }

  /* The settings the stores hold for `route`'s view, as a query ({name: text}, only what differs from the defaults): for the Gear
     browser and Stat Allocation the tab's Job and sync panel, then the view's own settings; Substat tiers holds its own job
     with its level; GCD Scaling has no job. */
  function paramsFor(route) {
    const view = queryViewOf(route);
    if (view === 'tiers') return writeQuery(view, app.tiers, app.panel('tiers').jobCtx);
    if (view === 'gcd') return writeQuery(view, app.gcd, null);
    const panel = app.panel(route.tab);
    return { ...writePanelQuery(panel), ...writeQuery(view, settingsOf(route), panel.jobCtx) };
  }

  /* Put the settings `route.params` names into the stores, through the checks a saved setting passes (query.js): for the Gear
     browser and Stat Allocation the tab's Job and sync panel, then the view's settings; Substat tiers takes its job
     (setTiersJob) and level; GCD Scaling its level, haste and speed. All of them are set; a name the query leaves out is its
     default. The view's settings are read for the job and level the link names. */
  function applyParams(route) {
    const view = queryViewOf(route);
    if (view === 'tiers') {
      const job = readJobQuery(route.params);
      const settings = readQuery(view, route.params, job, job.maxLevel);
      app.setTiersJob(settings.job);
      Object.assign(app.tiers, settings);
    } else if (view === 'gcd') {
      Object.assign(app.gcd, readQuery(view, route.params, null, app.panel('math').level));
    } else {
      const panel = readPanelQuery(route.params, app.panel(route.tab).cap);
      const settings = readQuery(view, route.params, panel.jobCtx, panel.level);
      app.setPanel(route.tab, panel);
      Object.assign(settingsOf(route), settings);
    }
  }

  /* `route` as the stores show it now: a query the address wrote is replaced by the settings the stores hold (the unknown names,
     the defaults and the order are gone). A route with no query stays as it is, unless `follow` (the address is the page's own:
     an entry the router wrote): then the Gear browser's and the math views' routes always take the settings the stores hold. */
  function canonicalOf(route, { follow = false } = {}) {
    const hasSettings = route.tab === 'browse' || route.tab === 'math';
    return hasSettings && (route.params || follow) ? { ...route, params: paramsFor(route) } : route;
  }

  /* The route the stores show now. A tab being opened counts as open (pendingTab), so the address does not lag behind a
     click; a sheet or set the address named that is not saved counts as open too ("not found" keeps its address). The
     Gear browser's and the math views' routes carry the settings the stores hold, as a query. */
  function routeFromStores() {
    const tab = app.pendingTab ?? app.tab;
    if (tab === 'browse') return { tab, params: paramsFor({ tab }) };
    if (tab === 'math') return { tab, mathTab: app.mathTab, params: paramsFor({ tab, mathTab: app.mathTab }) };
    const { screen, sheetId, setId, missing } = sheets;
    if (missing)
      return missing.setId
        ? { tab, screen: 'set', sheetId: missing.sheetId, setId: missing.setId }
        : { tab, screen: 'sheet', sheetId: missing.sheetId };
    if (screen === 'set') return { tab, screen, sheetId, setId };
    if (screen === 'sheet') return { tab, screen, sheetId };
    return { ...DEFAULT_ROUTE };
  }

  /* The page title of the screen the stores show: the screen's name, and the sheet's and gear set's names the address names. */
  function titleFromStores() {
    const route = routeFromStores();
    const sheet = route.sheetId ? sheets.sheet(route.sheetId) : null;
    const set = sheet && route.setId ? sheet.sets.find(gearSet => gearSet.id === route.setId) : null;
    return titleOf(route, { sheet: sheet?.name ?? null, set: set?.name ?? null, missing: route.tab === 'sheets' && !!sheets.missing });
  }

  /* Whether `route` names a sheet or set that is not saved (a "dead" address): the next move away from it replaces it. */
  function isDead(route) {
    if (route.tab !== 'sheets' || (route.screen !== 'sheet' && route.screen !== 'set')) return false;
    const sheet = sheets.sheet(route.sheetId);
    if (!sheet) return true;
    return route.screen === 'set' && !sheet.sets.some(gearSet => gearSet.id === route.setId);
  }

  /* Open the sheet or set `route` names (a route with screen 'sheet' or 'set'), read fresh from storage; a sheet or set
     that is not saved opens the "not found" screen instead. The stores' own actions ask the leave guard first when they
     leave a set page. */
  function openSheetsRoute(route) {
    sheets.reload();
    const sheet = sheets.sheet(route.sheetId);
    if (!sheet) return sheets.showMissing(route.sheetId, null);
    if (route.screen === 'sheet') return sheets.openSheet(route.sheetId);
    if (!sheet.sets.some(gearSet => gearSet.id === route.setId)) return sheets.showMissing(route.sheetId, route.setId);
    sheets.openSheet(route.sheetId);
    return sheets.openSet(route.setId);
  }

  /* Put the screen `route` names into the stores, and the settings its query names unless `withParams` is false (before the
     tab opens, so the tab is built once). `atStart`: the page is being built, so the tab opens at once (no loading line)
     instead of after a painted frame. */
  function applyRoute(route, { atStart = false, withParams = true } = {}) {
    if (route.tab === 'sheets') {
      if (route.screen === 'sheets') sheets.openManager();
      else openSheetsRoute(route);
    } else if (route.tab === 'math') {
      app.showSub(route.mathTab);
    }
    if (withParams && route.params) applyParams(route);
    if (route.tab !== (app.pendingTab ?? app.tab)) {
      if (atStart) app.showTab(route.tab);
      else app.openTab(route.tab);
    }
  }

  /* ---- stores to address ---- */

  /* A change of the stores' screen or settings: write its address. A new screen pushes an entry; a dead address is replaced;
     new settings on the same screen replace the entry's query (a change of settings never adds an entry). */
  function onStoresChanged() {
    if (settling) return;
    const route = routeFromStores();
    const hash = formatRoute(route);
    const here = parseRoute(port.read());
    if (here && formatRoute(here) === hash) {
      dropWrites();
    } else if (here && isDead(here)) {
      dropWrites();
      port.replace(hash, at);
    } else if (here && samePath(here, route)) {
      writeSettings(route, here);
    } else {
      pushScreen(hash);
    }
  }

  /* A new screen: its address becomes a new entry after the one the page is on. What the entry being left was waiting to
     write (a search text) goes into it first, and where it is scrolled is kept for it. */
  function pushScreen(hash) {
    flushWrites();
    const scrolledTo = readScroll();
    if (scrolledTo) noteScroll(scrolledTo.y, scrolledTo.maxY);
    const entry = { id: newEntryId(), pos: at.pos + 1 };
    port.push(hash, entry);
    at = entry;
    shown = entry;
  }

  /* The settings of the screen `here` (its address's route) changed to those of `route`: replace the address's query. A change
     of the search text alone waits until typing pauses (QUERY_PAUSE_MS); any other change writes at once, with the search
     text as it is (WRITE_COOLDOWN_MS apart at the most). */
  function writeSettings(route, here) {
    const withoutSearch = params => JSON.stringify(Object.entries(params ?? {}).filter(([name]) => name !== 'q'));
    pendingRoute = route;
    clearTimeout(pauseTimer);
    pauseTimer = null;
    if (withoutSearch(here.params) === withoutSearch(route.params)) {
      pauseTimer = setTimeout(() => {
        pauseTimer = null;
        writeLatest();
      }, QUERY_PAUSE_MS);
      pauseTimer.unref?.();
    } else {
      writeLatest();
    }
  }

  /* Write the settings the stores hold now to the address, unless a write was made a moment ago: then it is written when the
     cooldown ends. */
  function writeLatest() {
    if (coolTimer !== null) {
      dirty = true;
      return;
    }
    const latest = routeFromStores();
    const here = parseRoute(port.read());
    if (here && samePath(here, latest)) port.replace(formatRoute(latest), at);
    coolTimer = setTimeout(() => {
      coolTimer = null;
      if (dirty) {
        dirty = false;
        writeLatest();
      }
    }, WRITE_COOLDOWN_MS);
    coolTimer.unref?.();
  }

  /* Drop writes that are waiting: the address already names the settings, or is about to change for another reason. */
  function dropWrites() {
    clearTimeout(pauseTimer);
    pauseTimer = null;
    dirty = false;
  }

  /* Write what is waiting (a search text, a change in the cooldown) to the entry the browser is on, now. Returns the address
     written, or null when nothing waited. */
  function flushWrites() {
    if (pauseTimer === null && !dirty) return null;
    const hash = formatRoute(pendingRoute);
    dropWrites();
    port.replace(hash, at);
    return hash;
  }

  /* ---- address to stores ---- */

  /* The browser moved (Back, Forward, a typed address, a link) to an entry: `state` is its state, null for an entry the router
     did not make (its query is settings to apply). */
  function onPop({ hash, state }) {
    const from = at;
    const own = isEntry(state);
    let entry = state;
    if (!own) {
      // a typed address or a link: a new entry just after the one the page was on, which gets its state at once
      entry = { id: newEntryId(), pos: from.pos + 1 };
      port.replace(hash, entry);
    }
    at = entry;

    // the browser arrived at the entry the page shows (an undo, or the move after "leave")
    if (entry.id === shown.id) {
      endSettling();
      return;
    }

    // the router is still moving the browser: an entry it passes on the way (or a further Back made meanwhile) is not a move of
    // the player's to ask about; the browser goes on to the entry the page shows
    if (settling) {
      goTo(shown);
      return;
    }

    // an address that names nothing is the home address
    const route = parseRoute(hash) ?? { ...DEFAULT_ROUTE };
    dropWrites();

    // the screen that is open: the query of a link is settings to apply; an entry of the router's keeps the settings the page has.
    // The address takes the form of the settings
    if (samePath(route, routeFromStores())) {
      pending = null;
      if (!own && route.params) applyParams(route);
      const canonical = formatRoute(canonicalOf(route, { follow: own }));
      if (hash !== canonical) port.replace(canonical, entry);
      shown = entry;
      return;
    }

    // leaving a set page that holds something: the guard asks; the browser goes back to the shown entry until the player answers
    if (app.tab === 'sheets' && sheets.askLeave(() => leave())) {
      pending = { entry, route, hash, own };
      startSettling();
      goTo(shown);
      return;
    }
    openEntry({ entry, route, hash, own });
  }

  /* The move the page makes once nothing is held back: open the screen the entry names, and make the address its own form. The
     browser is on the entry. */
  function openEntry({ entry, route, hash, own }) {
    applyRoute(route, { withParams: !own });
    const canonical = formatRoute(canonicalOf(route, { follow: own }));
    if (hash !== canonical) port.replace(canonical, entry);
    shown = entry;
    focusScreen(scrollByEntry.get(entry.id) ?? 0);
  }

  /* The player answered "leave": open the screen of the held move, then move the browser to its entry. */
  function leave() {
    if (!pending) return;
    if (settling) {
      leaveWhenSettled = true;
      return;
    }
    const { entry, route, hash, own } = pending;
    pending = null;
    applyRoute(route, { withParams: !own });
    const canonical = formatRoute(canonicalOf(route, { follow: own }));
    shown = entry;
    focusScreen(scrollByEntry.get(entry.id) ?? 0);
    const distance = entry.pos - at.pos;
    if (distance === 0) {
      if (hash !== canonical) port.replace(canonical, at);
      return;
    }
    canonicalAfter = canonical;
    startSettling();
    goTo(entry);
  }

  /* Move the browser from the entry it is on to `entry`. Never history.go(0), which reloads the page. */
  function goTo(entry) {
    const distance = entry.pos - at.pos;
    if (distance === 0) {
      endSettling();
      return;
    }
    port.go(distance);
  }

  /* Read the address, open its screen, make the address the router's own entry, then follow the stores and the browser. An
     address the router wrote in an earlier load (a reload) is the page's own: the saved settings stand and the address follows
     them. Any other address is a link: the settings it names are applied. */
  function start() {
    const stored = port.state();
    const own = isEntry(stored);
    at = own ? stored : { id: newEntryId(), pos: Math.max(0, port.length() - 1) };
    shown = at;
    const route = parseRoute(port.read()) ?? { ...DEFAULT_ROUTE };
    applyRoute(route, { atStart: true, withParams: !own });
    port.replace(formatRoute(canonicalOf(route, { follow: own })), at);
    // a reload: the browser no longer puts the page back where it was, so the router does
    if (own && scrollByEntry.has(at.id)) restoreScroll(scrollByEntry.get(at.id));
    port.onPop(onPop);
    watch(() => formatRoute(routeFromStores()), onStoresChanged);
    setTitle(titleFromStores());
    watch(titleFromStores, setTitle);
  }

  /* The page scrolled to `y` (`maxY`: the furthest it can scroll now): remembered for the entry the page is on, so Back and Forward
     return to it. A scroll up that ends at the very end of the page is the browser holding the position to a page that has just
     become shorter (the screen is changing), not the player scrolling: it is left out. */
  function noteScroll(y, maxY = Number.POSITIVE_INFINITY) {
    if (at === null) return;
    const before = scrollByEntry.get(at.id) ?? 0;
    if (y < before && y >= maxY - 1) return;
    scrollByEntry.set(at.id, y);
  }

  return { start, routeFromStores, applyRoute, noteScroll, scrollPositions: () => Object.fromEntries(scrollByEntry) };
}
