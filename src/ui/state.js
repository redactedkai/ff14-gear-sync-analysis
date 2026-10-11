/* The page's saved state: defaults, per-job resets, and repair of whatever localStorage hands back.
   The shape is what gets saved under STORE_KEY; change it only together with a key bump. */
import { SLOT_TYPES, SLOT_LABEL, ALL_STATS, DEFAULT_JOB } from '../core/constants.js';
import { makeJobContext } from '../core/job-context.js';
import { reserveIds } from '../core/items.js';
import { MAX_REAL } from '../core/tables.js';

export const STORE_KEY = 'ilvl-stat-lab-v3';
export const TABS = ['pool', 'opt', 'math'];
export const MATH_TABS = ['piece', 'sync'];

export function defaultState() {
  return {
    job: DEFAULT_JOB,
    cap: 123,
    sync: true,
    level: 50,
    tab: 'pool',
    mathTab: 'piece',
    syncIlvl: 475,
    piece: { ilvl: 475, slot: 'head', subs: ['spd', 'spec', 'dh'] },
    browse: { q: '', type: 'any', min: 100, max: '', lvl: 100, sort: 'ilvl' },
    opt: { target: 'spd', tb: 'main', tb2: 'vit', avg: true, avgMin: 123 },
    poolFilter: 'all',
    pool: [],
  };
}

export function defaultSubs(job) {
  return ['spd', job.profile.spec ? 'spec' : 'crit', job.profile.spec === 'piety' ? 'dh' : null];
}

/* On a job change: job-specific selections go back to defaults, and the pool is emptied. */
export function resetForJob(s, job) {
  s.piece.subs = defaultSubs(job);
  if (!job.activeSlotTypes.includes(s.piece.slot)) s.piece.slot = 'head';
  s.opt.target = 'spd';
  s.opt.tb = 'main';
  s.opt.tb2 = 'vit';
  s.browse.type = 'any';
  s.browse.sort = 'ilvl';
  s.poolFilter = 'all';
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
  };
}

function restorePool(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  return raw.map(restoreItem).filter(i => i && !seen.has(i.id) && seen.add(i.id));
}

/* piece.subs: three ranked substats for this job; the third may be null. Unknown or repeated ones fall back. */
function restorePieceSubs(raw, job) {
  const ds = defaultSubs(job);
  if (!Array.isArray(raw)) return ds;
  const subs = [0, 1, 2].map(i => (job.substats.includes(raw[i]) ? raw[i] : i === 2 ? null : ds[i]));
  if (subs[1] === subs[0]) subs[1] = ds[1];
  if (subs[2] === subs[0] || subs[2] === subs[1]) subs[2] = null;
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
  const job = makeJobContext(r && typeof r.job === 'string' ? r.job : s.job);
  s.job = job.jobId;
  resetForJob(s, job); // job-dependent defaults; saved values below replace them
  if (!r) return s;

  s.cap = ilvlIn(r.cap, s.cap);
  s.sync = bool(r.sync, s.sync);
  s.level = intIn(r.level, 1, 100, s.level);
  s.syncIlvl = ilvlIn(r.syncIlvl, s.syncIlvl);
  restoreTabs(s, r);
  s.poolFilter = oneOf(r.poolFilter, ['all', ...job.activeSlotTypes], s.poolFilter);

  const piece = isObj(r.piece) ? r.piece : {};
  s.piece.ilvl = ilvlIn(piece.ilvl, s.piece.ilvl);
  s.piece.slot = oneOf(piece.slot, job.activeSlotTypes, s.piece.slot);
  s.piece.subs = restorePieceSubs(piece.subs, job);

  const b = isObj(r.browse) ? r.browse : {};
  s.browse.q = str(b.q, s.browse.q);
  s.browse.type = oneOf(b.type, ['any', ...job.activeSlotTypes], s.browse.type);
  s.browse.min = optIntIn(b.min, 0, MAX_REAL, s.browse.min);
  s.browse.max = optIntIn(b.max, 0, MAX_REAL, s.browse.max);
  s.browse.lvl = optIntIn(b.lvl, 1, 100, s.browse.lvl);
  s.browse.sort = oneOf(b.sort, ['ilvl', ...job.stats], s.browse.sort);

  const o = isObj(r.opt) ? r.opt : {};
  s.opt.target = oneOf(o.target, job.stats, s.opt.target);
  s.opt.tb = oneOf(o.tb, ['', ...job.stats], s.opt.tb);
  s.opt.tb2 = oneOf(o.tb2, ['', ...job.stats], s.opt.tb2);
  s.opt.avg = bool(o.avg, s.opt.avg);
  s.opt.avgMin = ilvlIn(o.avgMin, s.opt.avgMin);

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
