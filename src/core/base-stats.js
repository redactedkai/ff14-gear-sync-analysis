/* A character's base stats at a level (statBase): the points a stat starts from before gear, as the character panel counts
   them. Food, the tier tables and the set totals all start from them. */
import { clampLevel, levelParams } from './level-params.js';

/* The substats whose character base is the level's main stat base, not the speed base (statBase below): the ones the
   game scales from the main stat. */
const MAIN_BASED_SUBSTATS = Object.freeze(['det', 'piety']);

/* The character's base main stat at each level 1..100 (index = level - 1), the base that Determination and Piety start
   from (Critical Hit, Direct Hit, speed and Tenacity start from ParamGrow BaseSpeed). Not in the game files (no sheet
   holds it); AkhMorning's Level Modifiers table (Allagan Studies), which Ariyala and the FF Wiki repeat. Its BaseSpeed
   and LevelModifier columns equal ParamGrow's at every level, and this column equals xivgear's at 50, 60, ..., 100.
   Inferred; used for the character's base stats (statBase), which food, the tiers and the set totals start from
   (docs/mechanics/math.md, section 6, Food). */
export const LEVEL_MAIN = Object.freeze([
  20, 21, 22, 24, 26, 27, 29, 31, 33, 35, 36, 38, 41, 44, 46, 49, 52, 54, 57, 60, 63, 67, 71, 74, 78, 81, 85, 89, 92, 97, 101, 106, 110,
  115, 119, 124, 128, 134, 139, 144, 150, 155, 161, 166, 171, 177, 183, 189, 196, 202, 204, 205, 207, 209, 210, 212, 214, 215, 217, 218,
  224, 228, 236, 244, 252, 260, 268, 276, 284, 292, 296, 300, 305, 310, 315, 320, 325, 330, 335, 340, 345, 350, 355, 360, 365, 370, 375,
  380, 385, 390, 395, 400, 405, 410, 415, 420, 425, 430, 435, 440,
]);

/* The base a stat key starts from at character level `level`, as the character panel counts it: for the main stat
   and Vitality the level's main stat base (LEVEL_MAIN) x the job's modifier (ClassJob; floor, as AkhMorning and xivgear
   do), without the clan's bonus (-3 to +3: a saved sheet's clan is added on top by clan-bonus.js); the level's main stat base for
   Determination and Piety; ParamGrow BaseSpeed for the other substats. */
export function statBase(job, stat, level) {
  const lv = clampLevel(level);
  // the main stat and Vitality: the job's share of the main stat base
  if (stat === job.mainKey || stat === 'vit') return Math.floor((LEVEL_MAIN[lv - 1] * job.attributeMods[stat]) / 100);
  // Determination and Piety start from the main stat base, the other substats from the speed base
  if (MAIN_BASED_SUBSTATS.includes(stat)) return LEVEL_MAIN[lv - 1];
  return levelParams(lv).sub;
}
