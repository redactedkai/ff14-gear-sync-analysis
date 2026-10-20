/* Rank by tier against the reference (tests/unit/helpers/tier-reference.js): cases 31 to 60 of 120 with a
   Target GCD and three keys, seed 33818 (one of the seeds Perplexity's review ran on its prototype). The 120 cases take
   about 80 s in one file, so they are split in four files that node --test runs at the same time. Run by
   npm run test:full, not npm test. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkGcd } from '../unit/helpers/tier-reference.js';

test('rank by tier, three keys with a Target GCD: cases 31 to 60, seed 33818', () => {
  const { runs, infeasible } = checkGcd(33818, 60, true, 30);
  assert.ok(runs >= 20, `${runs} runs`);
  assert.ok(infeasible < runs / 2, `${infeasible} infeasible`);
});
