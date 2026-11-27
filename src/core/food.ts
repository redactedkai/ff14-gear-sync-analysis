/* Food: HQ meals raise one or two combat substats, and Vitality, by a percentage of the whole stat (the character's
   base at the level plus gear), up to the meal's maximum: bonus = min(max, floor(percent x (base + gear) / 100)).
   Verified by the owner in a synced duty (2026-10-18; xivgear and Ariyala use it too), so it applies unchanged under
   item level and level sync (docs/mechanics/math.md, section 6, Food). Vitality's base leaves out the clan's bonus
   (-3 to +3) unless the caller passes it (foodBonus, `extraBase`): a saved sheet that sets a clan does (core/set.ts), the
   searches never do, so their food can be a point off Vitality's in game.
   A meal's effect never falls with more gear points and gear + food rises with every gear point, so ranking gear sets by
   gear totals gives the same order as ranking them with food: the optimizer needs no change, and the best food for a goal
   can be picked after the search (bestFood). */
import { entriesOf, isOneOf, must, mustHave, present } from './guards.ts';
import { statBase } from './base-stats.ts';
import { FOODS } from './tables.ts';
import type { DimKey, JobContext, RawStatKey, StatKey, StatMap, Totals } from './types.ts';

/* One stat line of a meal: the stat key, the percent of the whole stat it adds and its maximum (HQ). */
export interface FoodStat {
  readonly stat: StatKey;
  readonly pct: number;
  readonly max: number;
}
/* A foodChoices entry: a meal as the searches and menus use it. `stats`: the substat lines, `vit` Vitality's line or null. */
export interface FoodChoice {
  readonly key: string;
  readonly name: string;
  readonly ilvl: number;
  readonly stats: readonly FoodStat[];
  readonly vit: FoodStat | null;
}
/* An allMeals entry: a FoodChoice, with `pair` (its stat keys joined by '+', primary first). */
export interface Meal extends FoodChoice {
  readonly pair: string;
}
/* The stat lines of a meal, all foodBonus needs of it. */
export interface FoodLines {
  readonly stats: readonly FoodStat[];
  readonly vit?: FoodStat | null;
}
/* What a meal adds on gear totals (foodBonus): per stat, the points and whether the meal's maximum is reached. */
export type FoodBonus = Partial<Record<StatKey, FoodBonusLine>>;
/* One stat's line of a foodBonus result. */
export interface FoodBonusLine {
  bonus: number;
  capped: boolean;
}
/* A meal the searches may choose, with the gear totals it goes with: pickMeal's entries (a search's own entry type adds more). */
export interface MealEntry {
  readonly meal: FoodChoice | null;
  readonly totals: Totals;
}

/* The stat key of a raw food stat (the game's own) if the job has it, or null when the job has no such stat (Spell Speed food for a
   Skill Speed job, Tenacity food for a job without Tenacity). */
function statKeyOf(job: JobContext, raw: RawStatKey): StatKey | null {
  return isOneOf(job.substats, raw) ? raw : null;
}

/* Every stat line of a foodChoices entry, Vitality included: [{stat, pct, max}]. */
function foodLines(food: FoodLines): readonly FoodStat[] {
  return food.vit ? [...food.stats, food.vit] : food.stats;
}

/* `a` is never worse than `b`: it has every stat of `b`, Vitality included, with at least its percent and maximum (a
   bonus never falls with a higher percent or maximum, and an extra stat only adds). */
function covers(a: FoodLines, b: FoodLines): boolean {
  return foodLines(b).every(s => foodLines(a).some(x => x.stat === s.stat && x.pct >= s.pct && x.max >= s.max));
}

const mealCache = new Map<string, readonly Meal[]>();

/* Every HQ meal the job can use, oldest first (FOODS order, by item level): {key, name, ilvl, pair, stats: [{stat, pct,
   max}], vit: {stat: 'vit', pct, max} or null}; key = the meal's name (unique in FOODS), pair = its stat keys
   joined by '+', primary first ('det+crit'). Only meals whose every stat the job has: 182 for Astrologian. The result's
   Food menu lists them all; foodChoices keeps the few the searches need. Cached per job. */
