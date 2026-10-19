/* Food: HQ meals raise one or two combat substats, and Vitality, by a percentage of the whole stat (the character's
   base at the level plus gear), up to the meal's maximum: bonus = min(max, floor(percent x (base + gear) / 100)).
   Verified by the owner in a synced duty (2026-10-18; xivgear and Ariyala use it too), so it applies unchanged under
   item level and level sync (docs/mechanics/math.md, section 6, Food). Vitality's base leaves out the clan's bonus
   (-2 to +3), which the page does not ask for, so its food can be a point lower than in game.
   A meal's effect never falls with more gear points and gear + food rises with every gear point, so ranking gear sets by
   gear totals gives the same order as ranking them with food: the optimizer needs no change, and the best food for a goal
   can be picked after the search (bestFood). */
import { LEVEL_MAIN } from './constants.js';
import { speedParams } from './speed.js';
import { FOODS, MAX_LEVEL } from './tables.js';

/* The neutral stat a raw food stat means for the job, or null when the job has no such stat (Spell Speed food for a
   Skill Speed job, Tenacity food for a job without Tenacity). */
function neutralOf(job, raw) {
  if (raw === 'crit' || raw === 'det' || raw === 'dh') return raw;
  if (raw === job.profile.spd) return 'spd';
  if (raw === job.profile.spec) return 'spec';
  return null;
}

/* The base a neutral stat starts from at character level `level`, as the character panel counts it: for the main stat
   and Vitality the level's main stat base (LEVEL_MAIN) x the job's modifier (ClassJob; floor, as AkhMorning and xivgear
   do), without the clan's bonus (-3 to +3, which the page does not ask for); the level's main stat base for
   Determination and Piety; ParamGrow BaseSpeed for the other substats. */
export function statBase(job, stat, level) {
  const lv = Math.max(1, Math.min(MAX_LEVEL, level | 0));
  // the main stat and Vitality: the job's share of the main stat base
  if (stat === 'main' || stat === 'vit') return Math.floor((LEVEL_MAIN[lv - 1] * job.attributeMods[stat]) / 100);
  // Determination and Piety start from the main stat base, the other substats from the speed base
  if (stat === 'det' || (stat === 'spec' && job.specKind === 'mp')) return LEVEL_MAIN[lv - 1];
  return speedParams(lv).sub;
}

/* Every stat line of a foodChoices entry, Vitality included: [{stat, pct, max}]. */
function foodLines(food) {
  return food.vit ? [...food.stats, food.vit] : food.stats;
}

/* `a` is never worse than `b`: it has every stat of `b`, Vitality included, with at least its percent and maximum (a
   bonus never falls with a higher percent or maximum, and an extra stat only adds). */
function covers(a, b) {
  return foodLines(b).every(s => foodLines(a).some(x => x.stat === s.stat && x.pct >= s.pct && x.max >= s.max));
}

/* Every HQ meal the job can use, oldest first (FOODS order, by item level): {key, name, ilvl, pair, stats: [{stat, pct,
   max}], vit: {stat: 'vit', pct, max} or null}; key = the meal's name (unique in FOODS), pair = its neutral stats
   joined by '+', primary first ('det+crit'). Only meals whose every stat the job has: 182 for Astrologian. The result's
   Food menu lists them all; foodChoices keeps the few the searches need. Cached per job. */
const mealCache = new Map();
export function allMeals(job) {
  if (mealCache.has(job.jobId)) return mealCache.get(job.jobId);
  const out = [];
  for (const [name, ilvl, stats, vitality] of FOODS) {
    const mapped = stats.map(([raw, pct, max]) => Object.freeze({ stat: neutralOf(job, raw), pct, max }));
    if (mapped.some(s => s.stat == null)) continue;
    const vit = vitality ? Object.freeze({ stat: 'vit', pct: vitality[0], max: vitality[1] }) : null;
    out.push(Object.freeze({ key: name, name, ilvl, pair: mapped.map(s => s.stat).join('+'), stats: Object.freeze(mapped), vit }));
  }
  const frozen = Object.freeze(out);
  mealCache.set(job.jobId, frozen);
  return frozen;
}

