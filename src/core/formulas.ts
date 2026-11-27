/* Stat formulas: how item level becomes the stats on a piece, and what item level sync clamps.
   See docs/mechanics/math.md (sections 4 and 5) for each rule and docs/mechanics/validation.md for the evidence. */
import { statTable } from './stat-keys.ts';
import { clamp } from './clamp.ts';
import {
  SUB_WEIGHTS,
  MIND_DIRECT_HIT_SHARE,
  GREEN_CRAFTED_DIRECT_HIT_SHARE,
  RARITY_GREEN,
  ATMA_NAME_SUFFIX,
  ATMA_STAT_ILVL,
  ALL_JOBS_ACCESSORY_FACTORS,
  REDUCED_STAT_PIECES,
  ITEM_STAT_ORDER,
  RAW_MAIN_IDX,
  RAW_MIND_IDX,
  RAW_MAIN_ATTR_IDX,
  RAW_VIT_IDX,
  RAW_SUBSTAT_IDX,
  DB_SLOT_PCT,
  DB_SLOT_TYPE,
  WEAPON_PCT,
  BASE_SLOT_PCT,
} from './constants.ts';
import { IL, MP, MAX_ILVL } from './tables.ts';
import type { DamageDefenseKey, JobContext, PerStat, RawStatKey, SlotType, StatKey, StatMap } from './types.ts';

/* One step of statLine: the slot's share of the budget, the stat factor, or the substat share, with its unrounded value. */
export type StatStep =
  | { kind: 'slot'; base: number; pct: number; exact: number; value: number }
  | { kind: 'factor'; factor: number; exact: number; value: number }
  | { kind: 'share'; weight: number; exact: number; value: number };
/* The result of statLine: the budget it started from, each step that applies, and the final value. */
export interface StatLine {
  base: number;
  steps: StatStep[];
  value: number;
}
/* An off-hand's line, as statDerivation gives it: one step, the two-handed value minus the one-handed value. */
export interface OffhandLine {
  base: number;
  steps: [{ kind: 'offhand'; two: number; one: number; value: number }];
  value: number;
}
/* The sync cap of one value (capFromBudget): the budget's value after the factor, the cap in tenths of a point, and rounded. */
export interface CapParts {
  afterFactor: number;
  exact: number;
  value: number;
}
/* capDerivation of a plain piece: its budget, factor in percent, share in per mille and the cap's parts. */
export interface CapDerivation extends CapParts {
  /* only an off-hand's derivation has it (OffhandCapDerivation), so `d.offhand` tells the two apart */
  offhand?: undefined;
  base: number;
  factorPct: number;
  pct: number;
}
/* capDerivation of an off-hand: the two-handed and one-handed caps and their difference. */
export interface OffhandCapDerivation {
  offhand: { two: number; one: number };
  value: number;
}
/* The facts of an item row predictRaw reads besides its stats: its name, whether it can be high quality, its rarity. */
export interface RowFacts {
  name?: string;
  hq?: boolean | number;
  rarity?: number;
}

/* Round half up. The epsilon keeps values like 22.4999999 (float noise from x.5 products) from rounding down. */
function rnd(x: number): number {
  return Math.floor(x + 0.5 + 1e-9);
}
/* Any input (number or typed text) as a whole item level inside the ItemLevel table, 0 to MAX_ILVL. */
export function clampIlvl(input: unknown): number {
  const ilvl = Math.round(Number(input) || 0);
  return clamp(ilvl, 0, MAX_ILVL);
}

/* A stat object with each of the job's stat keys (job.stats) at 0. */
function blankStats(job: JobContext): StatMap {
  return Object.fromEntries(job.stats.map(s => [s, 0]));
}

/* The stat factor of `stat` when no real item is involved: the one the job's own gear carries. In the game files every
   piece with a single main stat has 100 for that stat, and Vitality 90 on Intelligence/Mind gear, 100 otherwise
   (BaseParam MeldParam; checked against every database piece in tests/unit/core/formulas.stat-factor.test.js). */
