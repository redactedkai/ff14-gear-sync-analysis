/* Shared setup of the view builder tests (ui-views-*.test.js): store-shaped state with sync on at cap 123, small
   real-gear pools whose best loadouts the brute force (exhaustive.js) can check, and the optimizer's builders called
   as its component calls them: the plain inputs assembled from store-shaped state (ui/settings.js optimizerInputs). */
import { relicsLeftOut, recipePool } from '../../../src/core/recipe.js';
import { makeSession } from '../../../src/core/session.js';
import { optimizerInputs, recipeOf, syncSettings } from '../../../src/ui/settings.js';
import { gearView } from '../../../src/ui/views/gear.js';
import { optimizerView, searchCount } from '../../../src/ui/views/optimizer.js';
import { pieceView } from '../../../src/ui/views/piece.js';
import { explainerItemLevel, explainerView, meldKeys } from '../../../src/ui/views/sync-explainer.js';
import { appState } from './common.js';
import { gamePool } from './exhaustive.js';

/* One solver session for every test that searches the job's own gear, as the page has one. */
export const testSession = makeSession();
/* The session for `gear`: a test's own pool gets a fresh session (its caches would not be keyed by the pool), else the
   shared one. */
const sessionFor = gear => (gear ? makeSession({ gear: () => gear }) : testSession);
/* The gear a solve for `job` searches: every piece the job can wear (the shared session's). */
export const gearOf = job => testSession.gear(job);

/* The optimizer view for store-shaped `app`, searching `gear` (a test's pool) or every piece the job can wear;
   `pieces` ({row index: gameId}) and `meal` (an allMeals key) as the player's picks (optimizerView's choices). */
export function viewOf(app, gear, pieces = {}, meal = null) {
  const { job, sync, level, recipe } = optimizerInputs(app);
  return optimizerView(job, sync, level, recipe, sessionFor(gear), { pieces, meal });
}
/* The pool the optimizer searches for `app` (core/recipe.js recipePool), from `gear` or the job's own. */
export const poolOf = (app, gear) => recipePool(app.jobCtx, recipeOf(app), gear ?? gearOf(app.jobCtx));
/* {searched, left} under Gear to search (views/optimizer.js searchCount). */
export const countOf = (app, gear) => searchCount(app.jobCtx, recipeOf(app), gear ?? gearOf(app.jobCtx));
/* The relics with allocated substats left out (core/recipe.js relicsLeftOut). */
export const relicsOf = (app, gear) => relicsLeftOut(app.jobCtx, recipeOf(app), gear ?? gearOf(app.jobCtx));

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

/* The other tabs' views for store-shaped `app`, with the inputs their components assemble from the store. */
const goalOf = app => [app.opt.target, app.opt.tb, app.opt.tb2];
export const gearViewOf = (app, page = 1) => gearView(app.jobCtx, syncSettings(app), app.browse, page);
export const pieceViewOf = (app, ilvl) => pieceView(app.jobCtx, syncSettings(app), app.piece, ilvl);
export const explainerViewOf = (app, widths) => explainerView(app.jobCtx, syncSettings(app), app.piece, goalOf(app), widths);
export const explainerItemLevelOf = app => explainerItemLevel(app.jobCtx, syncSettings(app), app.piece);
export const meldKeysOf = app => meldKeys(app.jobCtx, goalOf(app), app.piece.subs);
