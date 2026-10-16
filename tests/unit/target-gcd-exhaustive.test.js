/* Target GCD against the exhaustive reference (helpers/exhaustive.js), on small real pools with melds: the reference
   enumerates every stone placement itself (meldVectors) and tries every legal loadout, so it shares no code with the
   meld versions, pruning, speed tables or memo. Speed rules are GCD tiers on both sides of the free result (the best
   set with no rule), so the drift case (a slower GCD than the gear wants) is covered, in both modes. The food test
   finds each meal's gear-speed band by scanning every gear speed with the food formula written out here, not with
   gearNeeded. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { foodChoices, statBase } from '../../src/core/food.js';
import { makeJobContext } from '../../src/core/job-context.js';
import { optimize, prepare, solve } from '../../src/core/optimizer/index.js';
import { gcdFor, gcdTierAt, hasteFor } from '../../src/core/speed.js';
import { optimizeGcd } from '../../src/core/target-gcd.js';
import { exhaustive, gamePool } from './helpers/exhaustive.js';

function rng(seed) {
  return () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
}

const WINDOWS = [
  { ilvlMin: 290, ilvlMax: 345 },
  { ilvlMin: 560, ilvlMax: 600 },
  { ilvlMin: 690, ilvlMax: 730 },
];

/* A small real pool: up to `n` distinct pieces per slot type (at least `least` where the window has them), from `window` or a random one of WINDOWS (the same object twice would be one Unique ring the
   reference could pair with itself). */
function smallPool(job, rand, types, n, least = 0, window = null) {
  const int = k => Math.floor(rand() * k);
  const all = gamePool(job, window ?? WINDOWS[int(WINDOWS.length)]);
  const pool = [];
  for (const ty of types) {
    const of = all.filter(i => i.type === ty);
    const m = ty === 'ring' ? 1 + int(n) : least + int(n + 1 - least);
    for (let i = 0; i < m && of.length; i++) pool.push(of.splice(int(of.length), 1)[0]);
  }
  return pool;
}

/* GCD tier starts around the free result's speed `free` at `level`: two below (slower GCDs) and two above (faster). */
function tiersAround(free, level) {
  const out = [];
  let t = gcdTierAt(free, level);
  out.push(t.start);
  for (let i = 0; i < 2 && t.next != null; i++) {
    out.push(t.next);
    t = gcdTierAt(t.next, level);
  }
  t = gcdTierAt(free, level);
  for (let i = 0; i < 2 && t.start > 0; i++) {
    t = gcdTierAt(t.start - 1, level);
    out.push(t.start);
  }
  return [...new Set(out)];
}

test('both modes with melds match exhaustive search, on tiers slower and faster than the free result', () => {
  const rand = rng(20261016),
    int = n => Math.floor(rand() * n);
  const types = ['head', 'body', 'neck', 'ring'];
  let runs = 0,
    slower = 0,
    infeasible = 0;
  for (let t = 0; t < 30; t++) {
    const job = makeJobContext(['SGE', 'WAR', 'BLM', 'SAM', 'PLD'][int(5)]);
    const pool = smallPool(job, rand, types, 2);
    if (!pool.length) continue;
    const ilvls = pool.map(i => i.ilvl).sort((a, b) => a - b);
    const sync = rand() < 0.5 ? { cap: null, sync: false, level: 100 } : { cap: ilvls[int(ilvls.length)], sync: true, level: 100 };
    const subs = job.substats.filter(s => s !== 'spd');
    const target = subs[int(subs.length)];
    const tiebreak = rand() < 0.6 ? [subs[int(subs.length)]] : [];
    const free = optimize(job, pool, sync, { target, tiebreak, melds: true }).totals.spd;
    for (const start of tiersAround(free, 100)) {
      const next = gcdTierAt(start, 100).next;
      for (const mode of ['min', 'exact']) {
        const opts = { target, tiebreak, melds: true, spdMin: start || null, spdMax: mode === 'exact' && next != null ? next - 1 : null };
        const want = exhaustive(job, pool, sync, opts);
        const r = optimize(job, pool, sync, opts);
        const label = `${job.jobId} pool #${t} ${mode} ${JSON.stringify(opts)} ${JSON.stringify(sync)} free ${free}`;
        runs++;
        if (start < free) slower++;
        if (!want) {
          infeasible++;
          assert.equal(r.ok, false, label);
          continue;
        }
        assert.ok(r.ok && !r.truncated, label);
        assert.deepEqual(
          [target, ...tiebreak].map(s => r.totals[s]),
          want,
          label,
        );
        assert.ok(r.totals.spd >= start, label);
        if (opts.spdMax != null) assert.ok(r.totals.spd <= opts.spdMax, label);
      }
    }
  }
  assert.ok(runs >= 150, `${runs} runs`);
  assert.ok(slower >= 30, `${slower} runs below the free result`); // the drift case is exercised
  assert.ok(infeasible < runs / 2, `${infeasible} infeasible`);
});

