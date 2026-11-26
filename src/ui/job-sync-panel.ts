/* The page's settings as the core and the views take them: plain values read from the store's fields, so a view never
   needs the store itself (a sheet hands in its own). Pure: no import of another UI module, so state.ts,
   level-cap.ts, the views and the elements can all use it without an import going back up. */
import { ACTIVITIES } from '../core/constants.ts';
import { capCeiling, levelSyncIlvl } from '../core/sync-target.ts';
import { makeJobContext } from '../core/job-context.ts';
import { MAX_LEVEL } from '../core/tables.ts';
import type { JobContext, SlotType, Sync } from '../core/types.ts';

/* Stat Allocation's example piece: its total number of materia slots follows its slot. The totals real pieces have, by
   kind of slot (item database, pieces at item level 200 and up; no piece has 4 in all: the 16 pieces with 4 guaranteed
   slots allow overmelding, so they take 5), and the usual one, the most common total:
   armor 0, 2 or 5, usually 2; accessories 0, 1, 2 or 5, usually 1; weapon 0, 1, 2, 3 or 5, usually 2; off-hand 0, 1 or
   5, usually 0 (most shields have none). Every slot counts as an ordinary one that takes any grade (no overmeld odds),
   like a piece with that many guaranteed slots. */
const MELD_SLOTS_BY_KIND = Object.freeze({
  armor: { choices: Object.freeze([0, 2, 5]), usual: 2 },
  accessory: { choices: Object.freeze([0, 1, 2, 5]), usual: 1 },
  weapon: { choices: Object.freeze([0, 1, 2, 3, 5]), usual: 2 },
  offhand: { choices: Object.freeze([0, 1, 5]), usual: 0 },
});
const SLOT_KIND = Object.freeze({
  weapon: 'weapon',
  offhand: 'offhand',
  head: 'armor',
  body: 'armor',
  hands: 'armor',
  legs: 'armor',
  feet: 'armor',
  ear: 'accessory',
  neck: 'accessory',
  wrist: 'accessory',
  ring: 'accessory',
});

/* The materia slot totals the Materia slots menu offers for a piece of slot type `slotType` ('head', 'ear', ...). */
export function meldSlotChoices(slotType: SlotType): readonly number[] {
  return MELD_SLOTS_BY_KIND[SLOT_KIND[slotType]].choices;
}

/* The materia slots of Stat Allocation's example piece `piece` ({slot, slots}): its own choice (`slots`: null means the
   slot's usual total), or the usual one when the choice is not a total that slot's pieces have. */
export function meldSlotsOf(piece: { slot: string; slots: number | null }): number {
  // the saved slot is a slot type (state.ts repairs it on restore)
  const { choices, usual } = MELD_SLOTS_BY_KIND[SLOT_KIND[piece.slot as SlotType]];
  // a null `slots` is in no list, so the usual total applies
  return choices.includes(piece.slots as number) ? (piece.slots as number) : usual;
}

/* Each reference tab has its own Job and sync panel (job, cap, sync, level), saved in a group of the state: the store
   field that holds it, by tab ('browse' the Gear browser, 'math' How the math works: Stat Allocation's). The store also
   mirrors the open tab's panel in its top-level job, cap, sync and level, which the panel's fields edit. The Sheets tab
   has none: a sheet holds its own job, level and sync (ui/store/sheets-actions.ts). Two more owners of a job have no mirror:
   Substat tiers (owner 'tiers': a job only, saved as `tiers.job`; its level is its own box) and GCD Scaling (no job at
   all). */
export const PANEL_GROUP = Object.freeze({ browse: 'browse', math: 'piece' });

/* A tab that has a Job and sync panel of its own. */
export type PanelTab = keyof typeof PANEL_GROUP;

/* A panel's four saved fields: the job's id, the item level cap (null: none), whether item level sync is on, the synced level. */
export interface PanelFields {
  job: string;
  cap: number | null;
  sync: boolean;
  level: number;
}

/* What panelOf reads: the store or a state shaped like it: the open tab's name and its mirrored fields, the saved groups (`browse`,
   `piece`) and Substat tiers' job. */
export interface PanelSource extends PanelFields {
  tab: string;
  jobCtx: JobContext;
  browse: PanelFields;
  piece: PanelFields;
  tiers: { job: string };
}

/* What panelOf returns: a panel's fields and its JobContext. */
export interface PanelOf extends PanelFields {
  jobCtx: JobContext;
}

/* The sync settings the core takes (`Sync` of core/types.ts, with the level always set to a number or null). */
export interface SyncSettings extends Sync {
  readonly level: number | null;
}

/* What shownSync returns: the cap and level to show, and whether the cap is the level's item level (level sync) rather than the cap. */
export interface ShownSync {
  cap: number | null;
  level: number | null | undefined;
  byLevel: boolean;
}

/* The owner of the job the math bar's Job box edits on math sub-tab `mathTab` ('piece', 'gcd' or 'tiers'): 'tiers' on
   Substat tiers, else 'math' (Stat Allocation's panel; GCD Scaling shows no Job box, so nothing reads it there). */
