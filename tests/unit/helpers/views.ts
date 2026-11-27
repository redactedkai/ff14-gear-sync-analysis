/* Shared setup of the view builder and solve tests: store-shaped state with sync on at cap 123 and a set's recipe (its
   Auto-fill settings at their defaults, rank by tier off), small real-gear pools whose best loadouts the brute force
   (exhaustive.js) can check, a solve as a set page's Auto-fill asks for it (core/recipe.ts runRecipe, evaluated by
   core/set.ts evaluateSet), and the other tabs' builders called as their components call them. */
import { recipePool, runRecipe } from '../../../src/core/recipe.ts';
import { makeSession } from '../../../src/core/session.ts';
import { evaluateSet } from '../../../src/core/set.ts';
import { syncSettings } from '../../../src/ui/job-sync-panel.ts';
import { gearView } from '../../../src/ui/views/gear.ts';
import { pieceView } from '../../../src/ui/views/piece.ts';
import { searchCount } from '../../../src/ui/solve.ts';
import { explainerItemLevel, explainerView, meldKeys } from '../../../src/ui/views/sync-explainer.ts';
import { appState } from './common.ts';
import type { TestAppState } from './common.ts';
import { gamePool } from './exhaustive.js';
import type { Recipe, RecipeChoices, RecipeResult, Pins } from '../../../src/core/recipe.ts';
import type { JobContext, PoolItem, StatKey } from '../../../src/core/types.ts';
import type { SetEvaluation } from '../../../src/core/set.ts';

/* One solver session for every test that searches the job's own gear, as the page has one. */
export const testSession = makeSession();
/* The session for `gear`: a test's own pool gets a fresh session (its caches would not be keyed by the pool), else the
   shared one. */
const sessionFor = (gear?: readonly PoolItem[]) => (gear ? makeSession({ gear: () => gear }) : testSession);
/* The gear a solve for `job` searches: every piece the job can wear (the shared session's). */
export const gearOf = (job: JobContext) => testSession.gear(job);

/* The plain inputs of a solve for store-shaped `app`: {job, sync (syncSettings), level, recipe (a copy of app.recipe,
   lists copied)}. */
export function inputsOf(app: TestAppState): { job: JobContext; sync: ReturnType<typeof syncSettings>; level: number; recipe: Recipe } {
  const recipe: Recipe = { ...app.recipe, expOff: [...app.recipe.expOff] };
  if (app.recipe.exclude) {
    recipe.exclude = [...app.recipe.exclude];
  }
  return { job: app.jobCtx, sync: syncSettings(app), level: app.level, recipe };
}

/* What solveOf returns: the run, its set evaluated (null unless the run is ok) and the character panel's numbers. */
export interface Solved {
  run: RecipeResult;
  set: SetEvaluation | null;
  panel: (stat: StatKey) => number;
  gearPanel: (stat: StatKey) => number;
}

/* The solve of `app.recipe` searching `gear` (a test's pool) or every piece the job can wear, with `choices` ({pieces:
   {row: gameId}, meal}) and `pins` as runRecipe takes them. Returns {run (runRecipe's), set (its set evaluated, or null
   unless ok), panel(stat) (the character panel's number with food: gear, meal and base), gearPanel(stat) (without the
   meal)}. */
export function solveOf(app: TestAppState, gear?: readonly PoolItem[], choices: RecipeChoices = {}, pins: Pins | null = null): Solved {
  const { job, sync, level, recipe } = inputsOf(app);
  const run = runRecipe(job, sync, level, recipe, sessionFor(gear), choices, pins);
  const set = run.status === 'ok' ? evaluateSet(job, run.set, sync, level) : null;
  const evaluated = (): SetEvaluation => {
    if (!set) {
      throw new Error(`the solve found no set (${run.status})`);
    }
    return set;
  };
  return {
    run,
    set,
    panel: stat => (evaluated().withFood[stat] ?? 0) + evaluated().base[stat],
    gearPanel: stat => (evaluated().gear[stat] ?? 0) + evaluated().base[stat],
  };
}
/* The pool the solve searches for `app` (core/recipe.ts recipePool), from `gear` or the job's own. */
export const poolOf = (app: TestAppState, gear?: readonly PoolItem[]) => recipePool(app.jobCtx, app.recipe, gear ?? gearOf(app.jobCtx));
/* {searched, left} under Gear to search (solve.ts searchCount). */
export const countOf = (app: TestAppState, gear?: readonly PoolItem[]) => searchCount(app.jobCtx, app.recipe, gear ?? gearOf(app.jobCtx));

/* A store-shaped state object, as the page's state holds it, with a set's recipe; sync on at cap 123 unless `patch`
   says otherwise. Rank by tier off: these tests check the plain ranking against brute force and the core; tier
   ranking has its own tests. */
export const makeApp = (job = 'SGE', patch: Partial<TestAppState> = {}): TestAppState => {
  const app = appState({ job, sync: true, cap: 123 }, patch);
  if (!('recipe' in patch)) {
    app.recipe.byTier = false;
  }
  return app;
};

/* Real gear, chosen by properties, passed to the solve in place of every piece the job can wear. A small item level
   window (with weapons) whose best loadouts exhaustive() can check; and item level 130 Sage gear (no weapon: Sage gear
   starts at level 70) keeping only Unique rings, which leaves exactly one ring, so the second ring slot stays empty. */
export const WINDOW = { ilvlMin: 125, ilvlMax: 135, lvlMax: 50 };
export const windowPool = (job: JobContext) => gamePool(job, WINDOW);
export const uniqueRingPool = (job: JobContext) =>
  gamePool(job, { ilvlMin: 130, ilvlMax: 130, lvlMax: 50 }, row => row.type !== 'ring' || row.unique);

/* The other tabs' views for store-shaped `app`, with the inputs their components assemble from the store. */
export const gearViewOf = (app: TestAppState, page = 1) => gearView(app.jobCtx, syncSettings(app), app.browse, page);
export const pieceViewOf = (app: TestAppState, ilvl?: number) => pieceView(app.jobCtx, syncSettings(app), app.piece, ilvl);
export const explainerViewOf = (app: TestAppState, widths?: Parameters<typeof explainerView>[3]) =>
  explainerView(app.jobCtx, syncSettings(app), app.piece, widths);
export const explainerItemLevelOf = (app: TestAppState) => explainerItemLevel(app.jobCtx, syncSettings(app), app.piece);
export const meldKeysOf = (app: TestAppState) => meldKeys(app.piece.subs);
