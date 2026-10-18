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
import { tierTable } from './ui/components/tiers.js';

const SAVE_DEBOUNCE_MS = 150;

Alpine.store('app', createAppStore(restoreState(loadSaved())));
const app = Alpine.store('app');

/* x-bind="$num('piece.ilvl', 1, $store.app.maxReal)": number input bound to a store path, in-range values only (a bound
   that changes while bound is passed as a function: $num('level', 1, () => $store.app.jobCtx.maxLevel)); a fourth
   argument {live: true} commits each valid value as typed (storeNumberField) */
Alpine.magic('num', () => (path, lo, hi, opts) => storeNumberField(app, path, lo, hi, opts));

Object.entries({ page, settings, syncExplainer, gear, optimizer, tierTable }).forEach(([name, factory]) => {
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
