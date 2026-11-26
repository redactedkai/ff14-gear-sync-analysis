/* The Food row's menu of a set page: the shared Food menu (meal-menu.ts) for the set shown. Takes plain data and returns
   plain data; the template only displays it. Pure: no store. */
import { allMeals } from '../../core/food.ts';
import { mealMenu } from './meal-menu.ts';
import type { SavedGearSet } from '../sheets/saved-types.ts';
import type { SheetContext } from './set-totals.ts';

/* The Food row's menu for `gearSet` evaluated by evaluateInSheet (`context`): meal-menu.ts mealMenu's {groups, pills,
   hasBest}, the set's meal marked `on`; plus hasMeal: the set holds a meal ("No food" is offered first). `bestKeys`: the
   meals tagged "best for goal" ([], or mealBestKeys of the saved set, which a draft or a suggestion does not have). */
export function setMealMenuView(context: SheetContext, gearSet: Pick<SavedGearSet, 'meal'>, bestKeys: readonly string[] = []) {
  const { job, level, evaluated } = context;
  const shown = allMeals(job).find(meal => meal.key === gearSet.meal) ?? null;
  return { ...mealMenu(job, level, evaluated.gear, shown, bestKeys), hasMeal: gearSet.meal != null };
}
