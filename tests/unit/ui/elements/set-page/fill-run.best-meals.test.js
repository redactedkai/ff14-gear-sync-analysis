/* "Best for goal" on a set page (docs/engineering/ui.md, the Food row): an Auto-fill with Food on that is applied whole saves
   the meals tied for the best result with the set; the Food row says "best for goal" and the menu offers its
   switch while the set is as Auto-fill made it. A meal or piece changed by hand, a change of the Auto-fill settings, a declined Take
   box and Food off drop it. Real Sage gear at level 100 and at level 50, item level sync 123. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FoodMenuModel } from '../../../../../src/ui/elements/set-page/food-menu-model.ts';
import { fakeFrames } from '../../../helpers/frames.js';
import { bind, twoToFill } from '../../../helpers/set-page-bind.js';
import { SAGE_IDS } from '../../../helpers/sheet-fixtures.js';
import { createSheetsFacade } from '../../../helpers/stores.js';

fakeFrames({ immediate: true });

const FEET = 6;
const HANDS = 4;
const NO_NOTE = { note: '' };

/* A page for the two-rows-to-fill Sage set with Food on and Critical Hit the goal, an Auto-fill run and its result waiting. */
async function filled(sheetOptions = {}) {
  const page = bind(twoToFill(), undefined, sheetOptions);
  page.session.settings.setGoalField('food', true);
  page.session.settings.setGoal(0, 'crit');
  await page.session.fill.fill();
  assert.equal(page.view().mode, 'suggestion');
  return page;
}
const mealsOf = menu => menu.groups.flatMap(g => g.items);

test('Auto-fill then Apply whole: the tie list is saved, the Food row says "best for goal", the menu offers the switch', async () => {
  for (const sheetOptions of [{}, { level: 50, sync: { on: true, cap: 123 } }]) {
    const { session, sheets, storage, view, mealMenu } = await filled(sheetOptions);
    session.fill.applySuggestion();
    const saved = sheets.currentSet;
    assert.ok(saved.bestMeals.length > 1, 'several meals tie');
    assert.ok(saved.bestMeals.includes(saved.meal), 'the set holds one of them');
    assert.ok(view().rows.food.best.note.length > 0, 'the meal is tagged');
    // the Food menu: the switch is offered, the tagged meals are marked
    const menu = mealMenu();
    assert.equal(menu.hasBest, true);
    assert.deepEqual(
      mealsOf(menu)
        .filter(x => x.best)
        .map(x => x.key)
        .sort(),
      [...saved.bestMeals].sort(),
    );
    // a reload reads it back
    assert.deepEqual(createSheetsFacade({ storage }).sheet('s_1').sets[0].bestMeals, saved.bestMeals);
  }
});

test('a suggestion is not "best for goal" yet; a draft of the meal alone keeps the tags and the switch, one of a piece does not', async () => {
  const { session, view, mealMenu } = await filled();
  assert.deepEqual(view().rows.food.best, NO_NOTE);
  assert.equal(mealMenu().hasBest, false);
  session.fill.applySuggestion();
  assert.equal(mealMenu().hasBest, true);
  const tied = mealsOf(mealMenu()).filter(x => x.best).length;
  // a meal picked by hand: a draft that still offers the switch and the tagged meals; the note leaves the row
  const other = mealsOf(mealMenu()).find(x => !x.best);
  session.edits.setMeal(other.key);
  assert.equal(view().mode, 'draft');
  assert.deepEqual(view().rows.food.best, NO_NOTE, 'the picked meal is not tagged: no note');
  assert.equal(mealMenu().hasBest, true, 'the switch stays');
  assert.equal(mealsOf(mealMenu()).filter(x => x.best).length, tied);
  session.edits.discardDraft();
  assert.ok(view().rows.food.best.note.length > 0, 'Discard: the set is as Auto-fill made it again');
  // a piece changed by hand: no longer what Auto-fill made
  session.edits.pick(HANDS, null);
  assert.equal(view().mode, 'draft');
  assert.deepEqual(view().rows.food.best, NO_NOTE);
  assert.equal(mealMenu().hasBest, false);
  session.edits.discardDraft();
  assert.ok(view().rows.food.best.note.length > 0, 'the meal is tagged again');
});

