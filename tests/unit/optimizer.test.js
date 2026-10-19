/* The optimizer (src/core/optimizer/) on real gear against the brute-force reference, one job per role, and the
   ring-pair bound and dominance pruning that keep its search small. Unique rings on real gear are in views.test.js,
   hand-made ring cases in optimizer-exhaustive.test.js. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeJobContext } from '../../src/core/job-context.js';
import { optimize } from '../../src/core/optimizer/index.js';
import { pruneDominated, makeScorer } from '../../src/core/optimizer/candidates.js';
import { suffixBounds } from '../../src/core/optimizer/search.js';
import { optimizeGcd } from '../../src/core/target-gcd.js';
import { rankByTier } from '../../src/core/tier-rank.js';
import { exhaustive, gamePool, loadoutCount } from './helpers/exhaustive.js';

const sge = makeJobContext('SGE');
const SYNC = { cap: 123, sync: true };
const NOSYNC = { cap: 123, sync: false };

/* Real gear pools, one job per role: every database item the job can equip in a small item level window
   (equip level 50 or below), small enough that exhaustive() can try every loadout. The expected totals come
   from that brute force, not from the optimizer. */
const REAL_POOLS = [
  ['WHM', { ilvlMin: 130, ilvlMax: 135, lvlMax: 50 }],
  ['SGE', { ilvlMin: 120, ilvlMax: 130, lvlMax: 50 }],
  ['WAR', { ilvlMin: 130, ilvlMax: 135, lvlMax: 50 }],
  ['PLD', { ilvlMin: 128, ilvlMax: 132, lvlMax: 50 }],
  ['DRG', { ilvlMin: 130, ilvlMax: 135, lvlMax: 50 }],
  ['BRD', { ilvlMin: 125, ilvlMax: 135, lvlMax: 50 }],
  ['BLM', { ilvlMin: 125, ilvlMax: 135, lvlMax: 50 }],
];

for (const [jobId, filter] of REAL_POOLS) {
  test(`${jobId} real gear (item level ${filter.ilvlMin}-${filter.ilvlMax}): optimizer equals brute force for every substat, synced and unsynced`, () => {
    const job = makeJobContext(jobId);
    const pool = gamePool(job, filter);
    // a real choice in every slot the job's gear covers here, and a pool small enough to enumerate
    const covered = job.activeSlotTypes.filter(t => pool.some(i => i.type === t));
    assert.ok(covered.length >= 9, `${jobId}: only ${covered.join(', ')}`);
    assert.ok(
      covered.every(t => pool.filter(i => i.type === t).length >= 2 || t === 'offhand'),
      `${jobId}: a slot has a single item`,
    );
    const n = loadoutCount(job, pool);
    assert.ok(n >= 1000 && n <= 200000, `${jobId}: ${n} loadouts`);
    for (const sync of [SYNC, NOSYNC]) {
      for (const target of job.substats) {
        const opts = { target, tiebreak: ['main', 'vit'] };
        const r = optimize(job, pool, sync, opts);
        const label = `${jobId} ${target} sync=${sync.sync}`;
        assert.ok(r.ok && !r.truncated, label);
        assert.deepEqual(
          [target, 'main', 'vit'].map(s => r.totals[s]),
          exhaustive(job, pool, sync, opts),
          label,
        );
      }
    }
  });
}

/* The two ring slots are bounded together by the best legal pair: a Unique ring is never counted twice. */
test('ring-pair bound: the best ring twice only with 2 copies, else the best plus the best other item', () => {
  const cand = (name, spd, copies) => ({ item: { id: name }, eff: { spd }, score: spd, copies });
  const slots = ['ring', 'ring'];
  const bound = list => suffixBounds(slots, [list, list], ['spd']);
  const u = cand('U', 10, 1);
  // Unique best ring: 10 + 6, not 20; the bound of the second ring slot alone stays the best single ring
  let b = bound([u, cand('A', 6, 1), cand('B', 5, 1)]);
  assert.deepEqual([b.remSc[0], b.remMax.spd[0], b.remSc[1]], [16, 16, 10]);
  // two candidates of one Unique item are still one ring
  b = bound([u, { ...u, eff: { spd: 9 }, score: 9 }, cand('A', 6, 1)]);
  assert.equal(b.remSc[0], 16);
  // a 2-copy best ring may be worn twice; a lone Unique ring is worn once
  assert.equal(bound([cand('T', 10, 2), cand('A', 6, 1)]).remSc[0], 20);
  assert.equal(bound([u]).remSc[0], 10);
});

