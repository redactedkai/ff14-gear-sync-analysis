/* effStats (a piece's stats under an item level cap) on every real piece of every job over a grid of caps, against the cap
   formula written out again here from the budget table (IL), the stat factors (MP) and the slot shares of the item format:
   each stat is the piece's own, cut to the cap formula, and never raised above its own value. Also: a piece's stats never
   fall as the cap rises, and a slot's cap never falls as the item level rises. Shields (the off-hand rule, a documented guess:
   2H value minus 1H value) are left out of the two monotone checks, since their cap does fall at some item levels. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DB_SLOT_PCT, DB_SLOT_TYPE, JOBS, ROW } from '../../../src/core/constants.ts';
import { browseItems, poolItemFromRow } from '../../../src/core/items.js';
import { makeJobContext } from '../../../src/core/job-context.js';
import { effStats } from '../../../src/core/piece.js';
import { IL, ITEMS, MAX_ILVL, MP } from '../../../src/core/tables.ts';
import { roundHalfUp } from '../helpers/common.js';

/* The cap of `stat` at cap item level `cap`: floor(floor(budget x factor / 100) x slot share / 100) / 10, rounded; an
   off-hand is the 2H weapon's cap less the 1H weapon's. `kind` is the item's stat factor kind (null: the job's own factor
   `jobFactor`, in percent). */
function capOf(stat, kind, slotCode, cap, jobFactor) {
  const factor = kind != null && MP.vit[kind] != null ? MP[stat][kind] : jobFactor;
  const share = percent => roundHalfUp(Math.floor((Math.floor((IL[stat][cap] * factor) / 100) * percent) / 100) / 10);
  if (DB_SLOT_TYPE[slotCode] === 'offhand' && DB_SLOT_PCT[slotCode] === 40) {
    return share(140) - share(100);
  }
  return share(DB_SLOT_PCT[slotCode]);
}
const isShield = slotCode => DB_SLOT_TYPE[slotCode] === 'offhand';

test('a slot cap never falls as the item level rises (shields left out)', () => {
  const stats = ['vit', 'mind', 'str', 'dex', 'int', 'crit', 'det', 'dh', 'sks', 'sps', 'piety', 'ten'].filter(stat => MP[stat]);
  for (let slotCode = 0; slotCode < DB_SLOT_TYPE.length; slotCode++) {
    if (isShield(slotCode)) {
      continue;
    }
    for (let kind = 0; kind < MP.vit.length; kind++) {
      for (const stat of stats) {
        let previous = -1;
        for (let cap = 0; cap <= MAX_ILVL; cap++) {
          const value = capOf(stat, kind, slotCode, cap, 100);
          assert.ok(
            value >= previous,
            `${DB_SLOT_TYPE[slotCode]}/${DB_SLOT_PCT[slotCode]} kind ${kind} ${stat}: ${previous} at ${cap - 1}, ${value} at ${cap}`,
          );
          previous = value;
        }
      }
    }
  }
});

test('effStats equals the cap formula for every piece of every job over a grid of caps, and never exceeds the piece or falls as the cap rises', () => {
  const rowOf = new Map(ITEMS.map(row => [row[ROW.gameId], row]));
  for (const { id } of JOBS) {
    const job = makeJobContext(id);
    for (const view of browseItems(job, {})) {
      const item = poolItemFromRow(job, view);
      const row = rowOf.get(view.gameId);
      const kind = row[ROW.kind];
      const slotCode = row[ROW.slotCode];
      const caps = [
        1,
        50,
        123,
        290,
        345,
        475,
        635,
        660,
        665,
        690,
        795,
        view.ilvl - 20,
        view.ilvl - 5,
        view.ilvl - 2,
        view.ilvl - 1,
        view.ilvl,
        view.ilvl + 1,
      ];
      const grid = [...new Set(caps.filter(cap => cap >= 1 && cap <= MAX_ILVL))].sort((a, b) => a - b);
      let previous = null;
      for (const cap of grid) {
        const effective = effStats(job, item, { cap, sync: true, level: null });
        for (const stat of job.stats) {
          const own = item.stats[stat] || 0;
          // a piece at or under the cap keeps its stats; above it, each is cut to the cap
          const expected =
            cap >= view.ilvl ? own : Math.min(own, capOf(stat, kind, slotCode, cap, stat === 'vit' ? job.vitFactor * 100 : 100));
          const label = `${job.jobId} ${view.name} (item level ${view.ilvl}) ${stat} at cap ${cap}`;
          assert.equal(effective[stat], expected, label);
          assert.ok(effective[stat] <= own, `${label}: above the piece's own value`);
          if (previous && !isShield(slotCode)) {
            assert.ok(effective[stat] >= previous[stat], `${label}: fell from ${previous[stat]} as the cap rose`);
          }
        }
        previous = effective;
      }
    }
  }
});
