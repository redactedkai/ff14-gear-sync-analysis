/* The Food row's menu of the optimizer's result (owner's design, 2026-10-18; best on top, F3 c, 2026-10-20): the meals
   with the best's result pinned on top, then a search box, stat pills and, while a pill is on, a Sort row over every
   other meal the job can use (views/optimizer.js mealMenu, mealList). A nested x-data inside the optimizer component:
   it reads the result (`view`, `viewId`) from it, and a meal picked here goes to its pickMeal. */
import { mealList, mealPillOff, mealsPassing } from '../views/optimizer.js';

/* How far below the list's top the shown meal lands when the Food menu opens (px): the meal above it stays in sight. */
const SHOWN_MEAL_OFFSET_PX = 40;

/* The Food menu's component (x-data="mealMenu" on the Food row): its open state, search, pills and sort. */
export function mealMenu() {
  return {
    /* open or not, its search text (meal names), the stats picked on its pills (a meal must have each; two at most,
       since a meal has at most two; none at first) and the list's order ('ilvl', or a picked stat's key) */
    mealOpen: false,
    mealQuery: '',
    mealStats: [],
    mealSortBy: 'ilvl',
    init() {
      // a new result (Optimize, or a pick from any menu) closes the menu
      this.$watch('viewId', () => {
        this.mealOpen = false;
      });
    },
    /* Open or close the Food menu; opened, the search box takes the keys and the list starts at the shown meal. */
    toggleMealMenu() {
      this.mealOpen = !this.mealOpen;
      if (!this.mealOpen) return;
      // the pills stay as the player left them across results, unless they would leave the list below empty for this
      // result (a meal pick can change which meals are pinned): then they start over, empty
      if (this.mealStats.length && !mealsPassing(this.mealItems, { stats: this.mealStats, query: '' }).length) {
        this.mealStats = [];
        this.mealSortBy = 'ilvl';
      }
      // after x-if has drawn the menu (it is built only while open)
      this.$nextTick(() =>
        requestAnimationFrame(() => {
          this.$refs.mealQuery?.focus();
          const list = this.$refs.mealList,
            on = list?.querySelector('.on');
          if (on) list.scrollTop += on.getBoundingClientRect().top - list.getBoundingClientRect().top - SHOWN_MEAL_OFFSET_PX;
        }),
      );
    },
    /* A stat pill: on or off; a greyed-out one stays off (mealPillOff: a third, or one that would leave the list below
       empty). Turning off the stat the list is sorted by goes back to ILVL. */
    toggleMealStat(stat) {
      if (this.mealStats.includes(stat)) {
        this.mealStats = this.mealStats.filter(s => s !== stat);
        if (this.mealSortBy === stat) this.mealSortBy = 'ilvl';
      } else if (!this.mealPillOff(stat)) this.mealStats = [...this.mealStats, stat];
    },
    /* the Food menu's filters now: its pills and search text (views mealsPassing) */
    get mealFilters() {
      return { stats: this.mealStats, query: this.mealQuery };
    },
    /* every meal of the list below the pinned ones, in its order */
    get mealItems() {
      return (this.view?.food?.menu?.groups ?? []).flatMap(g => g.items);
    },
    mealPillOff(stat) {
      return mealPillOff(this.mealItems, stat, this.mealFilters);
    },
    /* What the open menu shows under its tools: {sorts, groups, empty} (views mealList). The view is frozen
       (optimizer solveNow), so Alpine wraps none of it. */
    get mealView() {
      const menu = this.view?.food?.menu;
      if (!menu) return { sorts: [], groups: [], empty: null };
      return mealList(menu, { stats: this.mealStats, query: this.mealQuery, sortBy: this.mealSortBy });
    },
    /* A meal picked from the list: the menu closes and the optimizer searches with it (optimizer pickMeal). */
    chooseMeal(key) {
      this.mealOpen = false;
      this.pickMeal(key);
    },
  };
}
