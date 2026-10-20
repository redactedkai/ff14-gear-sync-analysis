/* The Food row's menu (src/ui/components/meal-menu.js), bound as Alpine binds it inside the optimizer component: the
   pills starting empty and kept across results while they still list a meal, the pinned group, the sort and its
   fallback, and a pick. The filters themselves (mealsPassing, mealPillOff, mealEmptyReason, sortMeals, mealList) are
   checked in ui-views-optimizer.test.js. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mealMenu } from '../../src/ui/components/meal-menu.js';

/* A meal of the hand-made menus: its stats in order, each with the points it adds. */
const meal = (key, name, adds, best = false) => ({
  key,
  name,
  stats: Object.keys(adds),
  adds: Object.entries(adds).map(([stat, value]) => ({ stat, text: `${stat} +${value}`, value })),
  best,
  on: false,
});
const PILLS = ['crit', 'det', 'dh', 'spd'].map(stat => ({ stat, short: stat.toUpperCase(), label: stat }));

/* A hand-made Food menu: one meal pinned (Critical Hit + Spell Speed), and below it Critical Hit + Determination and
   Critical Hit + Direct Hit in Dawntrail, Determination + Critical Hit in Endwalker. */
const VIEW = {
  food: {
    menu: {
      count: 1,
      pinned: [meal('p', 'Popoto Potage', { crit: 133, spd: 36 }, true)],
      groups: [
        {
          label: 'Dawntrail',
          items: [meal('a', 'Caramel Popcorn', { det: 125, crit: 91 }), meal('b', 'Rroneek au Gratin', { crit: 91, dh: 36 })],
        },
        { label: 'Endwalker', items: [meal('c', 'Baked Eggplant', { det: 103, crit: 62 })] },
      ],
      pills: PILLS,
    },
  },
};
/* The next result after a meal pick: Rroneek au Gratin is now the pinned one, and nothing below has Direct Hit. */
const VIEW_AFTER = {
  food: {
    menu: {
      ...VIEW.food.menu,
      pinned: [meal('b', 'Rroneek au Gratin', { crit: 91, dh: 36 }, true)],
      groups: [{ label: 'Dawntrail', items: [meal('a', 'Caramel Popcorn', { det: 125, crit: 91 })] }],
    },
  },
};

/* The menu inside a stand-in for the optimizer component: the result (`view`, `viewId`) and pickMeal. */
function menu() {
  const picked = [];
  let onNewResult = null;
  const m = Object.assign(mealMenu(), {
    view: VIEW,
    viewId: 1,
    pickMeal: key => picked.push(key),
    $watch: (_what, fn) => {
      onNewResult = fn;
    },
    $nextTick: () => {}, // focus and scrolling need a page
  });
  m.init();
  return { m, picked, newResult: () => onNewResult() };
}
const shown = m => m.mealView.groups.map(g => [g.key, g.items.map(x => x.key)]);

test('Food menu: opens with no pill; the pinned meal always shows, the pills narrow only the list below', () => {
  const { m } = menu();
  m.toggleMealMenu();
  assert.equal(m.mealOpen, true);
  assert.deepEqual(m.mealStats, []);
  assert.deepEqual(m.mealView.sorts, []);
  assert.deepEqual(shown(m), [
    ['best', ['p']],
    ['Dawntrail', ['a', 'b']],
    ['Endwalker', ['c']],
  ]);
  // Spell Speed: no meal below has it, so the pill stays off
  assert.equal(m.mealPillOff('spd'), true);
  m.toggleMealStat('spd');
  assert.deepEqual(m.mealStats, []);
  m.toggleMealStat('dh');
  assert.deepEqual(shown(m), [
    ['best', ['p']],
    ['Dawntrail', ['b']],
  ]);
  // a search that leaves nothing below: the pinned meal stays, with Clear search
  m.mealQuery = 'potage';
  assert.deepEqual(shown(m), [['best', ['p']]]);
  assert.deepEqual(m.mealView.empty, { text: 'No other meal matches "potage".', action: 'query' });
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
  assert.deepEqual(shown(m), [
    ['best', ['p']],
    ['sorted', ['a', 'c']],
  ]);
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
    ['best', 'Dawntrail', 'Endwalker'],
  );
});

test('Food menu: the pills stay across results while they list a meal below, else start over empty', () => {
  const { m, newResult } = menu();
  m.toggleMealMenu();
  m.toggleMealStat('crit');
  // a new result closes the menu; the pills stay
  newResult();
  assert.equal(m.mealOpen, false);
  m.viewId = 2;
  m.toggleMealMenu();
  assert.deepEqual(m.mealStats, ['crit']);
  // Direct Hit, sorted by it; then a result where no meal below has it: the pills and sort start over
  m.toggleMealStat('crit');
  m.toggleMealStat('dh');
  m.mealSortBy = 'dh';
  newResult();
  m.view = VIEW_AFTER;
  m.viewId = 3;
  m.toggleMealMenu();
  assert.deepEqual(m.mealStats, []);
  assert.equal(m.mealSortBy, 'ilvl');
});

test('Food menu: a meal picked closes the menu and searches again with it', () => {
  const { m, picked } = menu();
  m.toggleMealMenu();
  m.chooseMeal('b');
  assert.equal(m.mealOpen, false);
  assert.deepEqual(picked, ['b']);
});
