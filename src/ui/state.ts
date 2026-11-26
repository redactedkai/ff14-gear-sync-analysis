/* The page's saved state: defaults, per-job resets, and repair of whatever localStorage hands back.
   The shape is what gets saved under STORE_KEY; restoreState repairs an older shape field by field. */
import { clamp } from '../core/clamp.ts';
import { DEFAULT_JOB, ACTIVITIES, EXPANSIONS, jobById } from '../core/constants.ts';
import { makeJobContext } from '../core/job-context.ts';
import { currentStatKey } from '../core/stat-keys.ts';
import { MAX_REAL } from '../core/tables.ts';
import { ANY_SLOT_KEY } from './elements/gear-browser/slot-menu-names.ts';
import { DEFAULT_EXCLUDE, PANEL_GROUP, holdLevelSyncCap, meldSlotChoices } from './job-sync-panel.ts';
import { limitCapToLevel } from './level-cap.ts';
import { STORE_KEY } from './store-key.ts';
import type { JobContext, SlotType, StatKey } from '../core/types.ts';
import type { BrowseFields, Panel, PieceFields, RestoredState } from './store/app-state.ts';

/* The saved state as restoreState and defaultState give it: the saved groups, and the open tab's panel copied into the top level
   (job, cap, sync, level). Plain data; `piece` and `browse` hold their own panel's fields beside their own. */
export type SavedState = RestoredState & Panel;

/* A Job and sync panel as restorePanel returns it: the saved fields and the job's context. */
export type RestoredPanel = Panel & { jobCtx: JobContext };

/* Settings read from storage or an address: any JSON value, so every field is checked before it is used. */
type Raw = Record<string, unknown>;

/* Defaults favour no player's setup: level 100 (the level cap), no sync cap and sync off. */
const DEFAULT_LEVEL = 100;

/* The Job and sync panel's saved fields, which each reference tab holds for itself (job-sync-panel.ts PANEL_GROUP). */
const PANEL_KEYS = ['job', 'cap', 'sync', 'level'] as const;

/* One tab's Job and sync strip at its defaults: {job (DEFAULT_JOB, Paladin: a tab always has a job), cap (null: none),
   sync (item level sync off), level (the synced level)}. */
function defaultPanel(): Panel {
  return { job: DEFAULT_JOB, cap: null, sync: false, level: DEFAULT_LEVEL };
}

/* The Gear browser's settings at their defaults for `job` (a JobContext, or null before one is chosen). The one copy of
   them: defaultState, the job reset (resetForJob), Reset filters (elements/gear-browser/gear-browser.ts) and its check (views/gear.ts
   browseFiltered) all read it. expOff: expansions switched off. exclude: ACTIVITIES keys ("Gear categories" boxes) left out;
   market: tradeable pieces listed whatever their source (the market board switch, on by default). lvl: the "Equip
   level" filter, the job's level cap (DEFAULT_LEVEL with no job). sort: the table heading it is sorted by ('name',
   'lvl', 'ilvl' or a stat); dir: 'desc' (high first) or 'asc'. */
export function defaultBrowse(job: JobContext | null = null): BrowseFields {
  return {
    q: '',
    type: ANY_SLOT_KEY,
    expOff: [],
    exclude: [...DEFAULT_EXCLUDE],
    market: true,
    min: '',
    max: '',
    lvl: job?.maxLevel ?? DEFAULT_LEVEL,
    sort: 'ilvl',
    dir: 'desc',
  };
}

/* The longest name search the browser takes (characters): the box stops there, and a longer saved one is cut on
   restore (no gear name comes close; it bounds the one free-text field the page saves). */
export const SEARCH_MAX_LENGTH = 100;

/* `text` cut to at most `max` UTF-16 units, never between the two halves of a character (an emoji is two units: half of it is
   no text, and it cannot go into an address). */
export function cutText(text: string, max: number): string {
  const cut = text.slice(0, max);
  return text.length > max && /[\uD800-\uDBFF]$/.test(cut) ? cut.slice(0, -1) : cut;
}

