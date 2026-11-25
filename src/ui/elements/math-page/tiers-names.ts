/* The event the Substat tiers controls element sends, written once. A `.ts` module with no import, so Node tests can read it. */

/* The `tiers-level` event: the person typed a level into the math bar's Level box on Substat tiers. `detail` is `{level}`: the level
   to count, or null for the job's level cap (the sub-tab then follows it). The page's template listens with `@tiers-level`, which
   cannot import this constant, and calls `setTiersLevel`. */
export const TIERS_LEVEL_EVENT = 'tiers-level';
