/* Auto-fill round trips on real gear (runRecipe, the set page's search), random jobs, sync settings, goals and recipes from a
   fixed seed: the same input gives the same set; pinning every piece and the meal of a result gives its totals again; pinning
   a random half still reaches the same ranked totals; handing the result's pieces back as the player's picks changes nothing.
   Totals are evaluateSet's (the character panel's numbers). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JOBS } from '../../../src/core/constants.js';
import { makeJobContext } from '../../../src/core/job-context.js';
import { runRecipe } from '../../../src/core/recipe.js';
import { makeSession } from '../../../src/core/session.js';
import { evaluateSet } from '../../../src/core/set.js';
import { syncSettings } from '../../../src/ui/job-sync-panel.js';
import { defaultFillSettings, fillRecipe } from '../../../src/ui/sheets/fill-settings.js';
import { rng } from '../helpers/common.js';

const CASES = 22;
const SYNCS = [
  { cap: null, sync: false, level: 100 },
  { cap: 123, sync: true, level: 50 },
  { cap: 660, sync: true, level: 90 },
  { cap: 475, sync: true, level: 80 },
  { cap: 690, sync: true, level: 100 },
  { cap: 290, sync: true, level: 60 },
];

/* The gear and food totals of a set and the spare points of its tiers, as text to compare. */
function totalsOf(job, set, sync, level) {
  const evaluated = evaluateSet(job, set, sync, level);
  return JSON.stringify([evaluated.gear, evaluated.withFood, evaluated.tiers.map(tier => tier?.spare)]);
}
/* A set's pieces (slot, game id, stones) and meal as text: two equal texts are the same set. */
const setKey = set =>
  JSON.stringify([
    set.pieces.map(piece => [piece.slot, piece.gameId ?? null, (piece.stones ?? []).map(stone => stone && `${stone.stat}${stone.grade}`)]),
    set.meal ?? null,
  ]);
/* What the search ranks, as text; the rest of a result is free to tie: the ranked stats with food (by tier: each ranked
   stat's tier effect, then the goal's points), and the GCD when one was asked. */
function rankedOf(job, set, sync, level, recipe) {
  const evaluated = evaluateSet(job, set, sync, level);
  const keys = [recipe.target, recipe.tb, recipe.tb2].filter(Boolean);
  const tierOf = key => evaluated.tiers[job.stats.indexOf(key)];
  const body = recipe.byTier
    ? [keys.map(key => tierOf(key)?.effect ?? null), evaluated.withFood[recipe.target]]
    : keys.map(key => evaluated.withFood[key]);
  return JSON.stringify([body, recipe.gcd ? evaluated.gcd.gcd : null]);
}
/* Pins for runRecipe: the given set rows with their stones, and the meal. */
const pinsOf = (rows, meal) => ({ pieces: rows.map(row => ({ slot: row.slot, gameId: row.gameId, stones: row.stones ?? [] })), meal });

test('Auto-fill is repeatable and survives pinning and picking its own result', () => {
  const rand = rng(1234567);
  const pick = list => list[Math.floor(rand() * list.length)];
  const jobs = JOBS.map(job => makeJobContext(job.id));
  const session = makeSession();
  let solved = 0;
  for (let n = 0; n < CASES; n++) {
    const job = pick(jobs);
    const setting = pick(SYNCS);
    const level = Math.min(setting.level, job.maxLevel);
    const sync = syncSettings({ cap: setting.cap, sync: setting.sync, level });

    // a random recipe: goal, tiebreaks, tier ranking, melds, food and sometimes a Target GCD
    const recipe = fillRecipe(defaultFillSettings(job));
    recipe.target = pick(job.stats);
    const rest = job.stats.filter(stat => stat !== recipe.target);
    recipe.tb = rand() < 0.6 ? pick(rest) : '';
    recipe.tb2 = recipe.tb && rand() < 0.4 ? pick(rest.filter(stat => stat !== recipe.tb)) : '';
    recipe.byTier = rand() < 0.5;
    recipe.melds = rand() < 0.7;
    recipe.food = rand() < 0.6;
    if (rand() < 0.3) {
      recipe.gcd = (2.2 + rand() * 0.3).toFixed(2);
      recipe.gcdMode = pick(['exact', 'min']);
    }
    const label = `${job.jobId} ${JSON.stringify(sync)} ${JSON.stringify(recipe)}`;

    const first = runRecipe(job, sync, level, recipe, session);
    if (first.status !== 'ok') {
      continue; // an infeasible Target GCD has no set to round-trip
    }
    solved++;

    // the same input twice
    const again = runRecipe(job, sync, level, recipe, session);
    assert.equal(setKey(again.set), setKey(first.set), `${label}: not repeatable`);

    // pin every piece and the meal: the same totals again (a weapon-blocked row holds nothing)
    const rows = first.set.pieces.filter(piece => piece.gameId != null);
    const want = totalsOf(job, first.set, sync, level);
    const allPinned = runRecipe(job, sync, level, recipe, session, {}, pinsOf(rows, first.set.meal ?? null));
    assert.equal(allPinned.status, 'ok', `${label}: pinning everything: ${allPinned.status} ${JSON.stringify(allPinned.found?.badPins)}`);
    assert.equal(totalsOf(job, allPinned.set, sync, level), want, `${label}: pinning everything changed the totals`);

    // pin a random half (and the meal half the time): the ranked totals are the same
    const half = rows.filter(() => rand() < 0.5);
    const halfPinned = runRecipe(job, sync, level, recipe, session, {}, pinsOf(half, rand() < 0.5 ? (first.set.meal ?? null) : null));
    assert.equal(halfPinned.status, 'ok', `${label}: pinning ${half.map(piece => piece.slot)}: ${halfPinned.status}`);
    assert.equal(
      rankedOf(job, halfPinned.set, sync, level, recipe),
      rankedOf(job, first.set, sync, level, recipe),
      `${label}: pinning ${half.map(piece => piece.slot)} changed the ranked totals`,
    );

    // the result's pieces as the player's picks (rings are not picked by row): the set shown is unchanged
    const pieces = Object.fromEntries(
      rows.filter(piece => piece.slot !== 'ring').map(piece => [first.set.pieces.indexOf(piece), piece.gameId]),
    );
    const picked = runRecipe(job, sync, level, recipe, session, { pieces, meal: first.set.meal ?? undefined });
    assert.equal(picked.status, 'ok', `${label}: picks: ${picked.status}`);
    assert.equal(totalsOf(job, picked.set, sync, level), want, `${label}: picking the result's pieces changed the totals`);
  }
  assert.ok(solved >= CASES / 2, `only ${solved} of ${CASES} cases solved`);
});