export function jobFactor(job: JobContext, stat: StatKey): number {
  return stat === 'vit' ? job.vitFactor : 1;
}

/* One stat line from its ItemLevel budget `base`, rounded after each step: the slot's share of the budget (`pct`, per
   mille), then the stat factor (`factor`, a fraction: 0.9 for Vitality on Int/Mind gear; skipped at 1), then the
   substat share (`weight`, percent: 70 for the second substat; skipped at 100 or null). The rule of every item stat
   (pieceValue, statDerivation, predictRaw, the Wiki checks in the test helper model-validation.js), written once.
   Returns {base, steps, value}: steps holds each step that applies, with its unrounded value:
   {kind: 'slot', base, pct, exact, value}, {kind: 'factor', factor, exact, value},
   {kind: 'share', weight, exact, value}; value is the last step's. */
export function statLine(base: number, pct: number, factor = 1, weight: number | null = 100): StatLine {
  const steps: StatStep[] = [];

  // step 1: the slot's share of the budget
  const slotExact = (base * pct) / 1000;
  let value = rnd(slotExact);
  steps.push({ kind: 'slot', base, pct, exact: slotExact, value });

  // step 2: the stat factor, rounded again
  if (factor !== 1) {
    const exact = value * factor;
    value = rnd(exact);
    steps.push({ kind: 'factor', factor, exact, value });
  }

  // step 3: the substat share, rounded once more
  if (weight != null && weight !== 100) {
    const exact = (value * weight) / 100;
    value = rnd(exact);
    steps.push({ kind: 'share', weight, exact, value });
  }
  return { base, steps, value };
}

/* An off-hand (shield) is not its own 40-per-mille share: each of its stats is the two-handed weapon's value minus the
   one-handed weapon's, both computed in full (140 - 100 = 40). Inferred from real gear: it reproduces 224 of 226
   off-hands, the plain 40 share 195 (docs/mechanics/math.md, section 3). `pct` is the piece's share, null for the type's own. */
export function isOffhand(type: SlotType, pct?: number | null): boolean {
  return type === 'offhand' && (pct == null || pct === BASE_SLOT_PCT.offhand);
}

/* An off-hand's value by the rule above: {two, one, value}, the two-handed and one-handed values and their difference.
   `valueAt(share)` gives the same line on a weapon of slot share `share` (per mille). Shared by item stats, caps,
   derivations and the accuracy checks. */
export function offhandParts(valueAt: (share: number) => number): { two: number; one: number; value: number } {
  const two = valueAt(WEAPON_PCT['2h']);
  const one = valueAt(WEAPON_PCT['1h+oh']);
  return { two, one, value: two - one };
}

/* A stat at a given substat share (`weight`, percent; 100 or null means the full slot budget), rounded after each step
   (statLine). `pct`: the piece's own slot share (per mille) when it differs from the job's share for the slot type (a
   one-handed weapon on a two-handed job, a cloak covering the head); null for the job's. `factor`: the piece's own stat
   factor (a fraction; a real item's, see kindFactors in items.ts); null for the job's (jobFactor). */
export function pieceValue(
  job: JobContext,
  stat: StatKey,
  ilvl: unknown,
  type: SlotType,
  weight: number | null,
  pct?: number | null,
  factor: number | null | undefined = null,
): number {
  // a shield: the two-handed weapon's value minus the one-handed weapon's (isOffhand)
  if (isOffhand(type, pct)) {
    return offhandParts(share => pieceValue(job, stat, ilvl, 'weapon', weight, share, factor)).value;
  }
  const base = IL[stat][clampIlvl(ilvl)]; // the ItemLevel table's budget for this stat
  return statLine(base, pct ?? job.slotPct[type], factor ?? jobFactor(job, stat), weight).value;
}

