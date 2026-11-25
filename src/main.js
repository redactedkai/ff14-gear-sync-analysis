/* Entry point: restore saved state, register the store and components, start Alpine. */
import Alpine from 'alpinejs';
import 'styles:bundle'; // the stylesheet: src/styles/entry.css imports the files in cascade order
import { restoreState, loadSaved } from './ui/state.js';
import { unsettled } from './ui/store/app-state.ts';
import { createPageStore, sealFacade } from './ui/store/page-store.ts';
import { startAutosave } from './ui/store/autosave.ts';
import { watch } from './ui/store/watch.ts';
import { defaultStorage } from './ui/sheets/storage.js';
import { createRouter, windowPort } from './ui/router/router.js';
import { DEFAULT_ROUTE, parseRoute } from './ui/router/routes.js';
import { focusScreenHeading, isPlacingScroll } from './ui/router/focus.js';
import { readScrollPositions, tabStorage, writeScrollPositions } from './ui/router/scroll-storage.js';
import { installUnloadGuard } from './ui/router/unload-guard.js';
import { storeNumberField } from './ui/number-field.js';
import { modalDirective } from './ui/native-dialog.js';
import { overlays } from './ui/overlays.js';
import { enableHqFont } from './ui/hq-font.js';
// the Lit elements (each registers itself on import); the page's templates hold them as islands
import './ui/elements/gear-browser/expansion-menu.ts';
import './ui/elements/gear-browser/gear-categories.ts';
import './ui/elements/gear-browser/slot-menu.ts';
import './ui/elements/math-page/bar-popover.ts';
import './ui/elements/math-page/stat-note.ts';
import './ui/elements/shared/dialog.ts';
import './ui/elements/shared/collapsible.ts';
import './ui/elements/app/notes.ts';
import { page, settings } from './ui/components/page.js';
import { syncExplainer } from './ui/components/sync-explainer.js';
import { gear } from './ui/components/gear.js';
import { mealMenu } from './ui/components/meal-menu.js';
import { tierControls, tierTable } from './ui/components/tiers.js';
import { gcdControls, gcdTab } from './ui/components/gcd.js';
import { sheetsTab } from './ui/components/sheets.js';
import { setPage } from './ui/components/set-page.js';
import { inProcessSolver, workerSolver } from './ui/solver.js';
import { WORKER_DATA, WORKER_SOURCE } from 'solver-worker:bundle';

enableHqFont(document.fonts, document.documentElement);

// the screen the address names opens first (a bare or unknown address is the Sheets list): the tab and math view are not saved
const openRoute = parseRoute(location.hash) ?? DEFAULT_ROUTE;
/* The page's one store (ui/store/): the state, its actions and the two facades the templates read. Alpine tracks the revision of each
   slice (Alpine.reactive), so a template that reads a facade runs again when an action changes the slice it read. The saved sheets
   are one record each, written on their own edits (not part of the settings that autosave writes). */
const pageStore = createPageStore({ restored: restoreState(loadSaved(), openRoute), track: revisions => Alpine.reactive(revisions) });
const { store } = pageStore;
Alpine.store('app', sealFacade(pageStore.app));
Alpine.store('sheets', sealFacade(pageStore.sheets));
const app = Alpine.store('app');
const sheets = Alpine.store('sheets');
/* Where the page is scrolled: {y, maxY (the furthest it can scroll now)}. */
function pageScroll() {
  return { y: scrollY, maxY: document.documentElement.scrollHeight - innerHeight };
}
/* Where each history entry was scrolled is kept over a reload in the tab's sessionStorage (ui/router/scroll-storage.js). The router
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

/* x-bind="$num('piece.ilvl', 1, $store.app.maxReal)": number input bound to a store path, in-range values only (a bound
   that changes while bound is passed as a function: $num('level', 1, () => $store.app.jobCtx.maxLevel)); a fourth
   argument takes numberField's options, e.g. {live: true} to commit each valid value as typed, or {empty: ''} for a
   filter an emptied box clears (storeNumberField) */
Alpine.directive('modal', modalDirective);
Alpine.magic('num', () => (path, lo, hi, opts) => storeNumberField(app, path, lo, hi, opts));

/* The page's Web Worker for the searches (ui/solver.js workerSolver), made on the solver's first request: a set page
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

// the set page takes the solver from here, so its module loads without a page (its unit test)
Object.entries({
  page,
  settings,
  syncExplainer,
  gear,
  mealMenu,
  tierTable,
  gcdTab,
  gcdControls,
  tierControls,
  sheetsTab,
  setPage: () => setPage(solver),
}).forEach(([name, factory]) => {
  Alpine.data(name, factory);
});

/* Save the settings 150 ms after the last change and when the page is hidden (ui/store/autosave.ts). */
startAutosave(store);

// a reload or a closed tab asks first while a gear set's page holds a draft, a running Auto-fill or a waiting result: the store says
installUnloadGuard({ target: window, hasUnsettled: () => unsettled(store.state), storage: defaultStorage() });

Alpine.start();

/* The test hook (read-only, in every build): the two facades, the store's state and action log, and `scope(selector)`, the data of the Alpine component on the
   first element that matches (a component's own fields, such as the Gear browser's `view`). Tests read the page's state
   here instead of Alpine's private fields. `state` is the store's live state and `log` the names of its last 50 actions. */
const debugHook = {};
Object.defineProperties(debugHook, {
  app: { get: () => app, enumerable: true },
  sheets: { get: () => sheets, enumerable: true },
  state: { get: () => store.state, enumerable: true },
  log: { get: () => [...store.log], enumerable: true },
  scope: { value: selector => Alpine.$data(document.querySelector(selector)), enumerable: true },
});
Object.defineProperty(window, 'gsaDebug', { value: Object.freeze(debugHook), enumerable: true });

// the start marker the startup check reads (src/startup-failure.js): set only once Alpine.start() has returned
document.documentElement.dataset.started = '';
