/* Entry point: restore saved state, register the store and components, start Alpine. */
import Alpine from 'alpinejs';
import './styles.css';
import { restoreState, loadSaved, save } from './ui/state.js';
import { createAppStore } from './ui/store.js';
import { storeNumberField } from './ui/helpers.js';
import { page, settings } from './ui/components/page.js';
import { pieceLab } from './ui/components/piece-lab.js';
import { syncCaps } from './ui/components/sync-caps.js';
import { validationPanel } from './ui/components/validation-panel.js';
import { gear } from './ui/components/gear.js';
import { optimizer } from './ui/components/optimizer.js';

const SAVE_DEBOUNCE_MS = 150;

Alpine.store('app', createAppStore(restoreState(loadSaved())));
const app = Alpine.store('app');

/* x-bind="$num('piece.ilvl', 1, $store.app.maxReal)": number input bound to a store path, in-range values only (a bound
   that changes while bound is passed as a function: $num('level', 1, () => $store.app.jobCtx.maxLevel)) */
Alpine.magic('num', () => (path, lo, hi) => storeNumberField(app, path, lo, hi));

Object.entries({ page, settings, pieceLab, syncCaps, validationPanel, gear, optimizer }).forEach(([name, factory]) => {
  Alpine.data(name, factory);
});

/* Save whenever any persisted field changes. The effect tracks every field but the pool by serializing them (small),
   and the pool by poolVersion, which every pool change bumps (pool items are never edited in place): serializing a
   full pool takes ~40 ms (~280 ms on a 4x slower CPU), so it happens once, when the save runs, not on every change. */
let saveTimer = null;
Alpine.effect(() => {
  const { pool, ...rest } = app.persisted();
  JSON.stringify([rest, app.poolVersion, pool.length]);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const t0 = performance.now();
    const json = JSON.stringify(Alpine.raw(app).persisted());
    performance.measure('save', { start: t0 }); // read by scripts/perf/browser.py
    save(json);
  }, SAVE_DEBOUNCE_MS);
});

Alpine.start();
