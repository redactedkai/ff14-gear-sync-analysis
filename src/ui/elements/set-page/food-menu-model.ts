/* What the Food menu (<gsa-food-menu>) keeps and works out, with no DOM: the search text, the stat pills, the sort, the "Best for goal"
   switch, how many meals are drawn, and the list those make (views/meal-menu.js has the filters and the list). The element and the
   Node tests both import it. The menu's data (`menu`, views/set-meal-menu.js setMealMenuView) is given by the page and is frozen. */
import { FIRST_ROWS, limitRows } from '../../views/limit-rows.js';
import { mealList, mealPillOff, mealsPassing } from '../../views/meal-menu.js';

/* The events the element sends: `food-open` (detail: whether the menu is open now; the page then gives it `menu`, which it builds
   only for an open menu) and `meal-pick` (detail: the meal's key, or null for No food). The page's template listens with
   `@food-open` and `@meal-pick`, which cannot import these constants: a unit test asserts the template uses the same names. */
export const FOOD_OPEN_EVENT = 'food-open';
export const MEAL_PICK_EVENT = 'meal-pick';

/* The menu's name for a screen reader (the panel has no visible label). */
export const FOOD_MENU_NAME = 'Food';
/* The search box's placeholder and name. */
export const FOOD_SEARCH_LABEL = 'Search meals';

/* Meals drawn below the shown meal when the menu opens, so the list can scroll to it. */
const ROWS_BELOW_SHOWN = 10;

/* One meal of the menu (views/meal-menu.js mealMenu): `key`, `name`, the stat keys it has (`stats`), `adds` what it gives on this
   gear ({stat, text, value}), `on` (the row shows it) and `best` (it is tagged "best for goal"). */
export interface MealItem {
  key: string;
  name: string;
  stats: string[];
  adds: { stat: string; text: string; value: number }[];
  on: boolean;
  best: boolean;
}

/* The menu the page gives: `groups` (meals by expansion), `pills` (the stat pills), `hasBest` (some meal is tagged), `hasMeal`
   (the set holds a meal, so "No food" is offered first). */
export interface MealMenuData {
  groups: { label: string; items: MealItem[] }[];
  pills: { stat: string; short: string; label: string }[];
  hasBest: boolean;
  hasMeal: boolean;
}

/* A meal as the list draws it (a MealItem with what views/meal-menu.js mealList adds): `ilvlText` ("i770"), `rowClass` (its classes)
   and `line`, the chips of its stat line. */
export interface MealRow extends MealItem {
  ilvlText: string;
  rowClass: string;
  line: { text: string; cls: string }[];
}

/* What the open menu shows under its tools (views/meal-menu.js mealList): the Sort row's options, the meal groups (each meal with
   its `line` of chips, `rowClass`, `ilvlText` and `name`) and why the list is empty, if it is. */
export interface MealListView {
  sorts: { key: string; label: string }[];
  groups: { key: string; label: string | null; items: MealRow[] }[];
  empty: { text: string; action: string } | null;
}

/* The state of one Food menu. Fields: `query` (search text), `stats` (the stats picked on the pills; a meal must have each, two at
   most since a meal has at most two; none at first), `sortBy` ('ilvl', or a picked stat's key), `bestOnly` (the "Best for goal"
   switch: on at first, then as the player left it; it only counts while some meal is tagged), `rows` (how many meals the open
   menu draws: it draws a long list in steps, views/limit-rows.js) and `menu` (the data, or null while the menu is closed). */
export class FoodMenuModel {
  query = '';
  stats: string[] = [];
  sortBy = 'ilvl';
  bestOnly = true;
  rows = Infinity;
  menu: MealMenuData | null = null;
  // the last whole list and the last cut of it to `rows` meals: the meals keep their objects from one cut to the next, so the rows
  // already drawn are not drawn again when more are added
  #whole: { menu: MealMenuData; key: string; view: MealListView } | null = null;
  #cut: { rows: number; whole: MealListView; view: MealListView } | null = null;

  /* The filters now: the pills, the search text and the "Best for goal" switch (views mealsPassing). */
  get filters() {
    return { stats: this.stats, query: this.query, bestOnly: this.bestOnly && Boolean(this.menu?.hasBest) };
  }

  /* Every meal of the menu, in its order. */
  get items(): MealItem[] {
    return (this.menu?.groups ?? []).flatMap(group => group.items);
  }

  /* The stat pills of the menu. */
  get pills(): MealMenuData['pills'] {
    return this.menu?.pills ?? [];
  }

  /* Whether the pill of `stat` is greyed out (a third pill, or one that would leave the list empty): it cannot be turned on. */
  pillOff(stat: string): boolean {
    return mealPillOff(this.items, stat, this.filters);
  }

  /* The state for a menu that opens now: the pills stay as the player left them, unless they would leave the list empty for this
     menu, and then they start over, empty. The first rows are those a window shows and the shown meal with a few below it. */
  startOpen(): void {
    if (this.stats.length > 0 && mealsPassing(this.items, { ...this.filters, query: '' }).length === 0) {
      this.stats = [];
      this.sortBy = 'ilvl';
    }
    const meals = this.list.groups.flatMap(group => group.items);
    this.rows = Math.max(FIRST_ROWS, meals.findIndex(meal => meal.on) + 1 + ROWS_BELOW_SHOWN);
  }

  /* A stat pill clicked: on or off; a greyed-out one stays off. Turning off the stat the list is sorted by goes back to ILVL. */
  toggleStat(stat: string): void {
    if (this.stats.includes(stat)) {
      this.stats = this.stats.filter(picked => picked !== stat);
      if (this.sortBy === stat) {
        this.sortBy = 'ilvl';
      }
    } else if (!this.pillOff(stat)) {
      this.stats = [...this.stats, stat];
    }
  }

  /* The "Best for goal" switch turned on or off. On, it clears the pills (the list is the tagged meals; a pill picks among them
     only with the switch off). */
  setBestOnly(on: boolean): void {
    this.bestOnly = on;
    if (on) {
      this.stats = [];
      this.sortBy = 'ilvl';
    }
  }

  /* What the open menu shows under its tools, every meal after the pills and the search. Kept for the next read. */
  get list(): MealListView {
    const menu = this.menu;
    if (!menu) {
      return { sorts: [], groups: [], empty: null };
    }
    const filters = this.filters;
    const key = `${this.stats.join()}|${this.query}|${this.sortBy}|${filters.bestOnly}`;
    if (this.#whole?.menu !== menu || this.#whole.key !== key) {
      this.#whole = { menu, key, view: mealList(menu, { ...filters, sortBy: this.sortBy }) };
    }
    return this.#whole.view;
  }

  /* The same, as many meals as `rows`. */
  get shown(): MealListView {
    const whole = this.list;
    if (this.#cut?.rows !== this.rows || this.#cut.whole !== whole) {
      this.#cut = { rows: this.rows, whole, view: { ...whole, groups: limitRows(whole.groups, this.rows) } };
    }
    return this.#cut.view;
  }
}

/* The meal a click inside the list picked: the key of the row's `data-meal` (the empty key is No food: null), or undefined when
   the click was on nothing that picks (a heading, the Clear search button). `target` is the clicked element. */
export function mealKeyOfClick(target: Element | null): string | null | undefined {
  const row = target?.closest<HTMLElement>('.same-item');
  const key = row?.dataset.meal;
  if (key === undefined) {
    return undefined;
  }
  return key === '' ? null : key;
}