export function allMeals(job: JobContext): readonly Meal[] {
  if (mealCache.has(job.jobId)) {
    return must(mealCache, job.jobId, 'cached meals');
  }
  const out: Meal[] = [];
  for (const [name, ilvl, stats, vitality] of FOODS) {
    const mapped: FoodStat[] = [];
    for (const [raw, pct, max] of stats) {
      const stat = statKeyOf(job, raw);
      if (stat !== null) {
        mapped.push(Object.freeze({ stat, pct, max }));
      }
    }
    // a meal with a stat the job lacks is left out
    if (mapped.length < stats.length) {
      continue;
    }
    const vit = vitality ? Object.freeze({ stat: 'vit' as const, pct: vitality[0], max: vitality[1] }) : null;
    out.push(Object.freeze({ key: name, name, ilvl, pair: mapped.map(s => s.stat).join('+'), stats: Object.freeze(mapped), vit }));
  }
  const frozen = Object.freeze(out);
  mealCache.set(job.jobId, frozen);
  return frozen;
}

const choiceCache = new Map<string, readonly FoodChoice[]>();

/* The job's food choices, in the job's substat order: {key, name, ilvl, stats: [{stat, pct, max}], vit: {stat: 'vit',
   pct, max} or null}, key = the stat keys
   joined by '+', primary first ('det+crit'). Only meals whose every stat the job has. Each stat pair (or single
   stat) is its newest meal: FOODS is sorted by item level, and within a pair a newer meal never has a lower maximum
   (tests/unit/core/food.test.ts). A choice that another one covers (every stat at least as high) is left out, since it can
   never give more: an old Critical Hit + Determination meal next to a new Determination + Critical Hit one, a one-stat
   meal next to a newer pair with that stat. So the best of these is the best of every meal (allMeals). Cached per job. */