/* Generic piece: full main stat and Vitality, substats `subs` at the ranked shares (100/70). */
export function buildPiece(job: JobContext, ilvl: number, type: SlotType, subs: readonly (StatKey | null | undefined)[]): StatMap {
  const stats = blankStats(job);
  stats[job.mainKey] = pieceValue(job, job.mainKey, ilvl, type, 100);
  stats.vit = pieceValue(job, 'vit', ilvl, type, 100);
  // subs[0] at the first share (100%), subs[1] at the second (70%); an empty rank adds nothing
  subs.forEach((stat, rank) => {
    if (stat) {
      stats[stat] = pieceValue(job, stat, ilvl, type, SUB_WEIGHTS[rank]);
    }
  });
  return stats;
}

/* The sync cap of one stat for a slot at the cap item level, rounded in a different order from an item's own stats:
   the stat factor first, then the slot share, flooring both and rounding once at the end,
   round(floor(floor(B x f) x pct / 100) / 10) with f in percent and pct in thousandths. An item's own stats
   (statLine, pieceValue) round the slot share first and then apply the factor, which fits real items far better. The
   cap order reproduces three in-game sync values from xivgear's tests: Vitality 56 on a Blue Mage head
   at item level 270, Vitality 123 on a Red Mage head at 530 (the native 530 head carries 122) and main stat 71 on
   Azeyma's Earrings at 430 (docs/mechanics/math.md, section 5). For a factor of 1 both orders give the same number. `pct` and
   `factor` as in pieceValue; an off-hand is the two-handed cap minus the one-handed cap (isOffhand). */
export function capValue(
  job: JobContext,
  stat: StatKey,
  ilvl: unknown,
  type: SlotType,
  pct: number | null | undefined,
  factor: number | null | undefined = null,
): number {
  return capDerivation(job, stat, ilvl, type, pct, factor).value;
}

/* capValue step by step, for display: {base, factorPct, afterFactor, pct, exact, value} with exact the value in tenths
   of a point before the last rounding; an off-hand is {offhand: {two, one}, value} (two-handed cap minus one-handed). */
export function capDerivation(
  job: JobContext,
  stat: StatKey,
  ilvl: unknown,
  type: SlotType,
  pct?: number | null,
  factor: number | null | undefined = null,
): CapDerivation | OffhandCapDerivation {
  if (isOffhand(type, pct)) {
    const { two, one, value } = offhandParts(slotShare => capValue(job, stat, ilvl, 'weapon', slotShare, factor));
    return { offhand: { two, one }, value };
  }
  const base = IL[stat][clampIlvl(ilvl)];
  const factorPct = Math.round((factor ?? jobFactor(job, stat)) * 100); // 0.9 -> 90, so the arithmetic stays integer
  const share = pct ?? job.slotPct[type]; // per mille
  // the factor first, floored; then the slot share, floored, in tenths of a point; then rounded to whole points
  return { base, factorPct, ...capFromBudget(base, factorPct, share), pct: share };
}

/* The sync cap of one value from its ItemLevel budget `base`, its factor in percent and its slot share in thousandths:
   {afterFactor, exact, value}. The factor first, floored; then the slot share, floored, in tenths of a point; then
   rounded to whole points. Shared by the stats (capDerivation) and weapon damage and defense (damage-defense.ts). */
export function capFromBudget(base: number, factorPct: number, share: number): CapParts {
  const afterFactor = Math.floor((base * factorPct) / 100);
  const exact = Math.floor((afterFactor * share) / 100) / 10;
  return { afterFactor, exact, value: rnd(exact) };
}

/* Per-stat ceiling under sync: each stat's capValue for the piece's slot and kind at the cap item level. `pct`: the
   piece's own slot share, if not the job's share for the type. `factors`: the piece's own stat factors
   ({stat key: factor}, kindFactors in items.ts) for a real item; null for the job's (jobFactor). */
