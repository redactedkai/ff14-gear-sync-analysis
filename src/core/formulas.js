/* Stat formulas: how item level becomes the stats on a piece, and what item level sync clamps.
   See docs/math.md (sections 4 and 5) for each rule and docs/validation.md for the evidence. */
import {
  ALL_STATS,
  SUB_WEIGHTS,
  MIND_DIRECT_HIT_SHARE,
  GREEN_CRAFTED_DIRECT_HIT_SHARE,
  RARITY_GREEN,
  ATMA_NAME_SUFFIX,
  ATMA_STAT_ILVL,
  ALL_JOBS_ACCESSORY_FACTORS,
  ITEM_STAT_ORDER,
  RAW_MAIN_IDX,
  RAW_MAIN_ATTR_IDX,
  RAW_VIT_IDX,
  RAW_SUBSTAT_IDX,
  DB_SLOT_PCT,
  DB_SLOT_TYPE,
  WEAPON_PCT,
  BASE_SLOT_PCT,
} from './constants.js';
import { IL, MP, MAX_ILVL } from './tables.js';
import { statColumn } from './job-context.js';

/* Round half up. The epsilon keeps values like 22.4999999 (float noise from x.5 products) from rounding down. */
export function rnd(x) {
  return Math.floor(x + 0.5 + 1e-9);
}
export function clampIlvl(i) {
  i = Math.round(+i || 0);
  return Math.max(0, Math.min(MAX_ILVL, i));
}

export function blankStats() {
  return { main: 0, vit: 0, crit: 0, det: 0, dh: 0, spd: 0, spec: 0 };
}

/* The stat factor of `stat` when no real item is involved: the one the job's own gear carries. In the game files every
   piece with a single main stat has 100 for that stat, and Vitality 90 on Intelligence/Mind gear, 100 otherwise
   (BaseParam MeldParam; checked against every database piece in tests/unit/stat-factor.test.js). */
export function jobFactor(job, stat) {
  return stat === 'vit' ? job.vitFactor : 1;
}

/* The 100%-share value of `stat` for a slot at an item level. Rounded twice when the stat factor is not 1: first the
   slot budget (table x slot share / 1000), then the factor (Vitality x 0.9 on Int/Mind gear). `pct`: the piece's own
   slot share when it differs from the job's share for the slot type (a one-handed weapon on a two-handed job, a cloak
   covering the head). `factor`: the piece's own stat factor (a real item's, see kindFactors in items.js); null for the
   job's (jobFactor). */
export function slotBudget(job, stat, ilvl, type, pct = job.slotPct[type], factor = null) {
  const base = statColumn(job, stat)[clampIlvl(ilvl)];
  const f = factor ?? jobFactor(job, stat);
  const v = rnd((base * pct) / 1000);
  return f === 1 ? v : rnd(v * f);
}

/* An off-hand (shield) is not its own 40-per-mille share: each of its stats is the two-handed weapon's value minus the
   one-handed weapon's, both computed in full (140 - 100 = 40). Inferred from real gear: it reproduces 224 of 226
   off-hands, the plain 40 share 195 (docs/math.md, section 3). `pct` is the piece's share, null for the type's own. */
export function isOffhand(type, pct) {
  return type === 'offhand' && (pct == null || pct === BASE_SLOT_PCT.offhand);
}

/* A stat at a given substat share (percent). 100 or null means the full slot budget. `factor` as in slotBudget. */
export function pieceValue(job, stat, ilvl, type, weight, pct, factor = null) {
  if (isOffhand(type, pct)) {
    const two = pieceValue(job, stat, ilvl, 'weapon', weight, WEAPON_PCT['2h'], factor);
    return two - pieceValue(job, stat, ilvl, 'weapon', weight, WEAPON_PCT['1h+oh'], factor);
  }
  const v = slotBudget(job, stat, ilvl, type, pct, factor);
  return weight == null || weight === 100 ? v : rnd((v * weight) / 100);
}

/* Generic piece: full main stat and Vitality, substats `subs` at the ranked shares (100/70). */
export function buildPiece(job, ilvl, type, subs) {
  const st = blankStats();
  st.main = pieceValue(job, 'main', ilvl, type, 100);
  st.vit = pieceValue(job, 'vit', ilvl, type, 100);
  subs.forEach((s, i) => {
    if (s) st[s] = pieceValue(job, s, ilvl, type, SUB_WEIGHTS[i]);
  });
  return st;
}

