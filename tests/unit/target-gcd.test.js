/* Target GCD (src/core/target-gcd.js): the GCD the result reports is checked with the GCD formula and food bonus
   directly, food choices against running each meal on its own, and the edge cases on hand-made pools. Whether the
   loadout is the best one is the exhaustive tests' job (optimizer-exhaustive.test.js). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { foodBonus, foodChoices } from '../../src/core/food.js';
import { makeJobContext } from '../../src/core/job-context.js';
import { mkItem } from '../../src/core/items.js';
import { prepare, solve } from '../../src/core/optimizer/index.js';
import { gcdFor } from '../../src/core/speed.js';
import { optimizeGcd } from '../../src/core/target-gcd.js';
import { gamePool } from './helpers/exhaustive.js';

const sge = makeJobContext('SGE');
const sam = makeJobContext('SAM');
const nin = makeJobContext('NIN');
const NO_SYNC = { cap: null, sync: false, level: 100 };
const sagePool = gamePool(sge, { type: 'any', ilvlMin: 700, ilvlMax: 730, lvlMax: 100 });
const samPool = gamePool(sam, { type: 'any', ilvlMin: 700, ilvlMax: 730, lvlMax: 100 });
const goal = { target: 'crit', tiebreak: ['det'], melds: true };

test('exact mode: the result has exactly the asked GCD, counted with food and haste', () => {
  for (const [job, pool, haste, gcd] of [
    [sge, sagePool, 0, 2.42],
    [sam, samPool, 13, 2.12],
  ]) {
    for (const food of [null, 'best']) {
      const r = optimizeGcd(job, pool, NO_SYNC, { ...goal, gcd, mode: 'exact', food });
      const label = `${job.jobId} ${gcd} ${food}`;
      assert.ok(r.ok, label);
      assert.equal(r.haste?.pct ?? 0, haste, label);
      assert.equal(gcdFor(r.withFood.spd, 100, 2500, haste), gcd, label);
      assert.equal(r.gcd, gcd, label);
      assert.equal(r.faster, false, label);
      // gear speed inside the band the result reports, and the food on top of it is what the meal gives
      assert.ok(r.totals.spd >= r.band.gearMin && r.totals.spd <= r.band.gearMax, label);
      const add = r.food ? (foodBonus(job, r.food, r.totals, 100).spd?.bonus ?? 0) : 0;
      assert.equal(r.withFood.spd, r.totals.spd + add, label);
    }
  }
});

test('or-faster mode: the GCD is the asked one or shorter, and `faster` says which', () => {
  for (const gcd of [2.5, 2.45, 2.4, 2.35]) {
    const r = optimizeGcd(sge, sagePool, NO_SYNC, { ...goal, gcd, mode: 'min', food: 'best' });
    assert.ok(r.ok, `${gcd}`);
    assert.ok(r.gcd <= gcd, `${gcd}: ${r.gcd}`);
    assert.equal(r.faster, r.gcd < gcd, `${gcd}`);
    assert.equal(gcdFor(r.withFood.spd, 100), r.gcd);
  }
});

test('or-faster never does worse on the goal than exact', () => {
  for (const gcd of [2.45, 2.4]) {
    const ex = optimizeGcd(sge, sagePool, NO_SYNC, { ...goal, gcd, mode: 'exact', food: 'best' });
    const mn = optimizeGcd(sge, sagePool, NO_SYNC, { ...goal, gcd, mode: 'min', food: 'best' });
    const vals = r => [r.withFood.crit, r.withFood.det];
    const [a, b] = [vals(mn), vals(ex)];
    assert.ok(a[0] > b[0] || (a[0] === b[0] && a[1] >= b[1]), `${gcd}: ${a} vs ${b}`);
  }
});

test('"Best for the goal" is the best of each meal on its own', () => {
  for (const mode of ['exact', 'min']) {
    const best = optimizeGcd(sam, samPool, NO_SYNC, { ...goal, gcd: 2.12, mode, food: 'best' });
    let top = null;
    for (const meal of foodChoices(sam)) {
      const r = optimizeGcd(sam, samPool, NO_SYNC, { ...goal, gcd: 2.12, mode, food: meal });
      if (!r.ok) continue;
      const v = [r.withFood.crit, r.withFood.det];
      if (!top || v[0] > top[0] || (v[0] === top[0] && v[1] > top[1])) top = v;
    }
    assert.ok(best.ok, mode);
    assert.deepEqual([best.withFood.crit, best.withFood.det], top, mode);
    // meals asking for the same gear speed share one search
    assert.ok(best.searches <= foodChoices(sam).length, mode);
  }
});

test('a GCD slower than the no-speed GCD is unreachable in exact mode, any GCD in or-faster mode', () => {
  const pool = gamePool(nin, { type: 'any', ilvlMin: 700, ilvlMax: 710, lvlMax: 100 });
  const ex = optimizeGcd(nin, pool, NO_SYNC, { target: 'crit', gcd: 2.4, mode: 'exact' });
  assert.equal(ex.ok, false);
  assert.equal(ex.reason, 'unreachable');
  assert.ok(ex.fastest < 2.12, `fastest ${ex.fastest}`);
  const mn = optimizeGcd(nin, pool, NO_SYNC, { target: 'crit', gcd: 2.4, mode: 'min' });
  assert.ok(mn.ok);
  assert.ok(mn.gcd <= 2.12 && mn.faster);
});

test('no loadout meets the target: reason "none" and the fastest GCD the pool has', () => {
  const pool = [mkItem('H', 'head', 100, { spd: 50, crit: 10 })];
  const r = optimizeGcd(sge, pool, NO_SYNC, { target: 'crit', gcd: 2.5, mode: 'exact' });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'none');
  assert.equal(r.fastest, gcdFor(50, 100));
  const fast = optimizeGcd(sge, pool, NO_SYNC, { target: 'crit', gcd: 2.3, mode: 'min' });
  assert.equal(fast.reason, 'none');
  // or faster: 50 speed is past 2.49, so asking 2.49 or faster gives a faster GCD than asked
  const ok = optimizeGcd(sge, pool, NO_SYNC, { target: 'crit', gcd: 2.49, mode: 'min' });
  assert.ok(ok.ok && ok.gcd === gcdFor(50, 100) && ok.faster === ok.gcd < 2.49);
});

test('prepared candidates are reused: same result, and a minimum-only list refuses a band', () => {
  const opts = { ...goal, gcd: 2.44, mode: 'exact', food: 'best' };
  const first = optimizeGcd(sge, sagePool, NO_SYNC, opts);
  const again = optimizeGcd(sge, sagePool, NO_SYNC, { ...opts, gcd: 2.43 }, first.prep);
  const fresh = optimizeGcd(sge, sagePool, NO_SYNC, { ...opts, gcd: 2.43 });
  assert.deepEqual([again.withFood.crit, again.withFood.det, again.gcd], [fresh.withFood.crit, fresh.withFood.det, fresh.gcd]);
  const minOnly = prepare(sge, sagePool, NO_SYNC, { ...goal, speed: 'min' });
  assert.throws(() => solve(minOnly, { spdMin: 100, spdMax: 200 }), /prepared for speed rule min/);
  assert.ok(solve(first.prep, { spdMin: 100 }).ok); // an exact list also serves a minimum alone
});
