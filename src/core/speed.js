/* Speed stat -> GCD and DoT/HoT tick scaling (AkhMorning's formulas), using ParamGrow level data. */
import { PG } from './tables.js';
import { EXPANSIONS, HASTE, GCD_FLOOR_MS } from './constants.js';

/* sub = BaseSpeed (the character's own speed at this level), div = LevelModifier,
   sync = the item level gear is synced to at this level (ParamGrow.ItemLevelSync; level sync, sync-target.js) */
export function speedParams(level) {
  const r = PG[Math.max(1, Math.min(100, level | 0)) - 1];
  return { sub: r[0], div: r[1], sync: r[2] };
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
  const h = HASTE[jobId];
  if (!h) return null;
  let step = null;
  for (const s of h.steps) if (level >= s[0]) step = s;
  return step ? { name: h.name, pct: step[1], level: step[0], source: step[2] } : null;
}

/* GCD in seconds for `gearSpd` speed from gear (the base `sub` is added here), base recast in ms, `haste` in percent.
   The haste comes after the speed step is rounded down, then the result is rounded down again (xivgear's formula,
   xivmath.ts; with no haste it is AkhMorning's). The speed multiplier is at least 0 and the result at least 1.50 s
   (GCD_FLOOR_MS: the game client's floor, second-hand; xivgear and AkhMorning have none). */
export function gcdFor(gearSpd, level, baseMs, haste = 0) {
  const { sub, div } = speedParams(level);
  baseMs = baseMs || 2500;
  const speed = sub + gearSpd;
  const m = Math.max(0, 1000 + Math.ceil((130 * (sub - speed)) / div));
  const ms = Math.floor((baseMs * m) / 1000);
  return Math.max(GCD_FLOOR_MS / 10, Math.floor((ms * (100 - haste)) / 1000)) / 100;
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
  const start = lowest(0, spd, s => gcdFor(s, level, baseMs, haste) <= gcd);
  const LIMIT = 100000;
  const shorter = s => gcdFor(s, level, baseMs, haste) < gcd;
  const next = shorter(spd + LIMIT) ? lowest(spd + 1, spd + LIMIT, shorter) : null;
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
   (2.40 for a Ninja, whose no-speed GCD is 2.12), or (either mode) below the 1.50 s floor. At the floor itself no
   speed is too much: 'exact' 1.50 has no maximum (max 100,000). The GCD falls 0.01 s at a time, with or without haste, so every value
   in between is some speed's (speed.test.js). A target at or above the no-speed GCD is met by any speed: {min: 0} in
   'min' mode. Speeds are totals the GCD formula sees (gear, plus food when the caller adds it). */
export function speedForGcd(gcd, level, mode, haste = 0) {
  const LIMIT = 100000;
  const at = s => gcdFor(s, level, 2500, haste);
  const target = Math.round(gcd * 100) / 100;
  if (at(LIMIT) > target) return null;
  const min = lowest(0, LIMIT, s => at(s) <= target);
  if (mode !== 'exact') return { min, max: null };
  if (at(min) !== target) return null;
  const next = at(LIMIT) < target ? lowest(min, LIMIT, s => at(s) < target) : null;
  return { min, max: next == null ? LIMIT : next - 1 };
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
