/* Auto-fill (runRecipe) when the pool arrives in another order: the order of the session's gear is the only thing that
   changes (a seeded shuffle of the job's real pieces), the sync, level and recipe stay.
   - What the search ranks (the goal and tiebreaks with food, by tier when asked, the GCD when asked) is the same set of
     numbers in every order: a result must not depend on how the data happens to be sorted.
   - Where one set beats every other on the ranked stats (the top gear with no sync), the same pieces and stones are chosen
     in every order, not only the same totals.
   Where several sets tie on the ranked stats, the stats nobody ranked are free, so two orders may show different pieces
   (and a tie of equal pieces, like two rings with the same stats, item level and equip level, is broken by the pool's
   order: same-result.ts keeps "the optimizer's own pick on a tie"). That is not asserted here; recipe.ties.test.js
   shows it on three real cases. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeJobContext } from '../../../src/core/job-context.ts';
import { jobGear } from '../../../src/core/items.ts';
import { runRecipe } from '../../../src/core/recipe.ts';
import { makeSession } from '../../../src/core/session.ts';
import { syncSettings } from '../../../src/ui/job-sync-panel.ts';
import { defaultFillSettings, fillRecipe } from '../../../src/ui/sheets/fill-settings.ts';
import { rankedOf, setKey, shuffled } from '../helpers/recipe-sets.js';

const ORDER_SEEDS = [11, 222, 3333]; // the pool orders tried besides the database's own

/* Solves `recipe` for `jobId` under `cap` and `level` with the job's gear in the database's order and in each seeded order.
   Returns [{label, result}] (the first is the database's order); fails the test when a solve is not ok. */
function solveInEveryOrder(jobId, cap, level, change) {
  const job = makeJobContext(jobId);
  const sync = syncSettings({ cap, sync: cap != null, level });
  const recipe = { ...fillRecipe(defaultFillSettings(job)), ...change(job) };
  const gear = jobGear(job);
  const orders = [['database order', gear], ...ORDER_SEEDS.map(seed => [`order ${seed}`, shuffled(gear, seed)])];
  const solved = orders.map(([label, pool]) => {
    const result = runRecipe(job, sync, level, recipe, makeSession({ gear: () => pool }));
    assert.equal(result.status, 'ok', `${jobId} cap ${cap}, ${label}: ${result.status}`);
    return { label, result };
  });
  return { job, sync, level, recipe, solved };
}

/* Goals with ties on purpose (no tiebreak, a stat that sync caps, tier ranking, food, melds, a Target GCD), over roles and
   sync settings. A GCD of 2.50 or faster is reachable for every job at these levels. */
const RANKED_CASES = [
  ['SGE', 123, 50, () => ({ tb: '', byTier: false, melds: false, food: false })],
  ['PLD', 660, 90, () => ({ target: 'crit', tb: 'det', byTier: true, melds: true, food: true })],
  ['BRD', 123, 50, () => ({ target: 'crit', tb: 'det', tb2: 'dh', byTier: false, melds: true, food: true })],
  ['DRG', 475, 80, () => ({ target: 'det', tb: 'crit', byTier: true, melds: false, food: false })],
  ['WHM', 123, 50, job => ({ target: job.speedKey, tb: 'crit', byTier: false, melds: true, food: true })],
  ['BLM', 660, 90, () => ({ tb: 'crit', byTier: false, melds: true, food: false, gcd: '2.50', gcdMode: 'min' })],
  ['WAR', 290, 60, () => ({ tb: 'det', byTier: true, melds: true, food: true, gcd: '2.50', gcdMode: 'min' })],
];

test('the ranked totals of an Auto-fill do not depend on the order of the pool', () => {
  for (const [jobId, cap, level, change] of RANKED_CASES) {
    const { job, sync, level: synced, recipe, solved } = solveInEveryOrder(jobId, cap, level, change);
    const [first, ...others] = solved;
    const want = rankedOf(job, first.result.set, sync, synced, recipe);
    for (const other of others) {
      assert.equal(
        rankedOf(job, other.result.set, sync, synced, recipe),
        want,
        `${jobId} cap ${cap} ${JSON.stringify(recipe)}: ${other.label} ranks differently from the ${first.label}`,
      );
    }
  }
});

/* Top gear with no sync, where one set has the most of the goal and its tiebreaks: SGE and BRD with melds and food, DRG
   without. */
const SINGLE_OPTIMUM_CASES = [
  ['SGE', null, 100, () => ({ tb: '', byTier: false, melds: true, food: true })],
  ['SGE', null, 100, () => ({ tb: 'crit', byTier: true, melds: true, food: true })],
  ['DRG', null, 100, () => ({ tb: 'crit', byTier: false, melds: false, food: true })],
];

test('the same pieces and stones are chosen in every pool order where one set is best', () => {
  for (const [jobId, cap, level, change] of SINGLE_OPTIMUM_CASES) {
    const { recipe, solved } = solveInEveryOrder(jobId, cap, level, change);
    const [first, ...others] = solved;
    for (const other of others) {
      assert.equal(
        setKey(other.result.set),
        setKey(first.result.set),
        `${jobId} ${JSON.stringify(recipe)}: ${other.label} shows other pieces, stones or meal than the ${first.label}`,
      );
    }
  }
});