/* The sync cap of one stat for a slot at the cap item level, rounded in a different order from an item's own stats:
   the stat factor first, then the slot share, flooring both and rounding once at the end,
   round(floor(floor(B x f) x pct / 100) / 10) with f in percent and pct in thousandths. An item's own stats
   (slotBudget, pieceValue) round the slot share first and then apply the factor, which fits real items far better. The
   cap order reproduces three in-game sync values quoted second-hand in xivgear's tests: Vitality 56 on a Blue Mage head
   at item level 270, Vitality 123 on a Red Mage head at 530 (the native 530 head carries 122) and main stat 71 on
   Azeyma's Earrings at 430 (docs/math.md, section 5). For a factor of 1 both orders give the same number. `pct` and
   `factor` as in slotBudget; an off-hand is the two-handed cap minus the one-handed cap (isOffhand). */
export function capValue(job, stat, ilvl, type, pct, factor = null) {
  if (isOffhand(type, pct)) {
    const two = capValue(job, stat, ilvl, 'weapon', WEAPON_PCT['2h'], factor);
    return two - capValue(job, stat, ilvl, 'weapon', WEAPON_PCT['1h+oh'], factor);
  }
  const base = statColumn(job, stat)[clampIlvl(ilvl)];
  const f = Math.round((factor ?? jobFactor(job, stat)) * 100);
  const share = pct ?? job.slotPct[type];
  return rnd(Math.floor((Math.floor((base * f) / 100) * share) / 100) / 10);
}

/* Per-stat ceiling under sync: each stat's capValue for the piece's slot and kind at the cap item level. `pct`: the
   piece's own slot share, if not the job's share for the type. `factors`: the piece's own stat factors
   ({neutral stat: factor}, kindFactors in items.js) for a real item; null for the job's (jobFactor). */
export function capsFor(job, type, capIlvl, pct, factors = null) {
  const c = {};
  ALL_STATS.forEach(s => {
    c[s] = s === 'spec' && !job.profile.spec ? 0 : capValue(job, s, capIlvl, type, pct, factors?.[s]);
  });
  return c;
}

/* Stats after sync. Pieces at or below the cap are untouched; above it every stat is clamped to capsFor. */
export function syncStats(job, stats, type, capIlvl, itemIlvl, pct, factors = null) {
  if (itemIlvl != null && itemIlvl <= capIlvl) return Object.assign({}, stats);
  const c = capsFor(job, type, capIlvl, pct, factors),
    o = {};
  ALL_STATS.forEach(s => {
    o[s] = Math.min(stats[s] || 0, c[s]);
  });
  return o;
}

/* Step-by-step derivation of one stat line, for display. Each step keeps the exact value and its rounding. An off-hand
   line is one step: the two-handed value minus the one-handed value (each derived as below). */
export function statDerivation(job, stat, ilvl, type, weight) {
  if (isOffhand(type)) {
    const two = statDerivation(job, stat, ilvl, 'weapon2h', weight);
    const one = statDerivation(job, stat, ilvl, 'weapon1h', weight);
    const value = two.value - one.value;
    return { base: two.base, steps: [{ kind: 'offhand', two: two.value, one: one.value, value }], value };
  }
  const il = clampIlvl(ilvl);
  const base = statColumn(job, stat)[il],
    pct = type === 'weapon2h' ? WEAPON_PCT['2h'] : type === 'weapon1h' ? WEAPON_PCT['1h+oh'] : job.slotPct[type];
  const steps = [];
  const exact = (base * pct) / 1000;
  let v = rnd(exact);
  steps.push({ kind: 'slot', base, pct, exact, value: v });
  const f = jobFactor(job, stat);
  if (f !== 1) {
    const e = v * f;
    v = rnd(e);
    steps.push({ kind: 'factor', factor: f, exact: e, value: v });
  }
  if (weight !== 100) {
    const e = (v * weight) / 100;
    v = rnd(e);
    steps.push({ kind: 'share', weight, exact: e, value: v });
  }
  return { base, steps, value: v };
}

