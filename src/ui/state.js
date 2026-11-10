/* The page's saved state: defaults, per-job resets, and repair of whatever localStorage hands back.
   The shape is what gets saved under STORE_KEY; restoreState repairs an older shape field by field. */
import { DEFAULT_JOB, ACTIVITIES, EXPANSIONS, jobById } from '../core/constants.js';
import { makeJobContext } from '../core/job-context.js';
import { currentStatKey } from '../core/stat-keys.js';
import { MAX_REAL } from '../core/tables.js';
import { capCeiling } from '../core/sync-target.js';
import { DEFAULT_EXCLUDE, PANEL_GROUP, syncSettings } from './settings.js';
import { STORE_KEY } from './store-key.js';

/* Defaults favour no player's setup: level 100 (the level cap), no sync cap and sync off. */
const DEFAULT_LEVEL = 100;

/* The cap follows the level: a cap above what the level allows (capCeiling, the best gear made for it) is lowered to it,
   whatever the job (a job at its own level cap included), while item level sync is on. Above it the cap changes nothing
   (syncTarget), so the field shows the cap that applies. A cap is never raised: a low cap is a real duty's (Minimum IL).
   Called when the level settles, when a cap is entered, when sync is switched on, and on restore.
   Returns {from, to, level} when it lowered the cap (the note under the field), else null. */
export function limitCapToLevel(app) {
  if (!syncSettings(app).sync) return null;
  const top = app.level == null ? MAX_REAL : capCeiling(app.level);
  if (app.cap <= top) return null;
  const lowered = { from: app.cap, to: top, level: app.level ?? null };
  app.cap = top;
  return lowered;
}

/* The note under a cap field after limitCapToLevel lowered it (`lowered` its {from, to, level}, or null: ''), on the Job
   and sync panel and on a sheet's page and forms: "Lowered to 135, the highest for level 50." */
export function capLoweredText(lowered) {
  if (!lowered) return '';
  return `Lowered to ${lowered.to}, the highest ${lowered.level == null ? 'item level' : `for level ${lowered.level}`}.`;
}

/* The closed Job and sync strip after "Job: <name>" (the Gear browser and How the math works tabs): "Level 100 · Item
   level sync: off", or the cap in place of "off" while sync is on ("Item level sync: 275"; "on" while the cap field is
   empty). Wording from prototype B17 (app.js sheetBar). */
export function jobLineText(level, sync, cap) {
  const syncText = !sync ? 'off' : cap == null ? 'on' : String(cap);
  return `Level ${level} · Item level sync: ${syncText}`;
}

/* The error under a cap field holding text that is no whole item level from 1 (the field keeps its last cap). */
export const CAP_TYPED_BAD_TEXT = `Enter a whole item level from 1 to ${MAX_REAL}`;

/* Text typed in a cap field is no cap: not empty and not a whole number from 1. A whole number above the highest real
   item level is a cap (limitCapToLevel lowers it). The Job and sync panel and a sheet's page. */
export function capTextBad(text) {
  const value = Number(text);
  return text !== '' && !(Number.isInteger(value) && value >= 1);
}

/* The Job and sync panel's saved fields, which each reference tab holds for itself (settings.js PANEL_GROUP). */
const PANEL_KEYS = ['job', 'cap', 'sync', 'level'];

/* One tab's Job and sync panel at its defaults: {job (null: none chosen), cap (null: none), sync (item level sync
   off), level (the synced level)}. */
function defaultPanel() {
  return { job: null, cap: null, sync: false, level: DEFAULT_LEVEL };
}

/* The Gear browser's settings at their defaults for `job` (a JobContext, or null before one is chosen). The one copy of
   them: defaultState, the job reset (resetForJob), Reset filters (components/gear.js) and its check (views/gear.js
   browseFiltered) all read it. expOff: expansions switched off. exclude: ACTIVITIES keys ("Gear from" boxes) left out;
   market: tradeable pieces listed whatever their source (the market board switch, on by default). lvl: the "Equip
   level" filter, the job's level cap (DEFAULT_LEVEL with no job). sort: the table heading it is sorted by ('name',
   'lvl', 'ilvl' or a stat); dir: 'desc' (high first) or 'asc'. */
