/* How the math works, GCD: how speed becomes the GCD at a level, on its own settings (a level, a haste and a speed;
   not the job, sync or optimizer). The facts for one speed, the speed one 0.01 s step takes at every level, and the GCD
   steps around the speed. Pure: no Alpine, so Node can test it. */
import { HASTE, jobById } from '../../core/constants.js';
import { BASE_GCD_MS, dotMult, gcdFor, gcdTierAt, hasteFor, recastMult } from '../../core/speed.js';
import { levelParams } from '../../core/level-params.js';
import { MAX_SPEED } from '../../core/tables.js';
import { speedStepChartSvg } from '../sync-charts.js';

/* The levels the tab covers: every level of the game, whatever the job (its own setting). */
export const GCD_LEVELS = MAX_SPEED.length;
/* Steps shown either side of the speed's step in the table (13 rows). */
export const GCD_STEPS_NEAR = 6;
/* Steps averaged for "speed per step": the first is short (the base sits partway into it), so a few are read. */
const STEPS_AVERAGED = 10;

/* The Haste menu: none, then each job with always-on haste and every percent it reaches ("Samurai, Fuka: 10/13%"); the
   chart marks the levels. [{value: job id or '', label}]. */
export const HASTE_OPTIONS = Object.freeze([
  Object.freeze({ value: '', label: 'None' }),
  ...Object.entries(HASTE).map(([id, h]) =>
    Object.freeze({
      value: id,
      label: `${jobById(id).name}, ${h.name}: ${h.steps.map(st => st.pct).join('/')}%`,
    }),
  ),
]);

/* `level` held to 1 and GCD_LEVELS: {level, note}, note "Lowered to 100, the highest level." (or raised to 1) when it
   was out of range, as the Synced item level field says it. Null for text that is not a whole number. */
export function gcdLevelInput(text) {
  const v = Number(text);
  if (text === '' || !Number.isInteger(v)) return null;
  if (v > GCD_LEVELS) return { level: GCD_LEVELS, note: `Lowered to ${GCD_LEVELS}, the highest level.` };
  if (v < 1) return { level: 1, note: 'Raised to 1, the lowest level.' };
  return { level: v, note: '' };
}

/* The speed range at `level`: {base, most}, total speed (base + gear + food) from the level's base to the most any job
   can have there (MAX_SPEED). */
export function speedRange(level) {
  return { base: levelParams(level).sub, most: MAX_SPEED[level - 1] };
}

/* About how much speed a 0.01 s step takes at `level` with `haste` (percent): the first STEPS_AVERAGED steps' average. */
export function speedPerStep(level, haste = 0) {
  let at = 0;
  for (let k = 0; k < STEPS_AVERAGED; k++) {
    const next = gcdTierAt(at, level, BASE_GCD_MS, haste).next;
    if (next == null) break;
    at = next;
  }
  return at / STEPS_AVERAGED;
}

/* "−15.7%", or "0.0%" for no cut: what a multiplier below 1 takes off. */
const cutText = mult => (mult >= 1 ? '0.0%' : `−${((1 - mult) * 100).toFixed(1)}%`);

/* The GCD steps around `gear` (speed above the base): ROWS steps, the one `gear` is in kept in the middle unless it is
   near the base or the 1.5 s floor, where the rows stop at the end instead of leaving rows empty (as Substat tiers).
   [{gear (the step's first gear speed), gcd, cur}]. */
function stepWindow(level, haste, gear) {
  const ROWS = 2 * GCD_STEPS_NEAR + 1;
  const tierAt = g => gcdTierAt(g, level, BASE_GCD_MS, haste);
  const steps = [tierAt(gear)];
  const lower = () => steps.unshift(tierAt(steps[0].start - 1));
  const higher = () => steps.push(tierAt(steps.at(-1).next));
  for (let k = 0; k < GCD_STEPS_NEAR && steps[0].start > 0; k++) lower();
  for (let k = 0; k < GCD_STEPS_NEAR && steps.at(-1).next != null; k++) higher();
  while (steps.length < ROWS && steps.at(-1).next != null) higher();
  while (steps.length < ROWS && steps[0].start > 0) lower();
  return steps.map(st => ({ gear: st.start, gcd: st.gcd, cur: st.start <= gear && (st.next == null || gear < st.next) }));
}

/* The GCD tab at `level` with `hasteJob` (a HASTE job id, or '' for none) and `speed` (total speed asked for, or null for
   the base; held to speedRange). `width`: the chart's container width in px. Shape:
   - level, base, most, speed (the one used), fill (the slider's position, percent);
   - facts: [{value, label}] for the GCD, GCDs a minute, speed to the next step, the cut to cast and recast times, the
     DoT/HoT/auto-attack multiplier, and the haste when one is picked;
   - steps: [{speed, gcd, cut, cur, out}] (out: more than any job can have at this level);
   - chartSvg: the speed per step at every level, the haste's levels marked. */
export function gcdView(level, hasteJob, speed, width) {
  const { base, most } = speedRange(level);
  const used = Math.max(base, Math.min(most, speed ?? base));
  const gear = used - base;
  const haste = hasteJob ? hasteFor(hasteJob, level) : null;
  const pct = haste?.pct ?? 0;

  // 1. the facts for the speed
  const gcd = gcdFor(gear, level, BASE_GCD_MS, pct),
    atBase = gcdFor(0, level, BASE_GCD_MS, pct);
  const step = gcdTierAt(gear, level, BASE_GCD_MS, pct);
  const tick = dotMult(gear, level);
  const facts = [
    { value: `${gcd.toFixed(2)}s`, label: `GCD (${atBase.toFixed(2)}s at base)` },
    { value: (60 / gcd).toFixed(1), label: `GCDs / min (${(60 / atBase).toFixed(1)} at base)` },
    step.next == null
      ? { value: '–', label: 'the fastest GCD' }
      : { value: `+${step.next - gear}`, label: `more to reach ${step.nextGcd.toFixed(2)}s` },
    { value: cutText(recastMult(gear, level, pct)), label: `cast and recast times${pct ? `, with ${pct}% haste` : ''}` },
    { value: `${tick > 1 ? '+' : ''}${((tick - 1) * 100).toFixed(1)}%`, label: 'DoT, HoT and auto-attacks' },
  ];
  if (haste) facts.push({ value: `${pct}%`, label: `haste (${haste.name})` });
  else if (hasteJob) facts.push({ value: '0%', label: `${HASTE[hasteJob].name} starts at level ${HASTE[hasteJob].steps[0].level}` });

  // 2. the steps around the speed
  const steps = stepWindow(level, pct, gear).map(st => ({
    speed: base + st.gear,
    gcd: `${st.gcd.toFixed(2)}s`,
    cut: cutText(recastMult(st.gear, level, pct)),
    cur: st.cur,
    out: base + st.gear > most,
  }));

  // 3. the speed per step at every level, with the haste each level has
  const bars = [];
  for (let lv = 1; lv <= GCD_LEVELS; lv++)
    bars.push({ level: lv, speed: speedPerStep(lv, hasteJob ? (hasteFor(hasteJob, lv)?.pct ?? 0) : 0) });
  const marks = hasteJob ? HASTE[hasteJob].steps.map(st => ({ level: st.level, pct: st.pct })) : [];

  return {
    level,
    base,
    most,
    speed: used,
    fill: most > base ? ((used - base) / (most - base)) * 100 : 0,
    facts,
    steps,
    chartSvg: speedStepChartSvg({ bars, level, marks, width }),
  };
}
