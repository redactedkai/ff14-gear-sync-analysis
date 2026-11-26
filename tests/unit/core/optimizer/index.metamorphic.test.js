/* Properties of optimize() that must hold whatever the answer is, on every job's whole real pool, with fixed seeds:
   removing pieces the search did not choose keeps the totals, and removing a chosen one never improves them; tiebreaks never
   change weapon damage and the goal; a looser speed maximum or minimum never lowers the goal; jobs of one gear group wear
   the same pieces and so reach the same totals. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JOBS } from '../../../../src/core/constants.ts';
import { GEAR_GROUPS } from '../../../../src/core/gear-groups.ts';
import { jobGear } from '../../../../src/core/items.js';
import { makeJobContext } from '../../../../src/core/job-context.js';
import { optimize } from '../../../../src/core/optimizer/index.js';
import { rng } from '../../helpers/common.js';
import { lexCompare } from '../../helpers/exact-solver.js';

const SYNCS = [
  { cap: 123, sync: true, level: 100 },
  { cap: null, sync: false, level: 100 },
  { cap: 660, sync: true, level: 90 },
];
const jobs = JOBS.map(job => makeJobContext(job.id));
const pools = new Map(jobs.map(job => [job.jobId, jobGear(job)]));
const solve = (job, sync, options, pool = pools.get(job.jobId)) => optimize(job, pool, sync, options);
/* What the search ranks first: weapon damage (none for Blue Mage) and the goal. */
const rankOf = (result, goal) => [result.totals.wd ?? 0, result.totals[goal]];
const pickFrom = (rand, list) => list[Math.floor(rand() * list.length)];

test('removing pieces the search did not choose keeps the totals; removing a chosen one never improves them', () => {
  const rand = rng(4242);
  for (const job of jobs) {
    const sync = SYNCS[Math.floor(rand() * SYNCS.length)];
    const goal = pickFrom(rand, [job.mainKey, job.speedKey, pickFrom(rand, job.substats)]);
    const options = { target: goal, tiebreak: [job.mainKey] };
    const pool = pools.get(job.jobId);
    const keyOf = result => [...rankOf(result, goal), result.totals[job.mainKey]];
    const label = `${job.jobId} ${JSON.stringify(sync)} goal ${goal}`;
    const base = solve(job, sync, options);

    // three pieces the best set does not use
    const chosen = new Set(base.picks.filter(pick => pick.item).map(pick => pick.item));
    const dropped = new Set();
    while (dropped.size < 3) {
      const item = pickFrom(rand, pool);
      if (!chosen.has(item)) {
        dropped.add(item);
      }
    }
    const without = solve(
      job,
      sync,
      options,
      pool.filter(item => !dropped.has(item)),
    );
    assert.deepEqual(keyOf(without), keyOf(base), `${label}: dropping unused pieces changed the totals`);

    // one piece the best set uses
    const removed = pickFrom(rand, [...chosen]);
    const worse = solve(
      job,
      sync,
      options,
      pool.filter(item => item !== removed),
    );
    assert.ok(lexCompare(keyOf(worse), keyOf(base)) <= 0, `${label}: removing ${removed.name} improved the totals`);
  }
});

test('adding tiebreaks never changes weapon damage and the goal', () => {
  const rand = rng(99);
  for (const job of jobs) {
    for (const sync of SYNCS) {
      const goal = pickFrom(rand, job.stats);
      const rest = job.stats.filter(stat => stat !== goal);
      const tiebreak = [pickFrom(rand, rest), pickFrom(rand, rest)];
      const alone = solve(job, sync, { target: goal });
      const withTiebreaks = solve(job, sync, { target: goal, tiebreak });
      assert.deepEqual(
        rankOf(withTiebreaks, goal),
        rankOf(alone, goal),
        `${job.jobId} ${JSON.stringify(sync)} goal ${goal} tiebreak ${tiebreak}`,
      );
    }
  }
});

test('a looser speed maximum or minimum never lowers the goal and never turns a feasible search infeasible', () => {
  const rand = rng(7);
  for (const job of jobs) {
    const sync = SYNCS[Math.floor(rand() * SYNCS.length)];
    const goal = job.mainKey;
    const best = solve(job, sync, { target: goal }).totals[job.speedKey];
    const limit = Math.floor(rand() * (best + 1));
    const looser = 1 + Math.floor(rand() * 20);
    const label = `${job.jobId} ${JSON.stringify(sync)} limit ${limit} looser by ${looser}`;
    const tightMax = solve(job, sync, { target: goal, spdMax: limit });
    const looseMax = solve(job, sync, { target: goal, spdMax: limit + looser });
    const tightMin = solve(job, sync, { target: goal, spdMin: limit });
    const looseMin = solve(job, sync, { target: goal, spdMin: Math.max(0, limit - looser) });
    for (const [tight, loose, what] of [
      [tightMax, looseMax, 'maximum'],
      [tightMin, looseMin, 'minimum'],
    ]) {
      if (!tight.ok) {
        continue;
      }
      assert.ok(loose.ok, `${label}: a looser speed ${what} found no set`);
      assert.ok(lexCompare(rankOf(loose, goal), rankOf(tight, goal)) >= 0, `${label}: a looser speed ${what} lowered the goal`);
    }
  }
});

test('jobs of one gear group reach the same totals on the pieces all of them wear', () => {
  for (const group of GEAR_GROUPS) {
    const groupJobs = group.map(id => jobs.find(job => job.jobId === id));
    // some pieces are one job's own (artifact gear): compare on the game ids every job of the group can wear
    const common = new Set(pools.get(groupJobs[0].jobId).map(item => item.gameId));
    for (const job of groupJobs) {
      const ids = new Set(pools.get(job.jobId).map(item => item.gameId));
      for (const id of [...common]) {
        if (!ids.has(id)) {
          common.delete(id);
        }
      }
    }
    const poolOf = job => pools.get(job.jobId).filter(item => common.has(item.gameId));
    for (const sync of SYNCS.slice(0, 2)) {
      for (const goal of ['crit', 'speed']) {
        const runs = groupJobs
          .map(job => {
            const key = goal === 'speed' ? job.speedKey : goal;
            return job.stats.includes(key)
              ? { job, key, result: solve(job, sync, { target: key, tiebreak: ['crit'], melds: true }, poolOf(job)) }
              : null;
          })
          .filter(Boolean);
        // each job against the first job of its own weapon mode, else the first job of the group
        const totalsOf = r => [r.result.totals.wd, r.result.totals[r.key], r.result.totals.crit];
        for (const run of runs.slice(1)) {
          const reference = runs.find(candidate => candidate.job.weaponMode === run.job.weaponMode) ?? runs[0];
          if (reference === run) {
            continue;
          }
          assert.deepEqual(
            totalsOf(run),
            totalsOf(reference),
            `${run.job.jobId} and ${reference.job.jobId} ${JSON.stringify(sync)} goal ${goal}`,
          );
        }
      }
    }
  }
});