test('2H weapons, shields and blocked slots with a speed band match exhaustive search', () => {
  const rand = rng(77),
    int = n => Math.floor(rand() * n);
  let runs = 0;
  for (let t = 0; t < 16; t++) {
    const job = makeJobContext(['PLD', 'SGE'][t % 2]);
    const pool = smallPool(job, rand, ['weapon', 'offhand', 'body', 'ring'], 2);
    if (!pool.length) continue;
    const target = job.substats.filter(s => s !== 'spd')[int(3)];
    const free = optimize(job, pool, { cap: null, sync: false, level: 100 }, { target, melds: true }).totals.spd;
    for (const start of tiersAround(free, 100).slice(0, 3)) {
      const next = gcdTierAt(start, 100).next;
      for (const spdMax of [null, next != null ? next - 1 : null]) {
        const opts = { target, melds: true, spdMin: start || null, spdMax };
        const sync = { cap: null, sync: false, level: 100 };
        const want = exhaustive(job, pool, sync, opts);
        const r = optimize(job, pool, sync, opts);
        const label = `${job.jobId} #${t} ${JSON.stringify(opts)}`;
        runs++;
        if (!want) assert.equal(r.ok, false, label);
        else assert.deepEqual([r.totals[target]], want, label);
      }
    }
  }
  assert.ok(runs >= 40, `${runs} runs`);
});

/* The speed tables for blocked slots (search.js) are built only after LAZY_TABLES nodes, which these small pools never
   reach; lazyTables 0 builds them from the first node, so a two-handed weapon's search reads the table with the off-hand
   empty and a hooded body's the one with the head empty. White Mage's shields stop at item level 100, so its pools come
   from 38 to 55 (staves and wands with shields); every pool has a piece for each slot, so a blocked slot is in the
   search. */
test('speed tables for blocked slots (built from the first node) match exhaustive search', () => {
  const rand = rng(91),
    int = n => Math.floor(rand() * n);
  let runs = 0,
    blocking = 0;
  for (let t = 0; t < 40; t++) {
    const [id, window] = [
      ['WHM', { ilvlMin: 38, ilvlMax: 55 }],
      ['WHM', { ilvlMin: 38, ilvlMax: 55 }],
      ['BLM', WINDOWS[0]],
      ['SCH', WINDOWS[t % 3]],
    ][t % 4];
    const job = makeJobContext(id);
    const pool = smallPool(job, rand, ['weapon', 'offhand', 'head', 'body', 'ring'], 2, 1, window);
    if (!pool.length) continue;
    const sync = { cap: null, sync: false, level: 100 };
    const target = job.substats.filter(s => s !== 'spd')[int(3)];
    const prep = prepare(job, pool, sync, { target, melds: true, speed: 'exact' });
    if (prep.posList.some(l => l.some(a => a.blocks.some(b => prep.posList[prep.slotList.indexOf(b)]?.length)))) blocking++;
    const free = optimize(job, pool, sync, { target, melds: true }).totals.spd;
    for (const start of tiersAround(free, 100).slice(0, 3)) {
      const next = gcdTierAt(start, 100).next;
      for (const spdMax of [null, next != null ? next - 1 : null]) {
        const opts = { spdMin: start || null, spdMax };
        const want = exhaustive(job, pool, sync, { target, melds: true, ...opts });
        const r = solve(prep, { ...opts, lazyTables: 0 });
        const label = `${job.jobId} #${t} ${JSON.stringify(opts)}`;
        runs++;
        if (!want) assert.equal(r.ok, false, label);
        else assert.deepEqual([r.totals[target]], want, label);
      }
    }
  }
  assert.ok(runs >= 100, `${runs} runs`);
  assert.ok(blocking >= 10, `${blocking} pools where a piece blocks a slot with candidates`);
});

/* Food, written out: min(max, floor(pct x (base + gear) / 100)) (math.md section 6); base = BaseSpeed for speed, the
   level's main stat base for Determination and Piety (statBase, checked in food.test.js). */
function foodAdd(job, meal, stat, gear, level) {
  const s = meal?.stats.find(x => x.stat === stat);
  if (!s) return 0;
  return Math.min(s.max, Math.floor((s.pct * (statBase(job, stat, level) + gear)) / 100));
}

