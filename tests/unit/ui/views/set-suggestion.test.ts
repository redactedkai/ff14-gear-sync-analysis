/* An Auto-fill suggestion on a set page (src/ui/views/set-suggestion.ts): the rows an Auto-fill's answer changes with their Take
   boxes, the set as taken, the Now and After header, the Apply text, the table rows with the Take boxes
   (set-rows.ts), and the answers that are no suggestion (bad pins, no set). Real Sage pieces: the saved set is the
   fixture's crafted item level 115 set; the "answer" swaps the bracelet for the Ironworks Bracelet of Healing (item
   level 120), changes the head's stones and adds a meal. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allMeals } from '../../../../src/core/food.ts';
import { makeJobContext } from '../../../../src/core/job-context.ts';
import { defaultFillSettings, fillRecipe } from '../../../../src/ui/sheets/fill-settings.ts';
import { unpinnedText } from '../../../../src/ui/sheets/fill.ts';
import { MEAL_ROW_LABEL } from '../../../../src/ui/sheets/saved-set.ts';
import { evaluateInSheet, setFigures } from '../../../../src/ui/views/set-totals.ts';
import { setRowsView } from '../../../../src/ui/views/set-rows.ts';
import {
  STEP_LIMIT_TEXT,
  SUGGESTION_LEAVE_TEXT,
  failedText,
  fillAnswerView,
  suggestionOf,
  suggestionView,
  takenSet,
} from '../../../../src/ui/views/set-suggestion.ts';
import { hasNumber, mustFind } from '../../helpers/fixtures/common.ts';
import type { GearSet } from '../../../../src/core/types.ts';
import type { SavedGearSet, SavedRow, SavedStone } from '../../../../src/ui/sheets/saved-types.ts';
import type { FillAnswer } from '../../../../src/ui/views/set-suggestion.ts';
import { SAGE_IDS, piece, sageSet, sheetOf } from '../../helpers/fixtures/sheet-fixtures.ts';

const sage = makeJobContext('SGE');
const sheet = sheetOf('SGE', []);
const MEAL = mustFind(allMeals(sage).at(-1), 'a meal');
const BRACELET = 8624; // Ironworks Bracelet of Healing
const DET_STONES: SavedStone[] = [
  { stat: 'det', grade: 4 },
  { stat: 'det', grade: 4 },
  { stat: 'crit', grade: 3 },
];

/* A solve's plain set for Sage (pieces per slot type the job uses, in panel order; core/set.ts), built from the saved
   rows of `gearSet` with `changes` ({slot: piece}) and `meal`. */
function answerSet(gearSet: SavedGearSet, changes: Partial<Record<string, SavedRow>>, meal: string | null): GearSet {
  const pieces = gearSet.pieces
    .filter(row => sage.activeSlotTypes.includes(row.slot))
    .map(row => changes[row.slot] ?? (row.gameId == null ? { slot: row.slot } : { ...row }));
  return { pieces, meal };
}
const ANSWER = answerSet(sageSet(), { wrist: piece('wrist', BRACELET), head: piece('head', SAGE_IDS.head, DET_STONES) }, MEAL.key);

test('suggestionOf puts the answer on the open rows; every change taken by default', () => {
  const saved = sageSet();
  const suggested = suggestionOf(sheet, saved, ANSWER);
  assert.equal(suggested.pieces[9].gameId, BRACELET);
  assert.deepEqual(suggested.pieces[2].stones, DET_STONES);
  assert.equal(suggested.meal, MEAL.key);
  const v = suggestionView(sheet, saved, suggested);
  assert.deepEqual([v.total, v.taken, v.changedRows, v.mealChanged], [3, 3, [2, 9], true]);
  assert.deepEqual(Object.keys(v.takes), ['2', '9']);
  assert.deepEqual(v.takes[2], { taken: true, text: 'melds CRT IV ×3 → DET IV ×2, CRT III' });
  assert.equal(v.takes[9].taken, true);
  assert.ok(v.takes[9].text.includes('Mythrite Bangle of Healing'), 'the bracelet it replaces'); // the saved piece
  const mealTake = mustFind(v.mealTake, 'the meal take box');
  assert.equal(mealTake.taken, true);
  assert.ok(mealTake.text.length > 0);
  assert.deepEqual([v.applyDisabled, v.leaveText], [false, SUGGESTION_LEAVE_TEXT]);
  assert.ok(hasNumber(v.applyText, 3), v.applyText);
  assert.ok(hasNumber(v.appliedNote, 2), v.appliedNote); // the two slots; the meal comes with them
  assert.deepEqual(
    v.header.map(h => h.after),
    [false, true],
  );
  assert.ok(hasNumber(v.header[1].label, 3), v.header[1].label); // 3 of 3 taken
  // Now is the saved set; After is the set as taken, with delta lines (Determination rises from the bracelet)
  assert.deepEqual(
    v.header[0].figures.map(f => f.text),
    setFigures(evaluateInSheet(sheet, saved)).map(f => f.text),
  );
  assert.equal(
    mustFind(
      v.header[1].figures.find(f => f.key === 'det'),
      'the Determination figure',
    ).change?.up,
    true,
  );
});

