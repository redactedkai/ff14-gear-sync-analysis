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
