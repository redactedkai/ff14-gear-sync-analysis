/* Substat tiers: each substat's effect moves in steps, so the points between two steps do nothing. For a total of
   gear points g at a level, the effect is floor(c x g / div) per mille, with div = ParamGrow.LevelModifier and a step
   size c per effect (AkhMorning's formulas, which xivgear's xivmath matches; docs/mechanics/math.md, section 6):
     Critical Hit rate 200 (plus a base 5%), Determination 140, Direct Hit 550, Tenacity damage 112, Piety 150 (MP per
     tick, not per mille); Skill/Spell Speed by its GCD (speed.ts).
   The character's base value of each stat cancels out of these formulas, so the tier depends on the gear points alone.
   Food is not counted: it would move every total. Main stats and Vitality have no tiers here. */
import { isOneOf } from './guards.ts';
import { BASE_GCD_MS, gcdFor, gcdTierAt } from './speed.ts';
import { levelParams } from './level-params.ts';
import { statBase } from './base-stats.ts';
import type { DimKey, JobContext, StatKey } from './types.ts';

/* The kinds of effect a stat has (EFFECTS). */
export type EffectKind = 'rate' | 'onCrit' | 'dmgHeal' | 'dmgTaken' | 'mp' | 'gcd';
/* One effect of a stat: its kind and its step (null for speed's GCD). */
interface Effect {
  readonly kind: EffectKind;
  readonly step: number | null;
}
/* The tier a gear value falls in: its start and the start of the next tier (null for the last), in gear points. */
interface TierSpan {
  start: number;
  next: number | null;
}
/* An effect that has a step: every one but speed's GCD. The code reads a step only where the effect is not the GCD. */
interface SteppedEffect {
  readonly kind: EffectKind;
  readonly step: number;
}
/* One row of tierLadder: a tier on the panel scale, its values as text and which of them changed at its start. */
export interface TierRow {
  start: number;
  next: number | null;
  values: string[];
  changed: boolean[];
}
/* The result of tierLadder. */
export interface TierLadder {
  base: number;
  kinds: EffectKind[];
  rows: TierRow[];
  cur: number;
  spare: number;
  toNext: number | null;
  under: boolean;
}

/* Tenacity's other effect, damage taken, steps every 200 (xivmath `tenacityIncomingDmg`). Tier ranking uses it: players
   stack Tenacity for mitigation (owner). The optimizer's Tier row shows the damage step (112). */
const TEN_MITIGATION_STEP = 200;

/* Each substat's effects, in the order the page shows them: {kind, step}, step the c in floor(c x g / div) (speed has
   none: its GCD comes from speed.ts). Kinds:
     rate: the chance of a critical hit (from 5%) or a direct hit; onCrit: what a critical hit adds (from 40%, always
     the rate + 35%, the same step); dmgHeal: damage and healing done; dmgTaken: Tenacity's cut to damage taken; mp:
     Piety's MP per tick; gcd: the GCD.
   AkhMorning (checked 2026-10-17): Critical Hit, Determination and Tenacity's first effect apply to outgoing healing
   too, Direct Hit to damage only. The first effect is the one the optimizer's Tier row shows (statTier). */
const EFFECTS: Readonly<Partial<Record<StatKey, readonly Effect[]>>> = {
  crit: [
    { kind: 'rate', step: 200 },
    { kind: 'onCrit', step: 200 },
  ],
  det: [{ kind: 'dmgHeal', step: 140 }],
  dh: [{ kind: 'rate', step: 550 }],
  // speed: the GCD, whichever speed stat the job has
  sks: [{ kind: 'gcd', step: null }],
  sps: [{ kind: 'gcd', step: null }],
  // Piety's MP per tick
  piety: [{ kind: 'mp', step: 150 }],
  // Tenacity's mitigation: damage and healing done, and a cut to damage taken
  ten: [
    { kind: 'dmgHeal', step: 112 },
    { kind: 'dmgTaken', step: TEN_MITIGATION_STEP },
  ],
};
/* The step tier ranking uses for a stat when it is not its first effect's: Tenacity's mitigation (see rankTierOf). */
const RANK_STEP: Readonly<Partial<Record<StatKey, number>>> = { ten: TEN_MITIGATION_STEP };

