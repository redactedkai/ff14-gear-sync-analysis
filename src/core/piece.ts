/* A piece under sync: the item level a pool item is synced to, its stats there, the most each stat can be, and whether
   it keeps its melds. The optimizer (optimizer/candidates.js), the meld rules (meld.ts applyStones), a set's evaluation
   (set.ts) and the views all read a piece through these, so a piece is synced the same way everywhere.
   Its own module, not items.ts: items.ts is the database and pool items as they are, with no sync; this module adds
   sync (sync-target.ts) and the caps (formulas.ts) on top, and not the optimizer, so a reader of a piece needs none of
   the optimizer's internals.
   Rules and sources: docs/mechanics/math.md section 5 (which pieces are synced), docs/mechanics/materia.md (melds). */
import { capsFor, syncStats } from './formulas.ts';
import { equipLevel, scalesWithLevel, slotInfo } from './items.ts';
import { syncTarget } from './sync-target.ts';
import type { JobContext, PerStat, PoolItem, StatMap, Sync } from './types.ts';

/* The item level a pool item is synced to, or null when it is untouched (syncTarget). sync = {cap, sync, level}: the
   item level cap, whether item level sync is on (with a cap set), and the synced character level (null or missing: no
   level sync). Only database pieces have an equip level (or scale with the level), so only they can be level-synced. */
export function itemSyncIlvl(item: PoolItem, sync: Sync): number | null {
  return syncTarget({
    itemLevel: item.ilvl,
    equipLevel: equipLevel(item),
    scales: scalesWithLevel(item),
    syncOn: sync.sync,
    cap: sync.cap,
    syncedLevel: sync.level ?? null,
  });
}

/* True when a pool item keeps its melds under `sync` (as for itemSyncIlvl): only when it is not synced. A synced piece
   loses every stone, even one whose stats sync leaves as they were (verified in game by the owner; materia.md). */
export function keepsMelds(item: PoolItem, sync: Sync): boolean {
  return itemSyncIlvl(item, sync) == null;
}

/* A pool item's stats after sync ({stat key: points}; its own stats when untouched). A piece is capped by its own
   slot share and stat factors. */
export function effStats(job: JobContext, item: PoolItem, sync: Sync): StatMap {
  const target = itemSyncIlvl(item, sync);
  if (target == null) {
    return item.stats;
  }
  const s = slotInfo(job, item);
  return syncStats(job, item.stats, item.type, target, item.ilvl, s.pct, s.factors);
}

const capCache = new WeakMap<PoolItem, Map<JobContext, PerStat<number>>>();

/* The cap of each stat on a pool item at its own item level, slot share and stat factors ({stat key: points}): how
   far melds can raise each substat (the meld cap; materia.md, "The cap on each substat"). Cached per item and job: the
   optimizer asks for every piece on every run. */
export function meldCaps(job: JobContext, item: PoolItem): PerStat<number> {
  let byJob = capCache.get(item);
  if (!byJob) {
    byJob = new Map();
    capCache.set(item, byJob);
  }
  let c = byJob.get(job);
  if (!c) {
    const s = slotInfo(job, item);
    c = capsFor(job, item.type, item.ilvl, s.pct, s.factors);
    byJob.set(job, c);
  }
  return c as PerStat<number>;
}

/* The most each stat on a pool item can be after sync and melds ({stat key: points}): the cap at the item level it
   is synced to, or, when it is untouched, its own cap (meldCaps). For the page's "at cap" marks. */
export function itemCaps(job: JobContext, item: PoolItem, sync: Sync): PerStat<number> {
  const target = itemSyncIlvl(item, sync);
  if (target == null) {
    return meldCaps(job, item);
  }
  const s = slotInfo(job, item);
  return capsFor(job, item.type, target, s.pct, s.factors);
}
