/* Pins in a solve (src/core/recipe.ts: runRecipe's `pins`, resolvePins): a pinned piece is kept with exactly
   its stones and counts in the totals, the tiers and a Target GCD; a pinned meal is the meal; a pin the solve cannot
   keep says so. Real Sage items; the optimizer's own pin coverage is core/optimizer/index.pinned.test.js. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PoolItem, Stone, Sync } from '../../../src/core/types.ts';
import type { PinPiece, Pins, Recipe, RecipeSuccess } from '../../../src/core/recipe.ts';
import type { SetEvaluation, WornRow } from '../../../src/core/set.ts';
import { allMeals } from '../../../src/core/food.ts';
import { makeJobContext } from '../../../src/core/job-context.ts';
import { gcdRange, resolvePins, runRecipe } from '../../../src/core/recipe.ts';
import { jobGear } from '../../../src/core/items.ts';
import { makeSession } from '../../../src/core/session.ts';
import { evaluateSet } from '../../../src/core/set.ts';
import { appState, piece } from '../helpers/common.ts';

const sge = makeJobContext('SGE');
const SYNC: Sync = { cap: 999, sync: false, level: 100 };
const GEAR = jobGear(sge);
const SYNCED: Sync = { cap: 123, sync: true, level: 100 };
/* A set's recipe for Sage with `patch` on top: crit, then det, with melds. */
const recipe = (patch: Partial<Recipe> = {}): Recipe => ({
  ...appState({ job: 'SGE' }).recipe,
  target: 'crit',
  tb: 'det',
  melds: true,
  food: false,
  ...patch,
});

const shirt = piece(sge, 'Augmented Bygone Brass Shirt of Healing'); // body, item level 790: Main 810, Vit 817, Crit 427, Det 299
const SPD_XII: Stone = { stat: 'sps', grade: 12 }; // Spell Speed materia XII: +54 (docs/mechanics/materia.md)
/* The game id of a database piece. */
function gameIdOf(item: PoolItem): number {
  assert.ok(item.gameId !== undefined, `${item.name} is a database piece`);
  return item.gameId;
}
/* runRecipe for a solve that finds a set: the result, never a failure. */
function solved(...args: Parameters<typeof runRecipe>): RecipeSuccess {
  const run = runRecipe(...args);
  assert.ok(run.status === 'ok', `the solve found a set (${run.status})`);
  return run;
}
/* The row of an evaluated set for a slot, which must show a piece. */
function wornRowOf(evaluated: SetEvaluation, slot: string): WornRow {
  const row = evaluated.rows.find(r => r.slot === slot);
  assert.ok(row?.item, `the ${slot} row shows a piece`);
  return row;
}
const shirtPin: PinPiece = { slot: 'body', gameId: gameIdOf(shirt), stones: [SPD_XII, SPD_XII] };

test('a pinned piece is kept with exactly its stones and counts in the totals', () => {
  const run = solved(sge, SYNC, 100, recipe(), makeSession(), {}, { pieces: [shirtPin], meal: null });
  const body = run.set.pieces.find(p => p.slot === 'body');
  assert.ok(body);
  assert.equal(body.gameId, shirt.gameId);
  assert.deepEqual(body.stones, [SPD_XII, SPD_XII]);
  // the body's row in the set's own evaluation: Spell Speed from its two stones, the rest its item's
  const row = wornRowOf(evaluateSet(sge, run.set, SYNC, 100), 'body');
  assert.deepEqual([row.stats.mind, row.stats.crit, row.stats.det, row.stats.sps], [810, 427, 299, 2 * 54]);
  // the picks mark it, its row's menu holds only it, and every other row was searched (not the body)
  const bodyPick = run.found.picks.find(p => p.type === 'body');
  assert.ok(bodyPick);
  assert.equal(bodyPick.pinned, true);
  assert.deepEqual(
    run.found.options[run.found.picks.indexOf(bodyPick)].map(c => c.item.gameId),
    [shirt.gameId],
  );
  assert.equal(run.found.picks.filter(p => p.pinned).length, 1);
  assert.deepEqual(run.record.pins, { pieces: [shirtPin], meal: null });
});

test('pinned speed stones count toward a Target GCD, exact or minimum, with and without tier ranking', () => {
  const pins: Pins = { pieces: [shirtPin], meal: null };
  for (const gcd of ['2.40', '2.45']) {
    for (const byTier of [false, true]) {
      for (const gcdMode of ['exact', 'min'] as const) {
        const label = `${gcd} ${gcdMode} byTier ${byTier}`;
        const run = solved(sge, SYNC, 100, recipe({ food: true, gcd, gcdMode, byTier }), makeSession(), {}, pins);
        // the GCD of the set as the sheet adds it up, with its meal
        const shown = evaluateSet(sge, run.set, SYNC, 100).gcd.gcd;
        assert.equal(shown, Number(gcd), label);
        assert.equal(run.found.gcd?.gcd, Number(gcd), label);
        assert.deepEqual(run.set.pieces.find(p => p.slot === 'body')?.stones, [SPD_XII, SPD_XII], label);
      }
    }
  }
});

