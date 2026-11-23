/* Rank by tier against the reference (tests/unit/helpers/tier-reference.js), 240 random cases with no Target GCD,
   two or three keys, from two of the seeds Perplexity's review ran on its prototype. The search's speed-ups (regain
   cuts, slot order, trial search, band reach; docs/engineering/tier-ranking.md, section 4) change which partial
   loadouts it visits, never the answer. Run by npm run test:full, not npm test. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkNoGcd } from '../unit/helpers/tier-reference.js';

for (const seed of [11707, 22707])
  test(`rank by tier, 120 cases with no Target GCD, seed ${seed}`, () => {
    const { runs } = checkNoGcd(seed, 120);
    assert.ok(runs >= 100, `${runs} runs`);
  });
