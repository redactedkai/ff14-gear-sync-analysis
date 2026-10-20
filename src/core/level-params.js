/* Per-level game data: the ParamGrow sheet (generated into tables.js PG). One row per character level from 1 to the
   level cap; its columns feed speed (speed.js), substat tiers (tiers.js), food bases (food.js), level sync
   (sync-target.js), defense mitigation (damage-defense.js) and the expansion bounds (items.js). */
import { MAX_LEVEL, PG } from './tables.js';

/* The position of each ParamGrow column in a PG row (scripts/data/gen_item_level.py writes them in this order). */
const PG_COLUMN = Object.freeze({ baseSpeed: 0, levelModifier: 1, itemLevelSync: 2 });

/* A character level as a whole number from 1 to MAX_LEVEL, the levels PG has a row for. Any input: a level past the
   cap reads the cap's row (tests/unit/core-constants.level-tables.test.js holds PG to MAX_LEVEL rows). */
export function clampLevel(level) {
  return Math.max(1, Math.min(MAX_LEVEL, level | 0));
}

/* ParamGrow at character `level` (clampLevel): {sub, div, sync}.
   - sub: BaseSpeed, the character's own Critical Hit, Direct Hit, speed and Tenacity at this level;
   - div: LevelModifier, the divisor of every substat formula (2780 at level 100);
   - sync: ItemLevelSync, the item level gear is synced to at this level (level sync, sync-target.js). */
export function levelParams(level) {
  const row = PG[clampLevel(level) - 1];
  return { sub: row[PG_COLUMN.baseSpeed], div: row[PG_COLUMN.levelModifier], sync: row[PG_COLUMN.itemLevelSync] };
}