/* The page's tabs (`tab`; the first is the one a bare address opens) and the math tab's sub-tabs (`mathTab`). Neither is
   saved: the address names the open tab and math view (ui/router/). A saved `tab` or `mathTab` of an older save is
   ignored. The Sheets tab has no Job and sync panel (each sheet holds its own job, level and sync; job-sync-panel.ts PANEL_GROUP lists no group
   for it). */
export const TABS = ['sheets', 'browse', 'math'];
export const MATH_TABS = ['piece', 'gcd', 'tiers'];
/* What a sheet's list of gear sets shows per set (`sheetFigures`): the effects (GCD, rates, bonuses) or the stat points. */
const SHEET_FIGURES = ['effects', 'points'];

/* Every saved setting at its default, with the default job: the shape saved under STORE_KEY. The job-dependent fields
   are set for a job by resetForJob. */
export function defaultState(): SavedState {
  return {
    // The Job and sync panel as the open tab holds it (the store's mirror of that tab's group; PANEL_GROUP): not saved
    // itself, each tab's own copy is. job: the default job until the user picks one.
    ...defaultPanel(),
    tab: TABS[0],
    mathTab: 'piece',
    sheetFigures: SHEET_FIGURES[0],
    // How the math works: its own Job and sync panel (job, cap, sync, level), then the piece's item level (null: the
    // cap; explainerItemLevel in views/sync-explainer.ts), slot and two ranked substats
    piece: { ...defaultPanel(), ilvl: null, slot: 'head', subs: defaultSubs(makeJobContext(DEFAULT_JOB)), slots: null },
    // the Gear browser's own Job and sync panel, then its filters and sort (defaultBrowse)
    browse: { ...defaultPanel(), ...defaultBrowse() },
    // How the math works, Substat tiers: its own job (Stat Allocation's is `piece.job`; GCD Scaling has none)
    tiers: { job: DEFAULT_JOB },
  };
}

/* Critical Hit first and the job's speed second, for every job: a second substat shows sync raising the 70% line to
   the full cap, and speed as that line gives the GCD sub-tab something to show. `job`: a JobContext. */
export function defaultSubs(job: JobContext): string[] {
  return ['crit', job.speedKey];
}

/* The synced level (`s.level`, the open tab's panel) and, when `parts` has the Gear browser ('browse'), its "Equip
   level" filter held to the job's level cap (resetForJob). */
function clampLevels(s: ResetTarget, job: JobContext, parts: readonly string[] = ['browse']): void {
  if (s.level > job.maxLevel) {
    s.level = job.maxLevel;
  }
  const filter = s.browse;
  if (parts.includes('browse') && filter.lvl !== '' && filter.lvl > job.maxLevel) {
    filter.lvl = job.maxLevel;
  }
}

/* What resetForJob and clampLevels change: the synced level, the example piece's slot and substats, and the Gear browser's slot, sort
   and Equip level filter (the page's state, or an object built from it). */
export interface ResetTarget {
  level: number;
  piece: Pick<PieceFields, 'slot' | 'subs'>;
  browse: Pick<BrowseFields, 'lvl' | 'type' | 'sort' | 'dir'>;
}

/* On a job change from `from` (a JobContext, or null with no job chosen before) to `job`: the levels are held to the
   job's cap, and the job-specific selections the new job can use stay. A stat choice stays when the new job has the
   same stat (a key is one game stat: Piety is a key only on a healer, Tenacity only on a tank), else it goes back to
   its default. With no `from`, everything goes back. `parts`: the tabs whose settings are reset,
   any of 'math' (the piece) and 'browse'; both by default. A job change in one tab's panel passes that tab only, since
   the other tab keeps its own job (the store's setJob). */
