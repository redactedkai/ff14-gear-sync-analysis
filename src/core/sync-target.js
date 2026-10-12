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

/* The item level a piece is synced to, or null when it is untouched. Two triggers (verified by the owner in game):
   - item level sync: `syncOn`, a `cap` is set and the piece's `itemLevel` is above it; the target is the cap;
   - level sync: the piece's `equipLevel` is above `syncedLevel`; the target is levelSyncIlvl(syncedLevel).
   When both apply the item level cap wins, even where it is the higher of the two: in Aloalo Island (level 90, item
   level 665) level 95 and 96 gear at item level 666 and 669 showed item level 665 stats, not 660 (a player's in-game
   report, xivgear issue #317; second-hand). `equipLevel` null (a generated or hand-made piece) or `syncedLevel` null
   means no level sync. A piece synced to an item level at or above its own keeps its stats (syncStats). */
export function syncTarget({ itemLevel, equipLevel, syncOn, cap, syncedLevel }) {
  if (syncOn && cap != null && itemLevel > cap) return cap;
  if (equipLevel != null && syncedLevel != null && equipLevel > syncedLevel) return levelSyncIlvl(syncedLevel);
  return null;
}