const RAW_MIND_IDX = ITEM_STAT_ORDER.indexOf('mind'),
  RAW_DH_IDX = ITEM_STAT_ORDER.indexOf('dh');

/* The share of a fixed Direct Hit line on this raw stat vector, or 0 when it has none: Direct Hit on gear whose only
   main stat is Mind sits at MIND_DIRECT_HIT_SHARE, outside the substat ranking (the old healer Accuracy, converted in
   patch 4.0), or at GREEN_CRAFTED_DIRECT_HIT_SHARE on a green HQ-able piece with three substats (`item`: {hq, rarity}). */
function fixedDirectHitShare(st, item) {
  const onlyMind = st[RAW_MIND_IDX] && RAW_MAIN_IDX.every(i => i === RAW_MIND_IDX || !st[i]);
  if (!onlyMind || !st[RAW_DH_IDX]) return 0;
  const three = RAW_SUBSTAT_IDX.filter(i => st[i]).length === 3;
  return three && item.hq && item.rarity === RARITY_GREEN ? GREEN_CRAFTED_DIRECT_HIT_SHARE : MIND_DIRECT_HIT_SHARE;
}

/* Formula prediction from a database row's raw stat vector (any role) and its item kind (the row's statFactor). Used to
   validate the model against real items: every main stat present (a few pieces carry both Strength and Dexterity, and
   some carry the game's generic Main Attribute) and Vitality at 100%, substats ranked by size at 100/70%, where equal
   substats share the higher rank (relic weapon steps carry two substats at 100%), and Direct Hit on Mind-only gear as
   a fixed line (fixedDirectHitShare; `item` is {name, hq, rarity} of the row). Each stat's slot value is multiplied
   by the item's own stat factor (MP) before the substat share, rounded after each step. An off-hand is the two-handed
   value minus the one-handed value (isOffhand). An Atma weapon is predicted at its Zenith item level (ATMA_STAT_ILVL);
   an all-jobs accessory with its own factors (ALL_JOBS_ACCESSORY_FACTORS). */
export function predictRaw(il, slotCode, st, kind, item = {}) {
  if (item.name?.endsWith(ATMA_NAME_SUFFIX)) il = ATMA_STAT_ILVL;
  const own = Object.hasOwn(ALL_JOBS_ACCESSORY_FACTORS, item.name ?? '') ? ALL_JOBS_ACCESSORY_FACTORS[item.name] : {};
  const main = [...RAW_MAIN_IDX, RAW_MAIN_ATTR_IDX].filter(i => st[i]);
  const col = k => IL[k][il];
  // a stat line at a slot share: slot value, times the item's stat factor, times the substat share; rounded each time
  const line = (k, pct, weight) => {
    const f = own[k] ?? MP[k][kind];
    let v = rnd((col(k) * pct) / 1000);
    if (f !== 100) v = rnd((v * f) / 100);
    return weight === 100 ? v : rnd((v * weight) / 100);
  };
  const off = isOffhand(DB_SLOT_TYPE[slotCode], DB_SLOT_PCT[slotCode]);
  const value = (k, weight) =>
    off ? line(k, WEAPON_PCT['2h'], weight) - line(k, WEAPON_PCT['1h+oh'], weight) : line(k, DB_SLOT_PCT[slotCode], weight);
  const out = new Array(st.length).fill(0);
  for (const m of main) out[m] = value(ITEM_STAT_ORDER[m], 100);
  out[RAW_VIT_IDX] = value('vit', 100);
  const dhShare = fixedDirectHitShare(st, item);
  const fixed = dhShare ? RAW_DH_IDX : -1;
  if (dhShare) out[RAW_DH_IDX] = value('dh', dhShare);
  const subs = RAW_SUBSTAT_IDX.filter(i => st[i] && i !== fixed).sort((a, b) => st[b] - st[a]);
  let rank = 0;
  subs.slice(0, SUB_WEIGHTS.length).forEach((i, k) => {
    if (k > 0 && st[i] !== st[subs[k - 1]]) rank = k;
    out[i] = value(ITEM_STAT_ORDER[i], SUB_WEIGHTS[rank]);
  });
  return out;
}
