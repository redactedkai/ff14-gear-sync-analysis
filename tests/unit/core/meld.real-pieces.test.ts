/* bestMeld on real pieces, a fixed-seed sample of every job's gear at every item level, against the test helper's independent
   stone enumerator (meldVectors: every placement of the possible stones, each stat capped at the piece's own cap), for random
   ranked stats: the (goal, tiebreak 1, tiebreak 2) of the piece's own stats plus the meld's gain equals the best of any
   placement, and the stone list of the meld applied back (applyStones) gives the same stats. Unsynced. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { StatMap, Sync } from '../../../src/core/types.ts';
import { JOBS } from '../../../src/core/constants.ts';
import { capsFor } from '../../../src/core/formulas.ts';
import { jobGear, slotInfo } from '../../../src/core/items.ts';
import { makeJobContext } from '../../../src/core/job-context.ts';
import { applyStones, bestMeld, meldStones } from '../../../src/core/meld.ts';
import { effStats } from '../../../src/core/piece.ts';
import { rng } from '../helpers/fixtures/common.ts';
import { meldVectors } from '../helpers/fixtures/exhaustive.ts';
import { lexCompare } from '../helpers/fixtures/exact-solver.ts';

const PIECES = 3000;
const NO_SYNC: Sync = { cap: null, sync: false, level: null };

test('bestMeld equals the best stone placement on real pieces, and its stones apply back to the same stats', () => {
  const rand = rng(4040);
  const pick = <Item>(list: readonly Item[]): Item => {
    const item = list[Math.floor(rand() * list.length)];
    assert.ok(item !== undefined, 'a list to pick from');
    return item;
  };
  const jobs = JOBS.map(job => makeJobContext(job.id));
  const gearOf = new Map(jobs.map(job => [job.jobId, jobGear(job)]));
  for (let n = 0; n < PIECES; n++) {
    const job = pick(jobs);
    const gear = gearOf.get(job.jobId);
    assert.ok(gear);
    const item = pick(gear);
    const keys = [pick(job.stats), pick(job.stats), pick(job.stats)].filter((key, i, all) => all.indexOf(key) === i);
    const tupleOf = (stats: StatMap) => keys.map(key => stats[key] || 0);
    const label = `${job.jobId} ${item.name} (item level ${item.ilvl}, ${item.type}) keys ${keys}`;

    // the best of every placement, by the helper's enumeration
    const best = meldVectors(job, item, NO_SYNC, keys)
      .map(tupleOf)
      .reduce((a, b) => (lexCompare(b, a) > 0 ? b : a));

    // the piece's own stats plus the meld's gain, each stat held at the piece's cap unless it starts above it
    const meld = bestMeld(job, item, keys);
    const own = effStats(job, item, NO_SYNC);
    const info = slotInfo(job, item);
    const caps = capsFor(job, item.type, item.ilvl, info.pct, info.factors);
    const melded = Object.fromEntries(
      job.stats.map(stat => [stat, Math.max(own[stat] || 0, Math.min((own[stat] || 0) + (meld?.gain[stat] || 0), caps[stat] ?? 0))]),
    );
    assert.deepEqual(tupleOf(melded), best, `${label}: bestMeld against the best placement`);

    // the stone list applied back
    if (meld) {
      assert.deepEqual(
        tupleOf(applyStones(job, item, meldStones(item, meld), NO_SYNC).stats),
        tupleOf(melded),
        `${label}: applying its stones`,
      );
    }
  }
});
