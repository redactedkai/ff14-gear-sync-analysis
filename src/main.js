/* Entry point: restore saved state, register the store and components, start Alpine. */
import Alpine from 'alpinejs';
import 'styles:bundle'; // the stylesheet: src/styles/entry.css imports the files in cascade order
import { restoreState, loadSaved, save } from './ui/state.js';
import { createAppStore } from './ui/store.js';
import { createSheetStore } from './ui/sheets/store.js';
import { createRouter, windowPort } from './ui/router/router.js';
import { DEFAULT_ROUTE, parseRoute } from './ui/router/routes.js';
import { focusScreenHeading } from './ui/router/focus.js';
import { storeNumberField } from './ui/number-field.js';
import { notes } from './ui/messages.js';
import { modalDirective } from './ui/native-dialog.js';
import { overlays } from './ui/overlays.js';
import { enableHqFont } from './ui/hq-font.js';
import { menuScope } from './ui/components/overlay.js';
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

const SAVE_DEBOUNCE_MS = 150;

enableHqFont(document.fonts, document.documentElement);

// the screen the address names opens first (a bare or unknown address is the Sheets list): the tab and math view are not saved
const openRoute = parseRoute(location.hash) ?? DEFAULT_ROUTE;
Alpine.store('app', createAppStore(restoreState(loadSaved(), openRoute)));
const app = Alpine.store('app');
// the saved sheets: one record each, written on their own edits (not part of the settings the effect below saves)
Alpine.store('sheets', createSheetStore());
/* Where the page is scrolled: {y, maxY (the furthest it can scroll now)}. */
function pageScroll() {
  return { y: scrollY, maxY: document.documentElement.scrollHeight - innerHeight };
}
// the address and the two stores follow each other (ui/router/): Back, Forward, reload and bookmarks work
const router = createRouter({
  app,
  sheets: Alpine.store('sheets'),
  port: windowPort(),
  watch: Alpine.watch,
  setTitle: text => {
    document.title = text;
  },
  focusScreen: scrollY => focusScreenHeading({ scrollY, isPending: () => app.pendingTab !== null }),
  readScroll: pageScroll,
});
router.start();
// a change of screen (tab, sub-tab, sheet, gear set, Back and Forward) closes every open menu and popover; the router owns the focus then
for (const screen of [() => app.tab, () => app.mathTab, () => Alpine.store('sheets').sheetId, () => Alpine.store('sheets').setId]) {
  Alpine.watch(screen, () => overlays.closeAll());
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

// the set page takes Alpine (raw) and the solver from here, so its module loads without a page (its unit test)
Object.entries({
  page,
  settings,
  menuScope,
  notes,
  syncExplainer,
  gear,
  mealMenu,
  tierTable,
  gcdTab,
  gcdControls,
  tierControls,
  sheetsTab,
  setPage: () => setPage(Alpine, solver),
}).forEach(([name, factory]) => {
  Alpine.data(name, factory);
});

/* Save whenever any persisted field changes: the effect tracks every field by serializing them (settings only, so it
   is cheap; scripts/perf/browser.mjs times it as 'save'), and the save runs SAVE_DEBOUNCE_MS after the last change. */
let saveTimer = null;
let unsavedJson = null;
Alpine.effect(() => {
  const t0 = performance.now();
  const json = JSON.stringify(app.persisted());
  performance.measure('save', { start: t0 }); // read by scripts/perf/browser.mjs
  clearTimeout(saveTimer);
  unsavedJson = json;
  saveTimer = setTimeout(() => {
    unsavedJson = null;
    save(json);
  }, SAVE_DEBOUNCE_MS);
});
// a reload or a closed tab within the debounce does not lose the last change (a link opened and the page reloaded at once)
addEventListener('pagehide', () => {
  if (unsavedJson !== null) save(unsavedJson);
});

Alpine.start();

/* The test hook (read-only, in every build): the two stores, and `scope(selector)`, the data of the Alpine component on the
   first element that matches (a component's own fields, such as the Gear browser's `view`). Tests read the page's state
   here instead of Alpine's private fields. */
const debugHook = {};
Object.defineProperties(debugHook, {
  app: { get: () => app, enumerable: true },
  sheets: { get: () => Alpine.store('sheets'), enumerable: true },
  scope: { value: selector => Alpine.$data(document.querySelector(selector)), enumerable: true },
});
Object.defineProperty(window, 'gsaDebug', { value: Object.freeze(debugHook), enumerable: true });

// the start marker the startup check reads (src/startup-failure.js): set only once Alpine.start() has returned
document.documentElement.dataset.started = '';