export function foodChoices(job: JobContext): readonly FoodChoice[] {
  if (choiceCache.has(job.jobId)) {
    return must(choiceCache, job.jobId, 'cached food choices');
  }
  // allMeals is oldest first, so a later meal with the same stats replaces an older one
  const byKey = new Map<string, Omit<Meal, 'key' | 'pair'>>();
  for (const { name, ilvl, pair, stats, vit } of allMeals(job)) {
    byKey.set(pair, { name, ilvl, stats, vit });
  }
  const all = [...byKey].map(([key, f]) => ({ key, ...f }));
  // drop a choice another one covers; of two that cover each other, the later one goes
  const kept = all.filter((c, i) => !all.some((d, j) => j !== i && covers(d, c) && !(covers(c, d) && j > i)));
  // sort: primary stat in the job's substat order, single-stat meals before pairs, then the second stat
  const rank = (s: StatKey | undefined) => (s === undefined ? -1 : job.substats.indexOf(s));
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
export function foodLabel(job: JobContext, food: FoodLines): string {
  return food.stats.map(s => job.label[s.stat]).join(' + ');
}

/* What `food` adds to gear totals `totals` ({stat key: gear points}) at `level`: {stat: {bonus, capped}}, capped when
   the percentage reaches the meal's maximum; its substats, and Vitality when the meal has some (food.vit). `extraBase`
   ({stat key: points}, optional, none by default) is what the character has on top of its base at the level: the clan's
   offset for Vitality (clan-bonus.ts clanOffset). A meal's bonus counts it, but never the party bonus. */
export function foodBonus(job: JobContext, food: FoodLines, totals: Totals, level: number, extraBase: StatMap = {}): FoodBonus {
  const out: FoodBonus = {};
  for (const s of foodLines(food)) {
    const whole = statBase(job, s.stat, level) + (extraBase[s.stat] || 0) + (totals[s.stat] || 0);
    const uncapped = Math.floor((s.pct * whole) / 100);
    out[s.stat] = { bonus: Math.min(s.max, uncapped), capped: uncapped >= s.max };
  }
  return out;
}

/* Gear totals plus a foodBonus result. */
export function withFood(totals: Totals, bonus: FoodBonus): Totals {
  const t = { ...totals };
  for (const [stat, b] of entriesOf<StatKey, FoodBonusLine>(bonus)) {
    t[stat] = (t[stat] || 0) + b.bonus;
  }
  return t;
}

/* How a meal ranks for the objective `keys` (non-empty target and tiebreak keys): the totals with food on each key, then
   the substat food points in all (Vitality left out, so it ranks only as a key). Ranked by betterRank. */
export function mealRank(keys: readonly DimKey[], totalsWithFood: Totals, bonus: FoodBonus): number[] {
  const subPoints = entriesOf<StatKey, FoodBonusLine>(bonus).reduce((n, [stat, b]) => (stat === 'vit' ? n : n + b.bonus), 0);
  return [...keys.map(k => totalsWithFood[k] || 0), subPoints];
}

/* True when rank vector `a` beats `b`: higher at the first position where they differ (equal vectors: false, so the
   earlier choice keeps a tie). `b` null: always true. */
function betterRank(a: readonly number[], b: readonly number[] | null): boolean {
  if (!b) {
    return true;
  }
  const i = a.findIndex((v, j) => v !== b[j]);
  return i >= 0 && a[i] > b[i];
}

/* The meals to try for a `food` option: [null] for none, every choice of the job for 'best', else that one meal. */
export function mealsFor(job: JobContext, food: FoodChoice | 'best' | null | undefined): readonly (FoodChoice | null)[] {
  if (food == null) {
    return [null];
  }
  return food === 'best' ? foodChoices(job) : [food];
}

/* What `meal` (a foodChoices entry, or null for none) adds to gear totals `totals` at `level`: {bonus, withFood}, the
   foodBonus result ({} for none) and the totals with it. */
export function mealTotals(
  job: JobContext,
  meal: FoodChoice | null,
  totals: Totals,
  level: number,
): { bonus: FoodBonus; withFood: Totals } {
  const bonus = meal ? foodBonus(job, meal, totals, level) : {};
  return { bonus, withFood: withFood(totals, bonus) };
}

/* The rule every meal choice follows (bestFood, Target GCD, tier ranking): of `entries` ([{meal, totals, ...}], a meal
   or null with the gear totals it goes with), the one with the highest totals with food on `keys` (non-empty), compared
   in that order; then the most food points in all (mealRank); then the first in `entries`. Returns {entry, bonus,
   withFood} (mealTotals of the winner), or null when there are no entries. */
export function pickMeal<Entry extends MealEntry>(
  job: JobContext,
  entries: readonly Entry[],
  keys: readonly DimKey[],
  level: number,
): { entry: Entry; bonus: FoodBonus; withFood: Totals } | null {
  let best: { entry: Entry; bonus: FoodBonus; withFood: Totals } | null = null,
    bestRank: number[] | null = null;
  for (const entry of entries) {
    const { bonus, withFood: totalsWithFood } = mealTotals(job, entry.meal, entry.totals, level);
    const rank = mealRank(keys, totalsWithFood, bonus);
    if (betterRank(rank, bestRank)) {
      best = { entry, bonus, withFood: totalsWithFood };
      bestRank = rank;
    }
  }
  return best;
}

/* The choice that gives the highest totals with food for `keys` (target, tiebreak 1, tiebreak 2; empty ones ignored),
   compared in that order; then the most food points in all; then the first in `choices` (pickMeal). Null when there
   are none. */
export function bestFood(
  job: JobContext,
  choices: readonly FoodChoice[],
  totals: Totals,
  level: number,
  keys: readonly (DimKey | '' | null | undefined)[],
): FoodChoice | null {
  const entries = choices.map(meal => ({ meal, totals }));
  return pickMeal(job, entries, present(keys), level)?.entry.meal ?? null;
}

/* The fewest gear points of `stat` whose total with `food` (null for none) reaches `total` at `level`. Gear plus food
   rises with every gear point, so a binary search finds it; for Target GCD and tier ranking, which set minimums on
   totals with food while the optimizer works on gear points. */
export function gearNeeded(job: JobContext, food: FoodLines | null, stat: DimKey, total: number, level: number): number {
  const line = food && foodLines(food).find(x => x.stat === stat);
  // no food for this stat: the gear has to bring the whole total
  if (!line || total <= 0) {
    return Math.max(0, total);
  }
  const reachesTotal = (g: number) =>
    g + mustHave(foodBonus(job, { stats: [line] }, { [line.stat]: g }, level)[line.stat], 'food bonus line').bonus >= total;
  // binary search for the fewest gear points that reach it (gear alone always does at g = total)
  let lo = 0,
    hi = total;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (reachesTotal(mid)) {
      hi = mid;
    } else {
      lo = mid + 1;
    }
  }
  return lo;
}
