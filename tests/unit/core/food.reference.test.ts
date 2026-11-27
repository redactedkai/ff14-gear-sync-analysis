/* Food against references written out in the test, over every job's every meal (allMeals), random levels and gear totals
   from a fixed seed: the bonus of a meal equals min(max, floor(pct x (base + gear) / 100)) (foodAdd in helpers/exhaustive.js)
   and is never negative; bestFood over the pruned choices (foodChoices) reaches the same rank as the best of every meal; and
   gearNeeded is the least gear that reaches a total with the meal, by a linear scan. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JOBS } from '../../../src/core/constants.ts';
import type { FoodChoice } from '../../../src/core/food.ts';
import { allMeals, bestFood, foodBonus, foodChoices, gearNeeded, withFood } from '../../../src/core/food.ts';
import { makeJobContext } from '../../../src/core/job-context.ts';
import { rng } from '../helpers/common.ts';
import { foodAdd } from '../helpers/exhaustive.js';
import { lexCompare } from '../helpers/exact-solver.ts';

const CASES_PER_JOB = 120;

test('every meal of every job: the bonus is the formula and never negative', () => {
  const rand = rng(777);
  const int = (count: number) => Math.floor(rand() * count);
  for (const { id } of JOBS) {
    const job = makeJobContext(id);
    const meals = allMeals(job);
    for (let n = 0; n < CASES_PER_JOB; n++) {
      const level = 1 + int(job.maxLevel);
      const totals = Object.fromEntries(job.stats.map(stat => [stat, int(4500)]));
      for (const meal of meals) {
        const bonuses = foodBonus(job, meal, totals, level);
        for (const stat of job.stats) {
          const bonus = bonuses[stat]?.bonus;
          if (bonus === undefined) {
            continue;
          }
          assert.equal(
            bonus,
            foodAdd(job, meal, stat, totals[stat], level),
            `${job.jobId} ${meal.key} ${stat} level ${level} gear ${totals[stat]}`,
          );
          assert.ok(bonus >= 0, `${job.jobId} ${meal.key} ${stat}: negative bonus`);
        }
      }
    }
  }
});

test('the best meal of the pruned choices ranks as high as the best of every meal', () => {
  const rand = rng(778);
  const int = (count: number) => Math.floor(rand() * count);
  for (const { id } of JOBS) {
    const job = makeJobContext(id);
    const meals = allMeals(job);
    for (let n = 0; n < CASES_PER_JOB; n++) {
      const level = 1 + int(job.maxLevel);
      const totals = Object.fromEntries(job.stats.map(stat => [stat, int(4500)]));
      const keys = [0, 1, 2]
        .map(() => job.stats[int(job.stats.length)])
        .filter((key, i, all) => all.indexOf(key) === i)
        .slice(0, 1 + int(3));
      // the rank rule: the ranked stats with food, then the points the meal adds to substats
      const rankOf = (meal: FoodChoice) => {
        const bonus = foodBonus(job, meal, totals, level);
        const withMeal = withFood(totals, bonus);
        const substatPoints = Object.entries(bonus).reduce((sum, [stat, v]) => (stat === 'vit' ? sum : sum + v.bonus), 0);
        return [...keys.map(key => withMeal[key] || 0), substatPoints];
      };
      const bestOfAll = meals.map(rankOf).reduce((a, b) => (lexCompare(b, a) > 0 ? b : a));
      const chosen = bestFood(job, foodChoices(job), totals, level, keys);
      assert.ok(chosen, `${job.jobId} level ${level}: no meal chosen`);
      assert.equal(
        lexCompare(rankOf(chosen), bestOfAll),
        0,
        `${job.jobId} level ${level} keys ${keys}: ${chosen.key} ranks ${rankOf(chosen)}, the best is ${bestOfAll}`,
      );
    }
  }
});

test('gearNeeded is the least gear that reaches the total with the meal', () => {
  const rand = rng(779);
  const int = (count: number) => Math.floor(rand() * count);
  for (const { id } of JOBS) {
    const job = makeJobContext(id);
    const meals = allMeals(job);
    for (let n = 0; n < CASES_PER_JOB; n++) {
      const level = 1 + int(job.maxLevel);
      const meal = meals[int(meals.length)];
      const line = meal.stats[int(meal.stats.length)];
      assert.ok(line);
      const target = int(5000);
      let least = 0;
      while (least + (foodBonus(job, { stats: [line] }, { [line.stat]: least }, level)[line.stat]?.bonus ?? 0) < target) {
        least++;
      }
      assert.equal(
        gearNeeded(job, meal, line.stat, target, level),
        least,
        `${job.jobId} ${meal.key} ${line.stat} level ${level} total ${target}`,
      );
    }
  }
});
