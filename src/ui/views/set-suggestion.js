/* A Fill suggestion on a set page: what a Fill's answer would change in the saved set, row by row with a Take box each in
   the set's own table, the header's Now and After figures ("After · 3 of 4 taken"), the Apply text, and the answers that
   are no suggestion (a pin the solve cannot keep, no set found). Nothing proposed is saved until Apply
   (docs/engineering/sheets.md, "Drafts and suggestions"): the suggestion is held in memory as the pieces and meal fill.js
   applyFill gives, plus the rows the player declined. Takes plain data (a saved Sheet and GearSet: sheets.md, "Saved
   data") and returns plain view objects. Pure: no Alpine, no store. */
import { makeJobContext } from '../../core/job-context.js';
import { equipLevel, jobGear } from '../../core/items.js';
import { applyFill, badPinMessages, dropBadPins, fillPlan } from './fill.js';
import { changeText, draftChanges } from './set-draft.js';
import { evaluateInSheet, figuresAgainst, setFigures } from './set-totals.js';
import { oneOrMany, plural } from '../helpers.js';
import { fillSettingsOf } from './fill-settings.js';
import { holdsPiece, rowLabel, sameRow, usedRows } from './saved-set.js';

/* The line on a set page while a Fill result waits for Apply or Discard and the page is left. */
export const SUGGESTION_LEAVE_TEXT = 'This Fill result has not been applied. Leaving drops it, and the set stays as it is.';

/* The rows of `saved` (a GearSet) a suggestion changes: the used, unpinned rows whose piece or stones differ from
   `suggested.pieces` (fill.js applyFill's rows). Row indexes in order. */
function changedRowsOf(job, saved, suggested) {
  const open = new Set(fillPlan(job, saved).openRows);
  return saved.pieces.flatMap((row, index) => (open.has(index) && !sameRow(row, suggested.pieces[index]) ? [index] : []));
}

/* The suggestion of a Fill answer for `saved`: `result` is an ok solve's plain `set` (core/set.js: pieces per active slot,
   and the meal), put on the set's open rows by applyFill; `bestMeals` the answer's tied best meals (views/solve.js, null
   with Food off). Returns {pieces, meal, bestMeals}, the set as Fill would leave it and the meals to tag "best for goal"
   if it is applied whole. */
export function suggestionOf(sheet, saved, result, bestMeals = null) {
  return { ...applyFill(makeJobContext(sheet.job), saved, result), bestMeals };
}

/* The set the player would keep: the suggested rows and meal where taken, the saved ones where declined. `declined`:
   {rows: saved row numbers whose Take box is off, meal: the meal's Take box is off}. Returns a GearSet (a copy of
   `saved` with the pieces and meal replaced), the set Apply saves. */
export function takenSet(saved, suggested, declined = { rows: [], meal: false }) {
  const off = new Set(declined.rows);
  return {
    ...saved,
    pieces: saved.pieces.map((row, index) => (off.has(index) ? row : suggested.pieces[index])),
    meal: declined.meal ? (saved.meal ?? null) : (suggested.meal ?? null),
  };
}

/* The fields Apply saves for a suggestion taken as `declined` says ({rows, meal}, as for takenSet): {pieces, meal,
   bestMeals}. The set is as Fill made it only when nothing is declined, so only then does it keep the tied best meals
   (suggested.bestMeals, null with Food off) that tag its meal "best for goal"; otherwise bestMeals is null. */
export function appliedFields(saved, suggested, declined = { rows: [], meal: false }) {
  const { pieces, meal } = takenSet(saved, suggested, declined);
  const asFillMadeIt = !declined.rows.length && !declined.meal;
  return { pieces, meal, bestMeals: asFillMadeIt ? (suggested.bestMeals ?? null) : null };
}