export function resetForJob(
  s: ResetTarget,
  job: JobContext,
  from: JobContext | null = null,
  parts: readonly string[] = ['math', 'browse'],
): void {
  const keeps = (k: string | null | undefined) =>
    Boolean(k) && Boolean(from) && job.stats.includes(k as StatKey) && (from as JobContext).stats.includes(k as StatKey);
  clampLevels(s, job, parts);
  if (parts.includes('math')) {
    // Piece stats' two substats stay as a pair (the second may be none), else both go back
    const [sub1, sub2] = s.piece.subs;
    if (!(keeps(sub1) && (sub2 == null || keeps(sub2)))) {
      s.piece.subs = defaultSubs(job);
    }
    if (!job.activeSlotTypes.includes(s.piece.slot as SlotType)) {
      s.piece.slot = 'head';
    }
  }
  if (parts.includes('browse')) {
    // the browser's slot and sort: a slot the job wears and a sort by name, level, item level or a kept stat stay
    const browse = defaultBrowse(job);
    if (!from || ![ANY_SLOT_KEY, ...job.activeSlotTypes].includes(s.browse.type)) {
      s.browse.type = browse.type;
    }
    if (!from || !(['name', 'lvl', 'ilvl'].includes(s.browse.sort) || keeps(s.browse.sort))) {
      s.browse.sort = browse.sort;
      s.browse.dir = browse.dir;
    }
  }
}

/* ---- validators: each returns the value if it is valid (normalized), otherwise the fallback ---- */
const isObj = (v: unknown): v is Raw => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
/** a finite number, rounded and clamped to [lo, hi] */
const intIn = <Fallback>(v: unknown, lo: number, hi: number, fallback: Fallback): number | Fallback =>
  isNum(v) ? clamp(Math.round(v), lo, hi) : fallback;
/** like intIn, but '' (an empty filter field) is allowed, and so is a numeric string (an older save kept number boxes as text) */
const optIntIn = <Fallback>(v: unknown, lo: number, hi: number, fallback: Fallback): '' | number | Fallback => {
  if (v === '') {
    return '';
  }
  const number = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return intIn(number, lo, hi, fallback);
};
const bool = <Fallback>(v: unknown, fallback: Fallback): boolean | Fallback => (typeof v === 'boolean' ? v : fallback);
const str = <Fallback>(v: unknown, fallback: Fallback): string | Fallback => (typeof v === 'string' ? v : fallback);
// `allowed.includes(v)` says `v` is one of the allowed values: the cast is that test's result
const oneOf = <Allowed, Fallback>(v: unknown, allowed: readonly Allowed[], fallback: Fallback): Allowed | Fallback =>
  allowed.includes(v as Allowed) ? (v as Allowed) : fallback;
const ilvlIn = <Fallback>(v: unknown, fallback: Fallback): number | Fallback => intIn(v, 1, MAX_REAL, fallback);

/* The Gear browser's gear filter fields (expOff, min, max, lvl) from saved `raw` into `f`. */
function restoreGearFilter(f: BrowseFields, raw: Raw, job: JobContext): void {
  f.expOff = Array.isArray(raw.expOff) ? EXPANSIONS.map(e => e.short).filter(k => (raw.expOff as string[]).includes(k)) : [];
  f.min = optIntIn(raw.min, 0, MAX_REAL, f.min);
  f.max = optIntIn(raw.max, 0, MAX_REAL, f.max);
  f.lvl = optIntIn(raw.lvl, 1, job.maxLevel, f.lvl);
}

/* piece.subs: two ranked substats for this job (100% and 70%); rank 2 may be null. Unknown or repeated ones fall
   back. Older saves had a third rank (20%); it is dropped, since real gear has a third line only as Direct Hit on
   Mind-only gear (docs/mechanics/math.md section 4). Older saves also named the speed and special substats by position
   (`spd`, `spec`): currentStatKey reads them as the job's own. */
function restorePieceSubs(raw: unknown, job: JobContext): (string | null)[] {
  const ds = defaultSubs(job);
  if (!Array.isArray(raw)) {
    return ds;
  }
  const saved = raw.map(key => currentStatKey(job, key));
  const subs = [0, 1].map(i => {
    if (job.substats.includes(saved[i] as StatKey)) {
      return saved[i];
    }
    return i === 0 ? ds[0] : null;
  });
  if (subs[1] === subs[0]) {
    subs[1] = null;
  }
  return subs;
}

/* A saved "Gear categories" list (ACTIVITIES keys left out), in ACTIVITIES order. A saved list is kept as it is, an empty one
   too (every box ticked); a missing one gets the fallback, and so does one from before the boxes were activities (any
   key that is not a box, such as the old gear groups 'tomestone' or 'savage'). */
