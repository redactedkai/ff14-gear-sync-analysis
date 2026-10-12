/* The page's saved state: defaults, per-job resets, and repair of whatever localStorage hands back.
   The shape is what gets saved under STORE_KEY; change it only together with a key bump. */
import { SLOT_TYPES, SLOT_LABEL, ALL_STATS, JOBS, DEFAULT_JOB, SOURCES, EXPANSIONS } from '../core/constants.js';
import { makeJobContext } from '../core/job-context.js';
import { reserveIds } from '../core/items.js';
import { MAX_REAL, MAX_LEVEL } from '../core/tables.js';
import { levelSyncIlvl } from '../core/sync-target.js';

/* Defaults favour no player's setup: level 100 (the level cap), no sync cap and sync off. */
const DEFAULT_LEVEL = 100;

/* Sync applies only when it is switched on and a cap is set. */
export function syncActive(app) {
  return !!app.sync && app.cap != null;
}

/* Level sync can apply: the synced level is below the level cap, so gear with a higher equip level is synced to the
   level's item level (core/sync-target.js). Independent of the item level sync switch. */
export function levelSyncOn(app) {
  return app.level != null && app.level < MAX_LEVEL;
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

/* "level 50, item level 123": the sync settings in effect, for labels; '' when none. */
export function syncLabel(app) {
  return [levelSyncOn(app) ? `level ${app.level}` : '', syncActive(app) ? `item level ${app.cap}` : ''].filter(Boolean).join(', ');
}

export const STORE_KEY = 'ilvl-stat-lab-v3';
export const TABS = ['pool', 'opt', 'math'];
export const MATH_TABS = ['piece', 'sync'];

export function defaultState() {
  return {
    job: null, // none until the user picks one
    cap: null,
    sync: false,
    level: DEFAULT_LEVEL,
    tab: 'pool',
    mathTab: 'piece',
    syncIlvl: 475,
    piece: { ilvl: MAX_REAL, slot: 'head', subs: ['spd', null, null] }, // the highest real item level
    browse: { show: 'all', q: '', type: 'any', expOff: [], min: '', max: '', lvl: 100, sort: 'ilvl' }, // expOff: expansions switched off
    opt: { target: 'main', tb: '', tb2: '', exclude: [] }, // exclude: SOURCES keys switched off (left out of the search); every group is included by default
    pool: [],
  };
}

/* The job's own special substat (Piety, Tenacity) first, or its speed stat when it has none; ranks 2 and 3 empty. */
export function defaultSubs(job) {
  return [job.profile.spec ? 'spec' : 'spd', null, null];
}

/* On a job change: job-specific selections go back to defaults, and the pool is emptied. */
export function resetForJob(s, job) {
  s.piece.subs = defaultSubs(job);
  if (!job.activeSlotTypes.includes(s.piece.slot)) s.piece.slot = 'head';
  s.opt.target = 'main';
  s.opt.tb = '';
  s.opt.tb2 = '';
  s.browse.type = 'any';
  s.browse.sort = 'ilvl';
  s.pool = [];
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

/* Pool items come only from the game database. Hypothetical and hand-entered pieces (a removed feature) are
   dropped from older saves. */
const POOL_SOURCES = ['game'];

/* A saved pool item, or null when it cannot be used. Only the known fields are kept. */
function restoreItem(i) {
  if (!isObj(i) || typeof i.id !== 'string' || !i.id || !SLOT_TYPES.includes(i.type)) return null;
  if (!Number.isInteger(i.ilvl) || i.ilvl < 1 || i.ilvl > MAX_REAL) return null;
  if (!isObj(i.stats) || !POOL_SOURCES.includes(i.src)) return null;
  const stats = {};
  for (const k of ALL_STATS) {
    const v = i.stats[k] ?? 0;
    if (!isNum(v) || v < 0) return null;
    stats[k] = v;
  }
  return {
    id: i.id,
    name: str(i.name, SLOT_LABEL[i.type] + ' custom'),
    type: i.type,
    ilvl: i.ilvl,
    stats,
    copies: oneOf(i.copies, [1, 2], 1),
    src: i.src,
    hq: bool(i.hq, false),
  };
}

function restorePool(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  return raw.map(restoreItem).filter(i => i && !seen.has(i.id) && seen.add(i.id));
}

/* piece.subs: three ranked substats for this job; ranks 2 and 3 may be null, and rank 3 only with a rank 2.
   Unknown or repeated ones fall back. */
function restorePieceSubs(raw, job) {
  const ds = defaultSubs(job);
  if (!Array.isArray(raw)) return ds;
  const subs = [0, 1, 2].map(i => (job.substats.includes(raw[i]) ? raw[i] : i === 0 ? ds[0] : null));
  if (subs[1] === subs[0]) subs[1] = null;
  if (subs[2] === subs[0] || subs[2] === subs[1]) subs[2] = null;
  if (subs[1] == null) [subs[1], subs[2]] = [subs[2], null];
  return subs;
}

/* tab and mathTab; older saved state used the sub-view names as tabs */
function restoreTabs(s, raw) {
  if (MATH_TABS.includes(raw.tab)) {
    s.mathTab = raw.tab;
    s.tab = 'math';
  } else {
    s.tab = oneOf(raw.tab, TABS, s.tab);
    s.mathTab = oneOf(raw.mathTab, MATH_TABS, s.mathTab);
  }
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
  s.level = intIn(r.level, 1, 100, s.level);
  s.syncIlvl = ilvlIn(r.syncIlvl, s.syncIlvl);
  restoreTabs(s, r);

  const piece = isObj(r.piece) ? r.piece : {};
  s.piece.ilvl = ilvlIn(piece.ilvl, s.piece.ilvl);
  s.piece.slot = oneOf(piece.slot, job.activeSlotTypes, s.piece.slot);
  s.piece.subs = restorePieceSubs(piece.subs, job);

  const b = isObj(r.browse) ? r.browse : {};
  s.browse.q = str(b.q, s.browse.q);
  s.browse.show = oneOf(b.show, ['all', 'pool'], s.browse.show);
  s.browse.type = oneOf(b.type, ['any', ...job.activeSlotTypes], s.browse.type);
  s.browse.expOff = Array.isArray(b.expOff) ? EXPANSIONS.map(e => e[0]).filter(k => b.expOff.includes(k)) : [];
  s.browse.min = optIntIn(b.min, 0, MAX_REAL, s.browse.min);
  s.browse.max = optIntIn(b.max, 0, MAX_REAL, s.browse.max);
  s.browse.lvl = optIntIn(b.lvl, 1, 100, s.browse.lvl);
  s.browse.sort = oneOf(b.sort, ['ilvl', ...job.stats], s.browse.sort);

  const o = isObj(r.opt) ? r.opt : {};
  s.opt.target = oneOf(o.target, job.stats, s.opt.target);
  s.opt.tb = oneOf(o.tb, ['', ...job.stats], s.opt.tb);
  s.opt.tb2 = oneOf(o.tb2, ['', ...job.stats], s.opt.tb2);
  s.opt.exclude = Array.isArray(o.exclude) ? SOURCES.map(x => x.key).filter(k => o.exclude.includes(k)) : [];

  s.pool = restorePool(r.pool);
  reserveIds(s.pool.map(i => i.id));
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