/* A suggestion as the set page shows it, for `saved` (the GearSet as saved), `suggested` ({pieces, meal}: suggestionOf)
   and `declined` ({rows, meal}: the Take boxes the player turned off; none by default). Returns:
   - shown: the GearSet the table draws (the suggested rows where taken, the saved ones where declined: takenSet);
   - takes: {row number: {taken, text}} for each row the suggestion changes, the Take box under its piece. text names
     the other piece: "was <saved piece>" while taken, "suggested <piece>" once declined, or "melds CRT XII ×2 → DET XI"
     when only the stones differ; mealTake: the same for the Food row, or null when the meal is the same;
   - changedRows: the taken rows (setRowsView's highlight), mealChanged: the meal is taken and differs;
   - total, taken: how many changes the suggestion has (rows plus the meal) and how many are taken;
   - header: the stat block's rows, [{label, after, figures}] as draftView's: "Now" and "After · 3 of 4 taken" with delta
     lines; one row "Suggested · set is empty" when the saved set has no piece (nothing to compare with), or "Now · no
     changes" when the suggestion changes nothing;
   - emptyNote: why a slot the suggestion leaves empty stays empty ("Weapon: no Sage piece up to equip level 50, the lowest needs
     level 60."), '' for none;
   - applyText ("Apply 3 changes", "Nothing taken", "Nothing to change"), applyDisabled, discardText, leaveText;
   - appliedNote: the plain note after Apply ("Applied: 2 slots and the meal changed."). */
export function suggestionView(sheet, saved, suggested, declined = { rows: [], meal: false }) {
  const job = makeJobContext(sheet.job);
  const off = new Set(declined.rows);
  const shown = takenSet(saved, suggested, declined);

  // 1. what the suggestion changes, and which of it is taken
  const rows = changedRowsOf(job, saved, suggested);
  const mealDiffers = (saved.meal ?? null) !== (suggested.meal ?? null);
  const takenRows = rows.filter(index => !off.has(index));
  const mealTaken = mealDiffers && !declined.meal;
  const total = rows.length + (mealDiffers ? 1 : 0);
  const taken = takenRows.length + (mealTaken ? 1 : 0);

  // 2. the Take boxes' texts, from the differences between the saved and the suggested rows (set-draft.js)
  const diff = draftChanges(job, saved, { ...saved, pieces: suggested.pieces, meal: suggested.meal ?? null });
  const takes = {};
  for (const change of diff.rows) {
    if (!rows.includes(change.index)) continue;
    const isTaken = !off.has(change.index);
    const text = change.meldsOnly
      ? `melds ${change.beforeStones} → ${change.afterStones}`
      : isTaken
        ? `was ${change.before}`
        : `suggested ${change.after}`;
    takes[change.index] = { taken: isTaken, text };
  }
  const mealTake = diff.meal && { taken: mealTaken, text: mealTaken ? `was ${diff.meal.before}` : `suggested ${diff.meal.after}` };

  // 3. the header: Now against the set as taken
  const nowFigures = setFigures(evaluateInSheet(sheet, saved));
  const afterFigures = setFigures(evaluateInSheet(sheet, shown));
  const emptySet = !holdsPiece(job, saved);
  let header;
  if (emptySet) header = [{ label: 'Suggested · set is empty', after: false, figures: plainFigures(afterFigures) }];
  else if (!total) header = [{ label: 'Now · no changes', after: false, figures: plainFigures(nowFigures) }];
  else
    header = [
      { label: 'Now', after: false, figures: plainFigures(nowFigures) },
      { label: `After · ${taken} of ${total} taken`, after: true, figures: figuresAgainst(nowFigures, afterFigures) },
    ];

  return {
    shown,
    takes,
    mealTake,
    changedRows: takenRows,
    mealChanged: mealTaken,
    total,
    taken,
    header,
    emptyNote: emptySlotNote(job, saved, shown),
    applyText: !total ? 'Nothing to change' : taken ? `Apply ${plural(taken, 'change')}` : 'Nothing taken',
    applyDisabled: !taken,
    discardText: 'Discard',
    leaveText: SUGGESTION_LEAVE_TEXT,
    appliedNote: taken ? `Applied: ${changeText(takenRows.length, mealTaken)} changed.` : 'Applied: no changes.',
  };
}

