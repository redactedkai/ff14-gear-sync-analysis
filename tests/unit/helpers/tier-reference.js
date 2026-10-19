/* The reference for rank by tier (core/tier-rank.js), shared by tests/unit/tier-rank.test.js and the longer sweep in
   tests/full/: every legal loadout (forEachLoadout, with its own stone enumeration), every meal, food and tiers
   computed from the formulas (not gearNeeded or rankTierOf), and the stage rule of the spec applied to the whole list,
   with weapon damage first when the job ranks it (a key without tiers, held at its most; owner's decision 2026-10-18).
   Pools are small real ones from three item level windows, with a weapon slot in place of the necklace, so weapon
   damage can differ between sets. */
import assert from 'node:assert/strict';
import { foodChoices } from '../../../src/core/food.js';
import { makeJobContext } from '../../../src/core/job-context.js';
import { optimize } from '../../../src/core/optimizer/index.js';
import { gcdFor, hasteFor, speedParams } from '../../../src/core/speed.js';
import { rankByTier } from '../../../src/core/tier-rank.js';
import { rng } from './common.js';
import { foodAdd, forEachLoadout, smallPool } from './exhaustive.js';
/* Tier steps per mille for each neutral stat (AkhMorning; Tenacity by its mitigation, 200); speed by its GCD. */
const STEP = { crit: 200, det: 140, dh: 550, ten: 200, piety: 150 };

/* The reference tier of `stat` for total `total` (gear plus food) at `level` with `haste`, or null for main stat and
   Vitality (their totals rank as they are). */
export function refTier(job, stat, total, level, haste) {
  if (stat === 'spd') return -Math.round(gcdFor(total, level, 2500, haste) * 100);
  const step = stat === 'spec' ? STEP[job.profile.spec] : STEP[stat];
  if (!step) return null;
  return Math.floor((step * total) / speedParams(level).div);
}

/* The best [tier per key, total per key] (totals with food) by the spec's stages, over every loadout and meal:
   per meal, for each key, keep the loadouts whose total is at least one above the start of the best tier left (or the
   most left, if less), then the best totals in key order; across meals, the best tiers, then the best totals. Null when
   no loadout meets the GCD. */
export function tierLex(job, pool, sync, { keys: goal, melds, meals, level, gcd = null, mode = 'exact' }) {
  const keys = job.damageKey ? ['wd', ...goal] : goal;
  const haste = hasteFor(job.jobId, level)?.pct ?? 0;
  const stats = [...new Set([...keys, 'spd'])];
  const meldKeys = gcd != null ? [...new Set([...keys, 'spd'])] : keys;
  const seen = new Set(),
    loadouts = [];
  forEachLoadout(job, pool, sync, { melds, meldKeys, exactSpd: gcd != null && mode === 'exact' }, get => {
    const v = stats.map(get);
    const id = v.join();
    if (seen.has(id)) return;
    seen.add(id);
    loadouts.push(Object.fromEntries(stats.map((s, i) => [s, v[i]])));
  });
  let best = null;
  for (const meal of meals) {
    const total = (x, k) => x[k] + foodAdd(job, meal, k, x[k], level);
    let left = loadouts;
    if (gcd != null) {
      const want = Math.round(gcd * 100);
      left = left.filter(x => {
        const at = Math.round(gcdFor(total(x, 'spd'), level, 2500, haste) * 100);
        return mode === 'exact' ? at === want : at <= want;
      });
    }
    if (!left.length) continue;
    const tiers = [];
    for (const k of keys) {
      const most = left.reduce((m, x) => Math.max(m, total(x, k)), Number.NEGATIVE_INFINITY);
      const tier = refTier(job, k, most, level, haste);
      let hold = most;
      if (tier != null) {
        let start = most;
        while (start > 0 && refTier(job, k, start - 1, level, haste) === tier) start--;
        hold = Math.min(start + 1, most);
      }
      tiers.push(tier ?? most);
      left = left.filter(x => total(x, k) >= hold);
    }
    let totals = null;
    for (const x of left) {
      const t = keys.map(k => total(x, k));
      if (!totals || lexGreater(t, totals)) totals = t;
    }
    const v = [...tiers, ...totals];
    if (!best || lexGreater(v, best)) best = v;
  }
  return best;
}

function lexGreater(a, b) {
  const i = a.findIndex((x, k) => x !== b[k]);
  return i >= 0 && a[i] > b[i];
}

/* The engine's result as the reference reads it: [tier per key, total with food per key], weapon damage first when the
   job ranks it (as tierLex). */
export function asVector(job, r, goal, level) {
  const keys = job.damageKey ? ['wd', ...goal] : goal;
  const haste = hasteFor(job.jobId, level)?.pct ?? 0;
  return [
    ...keys.map(k => refTier(job, k, r.withFood[k] || 0, level, haste) ?? (r.withFood[k] || 0)),
    ...keys.map(k => r.withFood[k] || 0),
  ];
}

