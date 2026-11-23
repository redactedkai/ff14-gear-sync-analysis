/* The Food row's menu (src/ui/components/meal-menu.js), bound as Alpine binds it inside a set page: the pills starting
   empty and kept while they still list a meal, the sort and its fallback, and a pick. The filters themselves
   (mealsPassing, mealPillOff, mealEmptyReason, sortMeals, mealList) are checked in ui/views/meal-menu.test.js. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mealMenu } from '../../../../src/ui/components/meal-menu.js';
import { fakeFrames, pageMagics } from '../../helpers/page-magics.js';

fakeFrames({ immediate: true }); // Node has no frame callback

/* A meal of the hand-made menus: its stats in order, each with the points it adds. */
const meal = (key, name, adds) => ({
  key,
  name,
  stats: Object.keys(adds),
  adds: Object.entries(adds).map(([stat, value]) => ({ stat, text: `${stat} +${value}`, value })),
  on: false,
});
const PILLS = ['crit', 'det', 'dh', 'spd'].map(stat => ({ stat, short: stat.toUpperCase(), label: stat }));

/* A hand-made Food menu: Critical Hit + Spell Speed, Critical Hit + Determination and Critical Hit + Direct Hit in
   Dawntrail, Determination + Critical Hit in Endwalker. */
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
const MENU_AFTER = {
  ...MENU,
  groups: [{ label: 'Dawntrail', items: [meal('a', 'Caramel Popcorn', { det: 125, crit: 91 })] }],
};

/* The menu inside a stand-in for a set page: the owner holds `menu` and setMeal, and its `open` menu closes this one. */
function menu() {
  const picked = [];
  const watched = [];
  let onClose = null;
  const magics = pageMagics(['mealQuery', 'mealList']);
  const owner = { menu: MENU, setMeal: key => picked.push(key), keepMenuInView: () => {} };
  const source = { menu: self => self.menu, pick: (self, key) => self.setMeal(key), watch: 'open' };
  const m = Object.assign(mealMenu(source), owner, {
    $watch: (what, fn) => {
      watched.push(what);
      onClose = fn;
    },
    ...magics,
  });
  m.init();
  return { m, picked, watched, close: () => onClose() };
}
const shown = m => m.mealView.groups.map(g => [g.key, g.items.map(x => x.key)]);

test('Food menu: opens with no pill; the pills and search narrow the list', () => {
  const { m, watched } = menu();
  assert.deepEqual(watched, ['open', 'mealOpen']);
  m.toggleMealMenu();
  assert.equal(m.mealOpen, true);
  assert.deepEqual(m.mealStats, []);
  assert.deepEqual(m.mealView.sorts, []);
  assert.deepEqual(shown(m), [
    ['Dawntrail', ['p', 'a', 'b']],
    ['Endwalker', ['c']],
  ]);
  // Spell Speed with Direct Hit: no meal has both, so the second pill stays off
  m.toggleMealStat('dh');
  assert.equal(m.mealPillOff('spd'), true);
  m.toggleMealStat('spd');
  assert.deepEqual(m.mealStats, ['dh']);
  assert.deepEqual(shown(m), [['Dawntrail', ['b']]]);
  // a search that leaves nothing: Clear search
  m.mealQuery = 'potage';
  assert.deepEqual(shown(m), []);
  assert.equal(m.mealView.empty.action, 'query');
  assert.ok(m.mealView.empty.text.includes('potage'), m.mealView.empty.text); // the query
});

test('Food menu: sorted by a stat while its pill is on; turning that pill off goes back to ILVL', () => {
  const { m } = menu();
  m.toggleMealMenu();
  m.toggleMealStat('det');
  m.toggleMealStat('crit');
  assert.deepEqual(
    m.mealView.sorts.map(o => o.label),
    ['ILVL', 'CRIT', 'DET'],
  );
  m.mealSortBy = 'crit';
  assert.deepEqual(shown(m), [['sorted', ['a', 'c']]]);
  // turning off another pill keeps the sort
  m.toggleMealStat('det');
  assert.equal(m.mealSortBy, 'crit');
  m.toggleMealStat('det');
  // turning off the sorted stat's pill: ILVL, and turning it back on does not bring the sort back
  m.toggleMealStat('crit');
  assert.equal(m.mealSortBy, 'ilvl');
  m.toggleMealStat('crit');
  assert.equal(m.mealSortBy, 'ilvl');
  assert.deepEqual(
    shown(m).map(([key]) => key),
    ['Dawntrail', 'Endwalker'],
  );
});

test('Food menu: the pills stay while they list a meal, else start over empty', () => {
  const { m, close } = menu();
  m.toggleMealMenu();
  m.toggleMealStat('crit');
  // the owner's change closes the menu; the pills stay
  close();
  assert.equal(m.mealOpen, false);
  m.toggleMealMenu();
  assert.deepEqual(m.mealStats, ['crit']);
  // Direct Hit, sorted by it; then other gear where no meal has it: the pills and sort start over
  m.toggleMealStat('crit');
  m.toggleMealStat('dh');
  m.mealSortBy = 'dh';
  close();
  m.menu = MENU_AFTER;
  m.toggleMealMenu();
  assert.deepEqual(m.mealStats, []);
  assert.equal(m.mealSortBy, 'ilvl');
});

test('Food menu: a meal picked closes the menu and the owner takes it; no menu shows nothing', () => {
  const { m, picked } = menu();
  assert.deepEqual(
    m.mealPills.map(p => p.stat),
    ['crit', 'det', 'dh', 'spd'],
  );
  assert.equal(m.mealItems.length, 4);
  m.toggleMealMenu();
  m.chooseMeal('c');
  assert.deepEqual([m.mealOpen, picked], [false, ['c']]);
  m.menu = null;
  assert.deepEqual(m.mealView, { sorts: [], groups: [], empty: null });
});

/* A click on `row` as the list's @click handler gets it (row null: a click on nothing in the list). */
const clickOn = row => ({ target: { closest: selector => (selector === '.same-item' ? row : null) } });

test("Food menu: one click handler on the list reads the clicked row's data-meal; No food is the empty key", () => {
  const { m, picked } = menu();
  m.toggleMealMenu();
  m.mealClick(clickOn({ dataset: { meal: 'a' } }));
  assert.deepEqual([m.mealOpen, picked], [false, ['a']]);
  m.toggleMealMenu();
  m.mealClick(clickOn({ dataset: { meal: '' } }));
  assert.deepEqual([m.mealOpen, picked], [false, ['a', null]]);
  // the Clear search button and a click off any row do nothing
  m.toggleMealMenu();
  m.mealClick(clickOn({ dataset: {} }));
  m.mealClick(clickOn(null));
  assert.deepEqual([m.mealOpen, picked], [true, ['a', null]]);
});