test('declining a row and the meal: the Take box names the suggested piece, the set as taken keeps the saved row', () => {
  const saved = sageSet();
  const suggested = suggestionOf(sheet, saved, ANSWER);
  const declined = { rows: [9], meal: true };
  const v = suggestionView(sheet, saved, suggested, declined);
  assert.deepEqual([v.total, v.taken, v.changedRows, v.mealChanged], [3, 1, [2], false]);
  assert.equal(v.takes[9].taken, false);
  assert.ok(v.takes[9].text.includes('Ironworks Bracelet of Healing'), v.takes[9].text); // the suggested piece
  const mealTake = mustFind(v.mealTake, 'the meal take box');
  assert.equal(mealTake.taken, false);
  assert.ok(mealTake.text.includes(MEAL.name), mealTake.text);
  assert.ok(hasNumber(v.header[1].label, 1) && hasNumber(v.header[1].label, 3), v.header[1].label); // 1 of 3 taken
  assert.ok(hasNumber(v.applyText, 1), v.applyText);
  const shown = takenSet(saved, suggested, declined);
  assert.deepEqual(v.shown, shown);
  assert.equal(shown.pieces[9].gameId, SAGE_IDS.wrist);
  assert.equal(shown.meal, null);
  assert.deepEqual(shown.pieces[2].stones, DET_STONES);
  // nothing taken: Apply is off
  const none = suggestionView(sheet, saved, suggested, { rows: [2, 9], meal: true });
  assert.equal(none.applyDisabled, true);
  assert.ok(none.applyText.length > 0 && none.applyText !== v.applyText, none.applyText);
  assert.equal(none.appliedNote, '', 'no note for an Apply that cannot happen');
});

test('pinned rows never change; an answer equal to the set gives one "Now · no changes" row', () => {
  const saved = sageSet({ pinned: { pieces: [9], meal: false } });
  const suggested = suggestionOf(sheet, saved, ANSWER);
  // the bracelet row is pinned: the answer's bracelet does not land on it
  assert.equal(suggested.pieces[9].gameId, SAGE_IDS.wrist);
  const same = suggestionOf(sheet, sageSet(), answerSet(sageSet(), {}, null));
  const v = suggestionView(sheet, sageSet(), same);
  assert.deepEqual([v.total, v.applyDisabled], [0, true]);
  assert.equal(v.header.length, 1, 'one row: the set as it is');
});

test('an empty set: one "Suggested · set is empty" row with the suggested figures', () => {
  const empty = { ...sageSet(), pieces: sageSet().pieces.map(row => ({ slot: row.slot })) };
  const suggested = suggestionOf(sheet, empty, ANSWER);
  const v = suggestionView(sheet, empty, suggested);
  assert.equal(v.header.length, 1);
  assert.deepEqual(
    v.header[0].figures.map(f => f.text),
    setFigures(evaluateInSheet(sheet, v.shown)).map(f => f.text),
  );
});

test('the table during a suggestion: each changed row and the Food row carry their Take box', () => {
  const saved = sageSet();
  const v = suggestionView(sheet, saved, suggestionOf(sheet, saved, ANSWER), { rows: [9], meal: false });
  const rows = setRowsView(evaluateInSheet(sheet, v.shown), v.shown, {
    changedRows: v.changedRows,
    mealChanged: v.mealChanged,
    takes: v.takes,
    mealTake: v.mealTake,
  });
  const byIndex = Object.fromEntries(rows.rows.map(r => [r.index, r]));
  assert.deepEqual(byIndex[2].take, { taken: true, text: 'melds CRT IV ×3 → DET IV ×2, CRT III' });
  assert.equal(byIndex[2].changed, true);
  assert.deepEqual([byIndex[9].take?.taken, byIndex[9].changed, byIndex[9].name], [false, false, 'Mythrite Bangle of Healing']);
  assert.equal(byIndex[3].take, null);
  assert.deepEqual([rows.food.take?.taken, rows.food.name, rows.food.changed], [true, MEAL.name, true]);
});

/* A solver answer that found a set: `set` with no best-meals list, at Sage's default recipe. */
const okAnswer = (set: GearSet) => ({
  kind: 'ok' as const,
  set,
  bestMeals: null,
  recipe: fillRecipe(defaultFillSettings(sage)),
  truncated: false,
});

/* `answer` as a bad-pins answer, a failed one or a suggestion; fails the test when it is another kind. */
function badpinOf(answer: FillAnswer): Extract<FillAnswer, { kind: 'badpin' }> {
  assert.ok(answer.kind === 'badpin', `a bad-pins answer, not ${answer.kind}`);
  return answer;
}
function failedOf(answer: FillAnswer): Extract<FillAnswer, { kind: 'failed' }> {
  assert.ok(answer.kind === 'failed', `a failed answer, not ${answer.kind}`);
  return answer;
}
function suggestionAnswerOf(answer: FillAnswer): Extract<FillAnswer, { kind: 'suggestion' }> {
  assert.ok(answer.kind === 'suggestion', `a suggestion, not ${answer.kind}`);
  return answer;
}

