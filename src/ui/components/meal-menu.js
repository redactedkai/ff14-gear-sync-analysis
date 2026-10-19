/* The Food row's menu of the optimizer's result (owner's design, 2026-10-18): a search box, stat pills and a "Best for
   goal" switch over every meal the job can use (views/optimizer.js foodRow, mealsPassing). A nested x-data inside the
   optimizer component: it reads the result (`view`, `viewId`) and the "Best for goal" switch (`mealBestOnly`) from it,
   and a meal picked here goes to its pickMeal. */
import { mealEmptyReason, mealPillOff, mealsPassing } from '../views/optimizer.js';

export function mealMenu() {
  return {
    /* open or not, its search text (meal names) and the stats picked on its pills (a meal must have each; two at most,
       since a meal has at most two) */
    mealOpen: false,
    mealQuery: '',
    mealStats: [],
    /* the result (the optimizer's viewId) the pills were last preset for: the menu presets them on its first opening for
       each result, then keeps the player's changes */
    mealPresetFor: null,
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
      // the first opening for a result starts from the goal's stats (view.food.menu.preset): a meal pick reruns the
      // search, which can change the meals tagged best for goal
      if (this.mealPresetFor !== this.viewId) {
        this.mealStats = [...(this.view?.food?.menu?.preset ?? [])];
        this.mealPresetFor = this.viewId;
      }
      // after x-show has shown the menu (a hidden box takes no focus and has no layout)
      this.$nextTick(() =>
        requestAnimationFrame(() => {
          this.$refs.mealQuery?.focus();
          const list = this.$refs.mealList,
            on = list?.querySelector('.on');
          if (on) list.scrollTop += on.getBoundingClientRect().top - list.getBoundingClientRect().top - 40;
        }),
      );
    },
    /* A stat pill: on or off; a greyed-out one stays off (mealPillOff: a third, or one that would leave no meal). */
    toggleMealStat(stat) {
      if (this.mealStats.includes(stat)) this.mealStats = this.mealStats.filter(s => s !== stat);
      else if (!this.mealPillOff(stat)) this.mealStats = [...this.mealStats, stat];
    },
    /* the Food menu's filters now: its pills, search text and "Best for goal" switch (views mealsPassing) */
    get mealFilters() {
      return { stats: this.mealStats, query: this.mealQuery, bestOnly: this.mealBestOnly };
    },
    /* every meal of the Food menu, in its order */
    get mealItems() {
      return (this.view?.food?.menu?.groups ?? []).flatMap(g => g.items);
    },
    mealPillOff(stat) {
      return mealPillOff(this.mealItems, stat, this.mealFilters);
    },
    /* The Food menu's groups after its switch, pills and search: [{label, items}] (view.food.menu.groups, empty groups
       dropped). */
    get mealGroups() {
      // by key: Alpine's proxies make the same meal two different objects on two reads
      const passing = new Set(mealsPassing(this.mealItems, this.mealFilters).map(x => x.key));
      return (this.view?.food?.menu?.groups ?? [])
        .map(g => ({ label: g.label, items: g.items.filter(x => passing.has(x.key)) }))
        .filter(g => g.items.length);
    },
    /* why the list is empty ({text, action}), or null (views mealEmptyReason) */
    get mealEmpty() {
      return mealEmptyReason(this.mealItems, this.mealFilters);
    },
    /* A meal picked from the list: the menu closes and the optimizer searches with it (optimizer pickMeal). */
    chooseMeal(key) {
      this.mealOpen = false;
      this.pickMeal(key);
    },
    /* "Best for goal" on or off; on, the pills go back to the goal's (view.food.menu.preset), which a tagged meal has,
       so the switch never empties the list */
    setMealBest(on) {
      this.mealBestOnly = on;
      if (on) this.mealStats = [...(this.view?.food?.menu?.preset ?? [])];
    },
  };
}