export function defaultBrowse(job = null) {
  return {
    q: '',
    type: 'any',
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

/* The localStorage key of the saved state (store-key.js). */
export { STORE_KEY };
/* The page's tabs (`tab`; the first is the one a new visitor sees) and the math tab's sub-tabs (`mathTab`). The Sheets
   tab has no Job and sync panel (each sheet holds its own job, level and sync; settings.js PANEL_GROUP lists no group
   for it). */
export const TABS = ['sheets', 'browse', 'math'];
export const MATH_TABS = ['piece', 'gcd', 'tiers'];

/* Every saved setting at its default, with no job chosen: the shape saved under STORE_KEY. The job-dependent fields
   are set for a job by resetForJob. */
export function defaultState() {
  return {
    // The Job and sync panel as the open tab holds it (the store's mirror of that tab's group; PANEL_GROUP): not saved
    // itself, each tab's own copy is. job: none until the user picks one.
    ...defaultPanel(),
    tab: TABS[0],
    mathTab: 'piece',
    // How the math works: its own Job and sync panel (job, cap, sync, level), then the piece's item level (null: the
    // cap; explainerItemLevel in views/sync-explainer.js), slot and two ranked substats
    piece: { ...defaultPanel(), ilvl: null, slot: 'head', subs: defaultSubs(makeJobContext(DEFAULT_JOB)) },
    // the Gear browser's own Job and sync panel, then its filters and sort (defaultBrowse)
    browse: { ...defaultPanel(), ...defaultBrowse() },
  };
}

/* Critical Hit first and the job's speed second, for every job: a second substat shows sync raising the 70% line to
   the full cap, and speed as that line gives the GCD sub-tab something to show. `job`: a JobContext. */
export function defaultSubs(job) {
  return ['crit', job.speedKey];
}

/* The synced level (`s.level`, the open tab's panel) and, when `parts` has the Gear browser ('browse'), its "Equip
   level" filter held to the job's level cap (resetForJob). */
export function clampLevels(s, job, parts = ['browse']) {
  if (s.level > job.maxLevel) s.level = job.maxLevel;
  const filter = s.browse;
  if (parts.includes('browse') && filter.lvl !== '' && filter.lvl > job.maxLevel) filter.lvl = job.maxLevel;
}

/* On a job change from `from` (a JobContext, or null with no job chosen before) to `job`: the levels are held to the
   job's cap, and the job-specific selections the new job can use stay. A stat choice stays when the new job has the
   same stat (a key is one game stat: Piety is a key only on a healer, Tenacity only on a tank), else it goes back to
   its default. With no `from`, everything goes back. `parts`: the tabs whose settings are reset,
   any of 'math' (the piece) and 'browse'; both by default. A job change in one tab's panel passes that tab only, since
   the other tab keeps its own job (the store's setJob). */
export function resetForJob(s, job, from = null, parts = ['math', 'browse']) {
  const keeps = k => !!k && !!from && job.stats.includes(k) && from.stats.includes(k);
  clampLevels(s, job, parts);
  if (parts.includes('math')) {
    // Piece stats' two substats stay as a pair (the second may be none), else both go back
    const [sub1, sub2] = s.piece.subs;
    if (!(keeps(sub1) && (sub2 == null || keeps(sub2)))) s.piece.subs = defaultSubs(job);
    if (!job.activeSlotTypes.includes(s.piece.slot)) s.piece.slot = 'head';
  }
  if (parts.includes('browse')) {
    // the browser's slot and sort: a slot the job wears and a sort by name, level, item level or a kept stat stay
    const browse = defaultBrowse(job);
    if (!from || !['any', ...job.activeSlotTypes].includes(s.browse.type)) s.browse.type = browse.type;
    if (!from || !(['name', 'lvl', 'ilvl'].includes(s.browse.sort) || keeps(s.browse.sort))) {
      s.browse.sort = browse.sort;
      s.browse.dir = browse.dir;
    }
  }
}

/* ---- validators: each returns the value if it is valid (normalized), otherwise the fallback ---- */
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNum = v => typeof v === 'number' && Number.isFinite(v);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
/** a finite number, rounded and clamped to [lo, hi] */
const intIn = (v, lo, hi, fallback) => (isNum(v) ? clamp(Math.round(v), lo, hi) : fallback);
/** like intIn, but '' (an empty filter field) is allowed, and so is a numeric string (number inputs bound with x-model) */
const optIntIn = (v, lo, hi, fallback) => {
  if (v === '') return '';
  if (typeof v === 'string' && v.trim() !== '') v = Number(v);
  return intIn(v, lo, hi, fallback);
};
const bool = (v, fallback) => (typeof v === 'boolean' ? v : fallback);
const str = (v, fallback) => (typeof v === 'string' ? v : fallback);
const oneOf = (v, allowed, fallback) => (allowed.includes(v) ? v : fallback);
const ilvlIn = (v, fallback) => intIn(v, 1, MAX_REAL, fallback);

/* The Gear browser's gear filter fields (expOff, min, max, lvl) from saved `raw` into `f`. */
function restoreGearFilter(f, raw, job) {
  f.expOff = Array.isArray(raw.expOff) ? EXPANSIONS.map(e => e.short).filter(k => raw.expOff.includes(k)) : [];
  f.min = optIntIn(raw.min, 0, MAX_REAL, f.min);
  f.max = optIntIn(raw.max, 0, MAX_REAL, f.max);
  f.lvl = optIntIn(raw.lvl, 1, job.maxLevel, f.lvl);
}

/* piece.subs: two ranked substats for this job (100% and 70%); rank 2 may be null. Unknown or repeated ones fall
   back. Older saves had a third rank (20%); it is dropped, since real gear has a third line only as Direct Hit on
   Mind-only gear (docs/mechanics/math.md section 4). Older saves also named the speed and special substats by position
   (`spd`, `spec`): currentStatKey reads them as the job's own. */
function restorePieceSubs(raw, job) {
  const ds = defaultSubs(job);
  if (!Array.isArray(raw)) return ds;
  const saved = raw.map(key => currentStatKey(job, key));
  const subs = [0, 1].map(i => (job.substats.includes(saved[i]) ? saved[i] : i === 0 ? ds[0] : null));
  if (subs[1] === subs[0]) subs[1] = null;
  return subs;
}

/* tab and mathTab; older saved state used the sub-view names as tabs, 'pool' for the gear tab (now the browser) and
   'opt' for the Gear optimizer tab the Sheets tab replaced */
function restoreTabs(s, raw) {
  if (MATH_TABS.includes(raw.tab)) {
    s.mathTab = raw.tab;
    s.tab = 'math';
  } else {
    s.tab = raw.tab === 'pool' ? 'browse' : oneOf(raw.tab, TABS, s.tab);
    s.mathTab = oneOf(raw.mathTab, MATH_TABS, s.mathTab);
  }
}

/* A saved "Gear from" list (ACTIVITIES keys left out), in ACTIVITIES order. A saved list is kept as it is, an empty one
   too (every box ticked); a missing one gets the fallback, and so does one from before the boxes were activities (any
   key that is not a box, such as the old gear groups 'tomestone' or 'savage'). */
function restoreExclude(raw, fallback) {
  if (!Array.isArray(raw) || raw.some(k => !ACTIVITIES.some(a => a.key === k))) return fallback;
  return ACTIVITIES.map(a => a.key).filter(k => raw.includes(k));
}

/* Saved settings `raw` (parsed localStorage JSON) in the shape with the panel split: a copy in which `piece` and `browse`
   each hold their own job, cap, sync and level (the saved top-level ones, where the group has none yet), and the
   top-level four and an older save's Gear optimizer settings (`opt`, `optPanel`) are gone (no users to migrate: a
   search's settings live on each gear set of a sheet). Anything that is not an object comes back unchanged. Pure; it
   validates nothing: the restore of each group checks the values, as it does for every field. restoreState starts
   from it. */
export function splitPanelSettings(raw) {
  if (!isObj(raw)) return raw;
  const { opt: _opt, optPanel: _optPanel, ...rest } = raw;
  const split = { ...rest };
  for (const group of ['piece', 'browse']) {
    const own = isObj(raw[group]) ? raw[group] : {};
    split[group] = { ...own };
    for (const key of PANEL_KEYS) if (key in raw && !(key in own)) split[group][key] = raw[key];
  }
  for (const key of PANEL_KEYS) delete split[key];
  return split;
}

/* One tab's Job and sync panel from saved `own` (an object or not), checked: {job (null when unknown), cap, sync, level,
   jobCtx}. The level is held to the job's level cap, and a cap above what the level allows is lowered (a save from
   before the cap followed the level). The plain state has no jobCtx, and without it levelSyncOn would take the game's
   level cap: Blue Mage at 80 or Beastmaster at 50 would count as level synced, unlike the live page. */
function restorePanel(own) {
  const saved = isObj(own) ? own : {},
    panel = defaultPanel();
  panel.job = jobById(saved.job) ? saved.job : null;
  const jobCtx = makeJobContext(panel.job ?? DEFAULT_JOB); // with no job: placeholder defaults, replaced when one is chosen
  panel.cap = saved.cap === null ? null : ilvlIn(saved.cap, panel.cap);
  panel.sync = bool(saved.sync, panel.sync);
  panel.level = intIn(saved.level, 1, jobCtx.maxLevel, Math.min(panel.level, jobCtx.maxLevel));
  const lowered = limitCapToLevel({ ...panel, jobCtx });
  if (lowered) panel.cap = lowered.to;
  return { ...panel, jobCtx };
}

/* Build a valid state from parsed localStorage JSON (or null). Every field is checked for type and range;
   an invalid field falls back to its default (for the restored job) and the valid ones are kept. Each tab is restored
   for its own job (splitPanelSettings): `piece` and `browse` each hold their own job, cap, sync and level, and the
   top-level four are the open tab's copy. An older save with one panel gives both tabs that panel. */
export function restoreState(raw) {
  const s = defaultState();
  const r = isObj(raw) ? raw : null;
  if (!r) {
    resetForJob(s, makeJobContext(DEFAULT_JOB)); // job-dependent defaults for the placeholder job
    return s;
  }
  const saved = splitPanelSettings(r);
  restoreTabs(s, saved);
  const panels = { math: restorePanel(saved.piece), browse: restorePanel(saved.browse) };

  // job-dependent defaults for each tab's own job; the saved values below replace them
  for (const [part, group] of [
    ['math', 'piece'],
    ['browse', 'browse'],
  ]) {
    resetForJob(s, panels[part].jobCtx, null, [part]);
    const { jobCtx: _jobCtx, ...panel } = panels[part];
    Object.assign(s[group], panel);
  }

  const piece = isObj(saved.piece) ? saved.piece : {};
  const pieceJob = panels.math.jobCtx;
  s.piece.ilvl = piece.ilvl === null ? null : ilvlIn(piece.ilvl, s.piece.ilvl); // older saves: a number, kept
  s.piece.slot = oneOf(piece.slot, pieceJob.activeSlotTypes, s.piece.slot);
  s.piece.subs = restorePieceSubs(piece.subs, pieceJob);

  const b = isObj(saved.browse) ? saved.browse : {};
  const browseJob = panels.browse.jobCtx;
  s.browse.q = str(b.q, s.browse.q).slice(0, SEARCH_MAX_LENGTH);
  s.browse.type = oneOf(b.type, ['any', ...browseJob.activeSlotTypes], s.browse.type);
  restoreGearFilter(s.browse, b, browseJob);
  s.browse.exclude = restoreExclude(b.exclude, s.browse.exclude);
  s.browse.market = bool(b.market, s.browse.market);
  // older saves named the main, speed and special stats by position (currentStatKey)
  s.browse.sort = oneOf(currentStatKey(browseJob, b.sort), ['name', 'lvl', 'ilvl', ...browseJob.stats], s.browse.sort);
  s.browse.dir = oneOf(b.dir, ['desc', 'asc'], s.browse.dir);

  // the open tab's panel is the top-level copy (on the Sheets tab, which has none, the Gear browser's stands in)
  const openGroup = s[PANEL_GROUP[s.tab] ?? PANEL_GROUP.browse];
  Object.assign(s, Object.fromEntries(PANEL_KEYS.map(key => [key, openGroup[key]])));
  return s;
}

/* localStorage is a per-viewer convenience: every access may throw (private mode, blocked storage). */
export function loadSaved() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/* Save the state (`json`, already serialized) under STORE_KEY; a storage that throws is ignored. */
export function save(json) {
  try {
    localStorage.setItem(STORE_KEY, json);
  } catch {
    /* storage unavailable */
  }
}
