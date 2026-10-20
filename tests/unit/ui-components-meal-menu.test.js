/* The Food row's menu (src/ui/components/meal-menu.js), bound as Alpine binds it inside the optimizer component: its
   pills preset once per result, the pill and switch moves, the list after its filters, and a pick. The filters
   themselves (mealsPassing, mealPillOff, mealEmptyReason) are checked in ui-views-optimizer.test.js. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mealMenu } from '../../src/ui/components/meal-menu.js';

/* A hand-made Food menu: two meals tagged best for the goal (Critical Hit + Determination, Critical Hit + Spell Speed)
   and one other (Critical Hit + Direct Hit), in two expansions; the goal presets Critical Hit. */
const VIEW = {
  food: {
    menu: {
      preset: ['crit'],
      groups: [
        {
          label: 'Dawntrail',
          items: [
            { key: 'a', name: 'Caramel Popcorn', stats: ['det', 'crit'], best: true },
            { key: 'b', name: 'Rroneek au Gratin', stats: ['crit', 'dh'], best: false },
          ],
        },
        { label: 'Endwalker', items: [{ key: 'c', name: 'Popoto Potage', stats: ['crit', 'spd'], best: true }] },
      ],
    },
  },
};

/* The menu inside a stand-in for the optimizer component: the result (`view`, `viewId`), the switch, and pickMeal. */
function menu() {
  const picked = [];
  let onNewResult = null;
  const m = Object.assign(mealMenu(), {
    view: VIEW,
    viewId: 1,
    mealBestOnly: true,
    pickMeal: key => picked.push(key),
    $watch: (_what, fn) => {
      onNewResult = fn;
    },
    $nextTick: () => {}, // focus and scrolling need a page
  });
  m.init();
  return { m, picked, newResult: () => onNewResult() };
}
const names = m => m.mealGroups.flatMap(g => g.items.map(x => x.name));

test('Food menu: opened, its pills start from the goal once per result; the player’s changes are kept until a new one', () => {
  const { m, newResult } = menu();
  m.toggleMealMenu();
  assert.equal(m.mealOpen, true);
  assert.deepEqual(m.mealStats, ['crit']);
  m.toggleMealStat('crit');
  m.toggleMealMenu();
  m.toggleMealMenu();
  assert.deepEqual(m.mealStats, [], 'the same result: the pills as the player left them');
  // a new result closes the menu, and the next opening presets again
  newResult();
  assert.equal(m.mealOpen, false);
  m.viewId = 2;
  m.toggleMealMenu();
  assert.deepEqual(m.mealStats, ['crit']);
});

test('Food menu: the list follows its switch, pills and search, empty groups dropped; a greyed-out pill stays off', () => {
  const { m } = menu();
  assert.deepEqual(names(m), ['Caramel Popcorn', 'Popoto Potage']);
  m.mealStats = ['crit', 'spd'];
  assert.deepEqual(
    m.mealGroups.map(g => g.label),
    ['Endwalker'],
  );
  // Direct Hit with Best for goal on would leave no meal: the pill does not turn on
  m.mealStats = ['crit'];
  assert.equal(m.mealPillOff('dh'), true);
  m.toggleMealStat('dh');
  assert.deepEqual(m.mealStats, ['crit']);
  // the switch off: every meal, and Direct Hit can be picked
  m.setMealBest(false);
  assert.equal(m.mealBestOnly, false);
  m.toggleMealStat('dh');
  assert.deepEqual(names(m), ['Rroneek au Gratin']);
  // the switch on again: the pills go back to the goal's, so the list is never emptied by it
  m.setMealBest(true);
  assert.deepEqual(m.mealStats, ['crit']);
  assert.equal(m.mealEmpty, null);
  m.mealQuery = 'zzz';
  assert.deepEqual(m.mealEmpty, { text: 'No meal matches "zzz".', action: 'query' });
});

test('Food menu: a meal picked closes the menu and searches again with it', () => {
  const { m, picked } = menu();
  m.toggleMealMenu();
  m.chooseMeal('b');
  assert.equal(m.mealOpen, false);
  assert.deepEqual(picked, ['b']);
});
