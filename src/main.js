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

/* x-bind="$num('piece.ilvl', 1, $store.app.maxReal)": number input bound to a store path, in-range values only */
Alpine.magic('num', () => (path, lo, hi) => storeNumberField(app, path, lo, hi));

Object.entries({ page, settings, pieceLab, syncCaps, validationPanel, gear, optimizer }).forEach(([name, factory]) => {
  Alpine.data(name, factory);
});

/* Save whenever any persisted field changes (serializing reads, and so tracks, all of them). */
let saveTimer = null;
Alpine.effect(() => {
  const json = JSON.stringify(app.persisted());
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => save(json), SAVE_DEBOUNCE_MS);
});

Alpine.start();