/* Figures with no delta line (the Now row, or a single row). */
function plainFigures(figures) {
  return figures.map(figure => ({ ...figure, change: null }));
}

/* What a set page shows for a Fill's answer that is not a suggestion, by the answer's kind (views/solve.js solveView): a
   plain line. 'badpin' is fillAnswerView's. */
const FAILURE_TEXT = {
  excluded: 'Fill found no gear to search: no piece passes the filters under Gear to search.',
  noset: 'Fill found no set.',
  nogcd: 'Fill found no set that fits this GCD.',
  infeasible: 'Fill stopped at its step limit before finding a set. Untick more boxes under Gear from and try again.',
};

/* The line that says why the slots a Fill leaves empty stay empty, '' for none. Only the case that can be named from
   the set's Fill settings: no piece of the slot has an equip level up to the one under Gear to search (its lowest equip
   level is above it), e.g. "Weapon: no Sage piece up to equip level 50, the lowest needs level 60." `shown` is the set
   as the page shows it, `saved` the saved set whose settings the Fill used. */
function emptySlotNote(job, saved, shown) {
  const limit = fillSettingsOf(job, saved).searchCriteria.lvl;
  if (limit === '' || limit == null) return '';
  const gear = jobGear(job);
  const notes = usedRows(job, shown)
    .filter(({ row }) => row.gameId == null)
    .flatMap(({ index, row }) => {
      const levels = gear.filter(item => item.type === row.slot).map(item => equipLevel(item) ?? 0);
      if (!levels.length) return [];
      const lowest = Math.min(...levels);
      if (lowest <= limit) return [];
      return [`${rowLabel(shown, index)}: no ${job.jobName} piece up to equip level ${limit}, the lowest needs level ${lowest}.`];
    });
  return notes.join(' ');
}

/* The answer of a Fill for `saved` (the GearSet as saved when Fill was pressed), `answer` being the solver's reply
   (views/solve.js solveView: {kind, ...}) and `pins` the pins sent (fill.js fillPlan's). Returns one of:
   - {kind: 'suggestion', suggested ({pieces, meal, bestMeals}: suggestionOf)}, for suggestionView;
   - {kind: 'badpin', messages (one plain line per problem, badPinMessages'), pinnedRows (the pins that stay),
     droppedRows (the rows whose pin is dropped), droppedText ("Unpinned: Ring 2, Body. Fill again to fill them.", ''
     when only the pins as a whole were the problem)}: the sheet drops those pins and says so;
   - {kind: 'failed', text}: no set, with the reason (an error's own message after "Fill failed: "). */
export function fillAnswerView(sheet, saved, answer, pins = null) {
  const job = makeJobContext(sheet.job);
  if (answer.kind === 'ok') return { kind: 'suggestion', suggested: suggestionOf(sheet, saved, answer.set, answer.bestMeals) };
  if (answer.kind === 'badpin') {
    const { pieces, dropped } = dropBadPins(job, saved, answer.badPins);
    const names = dropped.map(index => rowLabel(saved, index));
    return {
      kind: 'badpin',
      messages: answer.messages ?? badPinMessages(job, answer.badPins, pins),
      pinnedRows: pieces,
      droppedRows: dropped,
      droppedText: names.length ? `Unpinned: ${names.join(', ')}. Fill again to fill ${oneOrMany(names.length, 'it', 'them')}.` : '',
    };
  }
  if (answer.kind === 'error') return { kind: 'failed', text: `Fill failed: ${answer.message}` };
  return { kind: 'failed', text: FAILURE_TEXT[answer.kind] ?? `Fill found no set (${answer.kind}).` };
}
