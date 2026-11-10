/* Rank by tier with pinned pieces against the reference (tests/unit/helpers/tier-reference.js, checkPinned): random
   cases with one or two pieces pinned with stones, with and without a Target GCD. The pinned pieces count in every
   minimum and band, so the stages' regain cuts and proven maxima must stay exact (docs/engineering/tier-ranking.md,
   section 9). Run by npm run test:full, not npm test. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkPinned } from '../unit/helpers/tier-reference.js';

for (const seed of [31415, 27182])
  test(`rank by tier with pinned pieces, 120 cases, seed ${seed}`, () => {
    const { runs } = checkPinned(seed, 120);
    assert.ok(runs >= 60, `${runs} runs`);
  });