function restoreExclude(raw: unknown, fallback: string[]): string[] {
  if (!Array.isArray(raw) || raw.some(k => !ACTIVITIES.some(a => a.key === k))) {
    return fallback;
  }
  return ACTIVITIES.map(a => a.key).filter(k => raw.includes(k));
}

/* Stat Allocation's own fields {ilvl, slot, subs, slots} from `raw` (a saved `piece`, or the fields a link names), checked for
   `job` (a JobContext): a value that is not valid for the job falls back to the one in `base` (the piece as it stands: the
   defaults for the job). ilvl: the example piece's item level, null for the item level cap (an older save's number is kept);
   slots: the materia slots, null for the slot's usual total. Returns a new object; `raw` and `base` are left as they are. */
export function restorePieceFields(raw: Raw, job: JobContext, base: Pick<PieceFields, 'ilvl' | 'slot'>): PieceFields {
  // `base.slot` is a slot type (the piece as it stands, or 'head')
  const slot = oneOf(raw.slot, job.activeSlotTypes, base.slot as SlotType);
  return {
    ilvl: raw.ilvl === null ? null : ilvlIn(raw.ilvl, base.ilvl),
    slot,
    subs: restorePieceSubs(raw.subs, job),
    slots: oneOf(raw.slots, meldSlotChoices(slot), null),
  };
}

/* The Gear browser's filters and sort {q, type, expOff, min, max, lvl, exclude, market, sort, dir} from `raw` (a saved `browse`,
   or the fields a link names), checked for `job` (a JobContext): a value that is not valid falls back to the one in `base`
   (the browser as it stands: the defaults for the job, defaultBrowse). The Job and sync panel's fields are not part of it
   (restorePanel). Returns a new object; `raw` and `base` are left as they are. */
export function restoreBrowseFields(raw: Raw, job: JobContext, base: BrowseFields): BrowseFields {
  const fields = { ...base };
  fields.q = cutText(str(raw.q, base.q), SEARCH_MAX_LENGTH);
  fields.type = oneOf(raw.type, [ANY_SLOT_KEY, ...job.activeSlotTypes], base.type);
  restoreGearFilter(fields, raw, job);
  fields.exclude = restoreExclude(raw.exclude, base.exclude);
  fields.market = bool(raw.market, base.market);
  // older saves named the main, speed and special stats by position (currentStatKey)
  fields.sort = oneOf(currentStatKey(job, raw.sort as string), ['name', 'lvl', 'ilvl', ...job.stats], base.sort);
  fields.dir = oneOf(raw.dir, ['desc', 'asc'], base.dir);
  return fields;
}

/* Saved settings `raw` (parsed localStorage JSON) in the shape with the panel split: a copy in which `piece` and `browse`
   each hold their own job, cap, sync and level (the saved top-level ones, where the group has none yet), and the
   top-level four and an older save's Gear optimizer settings (`opt`, `optPanel`) are gone (no users to migrate: a
   search's settings live on each gear set of a sheet). Anything that is not an object comes back unchanged. Pure; it
   validates nothing: the restore of each group checks the values, as it does for every field. restoreState starts
   from it. */
export function splitPanelSettings(raw: unknown): Raw {
  if (!isObj(raw)) {
    return raw as Raw; // handed back as it is (the caller checks)
  }
  const { opt: _opt, optPanel: _optPanel, ...rest } = raw;
  const split: Raw = { ...rest };
  for (const group of ['piece', 'browse']) {
    const own = isObj(raw[group]) ? raw[group] : {};
    split[group] = { ...own };
    for (const key of PANEL_KEYS) {
      if (key in raw && !(key in own)) {
        (split[group] as Raw)[key] = raw[key];
      }
    }
  }
  for (const key of PANEL_KEYS) {
    delete split[key];
  }
  return split;
}

/* One tab's Job and sync panel from saved `own` (an object or not), checked: {job (DEFAULT_JOB when unknown), cap, sync, level,
   jobCtx}. The level is held to the job's level cap, and a cap above what the level allows is lowered (a save from
   before the cap followed the level). The plain state has no jobCtx, and without it levelSyncOn would take the game's
   level cap: Blue Mage at 80 or Beastmaster at 50 would count as level synced, unlike the live page. */
