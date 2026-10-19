/* Substat tiers: each substat's effect moves in steps, so the points between two steps do nothing. For a total of
   gear points g at a level, the effect is floor(c x g / div) per mille, with div = ParamGrow.LevelModifier and a step
   size c per effect (AkhMorning's formulas, which xivgear's xivmath matches; docs/mechanics/math.md, section 6):
     Critical Hit rate 200 (plus a base 5%), Determination 140, Direct Hit 550, Tenacity damage 112, Piety 150 (MP per
     tick, not per mille); Skill/Spell Speed by its GCD (speed.js).
   The character's base value of each stat cancels out of these formulas, so the tier depends on the gear points alone.
   Food is not counted: it would move every total. Main stats and Vitality have no tiers here. */
import { BASE_GCD_MS, gcdFor, gcdTierAt, speedParams } from './speed.js';
import { statBase } from './food.js';

/* Tenacity's other effect, damage taken, steps every 200 (xivmath `tenacityIncomingDmg`). Tier ranking uses it: players
   stack Tenacity for mitigation (owner, 2026-10-16). The optimizer's Tier row shows the damage step (112). */
const TEN_MITIGATION_STEP = 200;

/* Each substat's effects, in the order the page shows them: [kind, step], step the c in floor(c x g / div) (speed has
   none: its GCD comes from speed.js). Kinds:
     rate: the chance of a critical hit (from 5%) or a direct hit; onCrit: what a critical hit adds (from 40%, always
     the rate + 35%, the same step); dmgHeal: damage and healing done; dmgTaken: Tenacity's cut to damage taken; mp:
     Piety's MP per tick; gcd: the GCD.
   AkhMorning (checked 2026-10-17): Critical Hit, Determination and Tenacity's first effect apply to outgoing healing
   too, Direct Hit to damage only. The first effect is the one the optimizer's Tier row shows (statTier). */
const EFFECTS = {
  crit: [
    ['rate', 200],
    ['onCrit', 200],
  ],
  det: [['dmgHeal', 140]],
  dh: [['rate', 550]],
  spd: [['gcd', null]],
};
/* The special substat's effects, by what it does (JobContext.specKind): Piety's MP, Tenacity's mitigation. */
const SPEC_EFFECTS = {
  mp: [['mp', 150]],
  mitigation: [
    ['dmgHeal', 112],
    ['dmgTaken', TEN_MITIGATION_STEP],
  ],
};

/* The effects of a neutral stat for the job ([kind, step] pairs), or null for stats without tiers (main, vit, a missing
   spec). */
function effectsOf(job, stat) {
  if (stat === 'spec') return job.specKind ? SPEC_EFFECTS[job.specKind] : null;
  return EFFECTS[stat] ?? null;
}

/* The step size of a neutral stat's first effect, or null for speed and stats without tiers. */
function stepOf(job, stat) {
  return effectsOf(job, stat)?.[0][1] ?? null;
}

/* A per mille value as a percent with one decimal: 193 -> "19.3%". */
const pct = n => `${(n / 10).toFixed(1)}%`;

/* An effect's display text from its tier floor(step x g / div) (for gcd: the GCD in seconds): "19.3%" (rate),
   "+54.3%" (onCrit, dmgHeal), "−8.6%" (dmgTaken), "+52" (mp), "2.47s" (gcd). */
function effectText(kind, stat, tier) {
  if (kind === 'gcd') return `${tier.toFixed(2)}s`;
  if (kind === 'rate') return pct(tier + (stat === 'crit' ? 50 : 0)); // the critical hit rate starts at 5% (50 per mille)
  if (kind === 'onCrit') return `+${pct(tier + 400)}`; // a critical hit adds 40% before any Critical Hit
  if (kind === 'dmgTaken') return `−${pct(tier)}`;
  if (kind === 'mp') return `+${tier}`;
  return `+${pct(tier)}`; // dmgHeal
}

/* The tier of `stat` with `points` from gear at character `level`: {effect, start, next}, or null for a stat without
   tiers. effect: display text of the stat's first effect ("19.3%", "+8.3%", "2.49s", "+120 MP"); start: the fewest
   points with the same effect; next: the fewest with a better one (null if none). So points - start can be spent
   elsewhere without losing the effect, and next - points are needed for the next step. */
export function statTier(job, stat, points, level) {
  const gear = Math.max(0, Math.floor(points || 0));
  // speed's effect is its GCD, which has its own steps (speed.js)
  if (stat === 'spd') {
    const t = gcdTierAt(gear, level);
    return { effect: effectText('gcd', stat, t.gcd), start: t.start, next: t.next };
  }
  const effects = effectsOf(job, stat);
  if (effects == null) return null;
  const [kind, step] = effects[0];
  const { div } = speedParams(level);
  // the effect in per mille (MP for Piety), and the fewest points that give it and the next one: the smallest g with
  // floor(step x g / div) >= tier, and >= tier + 1
  const tier = Math.floor((step * gear) / div);
  const start = Math.ceil((tier * div) / step);
  const next = Math.ceil(((tier + 1) * div) / step);
  return { effect: effectText(kind, stat, tier) + (kind === 'mp' ? ' MP' : ''), start, next };
}

/* The tier that gear points g fall in, for some or all of a stat's effects ([kind, step] pairs from effectsOf):
   {start, next} in gear points, next null past the last GCD step. With several effects a tier ends where any of them
   changes. haste in percent (speed only). */
