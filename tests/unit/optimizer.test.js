import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeJobContext } from '../../src/core/job-context.js';
import { genericItems } from '../../src/core/items.js';
import { optimize } from '../../src/core/optimizer/index.js';
import { pruneDominated } from '../../src/core/optimizer/candidates.js';
import { suffixBounds } from '../../src/core/optimizer/search.js';
import { gcdFor } from '../../src/core/speed.js';
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

/* The one item level 130 healer ring that is Unique (property, not name): with it as the only ring, the
   loadout wears it once and leaves the second ring slot empty. */
const healer130 = { ilvlMin: 130, ilvlMax: 130, lvlMax: 50 };
const uniqueRingPool = gamePool(sge, healer130, r => r.type !== 'ring' || r.unique);

test('Unique ring pool: item level 130 Sage gear with its only ring Unique', () => {
  const rings = uniqueRingPool.filter(i => i.type === 'ring');
  assert.equal(rings.length, 1);
  assert.equal(rings[0].copies, 1);
  for (const t of ['head', 'body', 'hands', 'legs', 'feet', 'ear', 'neck', 'wrist']) {
    assert.ok(uniqueRingPool.filter(i => i.type === t).length >= 2, t);
  }
});

for (const sync of [SYNC, NOSYNC]) {
  test(`a Unique ring is worn once (sync ${sync.sync ? 'on' : 'off'}), and a second copy would have been chosen`, () => {
    const r = optimize(sge, uniqueRingPool, sync, { target: 'spd' });
    const ringPicks = r.picks.filter(p => p.type === 'ring' && p.item);
    assert.equal(ringPicks.length, 1);
    assert.deepEqual([r.totals.spd], exhaustive(sge, uniqueRingPool, sync, { target: 'spd' }));
    // the rule binds: the same ring with 2 copies would be worn twice, adding its Spell Speed again
    const twice = uniqueRingPool.map(i => (i.type === 'ring' ? { ...i, copies: 2 } : i));
    const r2 = optimize(sge, twice, sync, { target: 'spd' });
    assert.equal(r2.picks.filter(p => p.type === 'ring' && p.item).length, 2);
    assert.equal(r2.totals.spd, r.totals.spd + ringPicks[0].eff.spd);
    assert.ok(ringPicks[0].eff.spd > 0);
  });
}

test('sync lowers the best Spell Speed of item level 130 gear under a 123 cap', () => {
  const synced = optimize(sge, uniqueRingPool, SYNC, { target: 'spd' }).totals.spd;
  const unsynced = optimize(sge, uniqueRingPool, NOSYNC, { target: 'spd' }).totals.spd;
  assert.ok(synced < unsynced, `${synced} vs ${unsynced}`);
});

test('generic maximum under a 123 cap is 296 Spell Speed, 2.22 s GCD', () => {
  const gen = genericItems(sge, 475, sge.substats, ['head', 'body', 'hands', 'legs', 'feet', 'ear', 'neck', 'wrist', 'ring']);
  const r = optimize(sge, gen, { cap: 123, sync: true }, { target: 'spd' });
  assert.deepEqual([r.totals.spd, gcdFor(r.totals.spd, 50)], [296, 2.22]);
});

/* The two ring slots are bounded together by the best legal pair: a Unique ring is never counted twice. */
test('ring-pair bound: the best ring twice only with 2 copies, else the best plus the best other item', () => {
  const cand = (name, spd, copies) => ({ it: { id: name }, v: { spd }, sc: spd, copies });
  const slots = ['ring', 'ring'];
  const bound = list => suffixBounds(slots, [list, list], ['spd']);
  const u = cand('U', 10, 1);
  // Unique best ring: 10 + 6, not 20; the bound of the second ring slot alone stays the best single ring
  let b = bound([u, cand('A', 6, 1), cand('B', 5, 1)]);
  assert.deepEqual([b.remSc[0], b.remMax.spd[0], b.remSc[1]], [16, 16, 10]);
  // two candidates of one Unique item are still one ring
  b = bound([u, { ...u, v: { spd: 9 }, sc: 9 }, cand('A', 6, 1)]);
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
    { it: u, v: { spd: 10 }, copies: 1, blocks: [] },
    { it: u, v: { spd: 9 }, copies: 1, blocks: [] },
    { it: { id: 'C' }, v: { spd: 5 }, copies: 1, blocks: [] },
  ];
  assert.deepEqual(
    pruneDominated(arr, ['spd'], 2).map(a => a.it.id),
    ['U', 'U', 'C'],
  );
  // a second, different item that beats C does make it droppable
  arr.push({ it: { id: 'D' }, v: { spd: 7 }, copies: 1, blocks: [] });
  assert.deepEqual(
    pruneDominated(arr, ['spd'], 2).map(a => a.it.id),
    ['U', 'U', 'D'],
  );
});
