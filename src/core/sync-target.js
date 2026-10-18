/* Which item level a piece is synced to: the duty's item level cap, the item level its level allows, or none.
   See docs/mechanics/math.md, section 5 ("Which pieces are synced"). How a stat is capped at that item level is formulas.js. */
import { speedParams } from './speed.js';

/* The item level a piece is synced to by level sync at character level `level`: ParamGrow.ItemLevelSync (levels 1 to
   49 map to their own number, 50 to 130, 60 to 270, 70 to 400, 80 to 530, 90 to 660, 100 to 690). The game file has one
   column for every slot. That weapons use it too is inferred; a player's report supports it at level 90 (level 100
   weapons synced to item level 660 in P12S, xivgear issue #317). */
export function levelSyncIlvl(level) {
  return speedParams(level).sync;
}

/* The highest item level cap a real duty pairs with synced level `level`: its level sync item level plus 5, or null at
   level 100. In the game's duty list (ContentFinderCondition: ClassJobLevelSync, ItemLevelSync; 567 duties at
   datamining d9582a6, verified 2026-10-16) no duty below level 100 has a cap more than 5 above levelSyncIlvl of its
   level: the most are Mount Rokkon and Aloalo Island (level 90, 665 over 660) and Second Master's Board (level 50, 135
   over 130); duties below level 50 have none (Sastasha syncs only the level) or the tutorials' 5 at level 15. At level
   100 caps run from 680 to the highest item level. The page computes nothing for a higher cap (ui/state.js
   capOutOfRange; owner's decision, 2026-10-18): it gives results no duty can, such as a 1.50 s GCD at level 50 with
   cap 500. */
export const DUTY_CAP_MARGIN = 5;
export function dutyCapMax(level) {
  return level >= 100 ? null : levelSyncIlvl(level) + DUTY_CAP_MARGIN;
}

/* The item level a piece is synced to, or null when it is untouched. Two triggers (verified by the owner in game):
   - item level sync: `syncOn`, a `cap` is set and the piece's `itemLevel` is above it; the target is the cap;
   - level sync: the piece's `equipLevel` is above `syncedLevel`; the target is levelSyncIlvl(syncedLevel).
   When both apply the item level cap wins, even where it is the higher of the two: in Aloalo Island (level 90, item
   level 665) level 95 and 96 gear at item level 666 and 669 showed item level 665 stats, not 660 (a player's in-game
   report, xivgear issue #317; second-hand). `equipLevel` null (a generated or hand-made piece) or `syncedLevel` null
   means no level sync. A piece synced to an item level at or above its own keeps its stats (syncStats).
   A piece that `scales` (Item.SubStatCategory 2: level 89 and 99 boost gear, gift earrings and rings) follows the
   wearer's level whatever its equip level: the game's description of each reads "IL and attributes synced to current
   job level." (verified, game files). Below levelSyncIlvl(syncedLevel) of its own item level it is synced to that, or
   to the item level cap where that is lower. That the target is ParamGrow's item level at every level is inferred: it
   gives the Wiki's artifact armor item levels (548 at level 89, 678 at 99); ffxiv-gearing does the same at levels 50
   to 90 (docs/mechanics/validation.md section 9). */
export function syncTarget({ itemLevel, equipLevel, scales, syncOn, cap, syncedLevel }) {
  const overCap = syncOn && cap != null && itemLevel > cap;
  // gear that scales with the wearer follows the synced level whatever its equip level; the cap can only lower it more
  if (scales && syncedLevel != null) {
    const levelIlvl = levelSyncIlvl(syncedLevel);
    if (levelIlvl < itemLevel) return overCap ? Math.min(cap, levelIlvl) : levelIlvl;
  }
  // the item level cap wins over level sync, even where it is the higher of the two
  if (overCap) return cap;
  if (equipLevel != null && syncedLevel != null && equipLevel > syncedLevel) return levelSyncIlvl(syncedLevel);
  return null;
}
