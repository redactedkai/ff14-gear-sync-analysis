/* A piece under sync: the item level a pool item is synced to, its stats there, the most each stat can be, and whether
   it keeps its melds. The optimizer (optimizer/candidates.js), the meld rules (meld.js applyStones), a set's evaluation
   (set.js) and the views all read a piece through these, so a piece is synced the same way everywhere.
   Its own module, not items.js: items.js is the database and pool items as they are, with no sync; this module adds
   sync (sync-target.js) and the caps (formulas.js) on top. They used to live in the optimizer, which made every other
   reader import the optimizer's internals.
   Rules and sources: docs/mechanics/math.md section 5 (which pieces are synced), docs/mechanics/materia.md (melds). */
import { capsFor, syncStats } from './formulas.js';
import { equipLevel, scalesWithLevel, slotInfo } from './items.js';
import { syncTarget } from './sync-target.js';

/* The item level a pool item is synced to, or null when it is untouched (syncTarget). sync = {cap, sync, level}: the
   item level cap, whether item level sync is on (with a cap set), and the synced character level (null or missing: no
   level sync). Only database pieces have an equip level (or scale with the level), so only they can be level-synced. */
export function itemSyncIlvl(item, sync) {
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
export function keepsMelds(item, sync) {
  return itemSyncIlvl(item, sync) == null;
}

/* A pool item's stats after sync ({neutral stat: points}; its own stats when untouched). A piece is capped by its own
   slot share and stat factors. */
export function effStats(job, item, sync) {
  const target = itemSyncIlvl(item, sync);
  if (target == null) return item.stats;
  const s = slotInfo(job, item);
  return syncStats(job, item.stats, item.type, target, item.ilvl, s.pct, s.factors);
}

/* The cap of each stat on a pool item at its own item level, slot share and stat factors ({neutral stat: points}): how
   far melds can raise each substat (the meld cap; materia.md, "The cap on each substat"). Cached per item and job: the
   optimizer asks for every piece on every run. */
const capCache = new WeakMap();
export function meldCaps(job, item) {
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
  return c;
}

/* The most each stat on a pool item can be after sync and melds ({neutral stat: points}): the cap at the item level it
   is synced to, or, when it is untouched, its own cap (meldCaps). For the page's "at cap" marks. */
export function itemCaps(job, item, sync) {
  const target = itemSyncIlvl(item, sync);
  if (target == null) return meldCaps(job, item);
  const s = slotInfo(job, item);
  return capsFor(job, item.type, target, s.pct, s.factors);
}