/* The effects of a stat key of the job ({kind, step} objects), or null for stats without tiers (the main stat,
   Vitality) and for a stat the job lacks (Piety on a job without it). */
function effectsOf(job: JobContext, stat: DimKey): readonly Effect[] | null {
  return isOneOf(job.stats, stat) ? (EFFECTS[stat] ?? null) : null;
}

/* The kinds of effect a stat key has, in the order the page shows them ([] for a stat without tiers). */
export function statEffectKinds(stat: StatKey): EffectKind[] {
  return (EFFECTS[stat] ?? []).map(effect => effect.kind);
}

/* The step size of a stat key's first effect, or null for speed and stats without tiers. */
function stepOf(job: JobContext, stat: DimKey): number | null {
  return effectsOf(job, stat)?.[0].step ?? null;
}

/* A per mille value as a percent with one decimal: 193 -> "19.3%". */
const pct = (n: number) => `${(n / 10).toFixed(1)}%`;

/* An effect's display text from its tier floor(step x g / div) (for gcd: the GCD in seconds): "19.3%" (rate),
   "+54.3%" (onCrit, dmgHeal), "−8.6%" (dmgTaken), "+52" (mp), "2.47s" (gcd). */
function effectText(kind: EffectKind, stat: StatKey, tier: number): string {
  if (kind === 'gcd') {
    return `${tier.toFixed(2)}s`;
  }
  if (kind === 'rate') {
    return pct(tier + (stat === 'crit' ? 50 : 0)); // the critical hit rate starts at 5% (50 per mille)
  }
  if (kind === 'onCrit') {
    return `+${pct(tier + 400)}`; // a critical hit adds 40% before any Critical Hit
  }
  if (kind === 'dmgTaken') {
    return `−${pct(tier)}`;
  }
  if (kind === 'mp') {
    return `+${tier}`;
  }
  return `+${pct(tier)}`; // dmgHeal
}

/* The tier of `stat` with `points` from gear at character `level`: {effect, start, next}, or null for a stat without
   tiers. effect: display text of the stat's first effect ("19.3%", "+8.3%", "2.49s", "+120 MP"); start: the fewest
   points with the same effect; next: the fewest with a better one (null if none). So points - start can be spent
   elsewhere without losing the effect, and next - points are needed for the next step. */
export function statTier(
  job: JobContext,
  stat: StatKey,
  points: number,
  level: number,
): { effect: string; start: number; next: number | null } | null {
  const gear = Math.max(0, Math.floor(points || 0));
  // speed's effect is its GCD, which has its own steps (speed.ts)
  if (stat === job.speedKey) {
    const t = gcdTierAt(gear, level);
    return { effect: effectText('gcd', stat, t.gcd), start: t.start, next: t.next };
  }
  const effects = effectsOf(job, stat);
  if (effects == null) {
    return null;
  }
  const { kind, step } = effects[0] as SteppedEffect;
  const { div } = levelParams(level);
  // the effect in per mille (MP for Piety), and the fewest points that give it and the next one: the smallest g with
  // floor(step x g / div) >= tier, and >= tier + 1
  const tier = Math.floor((step * gear) / div);
  const start = Math.ceil((tier * div) / step);
  const next = Math.ceil(((tier + 1) * div) / step);
  return { effect: effectText(kind, stat, tier) + (kind === 'mp' ? ' MP' : ''), start, next };
}

/* The tier that gear points g fall in, for some or all of a stat's effects ({kind, step} objects from effectsOf):
   {start, next} in gear points, next null past the last GCD step. With several effects a tier ends where any of them
   changes. haste in percent (speed only). */
