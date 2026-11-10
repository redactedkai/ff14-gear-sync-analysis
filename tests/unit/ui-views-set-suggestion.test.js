/* A Fill suggestion on a set page (src/ui/views/set-suggestion.js): the rows a Fill's answer changes with their Take
   boxes, the set as taken, the Now and After header, the Apply text, the table rows with the Take boxes
   (set-rows.js), and the answers that are no suggestion (bad pins, no set). Real Sage pieces: the saved set is the
   fixture's crafted item level 115 set; the "answer" swaps the bracelet for the Ironworks Bracelet of Healing (item
   level 120), changes the head's stones and adds a meal. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allMeals } from '../../src/core/food.js';
import { makeJobContext } from '../../src/core/job-context.js';
import { defaultFillSettings } from '../../src/ui/views/fill-settings.js';
import { evaluateInSheet, setFigures } from '../../src/ui/views/set-totals.js';
import { setRowsView } from '../../src/ui/views/set-rows.js';
import { SUGGESTION_LEAVE_TEXT, fillAnswerView, suggestionOf, suggestionView, takenSet } from '../../src/ui/views/set-suggestion.js';
import { SAGE_IDS, piece, sageSet, sheetOf } from './helpers/sheet-fixtures.js';

const sage = makeJobContext('SGE');
const sheet = sheetOf('SGE', []);
const MEAL = allMeals(sage).at(-1);
const BRACELET = 8624; // Ironworks Bracelet of Healing
const DET_STONES = [
  { stat: 'det', grade: 4 },
  { stat: 'det', grade: 4 },
  { stat: 'crit', grade: 3 },
];

/* A solve's plain set for Sage (pieces per slot type the job uses, in panel order; core/set.js), built from the saved
   rows of `gearSet` with `changes` ({slot: piece}) and `meal`. */
function answerSet(gearSet, changes, meal) {
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
  assert.deepEqual(v.takes, {
    2: { taken: true, text: 'melds CRT IV ×3 → DET IV ×2, CRT III' },
    9: { taken: true, text: 'was Mythrite Bangle of Healing' },
  });
  assert.deepEqual(v.mealTake, { taken: true, text: 'was none' });
  assert.deepEqual(
    [v.applyText, v.applyDisabled, v.discardText, v.leaveText],
    ['Apply 3 changes', false, 'Discard', SUGGESTION_LEAVE_TEXT],
  );
  assert.equal(v.appliedNote, 'Applied: 2 slots and the meal changed.');
  assert.deepEqual(
    v.header.map(h => [h.label, h.after]),
    [
      ['Now', false],
      ['After · 3 of 3 taken', true],
    ],
  );
  // Now is the saved set; After is the set as taken, with delta lines (Determination rises from the bracelet)
  assert.deepEqual(
    v.header[0].figures.map(f => f.text),
    setFigures(evaluateInSheet(sheet, saved)).map(f => f.text),
  );
  assert.equal(v.header[1].figures.find(f => f.key === 'det').change.up, true);
});

test('declining a row and the meal: the Take box names the suggested piece, the set as taken keeps the saved row', () => {
  const saved = sageSet();
  const suggested = suggestionOf(sheet, saved, ANSWER);
  const declined = { rows: [9], meal: true };
  const v = suggestionView(sheet, saved, suggested, declined);
  assert.deepEqual([v.total, v.taken, v.changedRows, v.mealChanged], [3, 1, [2], false]);
  assert.deepEqual(v.takes[9], { taken: false, text: 'suggested Ironworks Bracelet of Healing' });
  assert.deepEqual(v.mealTake, { taken: false, text: `suggested ${MEAL.name}` });
  assert.equal(v.header[1].label, 'After · 1 of 3 taken');
  assert.equal(v.applyText, 'Apply 1 change');
  const shown = takenSet(saved, suggested, declined);
  assert.deepEqual(v.shown, shown);
  assert.equal(shown.pieces[9].gameId, SAGE_IDS.wrist);
  assert.equal(shown.meal, null);
  assert.deepEqual(shown.pieces[2].stones, DET_STONES);
  // nothing taken: Apply is off
  const none = suggestionView(sheet, saved, suggested, { rows: [2, 9], meal: true });
  assert.deepEqual([none.applyText, none.applyDisabled, none.appliedNote], ['Nothing taken', true, 'Applied: no changes.']);
});

test('pinned rows never change; an answer equal to the set gives one "Now · no changes" row', () => {
  const saved = sageSet({ pinned: { pieces: [9], meal: false } });
  const suggested = suggestionOf(sheet, saved, ANSWER);
  // the bracelet row is pinned: the answer's bracelet does not land on it
  assert.equal(suggested.pieces[9].gameId, SAGE_IDS.wrist);
  const same = suggestionOf(sheet, sageSet(), answerSet(sageSet(), {}, null));
  const v = suggestionView(sheet, sageSet(), same);
  assert.deepEqual([v.total, v.applyText, v.applyDisabled], [0, 'Nothing to change', true]);
  assert.deepEqual(
    v.header.map(h => h.label),
    ['Now · no changes'],
  );
});

test('an empty set: one "Suggested · set is empty" row with the suggested figures', () => {
  const empty = { ...sageSet(), pieces: sageSet().pieces.map(row => ({ slot: row.slot })) };
  const suggested = suggestionOf(sheet, empty, ANSWER);
  const v = suggestionView(sheet, empty, suggested);
  assert.equal(v.header.length, 1);
  assert.equal(v.header[0].label, 'Suggested · set is empty');
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
  assert.deepEqual([byIndex[9].take.taken, byIndex[9].changed, byIndex[9].name], [false, false, 'Mythrite Bangle of Healing']);
  assert.equal(byIndex[3].take, null);
  assert.deepEqual([rows.food.take.taken, rows.food.name, rows.food.changed], [true, MEAL.name, true]);
});

test('answers that are no suggestion: bad pins are dropped and named; no set gives a plain line', () => {
  const saved = sageSet({ pinned: { pieces: [2, 11], meal: false } });
  const badpin = fillAnswerView(
    sheet,
    saved,
    { kind: 'badpin', messages: ['Sage cannot wear the piece pinned as ring.'], badPins: [{ index: 1, reason: 'wearable' }] },
    null,
  );
  assert.deepEqual(badpin, {
    kind: 'badpin',
    messages: ['Sage cannot wear the piece pinned as ring.'],
    pinnedRows: [2],
    droppedRows: [11],
    droppedText: 'Unpinned: Ring 2. Fill again to fill it.',
  });
  // a problem of the pins as a whole drops nothing
  const conflict = fillAnswerView(sheet, saved, { kind: 'badpin', messages: ['x'], badPins: [{ index: null, reason: 'conflict' }] });
  assert.deepEqual([conflict.droppedRows, conflict.droppedText, conflict.pinnedRows], [[], '', [2, 11]]);
  assert.deepEqual(fillAnswerView(sheet, saved, { kind: 'nogcd' }), { kind: 'failed', text: 'Fill found no set that fits this GCD.' });
  assert.deepEqual(fillAnswerView(sheet, saved, { kind: 'error', message: 'no answer after 60 s' }), {
    kind: 'failed',
    text: 'Fill failed: no answer after 60 s',
  });
  const ok = fillAnswerView(sheet, saved, { kind: 'ok', set: ANSWER });
  assert.equal(ok.kind, 'suggestion');
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
