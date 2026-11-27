/* The one way to build a Limit (types.ts), so no limit holds a null minimum. No state, no DOM. */

import type { Limit } from '../types.ts';

/* A limit on the total of `stat` over the loadout: `min` points at least (0 or less, or no number, means no minimum: a
   total is never below 0, so a minimum of 0 limits nothing), `max` points at most (null for none; a maximum of 0 is a real
   limit). `cut` marks a regain cut's synthetic stat. */
export function makeLimit(stat: string, min: number | null | undefined, max: number | null, cut = false): Limit {
  const limit: Limit = { stat, min: min !== null && min !== undefined && min > 0 ? min : 0, max };
  if (cut) {
    limit.cut = true;
  }
  return limit;
}
