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
  const m = 1000 + Math.ceil(130 * (sub - speed) / div);
  return Math.floor(baseMs * m / 10000) / 100;
}

/* DoT/HoT tick multiplier from gear speed, e.g. 1.012 */
export function dotMult(gearSpd, level) {
  const { div } = speedParams(level);
  return (1000 + Math.floor(130 * gearSpd / div)) / 1000;
}

/* Every gear-speed value where the GCD drops a step, from 0 to 1200 speed. */
export function gcdTiers(level, baseMs) {
  const out = [];
  let last = gcdFor(0, level, baseMs);
  out.push({ spd: 0, gcd: last });
  for (let s = 1; s <= 1200; s++) {
    const g = gcdFor(s, level, baseMs);
    if (g < last - 1e-9) { out.push({ spd: s, gcd: g }); last = g; }
  }
  return out;
}