test("a pinned piece need not pass the recipe's filters", () => {
  // item level 700 at most leaves out the 790 shirt; pinned, it is still worn
  const run = solved(sge, SYNC, 100, recipe({ max: 700 }), makeSession(), {}, { pieces: [shirtPin], meal: null });
  assert.equal(run.set.pieces.find(p => p.slot === 'body')?.gameId, shirt.gameId);
  const others = run.found.picks.filter(p => p.item && !p.pinned);
  assert.ok(others.length > 5 && others.every(p => (p.item?.ilvl ?? 0) <= 700));
});

test('a pinned meal is the meal, even with Food off, and the search counts it', () => {
  const meal = allMeals(sge).at(-1);
  assert.ok(meal);
  const run = solved(sge, SYNC, 100, recipe({ food: false }), makeSession(), {}, { pieces: [], meal: meal.key });
  assert.equal(run.set.meal, meal.key);
  assert.equal(run.found.food?.picked, true);
  assert.equal(run.found.food?.shown.key, meal.key);
  assert.equal(evaluateSet(sge, run.set, SYNC, 100).meal?.key, meal.key);
  // the Food row's pick does not move it
  const other = allMeals(sge)[0];
  assert.ok(other);
  const again = solved(sge, SYNC, 100, recipe({ food: true }), makeSession(), { meal: other.key }, { pieces: [], meal: meal.key });
  assert.equal(again.set.meal, meal.key);
  // without a pin and with Food off there is no meal
  assert.equal(solved(sge, SYNC, 100, recipe({ food: false }), makeSession()).set.meal, null);
});

test('a pin the solve cannot keep gives status badpin and says which', () => {
  const session = makeSession();
  const ask = (pins: Pins) => runRecipe(sge, SYNC, 100, recipe(), session, {}, pins);
  const ringOf = (name: string): PinPiece => ({ slot: 'ring', gameId: gameIdOf(piece(sge, name)), stones: [] });
  const ring = ringOf('Augmented Bygone Brass Ring of Healing');
  const problems = (pins: Pins) => {
    const result = ask(pins);
    assert.ok(result.status !== 'ok', 'the solve refuses the pins');
    return result.found.badPins;
  };
  assert.equal(ask({ pieces: [{ slot: 'body', gameId: 1, stones: [] }], meal: null }).status, 'badpin');
  assert.deepEqual(problems({ pieces: [shirtPin, { slot: 'body', gameId: 1, stones: [] }], meal: null }), [
    { index: 1, reason: 'missing' },
  ]);
  const headShirt: PinPiece = { ...shirtPin, slot: 'head' };
  assert.deepEqual(problems({ pieces: [headShirt], meal: null }), [{ index: 0, reason: 'slot' }]);
  assert.deepEqual(problems({ pieces: [], meal: 'no such meal' }), [{ index: null, reason: 'meal' }]);
  // three rings cannot be worn
  assert.deepEqual(problems({ pieces: [ring, ring, ring], meal: null }), [{ index: null, reason: 'conflict' }]);
  // a piece the job cannot wear: a Warrior's axe
  const axe = piece(makeJobContext('WAR'), 'Augmented Bygone Brass Battleaxe');
  assert.deepEqual(problems({ pieces: [{ slot: 'weapon', gameId: gameIdOf(axe), stones: [] }], meal: null }), [
    { index: 0, reason: 'wearable' },
  ]);
  assert.equal(ask({ pieces: [], meal: 'no such meal' }).set, null);
});

test('resolvePins: usable pieces become candidates, with their stones under sync', () => {
  const free = resolvePins(sge, SYNC, { pieces: [shirtPin], meal: null }, GEAR);
  assert.deepEqual(free.problems, []);
  assert.equal(free.fixed[0].eff.sps, 108);
  // item level sync takes every stone off a synced piece (materia.md)
  const synced = resolvePins(sge, SYNCED, { pieces: [shirtPin], meal: null }, GEAR);
  assert.equal(synced.fixed[0].eff.sps, 0);
  assert.deepEqual(resolvePins(sge, SYNC, null, GEAR), { fixed: [], meal: null, problems: [] });
});

