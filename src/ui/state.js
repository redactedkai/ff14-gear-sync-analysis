/* The page's saved state: defaults, per-job resets, and repair of whatever localStorage hands back.
   The shape is what gets saved under STORE_KEY; restoreState repairs an older shape field by field. */
import { JOBS, DEFAULT_JOB, SOURCES, EXPANSIONS } from '../core/constants.js';
import { makeJobContext } from '../core/job-context.js';
import { MAX_REAL, MAX_LEVEL } from '../core/tables.js';
import { levelSyncIlvl } from '../core/sync-target.js';
import { foodChoices } from '../core/food.js';

/* Defaults favour no player's setup: level 100 (the level cap), no sync cap and sync off. */
const DEFAULT_LEVEL = 100;

/* Gear groups left out until the user ticks them back in, in the optimizer and the gear browser alike: Current Savage,
   Ultimate and PvP (owner's decision, 2026-10-14). In SOURCES order. */
export const DEFAULT_EXCLUDE = Object.freeze(['savage', 'ultimate', 'pvp']);

/* Sync applies only when it is switched on and a cap is set. */
export function syncActive(app) {
  return !!app.sync && app.cap != null;
}

/* Level sync can apply: the synced level is below the job's level cap (MAX_LEVEL before a job context exists), so gear
   the job can wear with a higher equip level is synced to the level's item level (core/sync-target.js). Independent of
   the item level sync switch. */
export function levelSyncOn(app) {
  return app.level != null && app.level < (app.jobCtx?.maxLevel ?? MAX_LEVEL);
}

/* The gear filters of the browser (app.browse) or the optimizer (app.opt) as browseItems and filterGear take them
   (core/items.js); an empty field is no limit. */
export function gearFilter(f) {
  return { expOff: f.expOff, ilvlMin: +f.min || 0, ilvlMax: +f.max || 0, lvlMax: +f.lvl || 0 };
}

/* The sync settings the core takes: {cap, sync, level} (itemSyncIlvl in core/optimizer/candidates.js). */
export function syncSettings(app) {
  return { cap: app.cap, sync: syncActive(app), level: app.level ?? null };
}

/* The cap for a piece whose equip level is not known (Piece stats, Sync limits): the item level cap while item level
   sync is on (a piece above it is synced to it whatever its equip level); otherwise the synced level's item level
   while level sync can apply, for gear with a higher equip level (byLevel). Null when neither.
   {cap, level, byLevel} */
export function shownSync(app) {
  if (syncActive(app)) return { cap: app.cap, level: app.level, byLevel: false };
  if (levelSyncOn(app)) return { cap: levelSyncIlvl(app.level), level: app.level, byLevel: true };
  return null;
}

export const STORE_KEY = 'ilvl-stat-lab-v4';
export const TABS = ['opt', 'browse', 'math'];
export const MATH_TABS = ['piece', 'gcd'];

export function defaultState() {
  return {
    job: null, // none until the user picks one
    cap: null,
    sync: false,
    level: DEFAULT_LEVEL,
    tab: 'opt',
    mathTab: 'piece',
    // How the math works: the piece's item level (null: 60 above the cap, DEFAULT_OVER in views/sync-explainer.js),
    // slot and two ranked substats
    piece: { ilvl: null, slot: 'head', subs: ['crit', 'spd'] },
    // the Gear browser's filters. expOff: expansions switched off. exclude: SOURCES keys (gear groups) left out of the list
    browse: { q: '', type: 'any', expOff: [], exclude: [...DEFAULT_EXCLUDE], min: '', max: '', lvl: 100, sort: 'ilvl' },
    // melds: give pieces their best materia melds. expOff, exclude, min, max, lvl: Gear to search, the browser's
    // filters with their own values. food: add a meal to the result; foodPair: its key in foodChoices (core/food.js),
    // '' = best for the goal. gcd: the Target GCD in seconds, '' for any; gcdMode: 'exact' (exactly that GCD) or 'min'
    // (that GCD or faster); exact by default, like xivgear (owner's decision 2026-10-16). byTier: rank the goal and
    // tiebreaks by their tiers before their points (core/tier-rank.js); on by default (owner's decision 2026-10-16)
    opt: {
      target: 'main',
      tb: '',
      tb2: '',
      melds: true,
      expOff: [],
      exclude: [...DEFAULT_EXCLUDE],
      min: '',
      max: '',
      lvl: 100,
      food: false,
      foodPair: '',
      gcd: '',
      gcdMode: 'exact',
      byTier: true,
    },
  };
}

/* Critical Hit first and the job's speed second, for every job: a second substat shows sync raising the 70% line to
   the full cap, and speed as that line gives the GCD sub-tab something to show. */
export function defaultSubs() {
  return ['crit', 'spd'];
}

/* The synced level and the two "Equip level up to" filters held to the job's level cap. */
export function clampLevels(s, job) {
  if (s.level > job.maxLevel) s.level = job.maxLevel;
  for (const f of [s.browse, s.opt]) if (f.lvl !== '' && f.lvl > job.maxLevel) f.lvl = job.maxLevel;
}

/* On a job change: job-specific selections go back to defaults and the levels are held to the job's cap. */
export function resetForJob(s, job) {
  clampLevels(s, job);
  s.piece.subs = defaultSubs();
  if (!job.activeSlotTypes.includes(s.piece.slot)) s.piece.slot = 'head';
  s.opt.target = 'main';
  s.opt.tb = '';
  s.opt.tb2 = '';
  s.opt.foodPair = '';
  s.opt.gcd = ''; // the GCDs a job can reach depend on its haste
  s.browse.type = 'any';
  s.browse.sort = 'ilvl';
}

