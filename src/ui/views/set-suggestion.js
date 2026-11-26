/* An Auto-fill suggestion on a set page: what an Auto-fill's answer would change in the saved set, row by row with a Take box each in
   the set's own table, the header's Now and After figures ("After · 3 of 4 taken"), the Apply text, and the answers that
   are no suggestion (a pin the solve cannot keep, no set found). Nothing proposed is saved until Apply
   (docs/engineering/sheets.md, "Drafts and suggestions"): the suggestion is held in memory as the pieces and meal fill.js
   applyFill gives, plus the rows the player declined. Takes plain data (a saved Sheet and GearSet: sheets.md, "Saved
   data") and returns plain view objects. Pure: no store. */
import { makeJobContext } from '../../core/job-context.ts';
import { equipLevel, jobGear, poolItemById, slotInfo } from '../../core/items.ts';
import { applyFill, badPinMessages, dropBadPins, fillPlan, unpinnedText } from '../sheets/fill.js';
import { changeText, draftChanges } from './set-draft.js';
import { evaluateInSheet, figuresAgainst, setFigures } from './set-totals.js';
import { plural } from '../text.ts';
import { fillSettingsOf } from '../sheets/fill-settings.js';
import { MEAL_ROW_LABEL, holdsPiece, rowLabel, sameRow, usedRows } from '../sheets/saved-set.js';

/* The line on a set page while an Auto-fill result waits for Apply or Discard and the page is left. */
export const SUGGESTION_LEAVE_TEXT = 'This Auto-fill result has not been applied. Leaving drops it, and the set stays as it is.';

/* The rows of `saved` (a GearSet) a suggestion changes: the used, unpinned rows whose piece or stones differ from
   `suggested.pieces` (fill.js applyFill's rows). Row indexes in order. */
function changedRowsOf(job, saved, suggested) {
  const open = new Set(fillPlan(job, saved).openRows);
  return saved.pieces.flatMap((row, index) => (open.has(index) && !sameRow(row, suggested.pieces[index]) ? [index] : []));
}

/* The suggestion of an Auto-fill answer for `saved`: `result` is an ok solve's plain `set` (core/set.ts: pieces per active slot,
   and the meal), put on the set's open rows by applyFill; `bestMeals` the answer's tied best meals (solve.js, null
   with Food off). Returns {pieces, meal, bestMeals}, the set as Auto-fill would leave it and the meals to tag "best for goal"
   if it is applied whole. */
export function suggestionOf(sheet, saved, result, bestMeals = null) {
  return { ...applyFill(makeJobContext(sheet.job), saved, result), bestMeals };
}

/* The Take boxes as they stand once a covered Off-hand follows the weapon: a two-handed weapon in the set the player would keep
   covers the Off-hand row, so that row cannot hold a shield (placePiece refuses one). Each row's Take box is otherwise free,
   so a taken 2H weapon with the Off-hand declined (or a declined saved 2H weapon with a taken shield) would pair them. When
   the weapon as kept covers the Off-hand and the Off-hand row as kept holds a piece, the Off-hand row switches to
   whichever of the saved and suggested rows is empty. `declined` as for takenSet; returns {off, locked}: the set of declined
   row numbers, and the Off-hand row number whose Take box follows the weapon (null when it is free). `job` is the JobContext;
   without it the Take boxes stay as they are. */
function takeStateOf(job, saved, suggested, declined) {
  const off = new Set(declined.rows);
  if (!job) {
    return { off, locked: null };
  }
  const weapon = saved.pieces.findIndex(row => row.slot === 'weapon');
  const offhand = saved.pieces.findIndex(row => row.slot === 'offhand');
  if (weapon < 0 || offhand < 0) {
    return { off, locked: null };
  }
  const keptWeapon = off.has(weapon) ? saved.pieces[weapon] : suggested.pieces[weapon];
  const item = keptWeapon.gameId == null ? null : poolItemById(job, keptWeapon.gameId);
  if (!item || !slotInfo(job, item).blocks.includes('offhand')) {
    return { off, locked: null };
  }
  const savedOffhand = saved.pieces[offhand].gameId ?? null;
  const suggestedOffhand = suggested.pieces[offhand].gameId ?? null;
  // the covered Off-hand holds nothing: the suggested row when empty, else the saved one when empty
  if (suggestedOffhand == null) {
    off.delete(offhand);
  } else if (savedOffhand == null) {
    off.add(offhand);
  } else {
    return { off, locked: null };
  }
  return { off, locked: savedOffhand === suggestedOffhand ? null : offhand };
}