export function capsFor(
  job: JobContext,
  type: SlotType,
  capIlvl: unknown,
  pct?: number | null,
  factors: StatMap | null = null,
): PerStat<number> {
  return statTable(job, s => capValue(job, s, capIlvl, type, pct, factors?.[s]));
}

/* Stats after sync. Pieces at or below the cap are untouched; above it every stat is clamped to capsFor. */
export function syncStats(
  job: JobContext,
  stats: StatMap,
  type: SlotType,
  capIlvl: number,
  itemIlvl: number | null | undefined,
  pct?: number | null,
  factors: StatMap | null = null,
): StatMap {
  if (itemIlvl != null && itemIlvl <= capIlvl) {
    return Object.assign({}, stats);
  }
  const caps = capsFor(job, type, capIlvl, pct, factors);
  // sync only lowers: a stat already under its cap keeps its value (substats never scale up)
  return Object.fromEntries(job.stats.map(s => [s, Math.min(stats[s] || 0, caps[s])]));
}

/* Step-by-step derivation of one stat line of a generic piece (the job's stat factor), for display: statLine's {base,
   steps, value}. `pct`: the slot share in per mille, the job's for the type when missing. An off-hand line is one step,
   {kind: 'offhand', two, one, value}: the two-handed value minus the one-handed value (offhandParts). */
export function statDerivation(
  job: JobContext,
  stat: StatKey,
  ilvl: unknown,
  type: SlotType,
  weight: number | null,
  pct: number = job.slotPct[type],
): StatLine | OffhandLine {
  const base = IL[stat][clampIlvl(ilvl)];
  if (isOffhand(type, pct)) {
    const { two, one, value } = offhandParts(share => statDerivation(job, stat, ilvl, 'weapon', weight, share).value);
    return { base, steps: [{ kind: 'offhand', two, one, value }], value };
  }
  return statLine(base, pct, jobFactor(job, stat), weight);
}

const RAW_DH_IDX = ITEM_STAT_ORDER.indexOf('dh');

/* The share of a fixed Direct Hit line on this raw stat vector, or 0 when it has none: Direct Hit on gear whose only
   main stat is Mind sits at MIND_DIRECT_HIT_SHARE, outside the substat ranking (the old healer Accuracy, converted in
   patch 4.0), or at GREEN_CRAFTED_DIRECT_HIT_SHARE on a green HQ-able piece with three substats (`item`: {hq, rarity}). */
function fixedDirectHitShare(raw: readonly number[], item: RowFacts): number {
  const onlyMind = raw[RAW_MIND_IDX] && RAW_MAIN_IDX.every(i => i === RAW_MIND_IDX || !raw[i]);
  if (!onlyMind || !raw[RAW_DH_IDX]) {
    return 0;
  }
  // a fixed line is always the piece's smallest substat; a Direct Hit line above another substat is ranked like any
  // substat (Wolf Ringbands, PvP item level 55)
  if (RAW_SUBSTAT_IDX.some(i => raw[i] && raw[i] < raw[RAW_DH_IDX])) {
    return 0;
  }
  const hasThreeSubs = RAW_SUBSTAT_IDX.filter(i => raw[i]).length === 3;
  return hasThreeSubs && item.hq && item.rarity === RARITY_GREEN ? GREEN_CRAFTED_DIRECT_HIT_SHARE : MIND_DIRECT_HIT_SHARE;
}

/* Formula prediction from a database row's raw stat vector (any role) and its item kind (the row's statFactor). Used to
   validate the model against real items: every main stat present (a few pieces carry both Strength and Dexterity, and
   some carry the game's generic Main Attribute) and Vitality at 100%, substats ranked by size at 100/70%, where equal
   substats share the higher rank (relic weapon steps carry two substats at 100%), and Direct Hit on Mind-only gear as
   a fixed line (fixedDirectHitShare; `item` is {name, hq, rarity} of the row). Each stat's slot value is multiplied
   by the item's own stat factor (MP) before the substat share, rounded after each step. An off-hand is the two-handed
   value minus the one-handed value (isOffhand). An Atma weapon is predicted at its Zenith item level (ATMA_STAT_ILVL);
   an all-jobs accessory with its own factors (ALL_JOBS_ACCESSORY_FACTORS); 18 dungeon pieces with reduced stats at the
   end (REDUCED_STAT_PIECES). */