export function restorePanel(own: unknown): RestoredPanel {
  const saved = isObj(own) ? own : {},
    panel = defaultPanel();
  panel.job = jobById(saved.job as string) ? (saved.job as string) : DEFAULT_JOB; // an unknown job goes back to the default one
  const jobCtx = makeJobContext(panel.job);
  panel.cap = saved.cap === null ? null : ilvlIn(saved.cap, panel.cap);
  panel.sync = bool(saved.sync, panel.sync);
  panel.level = intIn(saved.level, 1, jobCtx.maxLevel, Math.min(panel.level, jobCtx.maxLevel));
  const lowered = limitCapToLevel({ ...panel, jobCtx });
  if (lowered) {
    panel.cap = lowered.to;
  }
  return { ...panel, jobCtx };
}

/* Build a valid state from parsed localStorage JSON (or null) and the screen the page opens on, `open` ({tab, mathTab}: the
   address's; an unknown or missing one is the first tab and math view). Every field is checked for type and range;
   an invalid field falls back to its default (for the restored job) and the valid ones are kept. Each tab is restored
   for its own job (splitPanelSettings): `piece` and `browse` each hold their own job, cap, sync and level, and the
   top-level four are the open tab's copy. An older save with one panel gives both tabs that panel. Substat tiers holds its
   own job (`tiers.job`); a save without a valid one (from before it had one: a single math job) gets Stat Allocation's. */
export function restoreState(raw: unknown, open: { tab?: string; mathTab?: string } = {}): SavedState {
  const s = defaultState();
  s.tab = oneOf(open.tab, TABS, s.tab);
  s.mathTab = oneOf(open.mathTab, MATH_TABS, s.mathTab);
  const r = isObj(raw) ? raw : null;
  if (!r) {
    resetForJob(s, makeJobContext(DEFAULT_JOB)); // job-dependent defaults for the placeholder job
    return s;
  }
  const saved = splitPanelSettings(r);
  s.sheetFigures = oneOf(r.sheetFigures, SHEET_FIGURES, s.sheetFigures);
  const panels = { math: restorePanel(saved.piece), browse: restorePanel(saved.browse) };

  // job-dependent defaults for each tab's own job; the saved values below replace them
  for (const [part, group] of [
    ['math', 'piece'],
    ['browse', 'browse'],
  ] as const) {
    resetForJob(s, panels[part].jobCtx, null, [part]);
    const { jobCtx: _jobCtx, ...panel } = panels[part];
    Object.assign(s[group], panel);
  }

  Object.assign(s.piece, restorePieceFields(isObj(saved.piece) ? saved.piece : {}, panels.math.jobCtx, s.piece));
  Object.assign(s.browse, restoreBrowseFields(isObj(saved.browse) ? saved.browse : {}, panels.browse.jobCtx, s.browse));

  // Substat tiers' own job
  const tiersSaved = isObj(saved.tiers) ? saved.tiers : {};
  s.tiers.job = jobById(tiersSaved.job as string) ? (tiersSaved.job as string) : panels.math.job;

  // the open tab's panel is the top-level copy (on the Sheets tab, which has none, the Gear browser's stands in)
  const openGroup = s[(PANEL_GROUP as Partial<Record<string, 'browse' | 'piece'>>)[s.tab] ?? PANEL_GROUP.browse];
  holdLevelSyncCap(s.piece); // also a save from before the math panel held its cap with IL Sync off
  Object.assign(s, Object.fromEntries(PANEL_KEYS.map(key => [key, openGroup[key]])));
  return s;
}

/* localStorage is a per-viewer convenience: every access may throw (private mode, blocked storage). */
export function loadSaved(): unknown {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/* Save the state (`json`, already serialized) under STORE_KEY; a storage that throws is ignored. Returns whether it was stored,
   so the caller can try again later. */
export function save(json: string): boolean {
  try {
    localStorage.setItem(STORE_KEY, json);
    return true;
  } catch {
    return false; // storage unavailable
  }
}