/* `count` random cases with no Target GCD from seed `seed`, each against the reference: six jobs, levels 50 and 100,
   two or three keys (sometimes main stat), melds on or off, food off / one meal / every meal. Returns {runs, differs}:
   the cases run, and those where the tier order picks other totals than the raw order (the reason for A7). */
export function checkNoGcd(seed, count) {
  const rand = rng(seed),
    int = n => Math.floor(rand() * n);
  let runs = 0,
    differs = 0;
  for (let t = 0; t < count; t++) {
    const job = makeJobContext(['SGE', 'WAR', 'SAM', 'BLM', 'DRK', 'WHM'][t % 6]);
    const level = t % 3 === 0 ? 50 : 100;
    const sync = { cap: null, sync: false, level };
    // every other case without weapons: with two, weapon damage (the first key) often leaves one, and the raw and
    // tier orders then rarely differ on the rest
    const pool = smallPool(job, rand, t % 2 ? ['weapon', 'head', 'body', 'ring'] : ['head', 'body', 'neck', 'ring'], 2);
    if (!pool.length) continue;
    const melds = rand() < 0.7;
    const subs = [...job.substats].sort(() => rand() - 0.5);
    const three = rand() < 0.35;
    const keys = rand() < 0.15 ? ['main', subs[0]] : subs.slice(0, three ? 3 : 2);
    const choices = foodChoices(job);
    const food = [null, choices[int(choices.length)], 'best'][t % 3];
    const meals = food === 'best' ? choices : [food];
    const want = tierLex(job, pool, sync, { keys, melds, meals, level });
    const r = rankByTier(job, pool, sync, { target: keys[0], tiebreak: keys.slice(1), melds, food, level });
    const label = `${job.jobId} #${t} L${level} ${keys.join('>')} melds ${melds} food ${food === 'best' ? 'best' : food?.key}`;
    runs++;
    assert.ok(r.ok && !r.truncated, label);
    assert.deepEqual(asVector(job, r, keys, level), want, label);
    const raw = optimize(job, pool, sync, { target: keys[0], tiebreak: keys.slice(1), melds });
    if (keys.some(k => raw.totals[k] !== r.totals[k])) differs++;
  }
  return { runs, differs };
}

/* `count` random cases with a Target GCD from seed `seed`, each against the reference: four jobs (two with always-on
   haste), level 100, both GCD modes, food off or every meal, a GCD at the free result's or one step either side; two
   keys, or with `threeKeys` three in two cases of three. Cases before `from` are drawn but not solved, so a long sweep
   can be split across files (tests/full/) and still check the same cases. Returns {runs, infeasible}. */
export function checkGcd(seed, count, threeKeys = false, from = 0) {
  const rand = rng(seed),
    int = n => Math.floor(rand() * n);
  let runs = 0,
    infeasible = 0;
  for (let t = 0; t < count; t++) {
    const job = makeJobContext(['SAM', 'SGE', 'NIN', 'PLD'][t % 4]);
    const level = 100;
    const sync = { cap: null, sync: false, level };
    const pool = smallPool(job, rand, ['weapon', 'head', 'body', 'ring'], 2);
    if (!pool.length) continue;
    const subs = job.substats.filter(s => s !== 'spd').sort(() => rand() - 0.5);
    const keys = subs.slice(0, threeKeys && t % 3 !== 0 ? 3 : 2);
    const choices = foodChoices(job);
    const food = [null, 'best'][t % 2];
    const meals = food === 'best' ? choices : [null];
    // a GCD near the free result's: its own, or one step either side (drawn before the skip, so every case keeps its
    // draws whatever `from` is)
    const step = [-1, 0, 1][int(3)];
    if (t < from) continue;
    const haste = hasteFor(job.jobId, level)?.pct ?? 0;
    const free = optimize(job, pool, sync, { target: keys[0], melds: true }).totals.spd;
    const gcd = Math.round(gcdFor(free, level, 2500, haste) * 100 + step) / 100;
    const mode = t % 4 < 2 ? 'exact' : 'min';
    const want = tierLex(job, pool, sync, { keys, melds: true, meals, level, gcd, mode });
    const r = rankByTier(job, pool, sync, { target: keys[0], tiebreak: keys.slice(1), melds: true, food, level, gcd, mode });
    const label = `${job.jobId} #${t} ${keys.join('>')} ${mode} ${gcd} food ${food}`;
    runs++;
    if (!want) {
      infeasible++;
      assert.equal(r.ok, false, label);
      continue;
    }
    assert.ok(r.ok && !r.truncated, label);
    assert.deepEqual(asVector(job, r, keys, level), want, label);
  }
  return { runs, infeasible };
}
