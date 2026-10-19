/* The page's saved state: defaults, per-job resets, and repair of whatever localStorage hands back.
   The shape is what gets saved under STORE_KEY; restoreState repairs an older shape field by field. */
import { JOBS, DEFAULT_JOB, ACTIVITIES, EXPANSIONS } from '../core/constants.js';
import { makeJobContext } from '../core/job-context.js';
import { MAX_REAL, MAX_LEVEL } from '../core/tables.js';
import { capCeiling, levelSyncIlvl } from '../core/sync-target.js';
import { uniqueRanks } from './views/ranks.js';

/* Defaults favour no player's setup: level 100 (the level cap), no sync cap and sync off. */
const DEFAULT_LEVEL = 100;

/* "Gear from" boxes left out until the user ticks them back in, in the optimizer and the gear browser alike: those with
   `on: false` in item-format.json (owner's decision, 2026-10-18: Miscellaneous, Deep dungeons, Wondrous Tails,
   Variant & Criterion, PvP, Extreme (Current), Savage (Current), Ultimate, Events & promotions). In ACTIVITIES order. */
export const DEFAULT_EXCLUDE = Object.freeze(ACTIVITIES.filter(a => !a.on).map(a => a.key));

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
   while level sync can apply, for gear with a higher equip level (byLevel). A cap above what the level allows
   (capCeiling) shows the level's item level too: gear made for a higher level is synced to it under the cap, and at most
   to capCeiling above it (syncTarget). Null when neither.
   {cap, level, byLevel} */
export function shownSync(app) {
  if (syncActive(app)) {
    if (!levelSyncOn(app) || app.cap <= capCeiling(app.level)) return { cap: app.cap, level: app.level, byLevel: false };
  }
  if (levelSyncOn(app)) return { cap: levelSyncIlvl(app.level), level: app.level, byLevel: true };
  return null;
}

/* The cap follows the synced level: a cap above what the level allows (capCeiling, the best gear made for it) is
   lowered to it, while item level sync is on and level sync can apply; without level sync (the job's level cap), a cap
   above the highest real item level is lowered to that. Above either the cap changes nothing (syncTarget), so the
   field shows the cap that applies (owner's decision, 2026-10-18). A cap is never raised: a low cap is a real duty's
   (Minimum IL). Called when the level settles, when a cap is entered, when sync is switched on, and on restore.
   Returns {from, to, level} when it lowered the cap (the note under the field; level null when the highest real item
   level was the limit), else null. */
