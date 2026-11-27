/* Pins for the optimizer's tests: random pieces to pin, with stones, in the two forms the code under test and its
   reference take (`fixed`: fixedCandidate; `oracle`: pinnedVector in exhaustive.ts, written independently). */
import { meldInfo, slotInfo } from '../../../src/core/items.ts';
import { fixedCandidate } from '../../../src/core/optimizer/index.ts';
import { itemSyncIlvl } from '../../../src/core/piece.ts';
import { MATERIA } from '../../../src/core/tables.ts';
import { pinnedVector } from './exhaustive.ts';
import type { Candidate, JobContext, PoolItem, Stone, Sync } from '../../../src/core/types.ts';

/* The pieces of one pin case: each a pool item with the stones in it ([] for none). */
export type Wear = [item: PoolItem, stones: Stone[]][];

/* The pins of one case, for both sides: `fixed` for the optimizer (fixedCandidate), `oracle` for the reference
   (pinnedVector). `wear` = [[item, stones]]. */
export function pinsOf(
  job: JobContext,
  sync: Sync,
  wear: Wear,
): { fixed: Candidate[]; oracle: { item: PoolItem; vector: ReturnType<typeof pinnedVector> }[] } {
  return {
    fixed: wear.map(([item, stones]) => fixedCandidate(job, item, stones, sync)),
    oracle: wear.map(([item, stones]) => ({ item, vector: pinnedVector(job, item, sync, stones) })),
  };
}

/* Stones for a pinned real piece: a random number of its guaranteed meld slots, each a random substat at a random grade
   the piece's item level allows (none for a synced piece or one with no slots). */
export function randomStones(job: JobContext, item: PoolItem, sync: Sync, rand: () => number): Stone[] {
  const info = meldInfo(item);
  if (!info || itemSyncIlvl(item, sync) != null) {
    return [];
  }
  const grades = MATERIA.gate.flatMap((gate, k) => (gate <= item.ilvl && !MATERIA.high.includes(k + 1) ? [k + 1] : []));
  const count = Math.floor(rand() * (info.slots + 1));
  return Array.from({ length: count }, () => ({
    stat: job.substats[Math.floor(rand() * job.substats.length)],
    grade: grades[Math.floor(rand() * grades.length)],
  }));
}

/* Up to `most` pieces of `pool` to pin, at most one per slot type and two rings (a Unique ring only once, and two of
   one item only with 2 copies), as [[item, stones]]. */
export function pickPins(
  job: JobContext,
  pool: readonly PoolItem[],
  sync: Sync,
  rand: () => number,
  most: number,
  stonesOn: boolean,
): Wear {
  const int = (n: number): number => Math.floor(rand() * n);
  const wear: Wear = [];
  const used = new Set<string>();
  const types = [...new Set(pool.map(i => i.type))];
  for (let k = 0; k < most; k++) {
    const type = types[int(types.length)];
    const items = pool.filter(i => i.type === type);
    const item = items[int(items.length)];
    const rings = wear.filter(([w]) => w.type === 'ring');
    if (type === 'ring' ? rings.length >= 2 || (rings.some(([w]) => w === item) && (item.copies || 1) < 2) : used.has(type)) {
      continue;
    }
    used.add(type);
    wear.push([item, stonesOn ? randomStones(job, item, sync, rand) : []]);
  }
  return wear;
}

/* True when the pinned pieces can be worn together: no pinned piece covers a slot another wears. */
export function pinsCoexist(job: JobContext, wear: Wear): boolean {
  const worn = new Set(wear.map(([item]) => item.type));
  return !wear.some(([item]) => slotInfo(job, item).blocks.some(t => worn.has(t)));
}