export function predictRaw(il: number, slotCode: number, raw: readonly number[], kind: number, item: RowFacts = {}): number[] {
  // named exceptions first: the Atma weapons carry an older item level's stats, the all-jobs accessories their own factors
  const statIlvl = item.name?.endsWith(ATMA_NAME_SUFFIX) ? ATMA_STAT_ILVL : il;
  const itemName = item.name ?? '';
  const accessoryFactors: Partial<Record<string, number>> = Object.hasOwn(ALL_JOBS_ACCESSORY_FACTORS, itemName)
    ? ALL_JOBS_ACCESSORY_FACTORS[itemName]
    : {};

  // one stat line at a slot share (per mille), the item's stat factor (MP and the accessory factors are percents, so
  // / 100) and a substat share (percent), rounded after each step (statLine)
  const line = (key: RawStatKey | DamageDefenseKey, pct: number, weight: number | null) =>
    statLine(IL[key][statIlvl], pct, (accessoryFactors[key] ?? MP[key][kind]) / 100, weight).value;
  // the line on this piece's slot; a shield is the two-handed line minus the one-handed line (isOffhand)
  const isShield = isOffhand(DB_SLOT_TYPE[slotCode], DB_SLOT_PCT[slotCode]);
  const value = (key: RawStatKey, weight: number | null) =>
    isShield ? offhandParts(share => line(key, share, weight)).value : line(key, DB_SLOT_PCT[slotCode], weight);

  const out = new Array(raw.length).fill(0);

  // every main stat the piece carries, and Vitality, at the full share
  const mainIdx = [...RAW_MAIN_IDX, RAW_MAIN_ATTR_IDX].filter(i => raw[i]);
  for (const i of mainIdx) {
    out[i] = value(ITEM_STAT_ORDER[i], 100);
  }
  if (raw[RAW_VIT_IDX]) {
    out[RAW_VIT_IDX] = value('vit', 100);
  }

  // a fixed Direct Hit line on Mind-only gear, outside the ranking below
  const dhShare = fixedDirectHitShare(raw, item);
  const fixedDhIdx = dhShare ? RAW_DH_IDX : -1;
  if (dhShare) {
    out[RAW_DH_IDX] = value('dh', dhShare);
  }

  // the other substats, largest first, at the ranked shares (100, 70). Ties share a rank and the next value skips past
  // them (a, a, b: ranks 0, 0, 2), so a substat past the last share counts only when it ties with the one before
  // (Herklaedi: three substats, two at 70%)
  const subs = RAW_SUBSTAT_IDX.filter(i => raw[i] && i !== fixedDhIdx).sort((a, b) => raw[b] - raw[a]);
  let rank = 0;
  for (const [pos, i] of subs.entries()) {
    if (pos > 0 && raw[i] !== raw[subs[pos - 1]]) {
      rank = pos;
    }
    if (rank >= SUB_WEIGHTS.length) {
      break;
    }
    out[i] = value(ITEM_STAT_ORDER[i], SUB_WEIGHTS[rank]);
  }

  // the 18 reduced-stat dungeon pieces: main stats at 90%, everything else at 80%, of the usual values
  if (item.name !== undefined && REDUCED_STAT_PIECES.names.has(item.name)) {
    const { main: mainPct, rest: restPct } = REDUCED_STAT_PIECES;
    return out.map((v, i) => rnd((v * (mainIdx.includes(i) ? mainPct : restPct)) / 100));
  }
  return out;
}
