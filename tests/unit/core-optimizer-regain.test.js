/* Regain cuts (src/core/optimizer/regain.js), as tier ranking uses them: a first search proves the most of one key
   under a speed rule; a second search holds that key a few points below its most and maximizes another, with the
   proof. On small real pools, with melds (where the cuts work: a stone moved off the held key is a regain), against the
   exhaustive reference (helpers/exhaustive.js), which shares no code with the cuts. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeJobContext } from '../../src/core/job-context.js';
import { optimize, prepare, solve } from '../../src/core/optimizer/index.js';
import { addRegainCuts } from '../../src/core/optimizer/regain.js';
import { exhaustive, smallPool } from './helpers/exhaustive.js';
import { rng } from './helpers/common.js';

const NO_SYNC = { cap: null, sync: false, level: 100 };

test('regain cuts: the search with a proven maximum gives the exhaustive totals, and the plain answer meets every cut', () => {
  const rand = rng(31337),
    int = n => Math.floor(rand() * n);
  let runs = 0,
    cutSome = 0;
  for (let t = 0; t < 40; t++) {
    const job = makeJobContext(['SGE', 'WHM', 'SAM', 'PLD', 'BLM'][t % 5]);
    const pool = smallPool(job, rand, ['head', 'body', 'neck', 'ring'], 2);
    if (!pool.length) continue;
    const [held, target] = job.substats.filter(s => s !== 'spd').sort(() => rand() - 0.5);
    const versionKeys = [held, target, 'spd'];

    // a speed band (or, one time in three, a minimum only) near the free result's speed
    const free = optimize(job, pool, NO_SYNC, { target: held, melds: true });
    const spdMin = Math.max(0, free.totals.spd - int(60));
    const spdMax = t % 3 === 0 ? null : spdMin + 10 + int(30);
    const speed = { spdMin, spdMax };

    // 1. the most of `held` under the speed rule: the proof
    const first = prepare(job, pool, NO_SYNC, { target: held, melds: true, speed: 'exact', versionKeys });
    const r1 = solve(first, speed);
    if (!r1.ok) continue;
    assert.ok(!r1.truncated);
    const most = r1.totals[held];
    const label = `${job.jobId} #${t} ${held} held, ${target} ${JSON.stringify(speed)}`;
    assert.equal(most, exhaustive(job, pool, NO_SYNC, { target: held, ...speed, melds: true })[0], label);
    const proof = { stat: held, most, minStats: [], speed: spdMax != null ? 'band' : 'min' };

    // 2. `target` first, `held` a few points below its most, from the first result, with the proof
    const hold = most - int(8);
    const second = prepare(job, pool, NO_SYNC, { target, tiebreak: [held], melds: true, speed: 'exact', minStats: [held], versionKeys });
    const limits = { ...speed, mins: { [held]: hold } };
    const r2 = solve(second, { ...limits, seed: r1.picks, proven: [proof] });
    const want = exhaustive(job, pool, NO_SYNC, { target, tiebreak: [held], ...limits, melds: true });
    assert.ok(r2.ok && !r2.truncated, label);
    assert.deepEqual([r2.totals[target], r2.totals[held]], want, label);
    runs++;

    // the inequality itself on the plain search's answer: each of its pieces passes the cut, and their regains sum to
    // at most most - hold
    const plain = solve(second, { ...limits, plain: true });
    const searchLimits = [
      { stat: 'spd', min: spdMin > 0 ? spdMin : null, max: spdMax },
      { stat: held, min: hold, max: null },
    ];
    const cut = addRegainCuts({
      slotList: second.slotList,
      posList: second.posList,
      fullLists: second.posList,
      dims: second.dims,
      limits: searchLimits,
      proven: [proof],
    });
    const copies = cut.posList.flat();
    let regain = 0;
    for (const pick of plain.picks) {
      if (!pick.item) continue;
      const copy = copies.find(c => c.original.item === pick.item && c.original.eff === pick.eff);
      assert.ok(copy, `${label}: ${pick.item.name} cut`);
      regain += copy.eff.regain0;
    }
    assert.ok(regain <= most - hold, `${label}: regain ${regain} > ${most - hold}`);
    if (copies.length < second.posList.flat().length) cutSome++;
  }
  assert.ok(runs >= 25, `${runs} runs`);
  assert.ok(cutSome >= 20, `${cutSome} runs where the cut dropped pieces`);
});

test('regain cuts: under a speed minimum only, a swap may not lower speed', () => {
  // one head slot: a fast piece with no Critical Hit, and a slow piece with 50. The proof says Critical Hit is at most 60
  // under a speed minimum, and this search holds it at 50, a room of 10. Swapping the fast piece for the slow one would
  // gain 50 Critical Hit but lose speed, which could break the minimum, so that swap does not count: the fast piece's
  // regain is 0 and it stays. (Counting it would drop the fast piece, which the minimum may need.)
  const fast = { item: { id: 'fast' }, eff: { spd: 40, crit: 0 }, blocks: [], copies: 1 };
  const slow = { item: { id: 'slow' }, eff: { spd: 0, crit: 50 }, blocks: [], copies: 1 };
  const proof = { stat: 'crit', most: 60, minStats: [], speed: 'min' };
  const limits = [
    { stat: 'spd', min: 30, max: null },
    { stat: 'crit', min: 50, max: null },
  ];
  const cut = addRegainCuts({
    slotList: ['head'],
    posList: [[fast, slow]],
    fullLists: [[fast, slow]],
    dims: ['spd', 'crit'],
    limits,
    proven: [proof],
  });
  const kept = cut.posList[0].map(c => c.original.item.id);
  assert.deepEqual(kept, ['fast', 'slow']);
  assert.equal(cut.posList[0][0].eff.regain0, 0);
  // the slow piece may become the fast one (speed rises), which gains no Critical Hit
  assert.equal(cut.posList[0][1].eff.regain0, 0);
});
