/* Pins in a solve (src/core/recipe.js: runRecipe's `pins`, resolvePins, recipeKey): a pinned piece is kept with exactly
   its stones and counts in the totals, the tiers and a Target GCD; a pinned meal is the meal; a pin the solve cannot
   keep says so. Real Sage items; the optimizer's own pin coverage is core-optimizer.pinned.test.js. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allMeals } from '../../src/core/food.js';
import { makeJobContext } from '../../src/core/job-context.js';
import { gcdRange, recipeKey, resolvePins, runRecipe } from '../../src/core/recipe.js';
import { jobGear } from '../../src/core/items.js';
import { makeSession } from '../../src/core/session.js';
import { evaluateSet } from '../../src/core/set.js';
import { appState, piece } from './helpers/common.js';

const sge = makeJobContext('SGE');
const SYNC = { cap: 999, sync: false, level: 100 };
const GEAR = jobGear(sge);
const SYNCED = { cap: 123, sync: true, level: 100 };
/* A set's recipe for Sage with `patch` on top: crit, then det, with melds. */
const recipe = (patch = {}) => ({ ...appState({ job: 'SGE' }).recipe, target: 'crit', tb: 'det', melds: true, food: false, ...patch });

const shirt = piece(sge, 'Augmented Bygone Brass Shirt of Healing'); // body, item level 790: Main 810, Vit 817, Crit 427, Det 299
const SPD_XII = { stat: 'spd', grade: 12 }; // Spell Speed materia XII: +54 (docs/mechanics/materia.md)
const shirtPin = { slot: 'body', gameId: shirt.gameId, stones: [SPD_XII, SPD_XII] };

test('a pinned piece is kept with exactly its stones and counts in the totals', () => {
  const run = runRecipe(sge, SYNC, 100, recipe(), makeSession(), {}, { pieces: [shirtPin], meal: null });
  assert.equal(run.status, 'ok');
  const body = run.set.pieces.find(p => p.slot === 'body');
  assert.equal(body.gameId, shirt.gameId);
  assert.deepEqual(body.stones, [SPD_XII, SPD_XII]);
  // the body's row in the set's own evaluation: Spell Speed from its two stones, the rest its item's
  const rows = evaluateSet(sge, run.set, SYNC, 100).rows;
  const row = rows.find(r => r.slot === 'body');
  assert.deepEqual([row.stats.main, row.stats.crit, row.stats.det, row.stats.spd], [810, 427, 299, 2 * 54]);
  // the picks mark it, its row's menu holds only it, and every other row was searched (not the body)
  const bodyPick = run.found.picks.find(p => p.type === 'body');
  assert.equal(bodyPick.pinned, true);
  assert.deepEqual(
    run.found.options[run.found.picks.indexOf(bodyPick)].map(c => c.item.gameId),
    [shirt.gameId],
  );
  assert.equal(run.found.picks.filter(p => p.pinned).length, 1);
  assert.deepEqual(run.record.pins, { pieces: [shirtPin], meal: null });
});

test('pinned speed stones count toward a Target GCD, exact or minimum, with and without tier ranking', () => {
  const pins = { pieces: [shirtPin], meal: null };
  for (const gcd of ['2.40', '2.45']) {
    for (const byTier of [false, true]) {
      for (const gcdMode of ['exact', 'min']) {
        const label = `${gcd} ${gcdMode} byTier ${byTier}`;
        const run = runRecipe(sge, SYNC, 100, recipe({ food: true, gcd, gcdMode, byTier }), makeSession(), {}, pins);
        assert.equal(run.status, 'ok', label);
        // the GCD of the set as the sheet adds it up, with its meal
        const shown = evaluateSet(sge, run.set, SYNC, 100).gcd.gcd;
        assert.equal(shown, Number(gcd), label);
        assert.equal(run.found.gcd.gcd, Number(gcd), label);
        assert.deepEqual(run.set.pieces.find(p => p.slot === 'body').stones, [SPD_XII, SPD_XII], label);
      }
    }
  }
});

