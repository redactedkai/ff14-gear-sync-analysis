/* Ranked stat dropdowns (ui/ranks.ts): a stat holds at most one rank; a dropdown hides the stats above it, and
   picking a stat a later rank holds swaps the two. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JOBS } from '../../../src/core/constants.ts';
import { makeJobContext } from '../../../src/core/job-context.ts';
import { rankChoices, rankSwapNote, uniqueRanks, withRank } from '../../../src/ui/ranks.ts';

const healer = makeJobContext('WHM').stats; // mind, vit, crit, det, dh, sps, piety

test('a dropdown offers every stat but those picked above it', () => {
  const goal = ['mind', 'crit', ''];
  assert.deepEqual(rankChoices(goal, 0, healer), healer);
  assert.ok(!rankChoices(goal, 1, healer).includes('mind'));
  assert.ok(rankChoices(goal, 1, healer).includes('crit'), 'its own pick stays');
  assert.deepEqual(
    rankChoices(goal, 2, healer).filter(s => s === 'mind' || s === 'crit'),
    [],
  );
});

test('picking a stat a later rank holds swaps the two', () => {
  // the owner's case: Mind > Critical Hit, and Critical Hit picked for Maximize
  assert.deepEqual(withRank(['mind', 'crit', ''], 0, 'crit', healer), ['crit', 'mind', null]);
  assert.deepEqual(withRank(['mind', 'crit', 'det'], 1, 'det', healer), ['mind', 'det', 'crit']);
  // a later rank that was none takes nothing back: Tiebreak 1's Critical Hit moves up, Tiebreak 1 is then none
  assert.deepEqual(withRank(['mind', '', 'crit'], 0, 'crit', healer), ['crit', null, 'mind']);
  assert.deepEqual(withRank(['mind', 'crit', ''], 1, '', healer), ['mind', null, null]);
});

test('a goal saved with a repeat keeps the first and clears the rest', () => {
  assert.deepEqual(uniqueRanks(['mind', 'crit', 'mind']), ['mind', 'crit', null]);
  assert.deepEqual(uniqueRanks(['mind', 'mind', 'mind']), ['mind', null, null]);
  assert.deepEqual(uniqueRanks(['mind', '', 'det']), ['mind', null, 'det']);
});

test('from every goal, every option offered leaves a goal with no repeat, Maximize set and the pick in place', () => {
  let walked = 0;
  for (const { id: jobId } of JOBS) {
    const stats = makeJobContext(jobId).stats;
    const none = ['', ...stats];
    for (const target of stats) {
      for (const tb of none) {
        for (const tb2 of none) {
          const goal = [target, tb, tb2];
          if (uniqueRanks(goal).some((r, i) => (r ?? '') !== goal[i])) {
            continue; // not a reachable goal
          }
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
    }
  }
  assert.ok(walked > 10000, `walked ${walked}`);
});

test('a swap says which rank changed and to what; no other rank changing says nothing', () => {
  const names: Record<string, string> = { mind: 'Mind', crit: 'Critical Hit', det: 'Determination' };
  const name = (stat: string): string => names[stat] ?? stat;
  const note = (ranks: (string | null)[], i: number, value: string) =>
    rankSwapNote(ranks, i, value, withRank(ranks, i, value, healer), name);
  // the owner's case: Mind > Critical Hit, Critical Hit picked for Maximize
  assert.equal(note(['mind', 'crit', ''], 0, 'crit'), 'Tiebreak 1 changed to Mind (a stat holds one rank).');
  assert.equal(note(['mind', 'crit', 'det'], 1, 'det'), 'Tiebreak 2 changed to Critical Hit (a stat holds one rank).');
  // a stat no other rank holds, a pick of the rank's own stat, and picking none: no note
  assert.equal(note(['mind', 'crit', ''], 2, 'det'), '');
  assert.equal(note(['mind', 'crit', ''], 1, 'crit'), '');
  assert.equal(note(['mind', 'crit', ''], 1, ''), '');
});
