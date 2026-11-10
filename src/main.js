/* Entry point: restore saved state, register the store and components, start Alpine. */
import Alpine from 'alpinejs';
import './styles.css';
import { restoreState, loadSaved, save } from './ui/state.js';
import { createAppStore } from './ui/store.js';
import { createSheetStore } from './ui/sheet-store.js';
import { storeNumberField } from './ui/helpers.js';
import { enableHqFont } from './ui/hq-font.js';
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

Alpine.store('app', createAppStore(restoreState(loadSaved())));
const app = Alpine.store('app');
// the saved sheets: one record each, written on their own edits (not part of the settings the effect below saves)
Alpine.store('sheets', createSheetStore());

/* x-bind="$num('piece.ilvl', 1, $store.app.maxReal)": number input bound to a store path, in-range values only (a bound
   that changes while bound is passed as a function: $num('level', 1, () => $store.app.jobCtx.maxLevel)); a fourth
   argument takes numberField's options, e.g. {live: true} to commit each valid value as typed, or {empty: ''} for a
   filter an emptied box clears (storeNumberField) */
Alpine.magic('num', () => (path, lo, hi, opts) => storeNumberField(app, path, lo, hi, opts));

/* The page's Web Worker for the searches (ui/solver.js workerSolver), made on the solver's first request: a set page
   asks for its Fill settings' Gear to search line as it opens, so the worker starts with the first set page. Started
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
Alpine.effect(() => {
  const t0 = performance.now();
  const json = JSON.stringify(app.persisted());
  performance.measure('save', { start: t0 }); // read by scripts/perf/browser.mjs
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => save(json), SAVE_DEBOUNCE_MS);
});

Alpine.start();
