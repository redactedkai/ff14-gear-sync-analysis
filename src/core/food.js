/* Food: HQ meals raise one or two combat substats by a percentage of the whole stat (the character's base at the level
   plus gear), up to the meal's maximum: bonus = min(max, floor(percent x (base + gear) / 100)). Community formula
   (xivgear, Ariyala); applied unchanged under item level and level sync (player reports, xivgear). Both inferred
   (docs/mechanics/math.md, section 6, Food). Vitality from food is not counted: it has no tier and its base needs the job and
   clan modifiers.
   A meal's effect never falls with more gear points and gear + food rises with every gear point, so ranking gear sets by
   gear totals gives the same order as ranking them with food: the optimizer needs no change, and the best food for a goal
   can be picked after the search (bestFood). */
import { LEVEL_MAIN } from './constants.js';
import { speedParams } from './speed.js';
import { FOODS } from './tables.js';

/* The neutral stat a raw food stat means for the job, or null when the job has no such stat (Spell Speed food for a
   Skill Speed job, Tenacity food for a job without Tenacity). */
function neutralOf(job, raw) {
  if (raw === 'crit' || raw === 'det' || raw === 'dh') return raw;
  if (raw === job.profile.spd) return 'spd';
  if (raw === job.profile.spec) return 'spec';
  return null;
}

/* The base a neutral substat starts from at character level `level`: the level's main stat base for Determination and
   Piety (LEVEL_MAIN), ParamGrow BaseSpeed for the others. */
export function statBase(job, stat, level) {
  const lv = Math.max(1, Math.min(100, level | 0));
  if (stat === 'det' || (stat === 'spec' && job.profile.spec === 'piety')) return LEVEL_MAIN[lv - 1];
  return speedParams(lv).sub;
}

/* `a` is never worse than `b`: it has every stat of `b` with at least its percent and maximum (a bonus never falls
   with a higher percent or maximum, and an extra stat only adds). */
function covers(a, b) {
  return b.stats.every(s => a.stats.some(x => x.stat === s.stat && x.pct >= s.pct && x.max >= s.max));
}

/* The job's food choices, in the job's substat order: {key, name, ilvl, stats: [{stat, pct, max}]}, key = the neutral
   stats joined by '+', primary first ('det+crit'). Only meals whose every stat the job has. Each stat pair (or single
   stat) is its newest meal: FOODS is sorted by item level, and within a pair a newer meal never has a lower maximum
   (tests/unit/food.test.js). A choice that another one covers (every stat at least as high) is left out, since it can
   never give more: an old Critical Hit + Determination meal next to a new Determination + Critical Hit one, a one-stat
   meal next to a newer pair with that stat. Cached per job. */
const choiceCache = new Map();
export function foodChoices(job) {
  if (choiceCache.has(job.jobId)) return choiceCache.get(job.jobId);
  const byKey = new Map();
  for (const [name, ilvl, stats] of FOODS) {
    const mapped = stats.map(([raw, pct, max]) => ({ stat: neutralOf(job, raw), pct, max }));
    if (mapped.some(s => s.stat == null)) continue;
    byKey.set(mapped.map(s => s.stat).join('+'), { name, ilvl, stats: mapped });
  }
  const all = [...byKey].map(([key, f]) => ({ key, ...f }));
  // of two that cover each other (the same stats and maxima), the first is kept
  const kept = all.filter((c, i) => !all.some((d, j) => j !== i && covers(d, c) && !(covers(c, d) && j > i)));
  const rank = s => job.substats.indexOf(s);
  const out = kept
    .map(f => Object.freeze({ ...f, stats: Object.freeze(f.stats.map(s => Object.freeze(s))) }))
    .sort(
      (a, b) =>
        rank(a.stats[0].stat) - rank(b.stats[0].stat) || a.stats.length - b.stats.length || rank(a.stats[1]?.stat) - rank(b.stats[1]?.stat),
    );
  const frozen = Object.freeze(out);
  choiceCache.set(job.jobId, frozen);
  return frozen;
}

/* "Critical Hit + Determination" */
export function foodLabel(job, food) {
  return food.stats.map(s => job.label[s.stat]).join(' + ');
}

/* What `food` adds to gear totals `totals` ({neutral stat: gear points}) at `level`: {stat: {bonus, capped}}, capped when
   the percentage reaches the meal's maximum. */
export function foodBonus(job, food, totals, level) {
  const out = {};
  for (const s of food.stats) {
    const pctOf = Math.floor((s.pct * (statBase(job, s.stat, level) + (totals[s.stat] || 0))) / 100);
    out[s.stat] = { bonus: Math.min(s.max, pctOf), capped: pctOf >= s.max };
  }
  return out;
}

/* Gear totals plus a foodBonus result. */
export function withFood(totals, bonus) {
  const t = { ...totals };
  for (const [stat, b] of Object.entries(bonus)) t[stat] = (t[stat] || 0) + b.bonus;
  return t;
}

/* The choice that gives the highest totals with food for `keys` (target, tiebreak 1, tiebreak 2; empty ones ignored),
   compared in that order; then the most food points in all; then the first in `choices`. Null when there are none. */
export function bestFood(job, choices, totals, level, keys) {
  const ks = keys.filter(Boolean);
  let best = null,
    bestVals = null;
  for (const c of choices) {
    const bonus = foodBonus(job, c, totals, level);
    const t = withFood(totals, bonus);
    const vals = [...ks.map(k => t[k] || 0), Object.values(bonus).reduce((n, b) => n + b.bonus, 0)];
    const i = bestVals ? vals.findIndex((v, j) => v !== bestVals[j]) : 0;
    if (!bestVals || (i >= 0 && vals[i] > bestVals[i])) {
      best = c;
      bestVals = vals;
    }
  }
  return best;
}

/* The fewest gear points of `stat` whose total with `food` (null for none) reaches `total` at `level`. Gear plus food
   rises with every gear point, so a binary search finds it; for Target GCD and tier ranking, which set minimums on
   totals with food while the optimizer works on gear points. */
export function gearNeeded(job, food, stat, total, level) {
  const s = food?.stats.find(x => x.stat === stat);
  if (!s || total <= 0) return Math.max(0, total);
  const reach = g => g + foodBonus(job, { stats: [s] }, { [stat]: g }, level)[stat].bonus >= total;
  let lo = 0,
    hi = total;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (reach(mid)) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}
