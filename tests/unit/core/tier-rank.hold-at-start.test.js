/* Tier ranking holds a key at the start of the tier it reached (src/core/tier-rank.ts), with no spare point. The Dark Knight case
   from the raw-against-tier comparison: level 100, cap 790, Critical Hit > Skill Speed > Strength, GCD exactly 2.50, no
   food. The 2.50 tier starts at 0 speed points, so holding it needs none; a hold one point above the start cost 20
   Strength (Critical Hit 3,143, Skill Speed 18, Strength 5,910 against 3,147, 0, 5,930 with the plain ranking). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeApp, solveOf } from '../helpers/views.js';

test('a speed tier that starts at 0 points is held at 0: tier ranking loses no Strength to the plain ranking', () => {
  const gearTotals = byTier => {
    const app = makeApp('DRK', { level: 100, cap: 790 });
    Object.assign(app.recipe, { target: 'crit', tb: 'sks', tb2: 'str', gcd: 2.5, gcdMode: 'exact', melds: true, food: false, byTier });
    const solve = solveOf(app);
    assert.equal(solve.run.status, 'ok');
    return { crit: solve.gearPanel('crit'), sks: solve.gearPanel('sks'), str: solve.gearPanel('str') };
  };
  const tiered = gearTotals(true);
  const raw = gearTotals(false);
  assert.deepEqual(tiered, raw);
});