test("a pinned piece need not pass the recipe's filters", () => {
  // item level 700 at most leaves out the 790 shirt; pinned, it is still worn
  const run = runRecipe(sge, SYNC, 100, recipe({ max: 700 }), makeSession(), {}, { pieces: [shirtPin], meal: null });
  assert.equal(run.status, 'ok');
  assert.equal(run.set.pieces.find(p => p.slot === 'body').gameId, shirt.gameId);
  const others = run.found.picks.filter(p => p.item && !p.pinned);
  assert.ok(others.length > 5 && others.every(p => p.item.ilvl <= 700));
});

test('a pinned meal is the meal, even with Food off, and the search counts it', () => {
  const meal = allMeals(sge).at(-1);
  const run = runRecipe(sge, SYNC, 100, recipe({ food: false }), makeSession(), {}, { pieces: [], meal: meal.key });
  assert.equal(run.status, 'ok');
  assert.equal(run.set.meal, meal.key);
  assert.equal(run.found.food.picked, true);
  assert.equal(run.found.food.shown.key, meal.key);
  assert.equal(evaluateSet(sge, run.set, SYNC, 100).meal.key, meal.key);
  // the Food row's pick does not move it
  const other = allMeals(sge)[0];
  const again = runRecipe(sge, SYNC, 100, recipe({ food: true }), makeSession(), { meal: other.key }, { pieces: [], meal: meal.key });
  assert.equal(again.set.meal, meal.key);
  // without a pin and with Food off there is no meal
  assert.equal(runRecipe(sge, SYNC, 100, recipe({ food: false }), makeSession()).set.meal, null);
});

test('a pin the solve cannot keep gives status badpin and says which', () => {
  const session = makeSession();
  const ask = pins => runRecipe(sge, SYNC, 100, recipe(), session, {}, pins);
  const ringOf = name => ({ slot: 'ring', gameId: piece(sge, name).gameId, stones: [] });
  const ring = ringOf('Augmented Bygone Brass Ring of Healing');
  const problems = pins => ask(pins).found.badPins;
  assert.equal(ask({ pieces: [{ slot: 'body', gameId: 1, stones: [] }], meal: null }).status, 'badpin');
  assert.deepEqual(problems({ pieces: [shirtPin, { slot: 'body', gameId: 1, stones: [] }], meal: null }), [
    { index: 1, reason: 'missing' },
  ]);
  assert.deepEqual(problems({ pieces: [{ ...shirtPin, slot: 'head' }], meal: null }), [{ index: 0, reason: 'slot' }]);
  assert.deepEqual(problems({ pieces: [], meal: 'no such meal' }), [{ index: null, reason: 'meal' }]);
  // three rings cannot be worn
  assert.deepEqual(problems({ pieces: [ring, ring, ring], meal: null }), [{ index: null, reason: 'conflict' }]);
  // a piece the job cannot wear: a Warrior's axe
  const axe = piece(makeJobContext('WAR'), 'Augmented Bygone Brass Battleaxe');
  assert.deepEqual(problems({ pieces: [{ slot: 'weapon', gameId: axe.gameId, stones: [] }], meal: null }), [
    { index: 0, reason: 'wearable' },
  ]);
  assert.equal(ask({ pieces: [], meal: 'no such meal' }).set, null);
});

test('resolvePins: usable pieces become candidates, with their stones under sync', () => {
  const free = resolvePins(sge, SYNC, { pieces: [shirtPin], meal: null }, GEAR);
  assert.deepEqual(free.problems, []);
  assert.equal(free.fixed[0].eff.spd, 108);
  // item level sync takes every stone off a synced piece (materia.md)
  const synced = resolvePins(sge, SYNCED, { pieces: [shirtPin], meal: null }, GEAR);
  assert.equal(synced.fixed[0].eff.spd, 0);
  assert.deepEqual(resolvePins(sge, SYNC, null, GEAR), { fixed: [], meal: null, problems: [] });
});

test('session keys: pins change every kind, and a key without pins is the one before pins existed', () => {
  const base = recipe();
  const pins = { pieces: [shirtPin], meal: null };
  for (const kind of ['tier', 'fast', 'prep', 'same']) {
    const plain = recipeKey(kind, sge, SYNC, 100, base);
    assert.ok(!JSON.parse(plain).some(part => typeof part === 'string' && part.includes('"slot"')));
    assert.equal(recipeKey(kind, sge, SYNC, 100, base, null, { pieces: [], meal: 'x' }), plain);
    assert.notEqual(recipeKey(kind, sge, SYNC, 100, base, null, pins), plain);
    assert.notEqual(
      recipeKey(kind, sge, SYNC, 100, base, null, pins),
      recipeKey(kind, sge, SYNC, 100, base, null, { pieces: [{ ...shirtPin, stones: [] }], meal: null }),
    );
  }
});