/* ---- validators: each returns the value if it is valid (normalized), otherwise the fallback ---- */
/** a Target GCD: '' or a number of seconds from 0.5 to 2.5 (a numeric string too: x-model on a number input), to 0.01 */
const gcdIn = (v, fallback) => {
  if (v === '') return '';
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0.5 && n <= 2.5 ? Math.round(n * 100) / 100 : fallback;
};
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

/* The gear filter fields both tabs have (expOff, min, max, lvl) from saved `raw` into `f`. */
function restoreGearFilter(f, raw, job) {
  f.expOff = Array.isArray(raw.expOff) ? EXPANSIONS.map(e => e[0]).filter(k => raw.expOff.includes(k)) : [];
  f.min = optIntIn(raw.min, 0, MAX_REAL, f.min);
  f.max = optIntIn(raw.max, 0, MAX_REAL, f.max);
  f.lvl = optIntIn(raw.lvl, 1, job.maxLevel, f.lvl);
}

/* piece.subs: two ranked substats for this job (100% and 70%); rank 2 may be null. Unknown or repeated ones fall
   back. Older saves had a third rank (20%); it is dropped, since real gear has a third line only as Direct Hit on
   Mind-only gear (docs/mechanics/math.md section 4). */
function restorePieceSubs(raw, job) {
  const ds = defaultSubs();
  if (!Array.isArray(raw)) return ds;
  const subs = [0, 1].map(i => (job.substats.includes(raw[i]) ? raw[i] : i === 0 ? ds[0] : null));
  if (subs[1] === subs[0]) subs[1] = null;
  return subs;
}

/* tab and mathTab; older saved state used the sub-view names as tabs, and 'pool' for the gear tab (now the browser) */
function restoreTabs(s, raw) {
  if (MATH_TABS.includes(raw.tab)) {
    s.mathTab = raw.tab;
    s.tab = 'math';
  } else {
    s.tab = raw.tab === 'pool' ? 'browse' : oneOf(raw.tab, TABS, s.tab);
    s.mathTab = oneOf(raw.mathTab, MATH_TABS, s.mathTab);
  }
}

/* A saved gear-group list (SOURCES keys), in SOURCES order. A saved list is kept as it is, an empty one too (every group
   ticked back in); only a missing one gets the fallback. */
function restoreExclude(raw, fallback) {
  return Array.isArray(raw) ? SOURCES.map(x => x.key).filter(k => raw.includes(k)) : fallback;
}

/* Build a valid state from parsed localStorage JSON (or null). Every field is checked for type and range;
   an invalid field falls back to its default (for the restored job) and the valid ones are kept. */
export function restoreState(raw) {
  const s = defaultState();
  const r = isObj(raw) ? raw : null;
  s.job = r && JOBS.some(j => j[0] === r.job) ? r.job : null;
  const job = makeJobContext(s.job ?? DEFAULT_JOB); // with no job: placeholder defaults, replaced when one is chosen
  resetForJob(s, job); // job-dependent defaults; saved values below replace them
  if (!r) return s;

  s.cap = r.cap === null ? null : ilvlIn(r.cap, s.cap);
  s.sync = bool(r.sync, s.sync);
  s.level = intIn(r.level, 1, job.maxLevel, s.level);
  restoreTabs(s, r);

  const piece = isObj(r.piece) ? r.piece : {};
  s.piece.ilvl = piece.ilvl === null ? null : ilvlIn(piece.ilvl, s.piece.ilvl); // older saves: a number, kept
  s.piece.slot = oneOf(piece.slot, job.activeSlotTypes, s.piece.slot);
  s.piece.subs = restorePieceSubs(piece.subs, job);

  const b = isObj(r.browse) ? r.browse : {};
  s.browse.q = str(b.q, s.browse.q);
  s.browse.type = oneOf(b.type, ['any', ...job.activeSlotTypes], s.browse.type);
  restoreGearFilter(s.browse, b, job);
  s.browse.exclude = restoreExclude(b.exclude, s.browse.exclude);
  s.browse.sort = oneOf(b.sort, ['ilvl', ...job.stats], s.browse.sort);

  const o = isObj(r.opt) ? r.opt : {};
  s.opt.target = oneOf(o.target, job.stats, s.opt.target);
  s.opt.tb = oneOf(o.tb, ['', ...job.stats], s.opt.tb);
  s.opt.tb2 = oneOf(o.tb2, ['', ...job.stats], s.opt.tb2);
  s.opt.melds = bool(o.melds, s.opt.melds);
  s.opt.food = bool(o.food, s.opt.food);
  s.opt.byTier = bool(o.byTier, s.opt.byTier);
  s.opt.foodPair = oneOf(o.foodPair, ['', ...foodChoices(job).map(c => c.key)], s.opt.foodPair);
  s.opt.gcd = gcdIn(o.gcd, s.opt.gcd);
  s.opt.gcdMode = oneOf(o.gcdMode, ['exact', 'min'], s.opt.gcdMode);
  // a save from before the optimizer had its own list (the gear pool days, when the browser's list served both)
  // starts from the browser's
  const oldSave = isObj(r.opt) && !('exclude' in r.opt);
  s.opt.exclude = restoreExclude(oldSave ? b.exclude : o.exclude, s.opt.exclude);
  restoreGearFilter(s.opt, o, job);
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

export function save(json) {
  try {
    localStorage.setItem(STORE_KEY, json);
  } catch {
    /* storage unavailable */
  }
}