/* The job's food choices, in the job's substat order: {key, name, ilvl, stats: [{stat, pct, max}], vit: {stat: 'vit',
   pct, max} or null}, key = the neutral
   stats joined by '+', primary first ('det+crit'). Only meals whose every stat the job has. Each stat pair (or single
   stat) is its newest meal: FOODS is sorted by item level, and within a pair a newer meal never has a lower maximum
   (tests/unit/food.test.js). A choice that another one covers (every stat at least as high) is left out, since it can
   never give more: an old Critical Hit + Determination meal next to a new Determination + Critical Hit one, a one-stat
   meal next to a newer pair with that stat. So the best of these is the best of every meal (allMeals). Cached per job. */
const choiceCache = new Map();
export function foodChoices(job) {
  if (choiceCache.has(job.jobId)) return choiceCache.get(job.jobId);
  // allMeals is oldest first, so a later meal with the same stats replaces an older one
  const byKey = new Map();
  for (const { name, ilvl, pair, stats, vit } of allMeals(job)) byKey.set(pair, { name, ilvl, stats, vit });
  const all = [...byKey].map(([key, f]) => ({ key, ...f }));
  // drop a choice another one covers; of two that cover each other, the later one goes
  const kept = all.filter((c, i) => !all.some((d, j) => j !== i && covers(d, c) && !(covers(c, d) && j > i)));
  // sort: primary stat in the job's substat order, single-stat meals before pairs, then the second stat
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
   the percentage reaches the meal's maximum; its substats, and Vitality when the meal has some (food.vit). */
export function foodBonus(job, food, totals, level) {
  const out = {};
  for (const s of foodLines(food)) {
    const uncapped = Math.floor((s.pct * (statBase(job, s.stat, level) + (totals[s.stat] || 0))) / 100);
    out[s.stat] = { bonus: Math.min(s.max, uncapped), capped: uncapped >= s.max };
  }
  return out;
}

/* Gear totals plus a foodBonus result. */
export function withFood(totals, bonus) {
  const t = { ...totals };
  for (const [stat, b] of Object.entries(bonus)) t[stat] = (t[stat] || 0) + b.bonus;
  return t;
}

/* How a meal ranks for the objective `keys` (non-empty target and tiebreak keys): the totals with food on each key, then
   the substat food points in all (Vitality left out, so it ranks only as a key). Ranked by betterRank. */
export function mealRank(keys, totalsWithFood, bonus) {
  const subPoints = Object.entries(bonus).reduce((n, [stat, b]) => (stat === 'vit' ? n : n + b.bonus), 0);
  return [...keys.map(k => totalsWithFood[k] || 0), subPoints];
}

/* True when rank vector `a` beats `b`: higher at the first position where they differ (equal vectors: false, so the
   earlier choice keeps a tie). `b` null: always true. */
export function betterRank(a, b) {
  if (!b) return true;
  const i = a.findIndex((v, j) => v !== b[j]);
  return i >= 0 && a[i] > b[i];
}

/* The meals to try for a `food` option: [null] for none, every choice of the job for 'best', else that one meal. */
export function mealsFor(job, food) {
  return food == null ? [null] : food === 'best' ? foodChoices(job) : [food];
}

/* The choice that gives the highest totals with food for `keys` (target, tiebreak 1, tiebreak 2; empty ones ignored),
   compared in that order; then the most food points in all; then the first in `choices`. Null when there are none. */
export function bestFood(job, choices, totals, level, keys) {
  const ks = keys.filter(Boolean);
  let best = null,
    bestRank = null;
  for (const c of choices) {
    const bonus = foodBonus(job, c, totals, level);
    const rank = mealRank(ks, withFood(totals, bonus), bonus);
    if (betterRank(rank, bestRank)) {
      best = c;
      bestRank = rank;
    }
  }
  return best;
}

/* The fewest gear points of `stat` whose total with `food` (null for none) reaches `total` at `level`. Gear plus food
   rises with every gear point, so a binary search finds it; for Target GCD and tier ranking, which set minimums on
   totals with food while the optimizer works on gear points. */
export function gearNeeded(job, food, stat, total, level) {
  const line = food && foodLines(food).find(x => x.stat === stat);
  // no food for this stat: the gear has to bring the whole total
  if (!line || total <= 0) return Math.max(0, total);
  const reachesTotal = g => g + foodBonus(job, { stats: [line] }, { [stat]: g }, level)[stat].bonus >= total;
  // binary search for the fewest gear points that reach it (gear alone always does at g = total)
  let lo = 0,
    hi = total;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (reachesTotal(mid)) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}