test('a piece applied by hand drops the tags; a meal picked by hand and applied, or a pin, keeps them', async () => {
  const { session, sheets, view } = await filled();
  session.fill.applySuggestion();
  const tied = sheets.currentSet.bestMeals;
  session.edits.togglePin(HANDS);
  assert.deepEqual(sheets.currentSet.bestMeals, tied, 'a pin changes no piece');
  session.edits.pick(FEET, SAGE_IDS.feet);
  session.edits.applyDraft();
  assert.equal(sheets.currentSet.bestMeals, null);
  assert.deepEqual(view().rows.food.best, NO_NOTE);

  const second = await filled();
  second.session.fill.applySuggestion();
  const other = mealsOf(second.mealMenu()).find(x => !x.best);
  second.session.edits.setMeal(other.key);
  second.session.edits.applyDraft();
  assert.ok(second.sheets.currentSet.bestMeals.length > 1, 'the list stays');
  assert.equal(second.sheets.currentSet.meal, other.key);
  assert.deepEqual(second.view().rows.food.best, NO_NOTE, 'no note beside a meal that is not tagged');
  assert.equal(second.mealMenu().hasBest, true, 'the switch stays after Apply');
});

test('a change of the Auto-fill settings drops it, as it drops a waiting result', async () => {
  const { session, sheets, view } = await filled();
  session.fill.applySuggestion();
  assert.ok(sheets.currentSet.bestMeals);
  session.settings.setGoal(1, 'det');
  assert.equal(sheets.currentSet.bestMeals, null);
  assert.deepEqual(view().rows.food.best, NO_NOTE);
});

test('a declined Take box (a piece, or the meal) and an Auto-fill with Food off save no tie list', async () => {
  const declined = await filled();
  declined.session.fill.setTake(FEET, false);
  declined.session.fill.applySuggestion();
  assert.equal(declined.sheets.currentSet.bestMeals, null);

  const noMeal = await filled();
  noMeal.session.fill.setTake(null, false);
  noMeal.session.fill.applySuggestion();
  assert.equal(noMeal.sheets.currentSet.bestMeals, null);

  const off = bind(twoToFill());
  off.session.settings.setGoal(0, 'crit');
  off.session.settings.setGoalField('food', false);
  await off.session.fill.fill();
  off.session.fill.applySuggestion();
  assert.deepEqual([off.sheets.currentSet.bestMeals, off.sheets.currentSet.meal], [null, null]);
  assert.deepEqual(off.view().rows.food.best, NO_NOTE);
});

test('Auto-fill again after a hand edit (the piece unpinned) saves a new list; an Auto-fill with nothing to change saves one too', async () => {
  const { session, sheets, view } = await filled();
  session.fill.applySuggestion();
  session.edits.pick(FEET, SAGE_IDS.feet);
  session.edits.applyDraft();
  assert.equal(sheets.currentSet.bestMeals, null);
  session.edits.togglePin(FEET);
  await session.fill.fill();
  assert.ok(view().suggest.total > 0);
  session.fill.applySuggestion();
  const kept = sheets.currentSet.bestMeals;
  assert.ok(kept.length > 1);
  await session.fill.fill();
  assert.equal(view().suggest.total, 0, 'nothing to change: Apply is off');
  assert.deepEqual(sheets.currentSet.bestMeals, kept, 'the list is saved without Apply');
  session.fill.discardSuggestion();
  assert.deepEqual(sheets.currentSet.bestMeals, kept);
});

test('a set that is already what Auto-fill makes gets its list from an Auto-fill with nothing to change, with Apply off', async () => {
  const { session, sheets, view } = await filled();
  session.fill.applySuggestion();
  const tied = sheets.currentSet.bestMeals;
  sheets.updateSet(sheets.currentSet.id, { bestMeals: null });
  assert.deepEqual(view().rows.food.best, NO_NOTE);
  await session.fill.fill();
  assert.equal(view().suggest.total, 0, 'nothing to change');
  assert.deepEqual(sheets.currentSet.bestMeals, tied, 'the Auto-fill itself saved the list');
  session.fill.discardSuggestion();
  assert.ok(view().rows.food.best.note.length > 0, 'the meal is tagged again');
});

test('the Food menu: the switch is on at first and stays as left, turning it on clears the pills, and off lists every meal', async () => {
  const { session, mealMenu } = await filled();
  session.fill.applySuggestion();
  const m = new FoodMenuModel();
  m.menu = mealMenu();
  m.startOpen();
  const tied = mealsOf(mealMenu()).filter(x => x.best);
  assert.equal(m.bestOnly, true);
  assert.deepEqual(
    mealsOf(m.list)
      .map(x => x.key)
      .sort(),
    tied.map(x => x.key).sort(),
  );
  m.setBestOnly(false);
  const everyMeal = mealsOf(m.list);
  assert.ok(everyMeal.length > tied.length);
  assert.equal(everyMeal.filter(x => x.rowClass.includes('best')).length, tied.length);
  // a pill with the switch off, then the switch on again: the pills clear
  m.toggleStat(m.pills[0].stat);
  assert.equal(m.stats.length, 1);
  m.setBestOnly(true);
  assert.deepEqual([m.stats, m.sortBy], [[], 'ilvl']);
  // opened again: as left (off stays off)
  m.setBestOnly(false);
  m.startOpen();
  assert.equal(m.bestOnly, false);
});
