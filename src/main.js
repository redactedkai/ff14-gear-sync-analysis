/* Entry point: restore saved state, register the store and components, start Alpine. */
import Alpine from 'alpinejs';
import './styles.css';
import { restoreState, loadSaved, save } from './ui/state.js';
import { createAppStore } from './ui/store.js';
import { storeNumberField } from './ui/helpers.js';
import { page, settings } from './ui/components/page.js';
import { syncExplainer } from './ui/components/sync-explainer.js';
import { gear } from './ui/components/gear.js';
import { optimizer } from './ui/components/optimizer.js';
import { mealMenu } from './ui/components/meal-menu.js';
import { tierControls, tierTable } from './ui/components/tiers.js';
import { gcdControls, gcdTab } from './ui/components/gcd.js';
import { inProcessSolver, workerSolver } from './ui/solver.js';
import { WORKER_DATA, WORKER_SOURCE } from 'solver-worker:bundle';

const SAVE_DEBOUNCE_MS = 150;

Alpine.store('app', createAppStore(restoreState(loadSaved())));
const app = Alpine.store('app');

/* x-bind="$num('piece.ilvl', 1, $store.app.maxReal)": number input bound to a store path, in-range values only (a bound
   that changes while bound is passed as a function: $num('level', 1, () => $store.app.jobCtx.maxLevel)); a fourth
   argument takes numberField's options, e.g. {live: true} to commit each valid value as typed, or {empty: ''} for a
   filter an emptied box clears (storeNumberField) */
Alpine.magic('num', () => (path, lo, hi, opts) => storeNumberField(app, path, lo, hi, opts));

/* The optimizer's Web Worker (ui/solver.js workerSolver), made when the optimizer first needs it: started from a Blob URL
   of its bundle (the page is one file, also opened from file://), then handed the data files' texts, which it parses
   on its own thread. Cancel starts a new one (workerSolver cancel), from the same URL; it is never revoked, since a
   worker may still be fetching it. */
let solverWorkerUrl = null;
function startSolverWorker() {
  solverWorkerUrl ??= URL.createObjectURL(new Blob([WORKER_SOURCE], { type: 'text/javascript' }));
  const worker = new Worker(solverWorkerUrl);
  worker.postMessage({ data: WORKER_DATA });
  return worker;
}
// searches off the page's thread; on the page's thread as before when the browser will not run the worker
const solver = workerSolver(startSolverWorker, inProcessSolver);

// the optimizer takes Alpine's effect and raw from here, so its module loads without a page (its unit test)
Object.entries({
  page,
  settings,
  syncExplainer,
  gear,
  optimizer: () => optimizer(Alpine, solver),
  mealMenu,
  tierTable,
  gcdTab,
  gcdControls,
  tierControls,
}).forEach(([name, factory]) => {
  Alpine.data(name, factory);
});

/* Save whenever any persisted field changes: the effect tracks every field by serializing them (small; the gear pool
   that once made this costly is gone), and the save runs once the changes settle. */
let saveTimer = null;
Alpine.effect(() => {
  const t0 = performance.now();
  const json = JSON.stringify(app.persisted());
  performance.measure('save', { start: t0 }); // read by scripts/perf/browser.mjs
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => save(json), SAVE_DEBOUNCE_MS);
});

Alpine.start();
