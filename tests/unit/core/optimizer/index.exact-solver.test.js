/* The optimizer against an independent exact solver (helpers/exact-solver.js): the best item per slot, with the ring pair and
   the blocked slots handled exactly, on every job's whole real pool over the sync presets of the perf scripts (melds off), and
   on a reduced pool with melds on (stat vectors from the test helper's meld enumerator). Fixed seeds. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JOBS, SLOT_TYPES } from '../../../../src/core/constants.ts';
import { jobGear } from '../../../../src/core/items.js';
import { makeJobContext } from '../../../../src/core/job-context.js';
import { optimize } from '../../../../src/core/optimizer/index.js';
import { rng } from '../../helpers/common.js';
import { lexCompare, solveExact } from '../../helpers/exact-solver.js';

/* Sync settings as the perf scripts use them: off, item level caps, level sync, and a duty's level with its cap. */
const SYNCS = [
  { label: 'off', cap: null, sync: false, level: 100 },
  ...[123, 530, 690].map(cap => ({ label: `cap ${cap}`, cap, sync: true, level: 100 })),
  ...[80].map(level => ({ label: `lvl ${level}`, cap: null, sync: false, level })),
  ...[
    [50, 123],
    [90, 635],
  ].map(([level, cap]) => ({ label: `lvl ${level} cap ${cap}`, cap, sync: true, level })),
];

/* A goal and up to two different tiebreaks, drawn from the job's stats. */
function objective(job, rand) {
  const pick = list => list[Math.floor(rand() * list.length)];
  const goal = pick(job.stats);
  const rest = job.stats.filter(stat => stat !== goal);
  const tiebreak = [pick(rest), pick(rest)].filter((stat, i, all) => all.indexOf(stat) === i);
  return { goal, tiebreak };
}

/* Checks one optimizer run against the exact solver; the failure message names the case. */
function assertSame(job, pool, sync, melds, rand) {
  const { goal, tiebreak } = objective(job, rand);
  const want = solveExact(job, pool, sync, goal, tiebreak, melds);
  const got = optimize(job, pool, sync, { target: goal, tiebreak, melds });
  const gotRanked = want.ranked.map(key => got.totals[key] ?? 0);
  const label = `${job.jobId} ${sync.label} melds ${melds} goal ${goal} tiebreak ${tiebreak}`;
  assert.ok(!got.truncated, `${label}: truncated`);
  assert.equal(lexCompare(gotRanked, want.total), 0, `${label}: optimizer ${gotRanked} exact ${want.total} (keys ${want.ranked})`);
}

test('melds off: the best item per slot equals optimize() on every job, over the sync presets', () => {
  const rand = rng(31337);
  for (const { id } of JOBS) {
    const job = makeJobContext(id);
    const pool = jobGear(job);
    for (const sync of SYNCS) {
      assertSame(job, pool, sync, false, rand);
    }
  }
});

test('melds on: the same on a reduced pool (the top 14 of each slot type by item level and 4 drawn at random)', () => {
  const rand = rng(31338);
  const syncs = SYNCS.filter(sync => ['off', 'cap 123', 'lvl 90 cap 635'].includes(sync.label));
  for (const { id } of JOBS) {
    const job = makeJobContext(id);
    const full = jobGear(job);
    const pool = [];
    for (const type of SLOT_TYPES) {
      const items = full.filter(item => item.type === type).sort((a, b) => b.ilvl - a.ilvl);
      pool.push(...items.slice(0, 14));
      const rest = items.slice(14);
      for (let n = 0; n < 4 && rest.length; n++) {
        pool.push(rest.splice(Math.floor(rand() * rest.length), 1)[0]);
      }
    }
    for (const sync of syncs) {
      assertSame(job, pool, sync, true, rand);
    }
  }
});
