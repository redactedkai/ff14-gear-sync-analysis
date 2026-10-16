/* Rank by tier (core/tier-rank.js) against a reference written out here: every legal loadout (forEachLoadout, with its
   own stone enumeration), every meal, food and tiers computed from the formulas (not gearNeeded or rankTierOf), and the
   stage rule of the spec applied to the whole list. Pools are small real ones from three item level windows. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { foodChoices } from '../../src/core/food.js';
import { makeJobContext } from '../../src/core/job-context.js';
import { optimize } from '../../src/core/optimizer/index.js';
import { gcdFor, hasteFor, speedParams } from '../../src/core/speed.js';
import { rankByTier } from '../../src/core/tier-rank.js';
import { foodAdd, forEachLoadout, smallPool } from './helpers/exhaustive.js';
import { rng } from './helpers/common.js';

/* Tier steps per mille for each neutral stat (AkhMorning; Tenacity by its mitigation, 200); speed by its GCD. */
const STEP = { crit: 200, det: 140, dh: 550, ten: 200, piety: 150 };

/* The reference tier of `stat` for total `total` (gear plus food) at `level` with `haste`, or null for main stat and
   Vitality (their totals rank as they are). */
function refTier(job, stat, total, level, haste) {
  if (stat === 'spd') return -Math.round(gcdFor(total, level, 2500, haste) * 100);
  const step = stat === 'spec' ? STEP[job.profile.spec] : STEP[stat];
  if (!step) return null;
  return Math.floor((step * total) / speedParams(level).div);
}

/* The best [tier per key, total per key] (totals with food) by the spec's stages, over every loadout and meal:
   per meal, for each key, keep the loadouts whose total is at least one above the start of the best tier left (or the
   most left, if less), then the best totals in key order; across meals, the best tiers, then the best totals. Null when
   no loadout meets the GCD. */
function tierLex(job, pool, sync, { keys, melds, meals, level, gcd = null, mode = 'exact' }) {
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
      const most = Math.max(...left.map(x => total(x, k)));
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

/* The engine's result as the reference reads it: [tier per key, total with food per key]. */
function asVector(job, r, keys, level) {
  const haste = hasteFor(job.jobId, level)?.pct ?? 0;
  return [
    ...keys.map(k => refTier(job, k, r.withFood[k] || 0, level, haste) ?? (r.withFood[k] || 0)),
    ...keys.map(k => r.withFood[k] || 0),
  ];
}

test('rank by tier matches the reference: two and three keys, main stat, food off / one meal / every meal, levels 50 and 100', () => {
  const rand = rng(7070),
    int = n => Math.floor(rand() * n);
  let runs = 0,
    differs = 0;
  for (let t = 0; t < 36; t++) {
    const job = makeJobContext(['SGE', 'WAR', 'SAM', 'BLM', 'DRK', 'WHM'][t % 6]);
    const level = t % 3 === 0 ? 50 : 100;
    const sync = { cap: null, sync: false, level };
    const pool = smallPool(job, rand, ['head', 'body', 'neck', 'ring'], 2);
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
    // how often the tier order picks another set than the raw order (the reason for A7)
    const raw = optimize(job, pool, sync, { target: keys[0], tiebreak: keys.slice(1), melds });
    if (keys.some(k => raw.totals[k] !== r.totals[k])) differs++;
  }
  assert.ok(runs >= 30, `${runs} runs`);
  assert.ok(differs >= 3, `${differs} runs where tier ranking changes the set`);
});

test('rank by tier with a Target GCD (both modes, haste, food) matches the reference', () => {
  const rand = rng(8181),
    int = n => Math.floor(rand() * n);
  let runs = 0,
    infeasible = 0;
  for (let t = 0; t < 24; t++) {
    const job = makeJobContext(['SAM', 'SGE', 'NIN', 'PLD'][t % 4]);
    const level = 100;
    const sync = { cap: null, sync: false, level };
    const pool = smallPool(job, rand, ['head', 'body', 'neck', 'ring'], 2);
    if (!pool.length) continue;
    const subs = job.substats.filter(s => s !== 'spd').sort(() => rand() - 0.5);
    const keys = subs.slice(0, 2);
    const choices = foodChoices(job);
    const food = [null, 'best'][t % 2];
    const meals = food === 'best' ? choices : [null];
    // a GCD near the free result's: its own, or one step either side
    const haste = hasteFor(job.jobId, level)?.pct ?? 0;
    const free = optimize(job, pool, sync, { target: keys[0], melds: true }).totals.spd;
    const gcd = Math.round(gcdFor(free, level, 2500, haste) * 100 + [-1, 0, 1][int(3)]) / 100;
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
  assert.ok(runs >= 20, `${runs} runs`);
  assert.ok(infeasible < runs / 2, `${infeasible} infeasible`);
});

test('rank by tier: only raw keys give the raw optimizer; a key is held one point above its tier start', () => {
  const job = makeJobContext('SGE');
  const sync = { cap: null, sync: false, level: 100 };
  const pool = smallPool(job, rng(12), ['head', 'body', 'neck', 'ring'], 2, 1, { ilvlMin: 690, ilvlMax: 730 });
  // main stat alone has no tiers: the same totals as optimize
  const raw = optimize(job, pool, sync, { target: 'main', tiebreak: ['vit'], melds: true });
  const r = rankByTier(job, pool, sync, { target: 'main', tiebreak: ['vit'], melds: true, level: 100 });
  assert.deepEqual([r.totals.main, r.totals.vit], [raw.totals.main, raw.totals.vit]);
  // every held key with a tier is held at its tier start + 1, or at the most reached
  const t = rankByTier(job, pool, sync, { target: 'crit', tiebreak: ['det', 'spec'], melds: true, level: 100 });
  for (const h of t.held) assert.ok(t.withFood[h.stat] >= h.hold, h.stat);
});