test('answers that are no suggestion: bad pins are dropped and named; no set gives a plain line', () => {
  const saved = sageSet({ pinned: { pieces: [2, 11], meal: false } });
  const badpin = badpinOf(fillAnswerView(sheet, saved, { kind: 'badpin', messages: ['x'], badPins: [{ index: 1, reason: 'wearable' }] }));
  assert.deepEqual(badpin, {
    kind: 'badpin',
    messages: ['x'],
    pinnedRows: [2],
    droppedRows: [11],
    mealDropped: false,
    droppedText: badpin.droppedText,
  });
  assert.equal(badpin.droppedText, unpinnedText(['Ring 2'], [])); // the row that was unpinned
  // a problem of the pins as a whole drops nothing
  const conflict = badpinOf(
    fillAnswerView(sheet, saved, { kind: 'badpin', messages: ['x'], badPins: [{ index: null, reason: 'conflict' }] }),
  );
  assert.deepEqual([conflict.droppedRows, conflict.droppedText, conflict.pinnedRows, conflict.mealDropped], [[], '', [2, 11], false]);
  // a meal problem names the meal row like a piece row and unpins the meal
  const mealSaved = sageSet({ pinned: { pieces: [2], meal: true } });
  const badMeal = badpinOf(
    fillAnswerView(sheet, mealSaved, { kind: 'badpin', messages: ['x'], badPins: [{ index: null, reason: 'meal' }] }),
  );
  assert.deepEqual([badMeal.mealDropped, badMeal.droppedRows, badMeal.pinnedRows], [true, [], [2]]);
  assert.equal(badMeal.droppedText, unpinnedText([MEAL_ROW_LABEL], []));
  const both = badpinOf(
    fillAnswerView(sheet, mealSaved, {
      kind: 'badpin',
      messages: ['x'],
      badPins: [
        { index: 0, reason: 'wearable' },
        { index: null, reason: 'meal' },
      ],
    }),
  );
  assert.equal(both.droppedText, unpinnedText(['Head', MEAL_ROW_LABEL], []));
  // a relic's row is named with its reason
  const relic = badpinOf(fillAnswerView(sheet, saved, { kind: 'badpin', messages: [], badPins: [{ index: 0, reason: 'relic' }] }));
  assert.equal(relic.droppedText, unpinnedText([], ['Head']));
  assert.deepEqual([relic.droppedRows, relic.pinnedRows], [[2], [11]]);
  const stopped = failedOf(fillAnswerView(sheet, saved, { kind: 'infeasible', truncated: false }));
  assert.deepEqual([stopped.kind, stopped.text], ['failed', STEP_LIMIT_TEXT]);
  const noGcd = failedOf(fillAnswerView(sheet, saved, { kind: 'nogcd', truncated: false }));
  assert.deepEqual([noGcd.kind, noGcd.text.length > 0], ['failed', true]);
  const errored = failedOf(fillAnswerView(sheet, saved, { kind: 'error', message: 'no answer after 60 s' }));
  assert.ok(errored.text.includes('no answer after 60 s'), errored.text); // the solver's own error
  assert.notEqual(errored.text, noGcd.text);
  const ok = suggestionAnswerOf(fillAnswerView(sheet, saved, okAnswer(ANSWER)));
  assert.equal(ok.suggested.meal, MEAL.key);
});

test('emptyNote: an empty slot with no piece up to the equip level under Gear to search says so (the lowest Sage weapon needs level 60)', () => {
  const saved = sageSet();
  const suggested = suggestionOf(sheet, saved, ANSWER);
  // the default equip level (the job's cap): a weapon exists, so nothing is said
  assert.equal(suggestionView(sheet, saved, suggested).emptyNote, '');
  // up to equip level 50: no Sage weapon can be searched
  const settings = defaultFillSettings(sage);
  settings.searchCriteria.lvl = 50;
  const low = { ...saved, fillSettings: settings };
  assert.equal(
    suggestionView(sheet, low, suggestionOf(sheet, low, ANSWER)).emptyNote,
    'Weapon: no Sage piece up to equip level 50, the lowest needs level 60.',
  );
});

test('the failure line has one build for a rejected request and a solver error: the message, then exactly one full stop', () => {
  const saved = sageSet();
  for (const message of ['boom', 'boom.', 'worker died: out of memory']) {
    const text = failedText(message);
    assert.ok(text.endsWith(`${message.replace(/\.$/, '')}.`), text);
    assert.ok(!text.endsWith('..'), text);
    assert.equal(
      failedOf(fillAnswerView(sheet, saved, { kind: 'error', message })).text,
      text,
      'the solver error answer builds it the same way',
    );
  }
});