/** The set the player would keep: the suggested rows and meal where taken, the saved ones where declined. `declined`:
   {rows: saved row numbers whose Take box is off, meal: the meal's Take box is off}. `job` (a JobContext) lets a covered
   Off-hand follow the weapon (takeStateOf). Returns a GearSet (a copy of `saved` with the pieces and meal replaced), the
   set Apply saves.
   @param {{ rows: readonly number[], meal: boolean }} [declined] */
export function takenSet(saved, suggested, declined = { rows: [], meal: false }, job = null) {
  const { off } = takeStateOf(job, saved, suggested, declined);
  return {
    ...saved,
    pieces: saved.pieces.map((row, index) => (off.has(index) ? row : suggested.pieces[index])),
    meal: declined.meal ? (saved.meal ?? null) : (suggested.meal ?? null),
  };
}

/** The fields Apply saves for a suggestion taken as `declined` says ({rows, meal}, as for takenSet): {pieces, meal,
   bestMeals}. The set is as Auto-fill made it only when nothing is declined, so only then does it keep the tied best meals
   (suggested.bestMeals, null with Food off) that tag its meal "best for goal"; otherwise bestMeals is null.
   @param {{ rows: readonly number[], meal: boolean }} [declined]
   @param {import('../../core/types.ts').JobContext | null} [job] */
export function appliedFields(saved, suggested, declined = { rows: [], meal: false }, job = null) {
  const { pieces, meal } = takenSet(saved, suggested, declined, job);
  const asFillMadeIt = !declined.rows.length && !declined.meal;
  return { pieces, meal, bestMeals: asFillMadeIt ? (suggested.bestMeals ?? null) : null };
}

/** A suggestion as the set page shows it, for `saved` (the GearSet as saved), `suggested` ({pieces, meal}: suggestionOf)
   and `declined` ({rows, meal}: the Take boxes the player turned off; none by default). Returns:
   - shown: the GearSet the table draws (the suggested rows where taken, the saved ones where declined: takenSet);
   - takes: {row number: {taken, text, locked?}} for each row the suggestion changes, the Take box under its piece. locked (true, only
     then): a covered Off-hand's box, which follows the weapon's (takeStateOf). text names
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
   - appliedNote: the plain note after Apply ("Applied: 2 slots and meal changed."), '' when nothing is taken (Apply is off then,
     and applySuggestion returns before it reads the note).
   @param {{ rows: readonly number[], meal: boolean }} [declined] */
export function suggestionView(sheet, saved, suggested, declined = { rows: [], meal: false }) {
  const job = makeJobContext(sheet.job);
  const { off, locked } = takeStateOf(job, saved, suggested, declined);
  const shown = takenSet(saved, suggested, declined, job);

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
    if (!rows.includes(change.index)) {
      continue;
    }
    const isTaken = !off.has(change.index);
    let text = isTaken ? `was ${change.before}` : `suggested ${change.after}`;
    if (change.meldsOnly) {
      text = `melds ${change.beforeStones} → ${change.afterStones}`;
    }
    takes[change.index] = { taken: isTaken, text, ...(change.index === locked ? { locked: true } : {}) };
  }
  const mealTake = diff.meal && { taken: mealTaken, text: mealTaken ? `was ${diff.meal.before}` : `suggested ${diff.meal.after}` };

  // 3. the header: Now against the set as taken
  const nowFigures = setFigures(evaluateInSheet(sheet, saved));
  const afterFigures = setFigures(evaluateInSheet(sheet, shown));
  const emptySet = !holdsPiece(job, saved);
  const against = figuresAgainst(nowFigures, afterFigures);
  let header;
  if (emptySet) {
    header = [{ label: 'Suggested · set is empty', after: false, figures: plainFigures(afterFigures) }];
  } else if (!total) {
    header = [{ label: 'Now · no changes', after: false, figures: plainFigures(nowFigures) }];
  } else {
    header = [
      { label: 'Now', after: false, figures: plainFigures(nowFigures) },
      { label: `After · ${taken} of ${total} taken`, after: true, moved: against.some(figure => figure.change), figures: against },
    ];
  }

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
    applyText: applyTextOf(total, taken),
    applyDisabled: !taken,
    discardText: 'Discard',
    leaveText: SUGGESTION_LEAVE_TEXT,
    appliedNote: taken ? `Applied: ${changeText(takenRows.length, mealTaken)} changed.` : '',
  };
}

/* The Apply button's text: `total` changes are suggested, `taken` of them taken. */
function applyTextOf(total, taken) {
  if (!total) {
    return 'Nothing to change';
  }
  return taken ? `Apply ${plural(taken, 'change')}` : 'Nothing taken';
}

