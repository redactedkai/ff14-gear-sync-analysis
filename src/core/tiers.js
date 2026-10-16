/* Substat tiers: each substat's effect moves in steps, so the points between two steps do nothing. For a total of
   gear points g at a level, the effect is floor(c x g / div) per mille, with div = ParamGrow.LevelModifier and a step
   size c per effect (AkhMorning's formulas, which xivgear's xivmath matches; docs/mechanics/math.md, section 6):
     Critical Hit rate 200 (plus a base 5%), Determination 140, Direct Hit 550, Tenacity damage 112, Piety 150 (MP per
     tick, not per mille); Skill/Spell Speed by its GCD (speed.js).
   The character's base value of each stat cancels out of these formulas, so the tier depends on the gear points alone.
   Food is not counted: it would move every total. Main stats and Vitality have no tiers here. */
import { BASE_GCD_MS, gcdFor, gcdTierAt, speedParams } from './speed.js';

const STEP = { crit: 200, det: 140, dh: 550, ten: 112, piety: 150 };

/* The step size of a neutral stat for the job, or null for stats without tiers (main, vit, a missing spec). */
function stepOf(job, stat) {
  if (stat === 'spec') return job.profile.spec ? STEP[job.profile.spec] : null;
  return STEP[stat] ?? null;
}

/* A per mille value as a percent with one decimal: 193 -> "19.3%". */
const pct = n => `${(n / 10).toFixed(1)}%`;

/* The tier of `stat` with `points` from gear at character `level`: {effect, start, next}, or null for a stat without
   tiers. effect: display text ("19.3%", "+8.3%", "2.49s", "+120 MP"); start: the fewest points with the same effect;
   next: the fewest with a better one (null if none). So points - start can be spent elsewhere without losing the
   effect, and next - points are needed for the next step. */
export function statTier(job, stat, points, level) {
  const gear = Math.max(0, Math.floor(points || 0));
  // speed's effect is its GCD, which has its own steps (speed.js)
  if (stat === 'spd') {
    const t = gcdTierAt(gear, level);
    return { effect: `${t.gcd.toFixed(2)}s`, start: t.start, next: t.next };
  }
  const step = stepOf(job, stat);
  if (step == null) return null;
  const { div } = speedParams(level);
  // the effect in per mille (MP for Piety), and the fewest points that give it and the next one: the smallest g with
  // floor(step x g / div) >= tier, and >= tier + 1
  const tier = Math.floor((step * gear) / div);
  const start = Math.ceil((tier * div) / step);
  const next = Math.ceil(((tier + 1) * div) / step);
  let effect;
  if (stat === 'crit')
    effect = pct(tier + 50); // the rate starts at 5% (50 per mille)
  else if (stat === 'dh') effect = pct(tier);
  else if (stat === 'spec' && job.profile.spec === 'piety') effect = `+${tier} MP`;
  else effect = `+${pct(tier)}`; // Determination, Tenacity: damage
  return { effect, start, next };
}

/* Tenacity's other effect, damage taken, steps every 200 (xivmath `tenacityIncomingDmg`). Tier ranking uses it: players
   stack Tenacity for mitigation (owner, 2026-10-16). The Tier row above still shows the damage step (112). */
const TEN_MITIGATION_STEP = 200;

/* For tier ranking: a function from a stat's total (gear points, plus food) at `level` to its tier, a number that rises
   with every better tier and never falls with more points; null for stats without tiers (main stat, Vitality: every
   point counts). Speed's tier is its GCD with the job's `haste` (percent), in hundredths, negated so that faster is
   higher; Tenacity's is its mitigation step (TEN_MITIGATION_STEP); the others as statTier. */
export function rankTierOf(job, stat, level, haste = 0) {
  if (stat === 'spd') return total => -Math.round(gcdFor(Math.max(0, total), level, BASE_GCD_MS, haste) * 100);
  const step = stat === 'spec' && job.profile.spec === 'ten' ? TEN_MITIGATION_STEP : stepOf(job, stat);
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