test('a warm session gives a pinned solve what a fresh one does, and pins do not leak into an unpinned solve', () => {
  const session = makeSession();
  const pins = { pieces: [shirtPin], meal: null };
  const asked = recipe({ food: true, gcd: '2.45', gcdMode: 'exact', byTier: false });
  const first = runRecipe(sge, SYNC, 100, asked, session, {}, pins);
  const plain = runRecipe(sge, SYNC, 100, asked, session);
  const second = runRecipe(sge, SYNC, 100, asked, session, {}, pins);
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
  assert.ok(pinned.fastest >= free.fastest);
  assert.equal(pinned.top, free.top);
});

test('one ring pinned: the other ring is searched, a Unique pinned ring is no choice for it, and its menu offers no second copy', () => {
  const pinnedRing = piece(sge, 'Augmented Bygone Brass Ring of Healing'); // item level 790, Unique
  assert.equal(pinnedRing.copies, 1);
  const pins = { pieces: [{ slot: 'ring', gameId: pinnedRing.gameId, stones: [] }], meal: null };
  const run = runRecipe(sge, SYNC, 100, recipe(), makeSession(), {}, pins);
  assert.equal(run.status, 'ok');
  const rings = run.found.picks.map((p, i) => ({ p, i })).filter(({ p }) => p.type === 'ring');
  assert.equal(rings.length, 2);
  assert.deepEqual(
    rings.map(({ p }) => !!p.pinned),
    [true, false],
  );
  assert.equal(rings[0].p.item.gameId, pinnedRing.gameId);
  assert.equal(rings[0].p.meld, null, 'pinned with no stones');
  assert.notEqual(rings[1].p.item.gameId, pinnedRing.gameId);
  for (const option of run.found.options[rings[1].i]) assert.notEqual(option.item.gameId, pinnedRing.gameId);
  assert.deepEqual(
    run.found.options[rings[0].i].map(c => c.item.gameId),
    [pinnedRing.gameId],
  );
  assert.equal(run.set.pieces.filter(p => p.slot === 'ring').length, 2);
});

test('pinProblem: a Unique ring pinned on both ring rows is a conflict; two different rings, or a plain piece once, are not', () => {
  const uniqueRing = piece(sge, 'Augmented Bygone Brass Ring of Healing');
  assert.equal(uniqueRing.copies, 1);
  const otherRing = GEAR.find(i => i.type === 'ring' && i.gameId !== uniqueRing.gameId && i.copies === 1 && i.ilvl >= 780);
  assert.ok(otherRing);
  const ringPin = item => ({ slot: 'ring', gameId: item.gameId, stones: [] });
  const resolve = pieces => resolvePins(sge, SYNC, { pieces, meal: null }, GEAR);
  // the same Unique ring twice
  assert.deepEqual(resolve([ringPin(uniqueRing), ringPin(uniqueRing)]).problems, [{ index: null, reason: 'conflict' }]);
  // one Unique ring, or two different ones
  assert.deepEqual(resolve([ringPin(uniqueRing)]).problems, []);
  assert.deepEqual(resolve([ringPin(uniqueRing), ringPin(otherRing)]).problems, []);
  // a ring that is not Unique can be worn twice, if the data has one for Sage
  const plainRing = GEAR.find(i => i.type === 'ring' && i.copies === 2);
  if (plainRing) assert.deepEqual(resolve([ringPin(plainRing), ringPin(plainRing)]).problems, []);
  // the solve answers badpin
  const run = runRecipe(sge, SYNC, 100, recipe(), makeSession(), {}, { pieces: [ringPin(uniqueRing), ringPin(uniqueRing)], meal: null });
  assert.equal(run.status, 'badpin');
  assert.deepEqual(run.found.badPins, [{ index: null, reason: 'conflict' }]);
});