export function mathJobOwner(mathTab: string): 'tiers' | 'math' {
  return mathTab === 'tiers' ? 'tiers' : 'math';
}

/* The Job and sync panel of `tab` ('browse', 'math' or 'tiers'), whether or not that tab is open: {job (id or null),
   jobCtx, cap, sync, level}. `app` is the store or a state shaped like it. The open tab's is read from the facade's
   job, cap, sync and level (what the panel edits); another tab's is its saved group. An element reads its own tab's panel here, so a hidden tab never
   works with the open tab's job. 'tiers' has only a job (`app.tiers.job`): no cap, IL Sync off, and its level is the job's
   level cap (the Level box of Substat tiers holds a typed level on top, app.tiers.level). */
export function panelOf(app: PanelSource, tab: string): PanelOf {
  if (tab === 'tiers') {
    const jobCtx = makeJobContext(app.tiers.job);
    return { job: jobCtx.jobId, jobCtx, cap: null, sync: false, level: jobCtx.maxLevel };
  }
  if (tab === app.tab) {
    return { job: app.job, jobCtx: app.jobCtx, cap: app.cap, sync: app.sync, level: app.level };
  }
  const { job, cap, sync, level } = app[PANEL_GROUP[tab as PanelTab]];
  return { job, jobCtx: makeJobContext(job), cap, sync, level };
}

/* "Gear categories" boxes left out until the user ticks them back in, in a set's Auto-fill settings and the gear browser alike:
   those with `on: false` in item-format.json (Miscellaneous, Deep dungeons, Wondrous Tails, Variant & Criterion, PvP,
   Extreme (Current), Savage (Current), Ultimate, Events & promotions). In ACTIVITIES order. */
export const DEFAULT_EXCLUDE = Object.freeze(ACTIVITIES.filter(a => !a.on).map(a => a.key));

/* The Target GCD a player can set, in seconds: [lowest, highest]. The highest is 2.50, the slowest base GCD
   (BASE_GCD_MS): no gear is slower, so the box moves a higher value to 2.50. The Auto-fill settings' box takes it from
   here. */
export const TARGET_GCD_RANGE = Object.freeze<[number, number]>([0.5, 2.5]);

/* The sync settings the core takes, from the store's fields {cap, sync, level} (sync: the item level sync switch):
   {cap, sync, level}, sync true only while the switch is on and a cap is set (itemSyncIlvl in core/piece.ts). */
export function syncSettings({ cap, sync, level }: { cap: number | null; sync: boolean | undefined; level?: number | null }): SyncSettings {
  return { cap, sync: Boolean(sync) && cap != null, level: level ?? null };
}

/* Level sync can apply: `level` is below the job's level cap (`job` a JobContext; MAX_LEVEL before one exists), so gear
   the job can wear with a higher equip level is synced to the level's item level (core/sync-target.ts). Independent of
   the item level sync switch. */
function levelSyncOn(job: JobContext | null | undefined, level: number | null | undefined): boolean {
  return level != null && level < (job?.maxLevel ?? MAX_LEVEL);
}

/* The cap for a piece whose equip level is not known (Piece stats), for `job` (a JobContext) under `sync`
   (syncSettings): the item level cap while item level sync is on (a piece above it is synced to it whatever its equip
   level); otherwise the synced level's item level while level sync can apply, for gear with a higher equip level
   (byLevel). A cap above what the level allows (capCeiling) shows the level's item level too: gear made for a higher
   level is synced to it under the cap, and at most to capCeiling above it (syncTarget). Null when neither.
   {cap, level, byLevel} */
export function shownSync(job: JobContext | null | undefined, sync: Sync): ShownSync | null {
  const byLevel = levelSyncOn(job, sync.level);
  // sync.sync means a cap is set (syncSettings), and byLevel means a level is set
  if (sync.sync && (!byLevel || (sync.cap as number) <= capCeiling(sync.level as number))) {
    return { cap: sync.cap, level: sync.level, byLevel: false };
  }
  if (byLevel) {
    return { cap: levelSyncIlvl(sync.level as number), level: sync.level, byLevel: true };
  }
  return null;
}

/* The item level level sync gives at synced level `level` for `job` (a JobContext): the cap the math tab holds while its
   IL Sync is off, and shows in the greyed Synced IL box. Null at the job's level cap (and for no level), where no level
   sync applies. */
export function levelSyncCap(job: JobContext | null | undefined, level: number | null | undefined): number | null {
  return shownSync(job, { cap: null, sync: false, level })?.cap ?? null;
}

/* The math panel `panel` ({job (id), cap, sync, level}, the group `piece`) with its IL Sync off holds level sync's item
   level as its cap (levelSyncCap), so the greyed box always shows the saved value and switching on never starts from a
   stale or empty one. Changes `panel.cap` in place; with the switch on it changes nothing. Called by the user actions
   that change the inputs (level, job, Reset) and at load: never by a watcher, so a tab change leaves both tabs' fields as
   they were. */
export function holdLevelSyncCap(panel: PanelFields): void {
  if (!panel.sync) {
    panel.cap = levelSyncCap(makeJobContext(panel.job), panel.level);
  }
}
