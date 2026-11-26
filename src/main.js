/* Entry point: restore saved state, make the store, start the router and give the page's root element its ports. */
import 'styles:bundle'; // the stylesheet: src/styles/entry.css imports the files in cascade order
import { restoreState, loadSaved } from './ui/state.ts';
import { unsettled } from './ui/store/app-state.ts';
import { createPageStore, sealFacade } from './ui/store/page-store.ts';
import { startAutosave } from './ui/store/autosave.ts';
import { watch } from './ui/store/watch.ts';
import { defaultStorage } from './ui/sheets/storage.ts';
import { createRouter, windowPort } from './ui/router/router.ts';
import { DEFAULT_ROUTE, parseRoute } from './ui/router/routes.ts';
import { focusScreenHeading, isPlacingScroll } from './ui/router/focus.ts';
import { readScrollPositions, tabStorage, writeScrollPositions } from './ui/router/scroll-storage.ts';
import { installUnloadGuard } from './ui/router/unload-guard.ts';
import { overlays } from './ui/overlays.ts';
import { enableHqFont } from './ui/hq-font.ts';
// the Lit elements (each registers itself on import): the page's root, which draws the others
import './ui/elements/gear-browser/expansion-menu.ts';
import './ui/elements/gear-browser/gear-browser.ts';
import './ui/elements/gear-browser/gear-categories.ts';
import './ui/elements/gear-browser/slot-menu.ts';
import './ui/elements/math-page/bar-popover.ts';
import './ui/elements/math-page/gcd-controls.ts';
import './ui/elements/math-page/gcd-view.ts';
import './ui/elements/math-page/math-bar.ts';
import './ui/elements/math-page/math-screen.ts';
import './ui/elements/math-page/piece-stats.ts';
import './ui/elements/math-page/stat-note.ts';
import './ui/elements/math-page/tiers-controls.ts';
import './ui/elements/math-page/tiers-view.ts';
import './ui/elements/shared/dialog.ts';
import './ui/elements/shared/select.ts';
import './ui/elements/shared/collapsible.ts';
import './ui/elements/app/app-root.ts';
import './ui/elements/app/cap-field.ts';
import './ui/elements/app/job-menu.ts';
import './ui/elements/app/job-strip.ts';
import './ui/elements/app/level-field.ts';
import './ui/elements/app/notes.ts';
import './ui/elements/set-page/food-menu.ts';
import './ui/elements/sheets/sheet-dialog.ts';
import './ui/elements/sheets/sheet-manager.ts';
import './ui/elements/sheets/sheet-page.ts';
import './ui/elements/sheets/sheets-screen.ts';
import './ui/elements/sheets/switch-menu.ts';
import './ui/elements/set-page/materia-menu.ts';
import './ui/elements/set-page/piece-picker.ts';
import './ui/elements/set-page/rank-note.ts';
import './ui/elements/set-page/set-page.ts';
import './ui/elements/set-page/settings-popover.ts';
import { inProcessSolver, workerSolver } from './ui/solver.ts';
import { WORKER_DATA, WORKER_SOURCE } from 'solver-worker:bundle';

enableHqFont(document.fonts, document.documentElement);

// the screen the address names opens first (a bare or unknown address is the Sheets list): the tab and math view are not saved
const openRoute = parseRoute(location.hash) ?? DEFAULT_ROUTE;
/* The page's one store (ui/store/): the state, its actions and the two facades the elements read. An element follows the store
   (a `Select`) and draws again when the parts it is made from change. The saved sheets are one record each, written on their own
   edits (not part of the settings that autosave writes). */
const pageStore = createPageStore({ restored: restoreState(loadSaved(), openRoute) });
const { store } = pageStore;
const app = sealFacade(pageStore.app);
const sheets = sealFacade(pageStore.sheets);
/* Where the page is scrolled: {y, maxY (the furthest it can scroll now)}. */
function pageScroll() {
  return { y: scrollY, maxY: document.documentElement.scrollHeight - innerHeight };
}
/* Where each history entry was scrolled is kept over a reload in the tab's sessionStorage (ui/router/scroll-storage.ts). The router
   places the scroll of every Back, Forward and reload before the first frame of the screen. The browser's own restore would show its
   remembered position first, clamped to the screen still on show (a flicker), so it is off; set before the router starts. */