function tierAt(effects, g, level, haste) {
  if (effects[0][0] === 'gcd') {
    const t = gcdTierAt(g, level, BASE_GCD_MS, haste);
    return { start: t.start, next: t.next };
  }
  const { div } = speedParams(level);
  let start = 0,
    next = Infinity;
  for (const [, step] of effects) {
    const tier = Math.floor((step * g) / div);
    start = Math.max(start, Math.ceil((tier * div) / step));
    next = Math.min(next, Math.ceil(((tier + 1) * div) / step));
  }
  return { start, next };
}

/* For How the math works (Substat tiers): the tiers of `stat` around `total`, a character panel value (base + gear, plus food
   when the caller counts it), at `level`, with the job's `haste` (percent; speed only). Null for a stat without tiers.
   Returns {base, kinds, rows, cur, spare, toNext, under}:
   - base: the character's own value (statBase), the panel's lowest; under: `total` was below it (it counts as base);
   - kinds: the stat's effect kinds (EFFECTS), one value per kind in each row;
   - rows: 2 x near + 1 tiers with the value's tier in the middle; near either end (the base, or the last GCD step) the
     rows stop at the end and run on past the other side instead of leaving rows empty (owner, 2026-10-19), so the
     value's tier moves off the middle. Each {start, next, values, changed}: start and next on the panel scale (next
     null for the last tier), values as text, changed[k] true when value k differs from the tier before (all true for
     the first tier). Fewer rows only when the stat has fewer tiers;
   - cur: the index of the value's tier in rows;
   - spare: points above the tier's start; toNext: points to the next tier (null for the last).
   A tier ends where any of the stat's effects changes, so Tenacity's two effects make tiers of uneven size. */
export function tierLadder(job, stat, level, total, near, haste = 0) {
  const effects = effectsOf(job, stat);
  if (effects == null) return null;
  const base = statBase(job, stat, level);
  const { div } = speedParams(level);
  const valuesAt = g =>
    effects.map(([kind, step]) =>
      effectText(kind, stat, kind === 'gcd' ? gcdFor(g, level, BASE_GCD_MS, haste) : Math.floor((step * g) / div)),
    );

  // 1. the value's tier, up to `near` tiers below it and above it, then more on one side for the rows the other lacks
  const gear = Math.max(0, Math.floor(total) - base);
  const tiers = [tierAt(effects, gear, level, haste)];
  const lower = () => tiers.unshift(tierAt(effects, tiers[0].start - 1, level, haste));
  const higher = () => tiers.push(tierAt(effects, tiers.at(-1).next, level, haste));
  for (let k = 0; k < near && tiers[0].start > 0; k++) lower();
  for (let k = 0; k < near && tiers.at(-1).next != null; k++) higher();
  while (tiers.length < 2 * near + 1 && tiers.at(-1).next != null) higher();
  while (tiers.length < 2 * near + 1 && tiers[0].start > 0) lower();
  const cur = tiers.findIndex(t => t.start <= gear && (t.next == null || gear < t.next));

  // 2. each tier on the panel scale, with its values and which of them changed at its start
  const row = t => {
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
  const at = tiers[cur];
  return {
    base,
    kinds: effects.map(e => e[0]),
    rows,
    cur,
    spare: gear - at.start,
    toNext: at.next == null ? null : at.next - gear,
    under: Math.floor(total) < base,
  };
}

/* The sizes of a stat's tiers at `level` in points, ascending and distinct, read from `count` tiers after the first
   (speed's first step is shorter, so it is left out; the job's `haste` makes some speed steps longer). `kind` picks one
   effect (Tenacity's two step on their own); without it, all of them, as tierLadder counts tiers. Null for a stat
   without tiers. */
export function tierSizes(job, stat, level, haste = 0, kind = null, count = 60) {
  const all = effectsOf(job, stat);
  if (all == null) return null;
  const effects = kind == null ? all : all.filter(e => e[0] === kind);
  const sizes = new Set();
  let t = tierAt(effects, 0, level, haste);
  for (let k = 0; k < count && t.next != null; k++) {
    if (k > 0 || effects[0][0] !== 'gcd') sizes.add(t.next - t.start);
    t = tierAt(effects, t.next, level, haste);
  }
  return [...sizes].sort((a, b) => a - b);
}

/* For tier ranking: a function from a stat's total (gear points, plus food) at `level` to its tier, a number that rises
   with every better tier and never falls with more points; null for stats without tiers (main stat, Vitality: every
   point counts). Speed's tier is its GCD with the job's `haste` (percent), in hundredths, negated so that faster is
   higher; Tenacity's is its mitigation step (TEN_MITIGATION_STEP); the others as statTier. */
export function rankTierOf(job, stat, level, haste = 0) {
  if (stat === 'spd') return total => -Math.round(gcdFor(Math.max(0, total), level, BASE_GCD_MS, haste) * 100);
  const step = stat === 'spec' && job.specKind === 'mitigation' ? TEN_MITIGATION_STEP : stepOf(job, stat);
  if (step == null) return null;
  const { div } = speedParams(level);
  return total => Math.floor((step * Math.max(0, total)) / div);
}

/* The fewest points with the same tier as `total` under `tierOf` (a rankTierOf function): every tier function rises
   with points, so a binary search finds it. */
export function tierStart(tierOf, total) {
  const tier = tierOf(total);
  let lo = 0,
    hi = total;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (tierOf(mid) >= tier) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}
