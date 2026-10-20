/* Shared setup of the view builder tests (ui-views-*.test.js): store-shaped state with sync on at cap 123, and small
   real-gear pools whose best loadouts the brute force (exhaustive.js) can check. */
import { appState } from './common.js';
import { gamePool } from './exhaustive.js';

/* A store-shaped state object, as the Alpine store holds it; sync on at cap 123 unless `patch` says otherwise. Rank by
   tier off: these tests check the plain ranking against brute force and the core; tier ranking has its own tests. */
export const makeApp = (job = 'SGE', patch = {}) => {
  const app = appState({ job, sync: true, cap: 123 }, patch);
  if (!('opt' in patch)) app.opt.byTier = false;
  return app;
};

/* Real gear, chosen by properties, passed to the optimizer view in place of every piece the job can wear. A small item
   level window (with weapons) whose best loadouts exhaustive() can check; and item level 130 Sage gear (no weapon: Sage
   gear starts at level 70) keeping only Unique rings, which leaves exactly one ring, so the second ring slot stays
   empty. */
export const WINDOW = { ilvlMin: 125, ilvlMax: 135, lvlMax: 50 };
export const windowPool = job => gamePool(job, WINDOW);
export const uniqueRingPool = job => gamePool(job, { ilvlMin: 130, ilvlMax: 130, lvlMax: 50 }, r => r.type !== 'ring' || r.unique);
