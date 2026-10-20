/* The page's settings as the core and the views take them: plain values read from the store's fields, so a view never
   needs the store itself (a set of the planned sheet will hand in its own). Pure: no Alpine import and no other UI
   module, so state.js, helpers.js, the views and the components can all use it without an import going back up. */
import { ACTIVITIES } from '../core/constants.js';
import { capCeiling, levelSyncIlvl } from '../core/sync-target.js';
import { MAX_LEVEL } from '../core/tables.js';

/* "Gear from" boxes left out until the user ticks them back in, in the optimizer and the gear browser alike: those with
   `on: false` in item-format.json (owner's decision, 2026-10-18: Miscellaneous, Deep dungeons, Wondrous Tails,
   Variant & Criterion, PvP, Extreme (Current), Savage (Current), Ultimate, Events & promotions). In ACTIVITIES order. */
export const DEFAULT_EXCLUDE = Object.freeze(ACTIVITIES.filter(a => !a.on).map(a => a.key));

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

/* The optimizer's recipe, from the store: a copy of its `opt` settings (state.js defaultState: the goal, the filters
   under Gear to search, materia, food, the Target GCD and rank by tier; core/recipe.js), lists copied, so a later
   change in the store never reaches a recipe already handed out. */
export function recipeOf(app) {
  return Object.fromEntries(Object.entries(app.opt).map(([k, v]) => [k, Array.isArray(v) ? [...v] : v]));
}

/* The settings an optimizer result depends on, as one string: the job and sync settings and every optimizer setting
   (each field of `opt`, by name, so a field added to defaultState is part of it without another edit). A result is
   for the current settings exactly when it was solved with the same key. Read synchronously, it also makes an effect
   track every one of them (the optimizer component). */
export function optimizerKey(app) {
  const opt = app.opt;
  return JSON.stringify([
    app.job,
    app.cap,
    app.sync,
    app.level,
    ...Object.keys(opt)
      .sort()
      .map(k => [k, opt[k]]),
  ]);
}

/* What the optimizer's view builders take, from the store: {job (the JobContext), sync (syncSettings), level (the
   synced level), recipe (recipeOf)}. */
export function optimizerInputs(app) {
  return { job: app.jobCtx, sync: syncSettings(app), level: app.level, recipe: recipeOf(app) };
}
