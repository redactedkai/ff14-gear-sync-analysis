/* Speed stat -> GCD and DoT/HoT tick scaling (AkhMorning's formulas), using ParamGrow level data. */
import { PG } from './tables.js';
import { EXPANSIONS, HASTE } from './constants.js';

/* The recast of a weaponskill or spell before speed: 2.5 s, in ms (the GCD every speed formula here starts from). */
export const BASE_GCD_MS = 2500;
/* Search ceiling for the speed that reaches a GCD: far above any real gear speed (a few thousand). */
const SPEED_SEARCH_LIMIT = 100000;

/* sub = BaseSpeed (the character's own speed at this level), div = LevelModifier,
   sync = the item level gear is synced to at this level (ParamGrow.ItemLevelSync; level sync, sync-target.js) */
export function speedParams(level) {
  const row = PG[Math.max(1, Math.min(100, level | 0)) - 1]; // PG has one row per level 1..100
  return { sub: row[0], div: row[1], sync: row[2] };
}

/* Item level span of each expansion: from the previous expansion's level-cap sync item level to its own (the last
   one is open-ended). [{short, name, from, to}], `from` of the first and `to` of the last are null. */
export function expansionBounds() {
  return EXPANSIONS.map(([short, name, cap], i) => ({
    short,
    name,
    from: i ? speedParams(EXPANSIONS[i - 1][2]).sync : null,
    to: i < EXPANSIONS.length - 1 ? speedParams(cap).sync : null,
  }));
}

/* The haste a job counts in its Target GCD at `level` (HASTE in constants.js): {name, pct}, or null for none. */
export function hasteFor(jobId, level) {
  const haste = HASTE[jobId];
  if (!haste) return null;
  // steps are in level order: the last one the level has reached applies
  let pct = 0;
  for (const [from, stepPct] of haste.steps) if (level >= from) pct = stepPct;
  return pct ? { name: haste.name, pct } : null;
}

/* GCD in seconds for `gearSpd` speed from gear (the base `sub` is added here), base recast in ms, `haste` in percent.
   The haste comes after the speed step is rounded down, then the result is rounded down again (xivgear's formula,
   xivmath.ts; with no haste it is AkhMorning's). */
export function gcdFor(gearSpd, level, baseMs, haste = 0) {
  const { sub, div } = speedParams(level);
  baseMs = baseMs || BASE_GCD_MS;
  const speed = sub + gearSpd;
  // the recast multiplier in per mille: 1000 minus 130 per `div` points of speed above the base (Math.ceil of the
  // negative term rounds toward 1000, so a part step gives nothing)
  const speedMod = 1000 + Math.ceil((130 * (sub - speed)) / div);
  const recastMs = Math.floor((baseMs * speedMod) / 1000);
  // haste in percent, then down to hundredths of a second: ms x (100 - haste) / 100 / 10, floored, / 100
  return Math.floor((recastMs * (100 - haste)) / 1000) / 100;
}

/* DoT/HoT tick multiplier from gear speed, e.g. 1.012 */
export function dotMult(gearSpd, level) {
  const { div } = speedParams(level);
  return (1000 + Math.floor((130 * gearSpd) / div)) / 1000;
}

/* The GCD step that `gearSpd` falls in: {gcd, start, next, nextGcd}. `start` is the lowest gear speed with the same
   GCD, `next` the lowest with a shorter one (null if none within 100,000). The GCD never rises with more speed,
   so both are found by binary search, at any speed (an earlier fixed scan window stopped at 1,200). */
export function gcdTierAt(gearSpd, level, baseMs, haste = 0) {
  const spd = Math.max(0, Math.floor(gearSpd));
  const gcd = gcdFor(spd, level, baseMs, haste);
  // the step starts at the lowest speed with this GCD (or shorter, which below spd cannot happen)
  const start = lowest(0, spd, s => gcdFor(s, level, baseMs, haste) <= gcd);
  const shorter = s => gcdFor(s, level, baseMs, haste) < gcd;
  const next = shorter(spd + SPEED_SEARCH_LIMIT) ? lowest(spd + 1, spd + SPEED_SEARCH_LIMIT, shorter) : null;
  return { gcd, start, next, nextGcd: next == null ? null : gcdFor(next, level, baseMs, haste) };
}

/* smallest s in [lo, hi] with pred(s), given pred is false then true; hi must satisfy pred */
function lowest(lo, hi, pred) {
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (pred(mid)) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/* The gear speed (beyond the base) that a Target GCD of `gcd` seconds asks for, 2.5 s base:
   - mode 'min' ("this GCD or faster"): {min, max: null}, min the lowest speed whose GCD is `gcd` or shorter;
   - mode 'exact': {min, max}, the speeds whose GCD is exactly `gcd`.
   Null when no speed gives it: (exact) slower than the GCD with no speed
   (2.40 for a Ninja, whose no-speed GCD is 2.12). The GCD falls 0.01 s at a time, with or without haste, so every value
   in between is some speed's (speed.test.js). A target at or above the no-speed GCD is met by any speed: {min: 0} in
   'min' mode. Speeds are totals the GCD formula sees (gear, plus food when the caller adds it). */
export function speedForGcd(gcd, level, mode, haste = 0) {
  const gcdAt = s => gcdFor(s, level, BASE_GCD_MS, haste);
  const target = Math.round(gcd * 100) / 100; // to hundredths, as the GCD is
  // even the most speed cannot reach it
  if (gcdAt(SPEED_SEARCH_LIMIT) > target) return null;
  const min = lowest(0, SPEED_SEARCH_LIMIT, s => gcdAt(s) <= target);
  if (mode !== 'exact') return { min, max: null };
  // exact: the lowest speed must land on the target itself (a target above the no-speed GCD lands on nothing), and the
  // band ends one below the first speed that is faster still
  if (gcdAt(min) !== target) return null;
  const next = gcdAt(SPEED_SEARCH_LIMIT) < target ? lowest(min, SPEED_SEARCH_LIMIT, s => gcdAt(s) < target) : null;
  return { min, max: next == null ? SPEED_SEARCH_LIMIT : next - 1 };
}

/* Every gear-speed value up to `maxSpd` (default 1,200) where the GCD drops a step. */
export function gcdTiers(level, baseMs, maxSpd = 1200, haste = 0) {
  const out = [];
  let last = gcdFor(0, level, baseMs, haste);
  out.push({ spd: 0, gcd: last });
  for (let s = 1; s <= maxSpd; s++) {
    const g = gcdFor(s, level, baseMs, haste);
    if (g < last - 1e-9) {
      out.push({ spd: s, gcd: g });
      last = g;
    }
  }
  return out;
}