/* Real full pool where counting the Unique best ring twice made the bound useless: 80,290 nodes before the pair
   bound, 170 after (same result). */
test('ring-pair bound keeps a full-pool search small: Sage, cap 660, Spell Speed > Critical Hit > Determination', () => {
  const pool = gamePool(sge, {});
  const r = optimize(sge, pool, { cap: 660, sync: true, level: 100 }, { target: 'spd', tiebreak: ['crit', 'det'] });
  assert.ok(r.ok && !r.truncated);
  assert.ok(r.nodes < 1000, `${r.nodes} nodes`);
});

/* Dominance counts copies per item: two candidates of one Unique ring are one ring, so a third ring they both beat
   is still needed for the pair and must not be dropped. */
test('dominance pruning counts the copies of one item once', () => {
  const u = { id: 'U' };
  const arr = [
    { item: u, eff: { spd: 10 }, copies: 1, blocks: [] },
    { item: u, eff: { spd: 9 }, copies: 1, blocks: [] },
    { item: { id: 'C' }, eff: { spd: 5 }, copies: 1, blocks: [] },
  ];
  assert.deepEqual(
    pruneDominated(arr, ['spd'], 2).map(a => a.item.id),
    ['U', 'U', 'C'],
  );
  // a second, different item that beats C does make it droppable
  arr.push({ item: { id: 'D' }, eff: { spd: 7 }, copies: 1, blocks: [] });
  assert.deepEqual(
    pruneDominated(arr, ['spd'], 2).map(a => a.item.id),
    ['U', 'U', 'D'],
  );
});

/* Audit 16, R7: a fifth ranked key was sliced off without a word. The packed score has room for weapon damage, the
   target and two tiebreaks only (docs/engineering/optimizer.md section 3), so more keys must fail loudly. */
test('makeScorer: four keys rank in order, a fifth throws', () => {
  const vectors = [[{ wd: 1, crit: 2, det: 3, dh: 4, spd: 5 }]];
  const score = makeScorer(['wd', 'crit', 'det', 'dh'], vectors);
  assert.ok(score({ wd: 1 }) > score({ crit: 2, det: 3, dh: 4 }));
  assert.throws(() => makeScorer(['wd', 'crit', 'det', 'dh', 'spd'], vectors), /at most 4 ranked keys/);
});

/* Audit 01, finding 20: the three entry points defaulted the goal to Spell or Skill Speed, from the Sage-only days.
   The neutral default is the main stat (CLAUDE.md); the page always passes a goal, so this only guards other callers. */
test('optimize, optimizeGcd and rankByTier: no goal given means the main stat', () => {
  const job = makeJobContext('SGE');
  const pool = gamePool(job, { ilvlMin: 690, ilvlMax: 730 });
  const sync = { cap: null, sync: false, level: 100 };
  const pickIds = res => res.picks.map(p => p.item?.id ?? null);
  for (const run of [
    opts => optimize(job, pool, sync, opts),
    opts => optimizeGcd(job, pool, sync, { ...opts, gcd: 2.45, mode: 'min' }),
    opts => rankByTier(job, pool, sync, opts),
  ]) {
    const noGoal = run({ tiebreak: ['crit'] });
    assert.ok(noGoal.ok);
    assert.deepEqual(pickIds(noGoal), pickIds(run({ target: 'main', tiebreak: ['crit'] })));
    assert.notDeepEqual(pickIds(noGoal), pickIds(run({ target: 'spd', tiebreak: ['crit'] })));
  }
});
