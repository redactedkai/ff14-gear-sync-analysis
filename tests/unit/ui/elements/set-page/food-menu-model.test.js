/* The Food menu's state (src/ui/elements/set-page/food-menu-model.ts): the pills starting empty and kept while they still list a
   meal, the sort and its fallback, the click on a row, and the page's wiring of the element's events. The filters themselves
   (mealsPassing, mealPillOff, mealEmptyReason, sortMeals, mealList) are checked in ui/views/meal-menu.test.js. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  FOOD_OPEN_EVENT,
  FoodMenuModel,
  MEAL_PICK_EVENT,
  mealKeyOfClick,
} from '../../../../../src/ui/elements/set-page/food-menu-model.ts';

/* A meal of the hand-made menus: its stats in order, each with the points it adds. */
const meal = (key, name, adds) => ({
  key,
  name,
  stats: Object.keys(adds),
  adds: Object.entries(adds).map(([stat, value]) => ({ stat, text: `${stat} +${value}`, value })),
  on: false,
});
const PILLS = ['crit', 'det', 'dh', 'spd'].map(stat => ({ stat, short: stat.toUpperCase(), label: stat }));

/* A hand-made Food menu: Critical Hit + Spell Speed, Critical Hit + Determination and Critical Hit + Direct Hit in Dawntrail,
   Determination + Critical Hit in Endwalker. */
const MENU = {
  groups: [
    {
      label: 'Dawntrail',
      items: [
        meal('p', 'Popoto Potage', { crit: 133, spd: 36 }),
        meal('a', 'Caramel Popcorn', { det: 125, crit: 91 }),
        meal('b', 'Rroneek au Gratin', { crit: 91, dh: 36 }),
      ],
    },
    { label: 'Endwalker', items: [meal('c', 'Baked Eggplant', { det: 103, crit: 62 })] },
  ],
  pills: PILLS,
};
/* The menu for other gear: nothing has Direct Hit. */
const MENU_AFTER = { ...MENU, groups: [{ label: 'Dawntrail', items: [meal('a', 'Caramel Popcorn', { det: 125, crit: 91 })] }] };

/* A model opened on `menu`. */
function opened(menu = MENU) {
  const model = new FoodMenuModel();
  model.menu = menu;
  model.startOpen();
  return model;
}
const shown = model => model.shown.groups.map(group => [group.key, group.items.map(item => item.key)]);

test('Food menu: opens with no pill; the pills and search narrow the list', () => {
  const model = opened();
  assert.deepEqual(model.stats, []);
  assert.deepEqual(model.shown.sorts, []);
  assert.deepEqual(shown(model), [
    ['Dawntrail', ['p', 'a', 'b']],
    ['Endwalker', ['c']],
  ]);
  // Direct Hit: no meal has it with Spell Speed, so that pill stays off
  model.toggleStat('dh');
  assert.equal(model.pillOff('spd'), true);
  model.toggleStat('spd');
  assert.deepEqual(model.stats, ['dh']);
  assert.deepEqual(shown(model), [['Dawntrail', ['b']]]);
  // a search that leaves nothing: Clear search
  model.query = 'potage';
  assert.deepEqual(shown(model), []);
  assert.equal(model.shown.empty.action, 'query');
  assert.ok(model.shown.empty.text.includes('potage'), model.shown.empty.text);
});

test('Food menu: sorted by a stat while its pill is on; turning that pill off goes back to ILVL', () => {
  const model = opened();
  model.toggleStat('det');
  model.toggleStat('crit');
  assert.deepEqual(
    model.shown.sorts.map(option => option.label),
    ['ILVL', 'CRIT', 'DET'],
  );
  model.sortBy = 'crit';
  assert.deepEqual(shown(model), [['sorted', ['a', 'c']]]);
  // turning off another pill keeps the sort
  model.toggleStat('det');
  assert.equal(model.sortBy, 'crit');
  // turning off the sorted stat's pill: ILVL, and turning it back on does not bring the sort back
  model.toggleStat('crit');
  model.toggleStat('crit');
  assert.equal(model.sortBy, 'ilvl');
});

test('Food menu: the pills stay while they list a meal, else start over empty; the switch stays as left', () => {
  const model = opened();
  model.toggleStat('crit');
  model.setBestOnly(false);
  model.startOpen();
  assert.deepEqual([model.stats, model.bestOnly], [['crit'], false]);
  // Direct Hit, sorted by it; then other gear where no meal has it: the pills and sort start over
  model.toggleStat('crit');
  model.toggleStat('dh');
  model.sortBy = 'dh';
  model.menu = MENU_AFTER;
  model.startOpen();
  assert.deepEqual([model.stats, model.sortBy], [[], 'ilvl']);
  // no menu shows nothing
  model.menu = null;
  assert.deepEqual(model.shown, { sorts: [], groups: [], empty: null });
});

test("Food menu: a click on the list reads the clicked row's data-meal; No food is the empty key, other clicks pick nothing", () => {
  const target = row => ({ closest: selector => (selector === '.same-item' ? row : null) });
  assert.equal(mealKeyOfClick(target({ dataset: { meal: 'a' } })), 'a');
  assert.equal(mealKeyOfClick(target({ dataset: { meal: '' } })), null);
  // the Clear search button and a click off any row
  assert.equal(mealKeyOfClick(target({ dataset: {} })), undefined);
  assert.equal(mealKeyOfClick(target(null)), undefined);
});

/* The page's wiring reads the events by name (the template cannot import the constants): if this fails, rename them together. */
test("the set page's template listens to the Food menu's events by their names", () => {
  const template = readFileSync(new URL('../../../../../src/partials/set-page.html', import.meta.url), 'utf-8');
  assert.ok(template.includes(`@${FOOD_OPEN_EVENT}=`));
  assert.ok(template.includes(`@${MEAL_PICK_EVENT}=`));
});