const tabScrollStorage = tabStorage();
history.scrollRestoration = 'manual';
// the address and the two stores follow each other (ui/router/): Back, Forward, reload and bookmarks work
const router = createRouter({
  app,
  sheets,
  port: windowPort(),
  watch: (select, callback) => watch(store, select, callback),
  setTitle: text => {
    document.title = text;
  },
  focusScreen: scrollY => focusScreenHeading({ scrollY, isPending: () => app.pendingTab !== null }),
  readScroll: pageScroll,
  savedScroll: readScrollPositions(tabScrollStorage),
  restoreScroll: scrollY => focusScreenHeading({ scrollY, focus: false, isPending: () => app.pendingTab !== null }),
  startAtTop: () => focusScreenHeading({ focus: false, once: true, isPending: () => app.pendingTab !== null }),
  isPlacing: isPlacingScroll,
});
router.start();
addEventListener('pagehide', () => writeScrollPositions(tabScrollStorage, router.scrollPositions()));
// a change of screen (tab, sub-tab, sheet, gear set, Back and Forward) closes every open menu and popover; the router owns the focus then
for (const screen of [
  state => state.screen.tab,
  state => state.screen.mathTab,
  state => state.sheets.sheetId,
  state => state.sheets.setId,
]) {
  watch(store, screen, () => overlays.closeAll());
}
addEventListener('popstate', () => overlays.closeAll());
// where the page is scrolled is kept for each history entry, so Back returns to it
addEventListener(
  'scroll',
  () => {
    const { y, maxY } = pageScroll();
    router.noteScroll(y, maxY);
  },
  { passive: true },
);

/* The page's Web Worker for the searches (ui/solver.ts workerSolver), made on the solver's first request: a set page
   asks for its Auto-fill settings' Gear to search line as it opens, so the worker starts with the first set page. Started
   from a Blob URL of its bundle (the page is one file, also opened from file://), then handed the data files' texts,
   which it parses on its own thread. Cancel starts a new one (workerSolver cancel), from the same URL; it is never
   revoked, since a worker may still be fetching it. */
let solverWorkerUrl = null;
function startSolverWorker() {
  solverWorkerUrl ??= URL.createObjectURL(new Blob([WORKER_SOURCE], { type: 'text/javascript' }));
  const worker = new Worker(solverWorkerUrl);
  worker.postMessage({ data: WORKER_DATA });
  return worker;
}
// searches in the worker, off the page's thread; on the page's thread when the browser will not run the worker
const solver = workerSolver(startSolverWorker, inProcessSolver);

/* What a set page (<gsa-set-page>, drawn by the Sheets screen) needs: the store, its Sheets facade, the solver and the highest
   real item level. Frozen. The solver comes from here, so the page's module loads without a page (its unit test). */
const setPagePorts = Object.freeze({
  store,
  sheets,
  solver,
  get maxReal() {
    return app.maxReal;
  },
});

// the page's root element (it draws the screens, which follow the store and read the facades themselves)
const root = document.querySelector('gsa-app');
root.ports = { store, app, sheets, setPagePorts };

/* Save the settings 150 ms after the last change and when the page is hidden (ui/store/autosave.ts). */
startAutosave(store);

// a reload or a closed tab asks first while a gear set's page holds a draft, a running Auto-fill or a waiting result: the store says
installUnloadGuard({ target: window, hasUnsettled: () => unsettled(store.state), storage: defaultStorage() });

/* The test hook (read-only, in every build): the two facades, the store's state and action log. Tests read the page's state here.
   `state` is the store's live state and `log` the names of its last 50 actions. */
const debugHook = {};
Object.defineProperties(debugHook, {
  app: { get: () => app, enumerable: true },
  sheets: { get: () => sheets, enumerable: true },
  state: { get: () => store.state, enumerable: true },
  log: { get: () => [...store.log], enumerable: true },
});
Object.defineProperty(window, 'gsaDebug', { value: Object.freeze(debugHook), enumerable: true });

/* The start marker the startup check reads (src/startup-failure.js): set once the root element and every element drawn inside it
   (the screens, even in a hidden tab, and what they draw at once) have drawn for the first time.
   A draw that throws rejects its element's `updateComplete`. The page reports that error itself with `reportError`, which tells the
   window's `error` listeners at once: the browser's own `unhandledrejection` event comes in a task of its own, which WebKit runs
   after the startup check's timer (Chromium and Firefox run it before), so the check would call the page started. A failed first draw
   sets no marker. */
async function drawnFirstTime(rootElement) {
  const seen = new Set();
  for (let pending = [rootElement]; pending.length > 0; ) {
    for (const element of pending) {
      seen.add(element);
    }
    await Promise.all(pending.map(element => element.updateComplete));
    // an element drawn by those draws is new: wait for it too (an element without `updateComplete` is not a Lit element)
    pending = [...rootElement.querySelectorAll('*')].filter(element => element.updateComplete && !seen.has(element));
  }
}
drawnFirstTime(root).then(
  () => {
    document.documentElement.dataset.started = '';
  },
  error => reportError(error),
);
