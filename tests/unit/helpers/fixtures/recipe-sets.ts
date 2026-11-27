/* Helpers for the tests that compare the sets Auto-fill (runRecipe) returns: a set as text, what the search ranks as text,
   and a seeded shuffle of a pool. Shared by core/recipe.round-trip and core/recipe.pool-order. */
import { evaluateSet } from '../../../../src/core/set.ts';
import { rng } from './common.ts';
import type { Recipe } from '../../../../src/core/recipe.ts';
import type { GearSet, JobContext, StatKey, Sync } from '../../../../src/core/types.ts';

/* A set's pieces (slot, game id, stones) and meal as text: two equal texts are the same set. */
export const setKey = (set: GearSet): string =>
  JSON.stringify([
    set.pieces.map(piece => [piece.slot, piece.gameId ?? null, (piece.stones ?? []).map(stone => stone && `${stone.stat}${stone.grade}`)]),
    set.meal ?? null,
  ]);

/* What the search ranks, as text; the rest of a result is free to tie: the ranked stats with food (by tier: each ranked
   stat's tier effect, then the goal's points), and the GCD when one was asked. `job` a JobContext, `sync` as for itemSyncIlvl,
   `recipe` the one that made `set`. */
export function rankedOf(job: JobContext, set: GearSet, sync: Sync, level: number, recipe: Recipe): string {
  const evaluated = evaluateSet(job, set, sync, level);
  const keys = [recipe.target, recipe.tb, recipe.tb2].filter((key): key is StatKey => key !== '');
  const tierOf = (key: StatKey) => evaluated.tiers[job.stats.indexOf(key)];
  const body = recipe.byTier
    ? [keys.map(key => tierOf(key)?.effect ?? null), evaluated.withFood[recipe.target]]
    : keys.map(key => evaluated.withFood[key]);
  return JSON.stringify([body, recipe.gcd ? evaluated.gcd.gcd : null]);
}

/* A copy of `list` in an order drawn from `seed` (Fisher-Yates over the seeded rng): the same seed gives the same order. */
export function shuffled<Item>(list: readonly Item[], seed: number): Item[] {
  const rand = rng(seed);
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
