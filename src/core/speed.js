/* Speed stat -> GCD and DoT/HoT tick scaling (AkhMorning's formulas), using ParamGrow level data. */
import { PG } from './tables.js';

/* sub = BaseSpeed (the character's own speed at this level), div = LevelModifier,
   sync = the game's default sync item level for this level */
export function speedParams(level) {
  const r = PG[Math.max(1, Math.min(100, level | 0)) - 1];
  return { sub: r[0], div: r[1], sync: r[2] };
}

/* GCD in seconds for `gearSpd` speed from gear (the base `sub` is added here), base recast in ms. */
export function gcdFor(gearSpd, level, baseMs) {
  const { sub, div } = speedParams(level);
  baseMs = baseMs || 2500;
  const speed = sub + gearSpd;
  const m = 1000 + Math.ceil((130 * (sub - speed)) / div);
  return Math.floor((baseMs * m) / 10000) / 100;
}

/* DoT/HoT tick multiplier from gear speed, e.g. 1.012 */
export function dotMult(gearSpd, level) {
  const { div } = speedParams(level);
  return (1000 + Math.floor((130 * gearSpd) / div)) / 1000;
}

/* The GCD step that `gearSpd` falls in: {gcd, start, next, nextGcd}. `start` is the lowest gear speed with the same
   GCD, `next` the lowest with a shorter one (null if none within 100,000). The GCD never rises with more speed,
   so both are found by binary search, at any speed (docs/audit-2.md A3: a fixed scan window used to stop at 1,200). */
export function gcdTierAt(gearSpd, level, baseMs) {
  const spd = Math.max(0, Math.floor(gearSpd));
  const gcd = gcdFor(spd, level, baseMs);
  const lowest = (lo, hi, pred) => {
    // smallest s in [lo, hi] with pred(s), given pred is false then true; hi must satisfy pred
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (pred(mid)) hi = mid;
      else lo = mid + 1;
    }
    return lo;
  };
  const start = lowest(0, spd, s => gcdFor(s, level, baseMs) <= gcd);
  const LIMIT = 100000;
  const shorter = s => gcdFor(s, level, baseMs) < gcd;
  const next = shorter(spd + LIMIT) ? lowest(spd + 1, spd + LIMIT, shorter) : null;
  return { gcd, start, next, nextGcd: next == null ? null : gcdFor(next, level, baseMs) };
}

/* Every gear-speed value up to `maxSpd` (default 1,200) where the GCD drops a step. */
export function gcdTiers(level, baseMs, maxSpd = 1200) {
  const out = [];
  let last = gcdFor(0, level, baseMs);
  out.push({ spd: 0, gcd: last });
  for (let s = 1; s <= maxSpd; s++) {
    const g = gcdFor(s, level, baseMs);
    if (g < last - 1e-9) {
      out.push({ spd: s, gcd: g });
      last = g;
    }
  }
  return out;
}
