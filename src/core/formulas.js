/* Stat formulas: how item level becomes the stats on a piece, and what item level sync clamps.
   See docs/findings.md sections 1 and 3 for the evidence behind each rule. */
import { ALL_STATS, SUB_WEIGHTS, ITEM_STAT_ORDER, RAW_MAIN_IDX, RAW_VIT_IDX, RAW_SUBSTAT_IDX, DB_SLOT_PCT } from './constants.js';
import { IL, MAX_ILVL } from './tables.js';
import { statColumn } from './job-context.js';

/* Round half up. The epsilon keeps values like 22.4999999 (float noise from x.5 products) from rounding down. */
export function rnd(x) { return Math.floor(x + 0.5 + 1e-9); }
export function clampIlvl(i) { i = Math.round(+i || 0); return Math.max(0, Math.min(MAX_ILVL, i)); }

export function blankStats() { return { main: 0, vit: 0, crit: 0, det: 0, dh: 0, spd: 0, spec: 0 }; }

/* The 100%-share value of `stat` for a slot at an item level. Rounded twice for Vitality on Int/Mind jobs:
   first the slot budget (table x slot share / 1000), then the 0.9 factor. */
export function slotBudget(job, stat, ilvl, type) {
  const base = statColumn(job, stat)[clampIlvl(ilvl)];
  let v = rnd(base * job.slotPct[type] / 1000);
  if (stat === 'vit' && job.vitFactor !== 1) v = rnd(v * job.vitFactor);
  return v;
}

/* A stat at a given substat share (percent). 100 or null means the full slot budget. */
export function pieceValue(job, stat, ilvl, type, weight) {
  const v = slotBudget(job, stat, ilvl, type);
  return (weight == null || weight === 100) ? v : rnd(v * weight / 100);
}

/* Generic piece: full main stat and Vitality, substats `subs` at the ranked shares (100/70/20). */
export function buildPiece(job, ilvl, type, subs) {
  const st = blankStats();
  st.main = pieceValue(job, 'main', ilvl, type, 100);
  st.vit = pieceValue(job, 'vit', ilvl, type, 100);
  subs.forEach((s, i) => { if (s) st[s] = pieceValue(job, s, ilvl, type, SUB_WEIGHTS[i]); });
  return st;
}

/* Per-stat ceiling under sync: the 100%-share value of a same-slot piece at the cap item level. */
export function capsFor(job, type, capIlvl) {
  const c = {};
  ALL_STATS.forEach(s => { c[s] = (s === 'spec' && !job.profile.spec) ? 0 : pieceValue(job, s, capIlvl, type, 100); });
  return c;
}

/* Stats after sync. Pieces at or below the cap are untouched; above it every stat is clamped to capsFor. */
export function syncStats(job, stats, type, capIlvl, itemIlvl) {
  if (itemIlvl != null && itemIlvl <= capIlvl) return Object.assign({}, stats);
  const c = capsFor(job, type, capIlvl), o = {};
  ALL_STATS.forEach(s => { o[s] = Math.min(stats[s] || 0, c[s]); });
  return o;
}

/* Step-by-step derivation of one stat line, for display. Each step keeps the exact value and its rounding. */
export function statDerivation(job, stat, ilvl, type, weight) {
  const il = clampIlvl(ilvl);
  const base = statColumn(job, stat)[il], pct = job.slotPct[type];
  const steps = [];
  const exact = base * pct / 1000;
  let v = rnd(exact);
  steps.push({ kind: 'slot', base, pct, exact, value: v });
  if (stat === 'vit' && job.vitFactor !== 1) {
    const e = v * job.vitFactor; v = rnd(e);
    steps.push({ kind: 'vit', factor: job.vitFactor, exact: e, value: v });
  }
  if (weight !== 100) {
    const e = v * weight / 100; v = rnd(e);
    steps.push({ kind: 'share', weight, exact: e, value: v });
  }
  return { base, steps, value: v };
}

/* Formula prediction from a database row's raw 12-stat vector (any role). Used to validate the model
   against real items: the main stat and Vitality at 100%, substats ranked by size at 100/70/20%. */
export function predictRaw(il, slotCode, st) {
  const pct = DB_SLOT_PCT[slotCode];
  const main = RAW_MAIN_IDX.filter(i => st[i]);
  if (!main.length) return null;
  const col = k => IL[k][il];
  const m = main[0], out = new Array(12).fill(0);
  out[m] = rnd(col(ITEM_STAT_ORDER[m]) * pct / 1000);
  const vb = rnd(col('vit') * pct / 1000);
  out[RAW_VIT_IDX] = (ITEM_STAT_ORDER[m] === 'int' || ITEM_STAT_ORDER[m] === 'mind') ? rnd(vb * 0.9) : vb;
  const subs = RAW_SUBSTAT_IDX.filter(i => st[i]).sort((a, b) => st[b] - st[a]);
  subs.slice(0, SUB_WEIGHTS.length).forEach((i, k) => {
    out[i] = rnd(rnd(col(ITEM_STAT_ORDER[i]) * pct / 1000) * SUB_WEIGHTS[k] / 100);
  });
  return out;
}