/* Figures with no delta line (the Now row, or a single row). */
function plainFigures(figures) {
  return figures.map(figure => ({ ...figure, change: null }));
}

/* The line for an Auto-fill that failed, `message` being the failure's own (a rejected request's or a solver error's): the
   same prefix, the message and exactly one full stop, whether or not the message ends with one. */
export function failedText(message) {
  return `Auto-fill failed: ${String(message).replace(/\.$/, '')}.`;
}

/* The line after an Auto-fill that stopped at its step limit ('infeasible') before finding a set. It gives no advice. */
export const STEP_LIMIT_TEXT = 'Auto-fill stopped at its step limit before finding a set.';

/* What a set page shows for an Auto-fill's answer that is not a suggestion, by the answer's kind (solve.js solveView): a
   plain line. 'badpin' is fillAnswerView's. Two kinds have no line of their own because the page cannot reach them: 'excluded'
   (no piece to search: the Auto-fill button is off, and a press before the first count lands waits for it) and 'noset' (without
   a Target GCD the search always finds a set); a kind not named here gets the generic line below. */
const FAILURE_TEXT = {
  nogcd: 'Auto-fill found no set that fits this GCD.',
  infeasible: STEP_LIMIT_TEXT,
};

/* The line that says why the slots an Auto-fill leaves empty stay empty, '' for none. Only the case that can be named from
   the set's Auto-fill settings: no piece of the slot has an equip level up to the one under Gear to search (its lowest equip
   level is above it), e.g. "Weapon: no Sage piece up to equip level 50, the lowest needs level 60." `shown` is the set
   as the page shows it, `saved` the saved set whose settings the Auto-fill used. */
function emptySlotNote(job, saved, shown) {
  const limit = fillSettingsOf(job, saved).searchCriteria.lvl;
  if (limit === '' || limit == null) {
    return '';
  }
  const gear = jobGear(job);
  const notes = usedRows(job, shown)
    .filter(({ row }) => row.gameId == null)
    .flatMap(({ index, row }) => {
      const levels = gear.filter(item => item.type === row.slot).map(item => equipLevel(item) ?? 0);
      if (!levels.length) {
        return [];
      }
      const lowest = Math.min(...levels);
      if (lowest <= limit) {
        return [];
      }
      return [`${rowLabel(shown, index)}: no ${job.jobName} piece up to equip level ${limit}, the lowest needs level ${lowest}.`];
    });
  return notes.join(' ');
}

/* The answer of an Auto-fill for `saved` (the GearSet as saved when Auto-fill was pressed), `answer` being the solver's reply
   (solve.js solveView: {kind, ...}). Returns one of:
   - {kind: 'suggestion', suggested ({pieces, meal, bestMeals}: suggestionOf)}, for suggestionView;
   - {kind: 'badpin', messages (one plain line per problem that names no row, badPinMessages'), pinnedRows (the pins that
     stay), droppedRows (the rows whose pin is dropped), mealDropped (the meal's pin is dropped), droppedText (unpinnedText:
     "Ring 2 and Food unpinned. Auto-fill again to fill them.", '' when only the pins as a whole were the problem)}: the sheet
     drops those pins and says so;
   - {kind: 'failed', text}: no set, with the reason (an error's own message after "Auto-fill failed: "). */
export function fillAnswerView(sheet, saved, answer) {
  const job = makeJobContext(sheet.job);
  if (answer.kind === 'ok') {
    return { kind: 'suggestion', suggested: suggestionOf(sheet, saved, answer.set, answer.bestMeals) };
  }
  if (answer.kind === 'badpin') {
    const { pieces, dropped, relicRows, mealDropped } = dropBadPins(job, saved, answer.badPins);
    const names = dropped.filter(index => !relicRows.includes(index)).map(index => rowLabel(saved, index));
    if (mealDropped) {
      names.push(MEAL_ROW_LABEL);
    }
    return {
      kind: 'badpin',
      messages: answer.messages ?? badPinMessages(answer.badPins),
      pinnedRows: pieces,
      droppedRows: dropped,
      mealDropped,
      droppedText: unpinnedText(
        names,
        relicRows.map(index => rowLabel(saved, index)),
      ),
    };
  }
  if (answer.kind === 'error') {
    return { kind: 'failed', text: failedText(answer.message) };
  }
  return { kind: 'failed', text: FAILURE_TEXT[answer.kind] ?? `Auto-fill found no set (${answer.kind}).` };
}
