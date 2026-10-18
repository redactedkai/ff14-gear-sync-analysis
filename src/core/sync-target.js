/* Which item level a piece is synced to: the duty's item level cap, the item level its level allows, or none.
   See docs/mechanics/math.md, section 5 ("Which pieces are synced"). How a stat is capped at that item level is formulas.js. */
import { ROW } from './constants.js';
import { speedParams } from './speed.js';
import { ITEMS } from './tables.js';

/* The item level a piece is synced to by level sync at character level `level`: ParamGrow.ItemLevelSync (levels 1 to
   49 map to their own number, 50 to 130, 60 to 270, 70 to 400, 80 to 530, 90 to 660, 100 to 690). The game file has one
   column for every slot. That weapons use it too is inferred; a player's report supports it at level 90 (level 100
   weapons synced to item level 660 in P12S, xivgear issue #317). */
export function levelSyncIlvl(level) {
  return speedParams(level).sync;
}

/* The highest item level an item level cap syncs gear made for a higher level to, at synced level `level`: the highest
   item level of gear made for that level (equip level `level`), or the level's own item level where that is higher.
   It is the Wiki's "the max IL achievable by gear matching the class level" (Item Level page, "Item Level vs. Class
   Level"): at each expansion's level cap the weapons' 5 above the rest (50: 135, 90: 665), else the level's item
   level, give or take a few item levels below level 50. Gear that scales with the wearer is left out: its item level is
   not tied to its equip level.
   The one case known of a cap above the level's item level fits it: in Aloalo Island (level 90, cap 665 over 660) gear
   above both showed item level 665 stats (syncTarget). Every real cap is at or under it (ContentFinderCondition at
   datamining d9582a6: the 492 caps of every duty with a level sync, Minimum IL included; verified 2026-10-18), so it
   changes no real duty; what a higher cap does is untested. Holding gear to it keeps every setting to what a duty can
   do: at level 50 with cap 400 a level 70 piece is synced to 135, where the cap alone gave it item level 400 stats
   (owner's decision, 2026-10-18; it replaces an error for such caps). */
let ceilings = null;
export function capCeiling(level) {
  if (!ceilings) {
    ceilings = [];
    for (const row of ITEMS) {
      if (row[ROW.scales]) continue;
      const lvl = row[ROW.equipLevel];
      ceilings[lvl] = Math.max(ceilings[lvl] ?? 0, row[ROW.ilvl]);
    }
  }
  return Math.max(levelSyncIlvl(level), ceilings[level] ?? 0);
}

/* The item level a piece is synced to, or null when it is untouched. Two triggers (verified by the owner in game):
   - item level sync: `syncOn`, a `cap` is set and the piece's `itemLevel` is above it; the target is the cap;
   - level sync: the piece's `equipLevel` is above `syncedLevel`; the target is levelSyncIlvl(syncedLevel).
   When both apply the item level cap wins, even where it is the higher of the two, up to capCeiling(syncedLevel): in
   Aloalo Island (level 90, item level 665) level 95 and 96 gear at item level 666 and 669 showed item level 665 stats,
   not 660 (a player's in-game report, xivgear issue #317; second-hand). `equipLevel` null (a generated or hand-made piece) or `syncedLevel` null
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
  const aboveLevel = equipLevel != null && syncedLevel != null && equipLevel > syncedLevel;
  // the item level cap wins over level sync, even where it is the higher of the two, but no higher than the level allows
  if (overCap) return aboveLevel ? Math.min(cap, capCeiling(syncedLevel)) : cap;
  if (aboveLevel) return levelSyncIlvl(syncedLevel);
  return null;
}
