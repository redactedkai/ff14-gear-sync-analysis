/* The page's settings as the core and the views take them: plain values read from the store's fields, so a view never
   needs the store itself (a sheet hands in its own). Pure: no Alpine import and no other UI module, so state.js,
   helpers.js, the views and the components can all use it without an import going back up. */
import { ACTIVITIES } from '../core/constants.js';
import { capCeiling, levelSyncIlvl } from '../core/sync-target.js';
import { makeJobContext } from '../core/job-context.js';
import { MAX_LEVEL } from '../core/tables.js';

/* Each reference tab has its own Job and sync panel (job, cap, sync, level), saved in a group of the state: the store
   field that holds it, by tab ('browse' the Gear browser, 'math' How the math works). The store also mirrors the open
   tab's panel in its top-level job, cap, sync and level, which the panel's fields edit. The Sheets tab has none: a sheet
   holds its own job, level and sync (ui/sheet-store.js). */
export const PANEL_GROUP = Object.freeze({ browse: 'browse', math: 'piece' });

/* The Job and sync panel of `tab` ('browse' or 'math'), whether or not that tab is open: {job (id or null),
   jobCtx, cap, sync, level}. `app` is the store or a state shaped like it. The open tab's is the top-level copy (what the
   panel edits); another tab's is its saved group. A component reads its own tab's panel here, so a hidden tab never
   works with the open tab's job. */
export function panelOf(app, tab) {
  if (tab === app.tab) return { job: app.job, jobCtx: app.jobCtx, cap: app.cap, sync: app.sync, level: app.level };
  const { job, cap, sync, level } = app[PANEL_GROUP[tab]];
  return { job, jobCtx: makeJobContext(job), cap, sync, level };
}

/* "Gear from" boxes left out until the user ticks them back in, in a set's Fill settings and the gear browser alike:
   those with `on: false` in item-format.json (Miscellaneous, Deep dungeons, Wondrous Tails, Variant & Criterion, PvP,
   Extreme (Current), Savage (Current), Ultimate, Events & promotions). In ACTIVITIES order. */
export const DEFAULT_EXCLUDE = Object.freeze(ACTIVITIES.filter(a => !a.on).map(a => a.key));

/* The Target GCD a player can set, in seconds: [lowest, highest]. The highest is 2.50, the slowest base GCD
   (BASE_GCD_MS): no gear is slower, so the box moves a higher value to 2.50. The Fill settings' box takes it from
   here. */
export const TARGET_GCD_RANGE = Object.freeze([0.5, 2.5]);

/* The sync settings the core takes, from the store's fields {cap, sync, level} (sync: the item level sync switch):
   {cap, sync, level}, sync true only while the switch is on and a cap is set (itemSyncIlvl in core/piece.js). */
export function syncSettings({ cap, sync, level }) {
  return { cap, sync: !!sync && cap != null, level: level ?? null };
}

/* Level sync can apply: `level` is below the job's level cap (`job` a JobContext; MAX_LEVEL before one exists), so gear
   the job can wear with a higher equip level is synced to the level's item level (core/sync-target.js). Independent of
   the item level sync switch. */
export function levelSyncOn(job, level) {
  return level != null && level < (job?.maxLevel ?? MAX_LEVEL);
}

/* The cap for a piece whose equip level is not known (Piece stats), for `job` (a JobContext) under `sync`
   (syncSettings): the item level cap while item level sync is on (a piece above it is synced to it whatever its equip
   level); otherwise the synced level's item level while level sync can apply, for gear with a higher equip level
   (byLevel). A cap above what the level allows (capCeiling) shows the level's item level too: gear made for a higher
   level is synced to it under the cap, and at most to capCeiling above it (syncTarget). Null when neither.
   {cap, level, byLevel} */
export function shownSync(job, sync) {
  const byLevel = levelSyncOn(job, sync.level);
  if (sync.sync && (!byLevel || sync.cap <= capCeiling(sync.level))) return { cap: sync.cap, level: sync.level, byLevel: false };
  if (byLevel) return { cap: levelSyncIlvl(sync.level), level: sync.level, byLevel: true };
  return null;
}
