/* Shared test helpers: an exhaustive reference for the optimizer, and real-gear pools from the item database.
   The reference tries every legal loadout, so it is independent of the optimizer's pruning and scoring. */
import { ilWeight } from '../../../src/core/job-context.js';
import { browseItems, poolItemFromRow } from '../../../src/core/items.js';
import { effStats } from '../../../src/core/optimizer/index.js';

/* Pool items for every database row this job can equip that matches the browse filter
   {q, type, ilvlMin, ilvlMax, lvlMax}, optionally narrowed by keep(row). */
export function gamePool(job, filter, keep = () => true) {
  return browseItems(job, filter)
    .filter(keep)
    .map(r => poolItemFromRow(job, r));
}

/* How many loadouts exhaustive() will try for this pool (one item per slot that has items, ring pairs). */
export function loadoutCount(job, pool) {
  return job.activeSlotTypes.reduce((n, t) => n * Math.max(1, choicesFor(pool, t).length), 1);
}

function choicesFor(pool, t) {
  const items = pool.filter(i => i.type === t);
  if (t !== 'ring') return items.map(i => [i]);
  const pairs = [];
  items.forEach((a, x) => {
    items.forEach((b, y) => {
      if (y < x || (x === y && (a.copies || 1) < 2)) return;
      pairs.push([a, b]);
    });
  });
  return pairs.length ? pairs : items.map(i => [i]);
}

/* Best [target, tiebreak1, tiebreak2] totals over every legal loadout, or null if none meets the constraints.
   One item per slot that has items; two rings (the same item twice only if it has 2 copies).

   Two engine policies are copied here on purpose, not derived independently (docs/optimizer.md, section 5,
   "Empty slot"; each has a direct test in optimizer-exhaustive.test.js, "policy:"):
   - a single ring only when no pair exists: if any legal pair exists, a loadout with one ring is not considered,
     even when a pair breaks a maximum and one ring alone would not;
   - a slot is never left empty to satisfy a maximum (or any other constraint): every slot that has items gets one.
   Changing either rule means changing the engine, this oracle and those policy tests together.

   Effective (synced) stats come from the optimizer's own effStats, so this reference does not check the sync
   clamp; that is covered by sync.test.js, the Wiki item level 475 caps and the caps at 123 (docs/testing.md). */
export function exhaustive(job, pool, sync, { target, tiebreak = [], minAvgIlvl = 0, mins = {}, maxs = {} }) {
  const keys = [target, ...tiebreak.filter(Boolean)];
  const stats = job.stats;
  const slots = job.activeSlotTypes.filter(t => pool.some(i => i.type === t));
  const denom = slots.reduce((a, t) => a + ilWeight(job, t) * (t === 'ring' ? 2 : 1), 0);
  /* each choice (an item, or a ring pair) as [effective stat totals in job.stats order, weighted item level] */
  const choices = slots.map(t =>
    choicesFor(pool, t).map(items => {
      const v = stats.map(() => 0);
      let ilw = 0;
      items.forEach(i => {
        const e = effStats(job, i, sync);
        stats.forEach((s, k) => {
          v[k] += e[s] || 0;
        });
        ilw += i.ilvl * ilWeight(job, i.type);
      });
      return [v, ilw];
    }),
  );
  const tot = stats.map(() => 0);
  let best = null;
  const rec = (k, ilw) => {
    if (k === choices.length) {
      const get = s => tot[stats.indexOf(s)] || 0;
      if (minAvgIlvl && ilw < minAvgIlvl * denom) return;
      if (Object.entries(mins).some(([s, m]) => get(s) < m)) return;
      if (Object.entries(maxs).some(([s, m]) => get(s) > m)) return;
      const v = keys.map(get);
      if (!best || lexGreater(v, best)) best = v;
      return;
    }
    for (const [v, w] of choices[k]) {
      v.forEach((x, j) => {
        tot[j] += x;
      });
      rec(k + 1, ilw + w);
      v.forEach((x, j) => {
        tot[j] -= x;
      });
    }
  };
  rec(0, 0);
  return best;
}

function lexGreater(a, b) {
  const i = a.findIndex((x, k) => x !== b[k]);
  return i >= 0 && a[i] > b[i];
}