/* The gear speeds whose GCD with `meal` and `haste` is the target (exact) or at most it (min), by scanning every value;
   they form one band, which is checked. */
function gearBand(job, meal, gcd, mode, level, haste) {
  let lo = null,
    hi = null;
  for (let g = 0; g <= 6000; g++) {
    const at = gcdFor(g + foodAdd(job, meal, 'spd', g, level), level, 2500, haste);
    const ok = mode === 'exact' ? at === gcd : at <= gcd;
    if (ok) {
      if (lo == null) lo = g;
      assert.ok(hi == null || hi === g - 1, 'one band');
      hi = g;
    }
  }
  return lo == null ? null : { min: lo, max: mode === 'exact' ? hi : null };
}

test('Target GCD with food and haste matches exhaustive search over every meal', () => {
  const rand = rng(4242),
    int = n => Math.floor(rand() * n);
  let runs = 0;
  for (let t = 0; t < 10; t++) {
    const job = makeJobContext(['SAM', 'SGE'][t % 2]);
    const pool = smallPool(job, rand, ['head', 'neck', 'ring'], 2);
    if (!pool.length) continue;
    const sync = { cap: null, sync: false, level: 100 };
    const haste = hasteFor(job.jobId, 100)?.pct ?? 0;
    const subs = job.substats.filter(s => s !== 'spd');
    const target = subs[int(subs.length)];
    const free = optimize(job, pool, sync, { target, melds: true }).totals.spd;
    const at = gcdFor(free, 100, 2500, haste);
    for (const gcd of [Math.round((at + 0.01) * 100) / 100, at, Math.round((at - 0.01) * 100) / 100]) {
      for (const mode of ['exact', 'min']) {
        // the reference: every meal on its own, exhaustive over its gear-speed band, totals with food compared
        let want = null;
        for (const meal of foodChoices(job)) {
          const band = gearBand(job, meal, gcd, mode, 100, haste);
          if (!band) continue;
          const best = exhaustive(job, pool, sync, { target, melds: true, spdMin: band.min || null, spdMax: band.max });
          if (!best) continue;
          const withFood = [best[0] + foodAdd(job, meal, target, best[0], 100)];
          if (!want || withFood[0] > want[0]) want = withFood;
        }
        const r = optimizeGcd(job, pool, sync, { target, melds: true, gcd, mode, food: 'best' });
        const label = `${job.jobId} #${t} ${target} ${mode} ${gcd} free ${free}`;
        runs++;
        if (!want) {
          assert.equal(r.ok, false, label);
          continue;
        }
        assert.ok(r.ok, label);
        assert.deepEqual([r.withFood[target]], want, label);
      }
    }
  }
  assert.ok(runs >= 40, `${runs} runs`);
});

/* Legs that also cover the feet (Flanchards) and a body that also covers hands, legs and feet (Herklaedi), with a speed
   rule: the speed tables let a blocked slot stay empty, and the memo keys on what is blocked. Two Flanchards take
   melds (4 slots, overmeld). */
test('pieces covering several slots, with a speed band, match exhaustive search', () => {
  const war = makeJobContext('WAR');
  const rand = rng(1313),
    int = n => Math.floor(rand() * n);
  const all = gamePool(war, { type: 'any', ilvlMin: 40, ilvlMax: 75, lvlMax: 100 });
  const blockers = all.filter(i => /^(Heavy Darksteel Flanchard|High Mythril Flanchard|Herklaedi)$/.test(i.name));
  assert.equal(blockers.length, 3);
  const sync = { cap: null, sync: false, level: 100 };
  let runs = 0;
  for (let t = 0; t < 6; t++) {
    const pool = [...blockers];
    for (const ty of ['body', 'hands', 'legs', 'feet']) {
      const of = all.filter(i => i.type === ty && !blockers.includes(i));
      pool.push(of[int(of.length)]);
    }
    const target = ['det', 'crit', 'spec'][t % 3];
    const free = optimize(war, pool, sync, { target, melds: true }).totals.spd;
    for (const start of tiersAround(free, 100)) {
      const next = gcdTierAt(start, 100).next;
      for (const spdMax of [null, next != null ? next - 1 : null]) {
        const opts = { target, melds: true, spdMin: start || null, spdMax };
        const want = exhaustive(war, pool, sync, opts);
        const r = optimize(war, pool, sync, opts);
        const label = `#${t} ${JSON.stringify(opts)} ${pool.map(i => i.name).join(', ')}`;
        runs++;
        if (!want) assert.equal(r.ok, false, label);
        else assert.deepEqual([r.totals[target]], want, label);
      }
    }
  }
  assert.ok(runs >= 30, `${runs} runs`);
});