test('a warm session gives a pinned solve what a fresh one does, and pins do not leak into an unpinned solve', () => {
  const session = makeSession();
  const pins: Pins = { pieces: [shirtPin], meal: null };
  const asked = recipe({ food: true, gcd: '2.45', gcdMode: 'exact', byTier: false });
  const first = solved(sge, SYNC, 100, asked, session, {}, pins);
  const plain = solved(sge, SYNC, 100, asked, session);
  const second = solved(sge, SYNC, 100, asked, session, {}, pins);
  assert.deepEqual(second.set, first.set);
  assert.deepEqual(runRecipe(sge, SYNC, 100, asked, makeSession()).set, plain.set);
  assert.deepEqual(runRecipe(sge, SYNC, 100, asked, makeSession(), {}, pins).set, first.set);
  assert.ok(first.found.picks.some(p => p.pinned) && !plain.found.picks.some(p => p.pinned));
});

test('the Target GCD box range counts pinned pieces', () => {
  const session = makeSession();
  const free = gcdRange(sge, SYNC, 100, recipe(), session);
  const pinned = gcdRange(sge, SYNC, 100, recipe(), session, null, { pieces: [{ ...shirtPin, stones: [] }], meal: null });
  // a body with no speed on it cannot be faster than the best body for speed
  assert.ok(pinned.fastest !== null && free.fastest !== null && pinned.fastest >= free.fastest);
  assert.equal(pinned.top, free.top);
});

test('one ring pinned: the other ring is searched, a Unique pinned ring is no choice for it, and its menu offers no second copy', () => {
  const pinnedRing = piece(sge, 'Augmented Bygone Brass Ring of Healing'); // item level 790, Unique
  assert.equal(pinnedRing.copies, 1);
  const pins: Pins = { pieces: [{ slot: 'ring', gameId: gameIdOf(pinnedRing), stones: [] }], meal: null };
  const run = solved(sge, SYNC, 100, recipe(), makeSession(), {}, pins);
  const rings = run.found.picks.flatMap((p, i) => (p.type === 'ring' && p.item ? [{ p, item: p.item, i }] : []));
  assert.equal(rings.length, 2);
  assert.deepEqual(
    rings.map(({ p }) => Boolean(p.pinned)),
    [true, false],
  );
  const [pinnedRow, searchedRow] = rings;
  assert.ok(pinnedRow && searchedRow);
  assert.equal(pinnedRow.item.gameId, pinnedRing.gameId);
  assert.equal(pinnedRow.p.meld, null, 'pinned with no stones');
  assert.notEqual(searchedRow.item.gameId, pinnedRing.gameId);
  for (const option of run.found.options[searchedRow.i] ?? []) {
    assert.notEqual(option.item.gameId, pinnedRing.gameId);
  }
  assert.deepEqual(
    (run.found.options[pinnedRow.i] ?? []).map(c => c.item.gameId),
    [pinnedRing.gameId],
  );
  assert.equal(run.set.pieces.filter(p => p.slot === 'ring').length, 2);
});

test('pinProblem: a Unique ring pinned on both ring rows is a conflict; two different rings, or a plain piece once, are not', () => {
  const uniqueRing = piece(sge, 'Augmented Bygone Brass Ring of Healing');
  assert.equal(uniqueRing.copies, 1);
  const otherRing = GEAR.find(i => i.type === 'ring' && i.gameId !== uniqueRing.gameId && i.copies === 1 && i.ilvl >= 780);
  assert.ok(otherRing);
  const ringPin = (item: PoolItem): PinPiece => ({ slot: 'ring', gameId: gameIdOf(item), stones: [] });
  const resolve = (pieces: PinPiece[]) => resolvePins(sge, SYNC, { pieces, meal: null }, GEAR);
  // the same Unique ring twice
  assert.deepEqual(resolve([ringPin(uniqueRing), ringPin(uniqueRing)]).problems, [{ index: null, reason: 'conflict' }]);
  // one Unique ring, or two different ones
  assert.deepEqual(resolve([ringPin(uniqueRing)]).problems, []);
  assert.deepEqual(resolve([ringPin(uniqueRing), ringPin(otherRing)]).problems, []);
  // a ring that is not Unique can be worn twice, if the data has one for Sage
  const plainRing = GEAR.find(i => i.type === 'ring' && i.copies === 2);
  if (plainRing) {
    assert.deepEqual(resolve([ringPin(plainRing), ringPin(plainRing)]).problems, []);
  }
  // the solve answers badpin
  const run = runRecipe(sge, SYNC, 100, recipe(), makeSession(), {}, { pieces: [ringPin(uniqueRing), ringPin(uniqueRing)], meal: null });
  assert.equal(run.status, 'badpin');
  assert.deepEqual(run.found.badPins, [{ index: null, reason: 'conflict' }]);
});
