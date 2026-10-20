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

/* A stage that stops at its node limit: with no set yet (the first stage, which has no seed) the result is 'none' and
   marked truncated; with a seed from the stage before, the result keeps a set that meets every hold so far, is no
   better than the finished run's, and is marked truncated. Small node limits on a small pool (SGE, no Target GCD),
   where a limit of a few dozen nodes stops some stage but not the first. */
test('rank by tier: a stage stopped at its node limit gives none or a held set, marked truncated', () => {
  const job = makeJobContext('SGE');
  const sync = { cap: null, sync: false, level: 100 };
  const types = ['weapon', 'head', 'body', 'hands', 'legs', 'feet', 'neck', 'ear', 'ring'];
  const pool = smallPool(job, rng(5), types, 5, 2, { ilvlMin: 690, ilvlMax: 730 });
  const opts = { target: 'crit', tiebreak: ['det', 'dh'], melds: true };
  const full = rankByTier(job, pool, sync, opts);
  assert.ok(full.ok && !full.truncated);
  const lex = r => ['wd', 'crit', 'det', 'dh'].map(stat => r.totals[stat] || 0);

  const first = rankByTier(job, pool, sync, { ...opts, nodeLimit: 1 });
  assert.equal(first.ok, false);
  assert.equal(first.reason, 'none');
  assert.equal(first.truncated, true);

  let stoppedWithSet = 0;
  for (const nodeLimit of [10, 30, 100]) {
    const r = rankByTier(job, pool, sync, { ...opts, nodeLimit });
    if (!r.ok || !r.truncated) continue;
    for (const h of r.held) assert.ok(r.withFood[h.stat] >= h.hold, `${nodeLimit}: ${h.stat} held`);
    const [mine, best] = [lex(r), lex(full)];
    const firstDiff = mine.findIndex((v, i) => v !== best[i]);
    assert.ok(firstDiff < 0 || mine[firstDiff] < best[firstDiff], `${nodeLimit}: ${mine} beats ${best}`);
    stoppedWithSet++;
  }
  assert.ok(stoppedWithSet >= 1, 'no run stopped after its first stage');
});

/* A Target GCD the pool cannot meet: 'unreachable' when no speed gives it (slower than the GCD with no speed, exactly
   mode), 'none' when no loadout lands in its band; both name the fastest GCD the pool reaches. */
test('rank by tier: an infeasible Target GCD gives unreachable or none, with the fastest GCD', () => {
  const job = makeJobContext('SGE');
  const sync = { cap: null, sync: false, level: 100 };
  const types = ['weapon', 'head', 'body', 'hands', 'legs', 'feet', 'neck', 'ring'];
  const pool = smallPool(job, rng(3), types, 4, 2, { ilvlMin: 690, ilvlMax: 730 });
  const opts = { target: 'crit', tiebreak: ['det'], melds: true, mode: 'exact' };
  const tooFast = rankByTier(job, pool, sync, { ...opts, gcd: 2.0 });
  assert.equal(tooFast.ok, false);
  assert.equal(tooFast.reason, 'none');
  assert.ok(tooFast.fastest > 2.0, `fastest ${tooFast.fastest}`);
  const tooSlow = rankByTier(job, pool, sync, { ...opts, gcd: 3.0 });
  assert.equal(tooSlow.ok, false);
  assert.equal(tooSlow.reason, 'unreachable');
  assert.equal(tooSlow.fastest, tooFast.fastest);
});
