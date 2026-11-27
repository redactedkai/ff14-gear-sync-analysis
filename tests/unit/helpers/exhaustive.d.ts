/* The types of the parts of exhaustive.js that the typed helpers use (exact-solver.ts, pins.ts, tier-reference.ts, views.ts). Until
   exhaustive.js itself is typed (it names the optimizer's limit types, which change on the ts/models branch), TypeScript would read
   its inferred JavaScript types, where a default `[]` makes a parameter `never[]`. Delete this file when exhaustive.js becomes
   exhaustive.ts. Each function is described where it is defined in exhaustive.js. */
import type { ParsedRow } from '../../../src/core/items.ts';
import type { FoodChoice } from '../../../src/core/food.ts';
import type { DimKey, JobContext, PoolItem, SlotType, Stone, Sync } from '../../../src/core/types.ts';

/* A set of stats by key, with weapon damage under 'wd'. */
type Vector = Partial<Record<DimKey, number>>;
/* A pinned piece in the reference's form: the item and its stat vector (pinnedVector). */
type PinnedPiece = { item: PoolItem; vector: Vector };

export function gamePool(
  job: JobContext,
  filter: { q?: string; type?: SlotType | 'any' | ''; ilvlMin?: number; ilvlMax?: number; lvlMax?: number },
  keep?: (row: ParsedRow) => boolean,
): PoolItem[];
export const WINDOWS: { ilvlMin: number; ilvlMax: number }[];
export function smallPool(
  job: JobContext,
  rand: () => number,
  types: readonly SlotType[],
  n: number,
  least?: number,
  window?: { ilvlMin: number; ilvlMax: number } | null,
): PoolItem[];
export function loadoutCount(job: JobContext, pool: readonly PoolItem[]): number;
export function pinnedVector(job: JobContext, item: PoolItem, sync: Sync, stones: readonly (Stone | null)[]): Vector;
export function meldVectors(
  job: JobContext,
  item: PoolItem,
  sync: Sync,
  keys: readonly DimKey[],
  options?: { exactSpd?: boolean },
): Vector[];
export function forEachLoadout(
  job: JobContext,
  pool: readonly PoolItem[],
  sync: Sync,
  options: { melds?: boolean; meldKeys?: readonly DimKey[]; exactSpd?: boolean; fixed?: readonly PinnedPiece[] },
  visit: (get: (stat: DimKey) => number) => void,
): void;
export function foodAdd(job: JobContext, meal: FoodChoice | null, stat: DimKey, gear: number, level: number): number;
/* The best loadout's ranked totals ([target, ...tiebreaks], weapon damage first is dropped), or null when no loadout is legal. */
export function exhaustive(
  job: JobContext,
  pool: readonly PoolItem[],
  sync: Sync,
  options: {
    target: DimKey;
    tiebreak?: readonly (DimKey | '' | null | undefined)[];
    spdMin?: number | null;
    spdMax?: number | null;
    mins?: Record<string, number>;
    melds?: boolean;
    fixed?: readonly PinnedPiece[];
  },
): number[] | null;
