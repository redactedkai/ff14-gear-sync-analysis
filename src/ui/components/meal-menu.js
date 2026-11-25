/* The Food row's menu on a set page: every meal the job can use by expansion, a search box, stat pills, the "Best for goal"
   switch (while some meal is tagged) and, while a pill is on, a Sort row (views/meal-menu.js mealMenu, mealList). A nested x-data inside the component that owns the
   meals, which hands it a `source` (components/set-page.js mealSource). */
import { drawInSteps } from '../draw-in-steps.js';
import { overlays } from '../overlays.js';
import { FIRST_ROWS, limitRows, ROWS_PER_STEP } from '../views/limit-rows.js';
import { mealList, mealPillOff, mealsPassing } from '../views/meal-menu.js';

/* How far below the list's top the shown meal lands when the Food menu opens (px): the meal above it stays in sight. */
const SHOWN_MEAL_OFFSET_PX = 40;
/* Meals drawn below the shown meal when the menu opens, so the list can scroll to it. */
const ROWS_BELOW_SHOWN = 10;

/* The Food menu's id in the overlay manager (overlays.js). */
const MEAL_LAYER = 'mealMenu';

/* The Food menu's component (x-data="mealMenu(mealSource)" on the Food row): its open state, search, pills and sort.
   `source`: {menu(component) → the menu (views/meal-menu.js mealMenu's shape) or null, pick(component, key), watch (a
   property of the owner whose change closes the menu)}. */