function tierAt(effects: readonly Effect[], g: number, level: number, haste: number): TierSpan {
  if (effects[0].kind === 'gcd') {
    const t = gcdTierAt(g, level, BASE_GCD_MS, haste);
    return { start: t.start, next: t.next };
  }
  const { div } = levelParams(level);
  let start = 0,
    next = Infinity;
  for (const { step } of effects as readonly SteppedEffect[]) {
    const tier = Math.floor((step * g) / div);
    start = Math.max(start, Math.ceil((tier * div) / step));
    next = Math.min(next, Math.ceil(((tier + 1) * div) / step));
  }
  return { start, next };
}

/* The index of the row whose tier holds `value` (a panel value) in `rows` (tierLadder's rows: ascending by start, the
   first at the base). A value under the base is in the first row. Returns an index. */
export function rowIndexAt(rows: readonly { start: number }[], value: number): number {
  let low = 0,
    high = rows.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (rows[middle].start <= value) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return low;
}

/* For How the math works (Substat tiers): the tiers of `stat` around `total`, a character panel value (base + gear, plus food
   when the caller counts it), at `level`, with the job's `haste` (percent; speed only). Null for a stat without tiers.
   `near` is how many tiers to keep either side of the value's tier (0 for its tier alone); `most` is the highest panel
   value the stat can have (null for none). With `near` Infinity the rows are every tier from the base up to `most`:
   the stat must then have a `most`, or a last GCD step, since the ladder would never end. The tier that holds `most`
   is the last row and has no next, and a value over `most` counts as `most`.
   Returns {base, kinds, rows, cur, spare, toNext, under}:
   - base: the character's own value (statBase), the panel's lowest; under: `total` was below it (it counts as base);
   - kinds: the stat's effect kinds (EFFECTS), one value per kind in each row;
   - rows: ascending, 2 x near + 1 tiers with the value's tier in the middle; near either end (the base, the last
     GCD step or `most`) the rows stop at the end and run on past the other side instead of leaving rows empty
     (owner), so the value's tier moves off the middle. Each {start, next, values, changed}: start and next on the
     panel scale (next null for the last tier), values as text, changed[k] true when value k differs from the tier
     before (all true for the first tier). Fewer rows only when the stat has fewer tiers;
   - cur: the index of the value's tier in rows;
   - spare: points above the tier's start; toNext: points to the next tier (null for the last).
   A tier ends where any of the stat's effects changes, so Tenacity's two effects make tiers of uneven size. */
