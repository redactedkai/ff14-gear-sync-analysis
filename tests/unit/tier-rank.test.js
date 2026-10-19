/* Rank by tier (core/tier-rank.js) against the reference in helpers/tier-reference.js: every legal loadout and meal,
   the stage rule of the spec applied to the whole list. A longer random sweep for the search's speed-ups is in
   tests/full/ (npm run test:full). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { foodChoices } from '../../src/core/food.js';
import { makeJobContext } from '../../src/core/job-context.js';
import { optimize } from '../../src/core/optimizer/index.js';
import { rankByTier } from '../../src/core/tier-rank.js';
import { rng } from './helpers/common.js';
import { smallPool } from './helpers/exhaustive.js';
import { asVector, checkGcd, checkNoGcd, tierLex } from './helpers/tier-reference.js';

test('rank by tier matches the reference: two and three keys, main stat, food off / one meal / every meal, levels 50 and 100', () => {
  const { runs, differs } = checkNoGcd(7070, 36);
  assert.ok(runs >= 30, `${runs} runs`);
  // how often the tier order picks another set than the raw order (the reason for A7)
  assert.ok(differs >= 3, `${differs} runs where tier ranking changes the set`);
});

test('rank by tier with a Target GCD (both modes, haste, food) matches the reference', () => {
  const { runs, infeasible } = checkGcd(8181, 24);
  assert.ok(runs >= 20, `${runs} runs`);
  assert.ok(infeasible < runs / 2, `${infeasible} infeasible`);
});

/* Three keys with a Target GCD, where the search's speed-ups work (regain cuts, slot order, trial search, band reach;
   docs/engineering/tier-ranking.md, section 4): a band, and two held keys before the last stage. Each changes which
   partial loadouts the search visits, never the answer. The first 20 cases of the sweep in tests/full/, which runs 360
   (npm run test:full). */
test('rank by tier, three keys with a Target GCD: 20 cases against the reference', () => {
  const { runs, infeasible } = checkGcd(33818, 20, true);
  assert.ok(runs >= 15, `${runs} runs`);
  assert.ok(infeasible < runs / 2, `${infeasible} infeasible`);
});

/* Vitality as a key, with food: meals add Vitality too (since 2026-10-18), so holding it must count theirs (owner's
   screenshot: Astrologian at level 50, Mind > Vitality > Direct Hit, best meal, found no set). */
test('rank by tier with Vitality as a key and food matches the reference', () => {
  const rand = rng(5150);
  let runs = 0;
  for (const [t, keys] of [
    ['main', 'vit', 'dh'],
    ['main', 'vit'],
    ['crit', 'vit'],
    ['vit', 'det'],
  ].entries())
    for (const jobId of ['AST', 'WAR']) {
      const job = makeJobContext(jobId);
      const level = t % 2 ? 100 : 50;
      const sync = { cap: null, sync: false, level };
      const pool = smallPool(job, rand, ['weapon', 'head', 'body', 'ring'], 2);
      if (!pool.length) continue;
      const meals = foodChoices(job);
      const want = tierLex(job, pool, sync, { keys, melds: true, meals, level });
      const r = rankByTier(job, pool, sync, { target: keys[0], tiebreak: keys.slice(1), melds: true, food: 'best', level });
      const label = `${jobId} L${level} ${keys.join('>')}`;
      runs++;
      assert.ok(r.ok && !r.truncated, label);
      assert.deepEqual(asVector(job, r, keys, level), want, label);
    }
  assert.ok(runs >= 6, `${runs} runs`);
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