export function mealMenu(source) {
  // the last whole list built and the last cut of it to mealRows meals (plain variables: writing reactive state inside
  // the view that reads it would run it again)
  let lastWhole = null;
  let lastCut = null;
  return {
    /* open or not, its search text (meal names), the stats picked on its pills (a meal must have each; two at most,
       since a meal has at most two; none at first) and the list's order ('ilvl', or a picked stat's key) */
    mealOpen: false,
    mealQuery: '',
    mealStats: [],
    mealSortBy: 'ilvl',
    /* the "Best for goal" switch: on at first, then as the player left it (it only counts while some meal is tagged) */
    mealBestOnly: true,
    // how many meals the open menu draws (it draws a long list in steps: views/limit-rows.js)
    mealRows: Infinity,
    init() {
      // the owner's change named by the source (a set page's open menu) closes the menu
      this.$watch(source.watch, () => {
        this.mealOpen = false;
      });
      // a menu closed by the page itself is taken off the overlay manager too
      this.$watch('mealOpen', open => {
        if (!open) {
          overlays.close(MEAL_LAYER);
        }
      });
    },
    /* Open or close the Food menu; opened, it is a layer of the overlay manager (Escape, a press outside and Tab out close it),
       the search box takes the keys and the list starts at the shown meal. */
    toggleMealMenu() {
      if (this.mealOpen) {
        if (!overlays.close(MEAL_LAYER, { restoreFocus: true })) {
          this.mealOpen = false;
        }
        return;
      }
      overlays.open({
        id: MEAL_LAYER,
        root: () => this.$root,
        opener: () => this.$refs.mealBtn,
        tabOut: true,
        close: () => {
          this.mealOpen = false;
        },
      });
      this.mealOpen = true;
      // the pills stay as the player left them, unless they would leave the list empty for this menu: then they start
      // over, empty
      if (this.mealStats.length && !mealsPassing(this.mealItems, { ...this.mealFilters, query: '' }).length) {
        this.mealStats = [];
        this.mealSortBy = 'ilvl';
      }
      this.drawMealsInSteps();
      // after x-if has drawn the menu (it is built only while open)
      this.$nextTick(() =>
        requestAnimationFrame(() => {
          this.$refs.mealQuery?.focus();
          const list = this.$refs.mealList,
            on = list.querySelector('.on');
          if (on) {
            list.scrollTop += on.getBoundingClientRect().top - list.getBoundingClientRect().top - SHOWN_MEAL_OFFSET_PX;
          }
          // the owner keeps an opened menu inside the window (the set page's keepMenuInView)
          this.keepMenuInView(list.closest('.same-menu'));
        }),
      );
    },
    /* Draw the meals in steps: the first ones, and the shown meal with a few below it, at once; the rest one step per
       frame while the menu stays open. */
    drawMealsInSteps() {
      const meals = this.fullMealView.groups.flatMap(g => g.items);
      this.mealRows = Math.max(FIRST_ROWS, meals.findIndex(x => x.on) + 1 + ROWS_BELOW_SHOWN);
      drawInSteps(() => {
        if (!this.mealOpen) {
          return false;
        }
        this.mealRows += ROWS_PER_STEP;
        return this.mealRows < meals.length;
      });
    },
    /* A stat pill: on or off; a greyed-out one stays off (mealPillOff: a third, or one that would leave the list
       empty). Turning off the stat the list is sorted by goes back to ILVL. */
    toggleMealStat(stat) {
      if (this.mealStats.includes(stat)) {
        this.mealStats = this.mealStats.filter(s => s !== stat);
        if (this.mealSortBy === stat) {
          this.mealSortBy = 'ilvl';
        }
      } else if (!this.mealPillOff(stat)) {
        this.mealStats = [...this.mealStats, stat];
      }
    },
    /* The "Best for goal" switch turned on or off. On, it clears the pills (the list is the tagged meals; a pill picks
       among them only through the switch being off). */
    setMealBest(on) {
      this.mealBestOnly = on;
      if (on) {
        this.mealStats = [];
        this.mealSortBy = 'ilvl';
      }
    },
    /* the Food menu's filters now: its pills, search text and "Best for goal" switch (views mealsPassing) */
    get mealFilters() {
      return { stats: this.mealStats, query: this.mealQuery, bestOnly: this.mealBestOnly && Boolean(this.mealSourceMenu?.hasBest) };
    },
    /* every meal of the list, in its order */
    get mealItems() {
      return (this.mealSourceMenu?.groups ?? []).flatMap(g => g.items);
    },
    mealPillOff(stat) {
      return mealPillOff(this.mealItems, stat, this.mealFilters);
    },
    /* the menu the meals come from (source.menu), or null */
    get mealSourceMenu() {
      return source.menu(this) ?? null;
    },
    /* the stat pills of the menu */
    get mealPills() {
      return this.mealSourceMenu?.pills ?? [];
    },
    /* What the open menu shows under its tools: {sorts, groups, empty} (views mealList), every meal after the pills and
       search. Kept for the next read (the meals keep their objects, so the rows drawn are not drawn again when more
       are added); the owner's view is frozen (deepFreeze), so Alpine wraps none of it. */
    get fullMealView() {
      const menu = this.mealSourceMenu;
      if (!menu) {
        return { sorts: [], groups: [], empty: null };
      }
      const filters = this.mealFilters;
      const key = `${this.mealStats.join()}|${this.mealQuery}|${this.mealSortBy}|${filters.bestOnly}`;
      if (lastWhole?.menu !== menu || lastWhole.key !== key) {
        lastWhole = { menu, key, view: mealList(menu, { ...filters, sortBy: this.mealSortBy }) };
      }
      return lastWhole.view;
    },
    /* The same, as many meals as mealRows. */
    get mealView() {
      const full = this.fullMealView;
      const rows = this.mealRows;
      if (lastCut?.rows !== rows || lastCut.full !== full) {
        lastCut = { rows, full, view: Object.freeze({ ...full, groups: limitRows(full.groups, rows) }) };
      }
      return lastCut.view;
    },
    /* A click inside the Food menu's list: one handler on the list instead of one per meal. The row clicked carries its
       meal's key (data-meal) or is the No food row (data-meal=""); the Clear search button does nothing here. */
    mealClick(event) {
      const row = event.target.closest?.('.same-item');
      if (!row || row.dataset.meal === undefined) {
        return;
      }
      this.chooseMeal(row.dataset.meal === '' ? null : row.dataset.meal);
    },
    /* A meal picked from the list: the menu closes and the owner takes it (source.pick). */
    chooseMeal(key) {
      if (!overlays.close(MEAL_LAYER, { restoreFocus: true })) {
        this.mealOpen = false;
      }
      source.pick(this, key);
    },
  };
}