export function tierLadder(
  job: JobContext,
  stat: StatKey,
  level: number,
  total: number,
  near: number,
  haste = 0,
  most: number | null = null,
): TierLadder | null {
  const effects = effectsOf(job, stat);
  if (effects == null) {
    return null;
  }
  const base = statBase(job, stat, level);
  const { div } = levelParams(level);
  const valuesAt = (g: number) =>
    (effects as readonly SteppedEffect[]).map(({ kind, step }) =>
      effectText(kind, stat, kind === 'gcd' ? gcdFor(g, level, BASE_GCD_MS, haste) : Math.floor((step * g) / div)),
    );

  // 1. the value's tier, up to `near` tiers below it and above it, then more on one side for the rows the other lacks;
  //    a ladder of every tier starts at the base, and none goes past the tier that holds `most`
  const gearMost = most == null ? Infinity : Math.max(0, most - base);
  const gear = Math.min(gearMost, Math.max(0, Math.floor(total) - base));
  const tiers: TierSpan[] = [tierAt(effects, near === Infinity ? 0 : gear, level, haste)];
  const lower = () => tiers.unshift(tierAt(effects, tiers[0].start - 1, level, haste));
  const canHigher = () => (tiers.at(-1) as TierSpan).next != null && ((tiers.at(-1) as TierSpan).next as number) <= gearMost;
  const higher = () => tiers.push(tierAt(effects, (tiers.at(-1) as TierSpan).next as number, level, haste));
  for (let k = 0; k < near && tiers[0].start > 0; k++) {
    lower();
  }
  for (let k = 0; k < near && canHigher(); k++) {
    higher();
  }
  while (tiers.length < 2 * near + 1 && canHigher()) {
    higher();
  }
  while (tiers.length < 2 * near + 1 && tiers[0].start > 0) {
    lower();
  }
  if (gearMost !== Infinity && (tiers.at(-1) as TierSpan).next != null && ((tiers.at(-1) as TierSpan).next as number) > gearMost) {
    (tiers.at(-1) as TierSpan).next = null;
  }

  // 2. each tier on the panel scale, with its values and which of them changed at its start
  const row = (t: TierSpan): TierRow => {
    const values = valuesAt(t.start);
    const before = t.start > 0 ? valuesAt(t.start - 1) : null;
    return {
      start: base + t.start,
      next: t.next == null ? null : base + t.next,
      values,
      changed: values.map((v, k) => !before || v !== before[k]),
    };
  };
  const rows = tiers.map(row);

  // 3. where the value sits in its tier
  const cur = rowIndexAt(rows, base + gear);
  const at = rows[cur];
  return {
    base,
    kinds: effects.map(effect => effect.kind),
    rows,
    cur,
    spare: base + gear - at.start,
    toNext: at.next == null ? null : at.next - base - gear,
    under: Math.floor(total) < base,
  };
}

/* The sizes of a stat's tiers at `level` in points, ascending and distinct, read from `count` tiers after the first
   (speed's first step is shorter, so it is left out; the job's `haste` makes some speed steps longer). `kind` picks one
   effect (Tenacity's two step on their own); without it, all of them, as tierLadder counts tiers. Null for a stat
   without tiers. */
export function tierSizes(
  job: JobContext,
  stat: StatKey,
  level: number,
  haste = 0,
  kind: EffectKind | null = null,
  count = 60,
): number[] | null {
  const all = effectsOf(job, stat);
  if (all == null) {
    return null;
  }
  const effects = kind == null ? all : all.filter(effect => effect.kind === kind);
  const sizes = new Set<number>();
  let t = tierAt(effects, 0, level, haste);
  for (let k = 0; k < count && t.next != null; k++) {
    if (k > 0 || effects[0].kind !== 'gcd') {
      sizes.add(t.next - t.start);
    }
    t = tierAt(effects, t.next, level, haste);
  }
  return [...sizes].sort((a, b) => a - b);
}

/* For tier ranking: a function from a stat's total (gear points, plus food) at `level` to its tier, a number that rises
   with every better tier and never falls with more points; null for stats without tiers (main stat, Vitality: every
   point counts). Speed's tier is its GCD with the job's `haste` (percent), in hundredths, negated so that faster is
   higher; Tenacity's is its mitigation step (RANK_STEP); the others as statTier. */
export function rankTierOf(job: JobContext, stat: DimKey, level: number, haste = 0): ((total: number) => number) | null {
  if (stat === job.speedKey) {
    return total => -Math.round(gcdFor(Math.max(0, total), level, BASE_GCD_MS, haste) * 100);
  }
  const step = effectsOf(job, stat) ? ((isOneOf(job.stats, stat) ? RANK_STEP[stat] : undefined) ?? stepOf(job, stat)) : null;
  if (step == null) {
    return null;
  }
  const { div } = levelParams(level);
  return total => Math.floor((step * Math.max(0, total)) / div);
}

/* The fewest points with the same tier as `total` under `tierOf` (a rankTierOf function): every tier function rises
   with points, so a binary search finds it. */
export function tierStart(tierOf: (total: number) => number, total: number): number {
  const tier = tierOf(total);
  let lo = 0,
    hi = total;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (tierOf(mid) >= tier) {
      hi = mid;
    } else {
      lo = mid + 1;
    }
  }
  return lo;
}
