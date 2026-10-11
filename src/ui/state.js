/* The page's saved state: defaults, per-job resets, and repair of whatever localStorage hands back.
   The shape is what gets saved under STORE_KEY; change it only together with a key bump. */
import { SLOT_TYPES, JOBS, DEFAULT_JOB } from '../core/constants.js';
import { makeJobContext } from '../core/job-context.js';
import { mkItem, reserveIds } from '../core/items.js';
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
    gen: { ilvl: 475, third: true, subs: [], types: [] },
    browse: { q: '', type: 'any', min: 100, max: '', lvl: 100, sort: 'ilvl' },
    opt: { target: 'spd', tb: 'main', tb2: 'vit', avg: true, avgMin: 123 },
    poolFilter: 'all',
    pool: [],
  };
}

export function defaultSubs(job) {
  return ['spd', job.profile.spec ? 'spec' : 'crit', job.profile.spec === 'piety' ? 'dh' : null];
}

/* Selections that depend on the role or weapon mode go back to defaults, and the pool is emptied. */
export function resetForJob(s, job) {
  s.piece.subs = defaultSubs(job);
  if (!job.activeSlotTypes.includes(s.piece.slot)) s.piece.slot = 'head';
  s.gen.subs = job.substats.slice();
  s.gen.types = job.activeSlotTypes.slice();
  s.gen.third = job.profile.spec === 'piety';
  s.opt.target = 'spd';
  s.opt.tb = 'main';
  s.opt.tb2 = 'vit';
  s.browse.type = 'any';
  s.browse.sort = 'ilvl';
  s.poolFilter = 'all';
  s.pool = [];
}

/* Build a valid state from parsed localStorage JSON (or null). */
export function restoreState(raw) {
  const s = defaultState();
  let had = false;
  if (raw) {
    try {
      if (raw.job && JOBS.some(j => j[0] === raw.job)) s.job = raw.job;
      ['cap', 'sync', 'level', 'tab', 'mathTab', 'syncIlvl', 'poolFilter'].forEach(k => {
        if (raw[k] != null) s[k] = raw[k];
      });
      ['piece', 'gen', 'browse', 'opt'].forEach(k => {
        if (raw[k]) Object.assign(s[k], raw[k]);
      });
      if (Array.isArray(raw.pool)) {
        s.pool = raw.pool
          .filter(i => i && i.id && i.stats && i.src !== 'preset' && SLOT_TYPES.includes(i.type))
          .map(i => Object.assign(mkItem('', i.type, i.ilvl, {}), i));
      }
      had = true;
    } catch (e) {
      had = false;
    }
  }

  const job = makeJobContext(s.job);
  s.job = job.jobId;
  if (!had) resetForJob(s, job);
  else {
    if (!Array.isArray(s.piece.subs)) s.piece.subs = defaultSubs(job);
    if (!s.gen.subs.length) s.gen.subs = job.substats.slice();
    if (!s.gen.types.length) s.gen.types = job.activeSlotTypes.slice();
  }

  // drop saved selections that don't exist for this job
  const okSub = v => job.substats.includes(v);
  const ds = defaultSubs(job);
  s.piece.subs = [0, 1, 2].map(i => {
    const v = s.piece.subs && s.piece.subs[i];
    return okSub(v) ? v : i === 2 ? null : ds[i];
  });
  if (s.piece.subs[1] === s.piece.subs[0]) s.piece.subs[1] = ds[1];
  if (!job.activeSlotTypes.includes(s.piece.slot)) s.piece.slot = 'head';
  s.piece.ilvl = Math.min(s.piece.ilvl, MAX_REAL);
  s.syncIlvl = Math.min(s.syncIlvl, MAX_REAL);
  s.gen.ilvl = Math.min(s.gen.ilvl, MAX_REAL);
  s.gen.subs = s.gen.subs.filter(okSub);
  if (s.gen.subs.length < 2) s.gen.subs = job.substats.slice();
  s.gen.types = s.gen.types.filter(t => job.activeSlotTypes.includes(t));
  if (!s.gen.types.length) s.gen.types = job.activeSlotTypes.slice();
  if (!job.stats.includes(s.opt.target)) s.opt.target = 'spd';
  if (s.opt.tb && !job.stats.includes(s.opt.tb)) s.opt.tb = 'main';
  if (s.opt.tb2 && !job.stats.includes(s.opt.tb2)) s.opt.tb2 = 'vit';
  if (s.browse.sort !== 'ilvl' && !job.stats.includes(s.browse.sort)) s.browse.sort = 'ilvl';
  // older saved state used the sub-view names as tabs
  if (MATH_TABS.includes(s.tab)) {
    s.mathTab = s.tab;
    s.tab = 'math';
  }
  if (!TABS.includes(s.tab)) s.tab = 'pool';
  if (!MATH_TABS.includes(s.mathTab)) s.mathTab = 'piece';

  reserveIds(s.pool.map(i => i.id));
  return s;
}

/* localStorage is a per-viewer convenience: every access may throw (private mode, blocked storage). */
export function loadSaved() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

export function save(json) {
  try {
    localStorage.setItem(STORE_KEY, json);
  } catch (e) {
    /* storage unavailable */
  }
}