export function limitCapToLevel(app) {
  if (!syncActive(app)) return null;
  const byLevel = levelSyncOn(app),
    top = byLevel ? capCeiling(app.level) : MAX_REAL;
  if (app.cap <= top) return null;
  const lowered = { from: app.cap, to: top, level: byLevel ? app.level : null };
  app.cap = top;
  return lowered;
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

/* The localStorage key of the saved state. Kept when the saved shape changes: restoreState repairs an older one (no
   users to migrate yet; CLAUDE.md, Page rules). */
export const STORE_KEY = 'ilvl-stat-lab-v4';
/* The page's tabs (`tab`) and the math tab's sub-tabs (`mathTab`). */
export const TABS = ['opt', 'browse', 'math'];
export const MATH_TABS = ['piece', 'gcd', 'tiers'];

/* Every saved setting at its default, with no job chosen: the shape saved under STORE_KEY. The job-dependent fields
   are set for a job by resetForJob. */
export function defaultState() {
  return {
    job: null, // none until the user picks one
    cap: null,
    sync: false,
    level: DEFAULT_LEVEL,
    tab: 'opt',
    mathTab: 'piece',
    // How the math works: the piece's item level (null: the cap; explainerItemLevel in views/sync-explainer.js),
    // slot and two ranked substats
    piece: { ilvl: null, slot: 'head', subs: ['crit', 'spd'] },
    // the Gear browser's filters and sort (defaultBrowse)
    browse: defaultBrowse(),
    // melds: give pieces their best materia melds. expOff, exclude, market, min, max, lvl: Gear to search, the browser's
    // filters with their own values. food: add the best meal for the goal to the result (a meal picked from the Food
    // row's menu is not saved, like the rows' picks; a save's old foodPair is dropped). gcd: the Target GCD in seconds,
    // '' for any; gcdMode: 'exact' (exactly that GCD) or 'min' (that GCD or faster); exact by default, like xivgear
    // (owner's decision 2026-10-16). byTier: rank the goal and tiebreaks by their tiers before their points
    // (core/tier-rank.js); on by default (owner's decision 2026-10-16)
    opt: {
      target: 'main',
      tb: '',
      tb2: '',
      melds: true,
      expOff: [],
      exclude: [...DEFAULT_EXCLUDE],
      market: true,
      min: '',
      max: '',
      lvl: 100,
      food: false,
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

/* The synced level and the two "Equip level" filters held to the job's level cap. */
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
  s.opt.gcd = ''; // the GCDs a job can reach depend on its haste
  const browse = defaultBrowse(job);
  s.browse.type = browse.type;
  s.browse.sort = browse.sort;
  s.browse.dir = browse.dir;
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

/* A saved "Gear from" list (ACTIVITIES keys left out), in ACTIVITIES order. A saved list is kept as it is, an empty one
   too (every box ticked); a missing one gets the fallback, and so does one from before the boxes were activities (any
   key that is not a box, such as the old gear groups 'tomestone' or 'savage'). */
function restoreExclude(raw, fallback) {
  if (!Array.isArray(raw) || raw.some(k => !ACTIVITIES.some(a => a.key === k))) return fallback;
  return ACTIVITIES.map(a => a.key).filter(k => raw.includes(k));
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
  // a save from before the cap followed the level. The plain state has no jobCtx yet, and without it levelSyncOn would
  // take the game's level cap: Blue Mage at 80 or Beastmaster at 50 would count as level synced, unlike the live page
  const lowered = limitCapToLevel({ ...s, jobCtx: job });
  if (lowered) s.cap = lowered.to;
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
  s.browse.market = bool(b.market, s.browse.market);
  s.browse.sort = oneOf(b.sort, ['name', 'lvl', 'ilvl', ...job.stats], s.browse.sort);
  s.browse.dir = oneOf(b.dir, ['desc', 'asc'], s.browse.dir);

  const o = isObj(r.opt) ? r.opt : {};
  s.opt.target = oneOf(o.target, job.stats, s.opt.target);
  s.opt.tb = oneOf(o.tb, ['', ...job.stats], s.opt.tb);
  s.opt.tb2 = oneOf(o.tb2, ['', ...job.stats], s.opt.tb2);
  // a goal saved before a stat could hold only one rank: a repeat of a rank above is cleared (views/ranks.js)
  [s.opt.target, s.opt.tb, s.opt.tb2] = uniqueRanks([s.opt.target, s.opt.tb, s.opt.tb2]).map(r => r ?? '');
  s.opt.melds = bool(o.melds, s.opt.melds);
  s.opt.food = bool(o.food, s.opt.food);
  s.opt.byTier = bool(o.byTier, s.opt.byTier);
  s.opt.gcd = gcdIn(o.gcd, s.opt.gcd);
  s.opt.gcdMode = oneOf(o.gcdMode, ['exact', 'min'], s.opt.gcdMode);
  // a save from before the optimizer had its own list (the gear pool days, when the browser's list served both)
  // starts from the browser's
  const oldSave = isObj(r.opt) && !('exclude' in r.opt);
  s.opt.exclude = restoreExclude(oldSave ? b.exclude : o.exclude, s.opt.exclude);
  s.opt.market = bool(o.market, s.opt.market);
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

/* Save the state (`json`, already serialized) under STORE_KEY; a storage that throws is ignored. */
export function save(json) {
  try {
    localStorage.setItem(STORE_KEY, json);
  } catch {
    /* storage unavailable */
  }
}
