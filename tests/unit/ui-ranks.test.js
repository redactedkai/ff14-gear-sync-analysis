/* Ranked stat dropdowns (ui/ranks.js): a stat holds at most one rank; a dropdown hides the stats above it, and
   picking a stat a later rank holds swaps the two. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JOBS } from '../../src/core/constants.js';
import { makeJobContext } from '../../src/core/job-context.js';
import { rankChoices, uniqueRanks, withRank } from '../../src/ui/ranks.js';

const healer = makeJobContext('WHM').stats; // main, crit, det, dh, spd, spec (and vit)

test('a dropdown offers every stat but those picked above it', () => {
  const goal = ['main', 'crit', ''];
  assert.deepEqual(rankChoices(goal, 0, healer), healer);
  assert.ok(!rankChoices(goal, 1, healer).includes('main'));
  assert.ok(rankChoices(goal, 1, healer).includes('crit'), 'its own pick stays');
  assert.deepEqual(
    rankChoices(goal, 2, healer).filter(s => s === 'main' || s === 'crit'),
    [],
  );
});

test('picking a stat a later rank holds swaps the two', () => {
  // the owner's case: Mind > Critical Hit, and Critical Hit picked for Maximize
  assert.deepEqual(withRank(['main', 'crit', ''], 0, 'crit', healer), ['crit', 'main', null]);
  assert.deepEqual(withRank(['main', 'crit', 'det'], 1, 'det', healer), ['main', 'det', 'crit']);
  // a later rank that was none takes nothing back: Tiebreak 1's Critical Hit moves up, Tiebreak 1 is then none
  assert.deepEqual(withRank(['main', '', 'crit'], 0, 'crit', healer), ['crit', null, 'main']);
  assert.deepEqual(withRank(['main', 'crit', ''], 1, '', healer), ['main', null, null]);
});

test('a goal saved with a repeat keeps the first and clears the rest', () => {
  assert.deepEqual(uniqueRanks(['main', 'crit', 'main']), ['main', 'crit', null]);
  assert.deepEqual(uniqueRanks(['main', 'main', 'main']), ['main', null, null]);
  assert.deepEqual(uniqueRanks(['main', '', 'det']), ['main', null, 'det']);
});

test('from every goal, every option offered leaves a goal with no repeat, Maximize set and the pick in place', () => {
  let walked = 0;
  for (const { id: jobId } of JOBS) {
    const stats = makeJobContext(jobId).stats;
    const none = ['', ...stats];
    for (const target of stats)
      for (const tb of none)
        for (const tb2 of none) {
          const goal = [target, tb, tb2];
          if (uniqueRanks(goal).some((r, i) => (r ?? '') !== goal[i])) continue; // not a reachable goal
          for (let i = 0; i < 3; i++) {
            const offered = i === 0 ? stats : ['', ...rankChoices(goal, i, stats)];
            for (const value of offered) {
              const out = withRank(goal, i, value, stats);
              const picked = out.filter(Boolean);
              const where = JSON.stringify([jobId, goal, i, value]);
              assert.equal(new Set(picked).size, picked.length, where);
              assert.ok(out[0], where);
              assert.equal(out[i], value || null, where);
              walked++;
            }
          }
        }
  }
  assert.ok(walked > 10000, `walked ${walked}`);
});
