/* What Apply saves of an Auto-fill result's tied best meals (src/ui/views/set-suggestion.js appliedFields and suggestionOf) and
   what the Food row shows of them (set-rows.js). Real Sage meals and pieces. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allMeals } from '../../../../src/core/food.ts';
import { makeJobContext } from '../../../../src/core/job-context.ts';
import { setRowsView } from '../../../../src/ui/views/set-rows.js';
import { appliedFields, suggestionOf } from '../../../../src/ui/views/set-suggestion.js';
import { evaluateInSheet } from '../../../../src/ui/views/set-totals.js';
import { piece, sageSet, sheetOf } from '../../helpers/sheet-fixtures.js';

const sage = makeJobContext('SGE');
const sheet = sheetOf('SGE', []);
const MEALS = allMeals(sage).slice(-3);
const TIED = MEALS.map(meal => meal.key);
const BRACELET = 8624; // Ironworks Bracelet of Healing

/* A solve's plain set: the saved rows with the wrist swapped, and the last tied meal. */
const answer = gearSet => ({
  pieces: gearSet.pieces
    .filter(row => sage.activeSlotTypes.includes(row.slot))
    .map(row => {
      if (row.slot === 'wrist') {
        return piece('wrist', BRACELET);
      }
      return row.gameId == null ? { slot: row.slot } : { ...row };
    }),
  meal: TIED[2],
});

test("suggestionOf carries the answer's tied meals; appliedFields saves them only when nothing is declined", () => {
  const saved = sageSet();
  const suggested = suggestionOf(sheet, saved, answer(saved), TIED);
  assert.deepEqual(suggested.bestMeals, TIED);
  assert.deepEqual(appliedFields(saved, suggested).bestMeals, TIED);
  assert.equal(appliedFields(saved, suggested, { rows: [9], meal: false }).bestMeals, null, 'a piece declined');
  assert.equal(appliedFields(saved, suggested, { rows: [], meal: true }).bestMeals, null, 'the meal declined');
  const taken = appliedFields(saved, suggested);
  assert.deepEqual([taken.pieces[9].gameId, taken.meal], [BRACELET, TIED[2]]);
  // Food off: the answer has no list
  assert.equal(appliedFields(saved, suggestionOf(sheet, saved, answer(saved))).bestMeals, null);
});

test('the Food row: "best for goal" for a tagged meal; a meal picked by hand, no meal and no tags show nothing', () => {
  const set = sageSet({ meal: TIED[2] });
  const view = bestKeys => setRowsView(evaluateInSheet(sheet, set), set, { bestKeys }).food.best;
  const tagged = view(TIED).note;
  assert.ok(tagged.length > 0, 'a tagged meal gets a note');
  assert.deepEqual(view([TIED[2]]), { note: tagged });
  assert.deepEqual(view([TIED[0], TIED[1]]), { note: '' }, 'the set meal is not among them');
  assert.deepEqual(view([]), { note: '' });
  const none = sageSet();
  assert.deepEqual(setRowsView(evaluateInSheet(sheet, none), none, { bestKeys: TIED }).food.best, { note: '' });
});
