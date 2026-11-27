/* The reference tabs' view builders over every job and level with a spread of caps, slots, substats and speeds from a fixed
   seed: Piece stats (explainerView), Substat tiers (tiersView) and GCD (gcdView) never throw and hold no NaN, Infinity,
   undefined, "[object" or "null" in any number or text, the chart SVGs included. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HASTE, JOBS } from '../../../../src/core/constants.ts';
import { makeJobContext } from '../../../../src/core/job-context.ts';
import { syncSettings } from '../../../../src/ui/job-sync-panel.ts';
import { gcdView } from '../../../../src/ui/views/gcd.ts';
import { explainerItemLevel, explainerView } from '../../../../src/ui/views/sync-explainer.ts';
import { tierValues, tiersView } from '../../../../src/ui/views/tiers.ts';
import { rng } from '../../helpers/fixtures/common.ts';
import type { JobContext } from '../../../../src/core/types.ts';

const BAD_TEXT = /NaN|Infinity|undefined|\[object|\bnull\b/;

/* The path and value of the first bad number, text or undefined in a view, or null when it has none. */
function firstBad(value: unknown, path = ''): string | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? null : `${path} = ${value}`;
  }
  if (typeof value === 'string') {
    return BAD_TEXT.test(value) ? `${path} = "${value.slice(0, 60)}"` : null;
  }
  if (value === undefined) {
    return `${path} undefined`;
  }
  if (value === null || typeof value !== 'object') {
    return null;
  }
  for (const [key, child] of Object.entries(value)) {
    const found = firstBad(child, `${path}.${key}`);
    if (found) {
      return found;
    }
  }
  return null;
}

test('Piece stats, Substat tiers and GCD hold no bad value for every job over its levels', () => {
  const rand = rng(8675309);
  const int = (count: number): number => Math.floor(rand() * count);
  const pick = <Item>(list: readonly Item[]): Item => list[int(list.length)];
  const caps = [null, 50, 123, 290, 400, 475, 590, 660, 690, 795];
  // levels are thinned to keep the run short: levels 1 to 5, the job's top three and every 7th between
  const levelsOf = (job: JobContext): number[] =>
    Array.from({ length: job.maxLevel }, (_, i) => i + 1).filter(level => level <= 5 || level > job.maxLevel - 3 || level % 7 === 0);
  for (const { id } of JOBS) {
    const job = makeJobContext(id);
    for (const level of levelsOf(job)) {
      const cap = pick(caps);
      const sync = syncSettings({ cap, sync: cap != null, level });
      const slot = pick(job.activeSlotTypes);
      const subs = [pick(job.substats), pick([...job.substats, null])];
      // the item levels the slider reaches: its two ends and one between, or none saved
      const [lowest, highest] = explainerItemLevel(job, sync, { ilvl: null, subs }).range;
      const settings = {
        ilvl: pick([null, lowest, highest, lowest + int(highest - lowest + 1)]),
        slot,
        subs,
        slots: pick([null, 0, 1, 2, 5]),
      };
      const label = `${job.jobId} level ${level} cap ${cap} ${slot} ${subs} ilvl ${settings.ilvl}`;

      assert.equal(firstBad(explainerView(job, sync, settings, { piece: pick([300, 640, 1100]) })), null, `Piece stats: ${label}`);

      const values = tierValues(job, level);
      for (const substat of job.substats) {
        values[substat] = (values[substat] ?? 0) + int(400);
      }
      assert.equal(firstBad(tiersView(job, values, level)), null, `Substat tiers: ${label}`);

      const speed = pick([null, 0, 1, 400, 1500, 99999, -5]);
      assert.equal(
        firstBad(gcdView(level, pick(['', ...Object.keys(HASTE)]), speed, pick([300, 900]))),
        null,
        `GCD: ${label} speed ${speed}`,
      );
    }
  }
});
