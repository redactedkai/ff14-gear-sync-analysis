/* The set a set page shows and what it draws: the saved set and its sheet, the lock on every edit, and the view built once
   per change of the set, the draft or the suggestion (the stat block, the table, the totals, the Auto-fill and Apply buttons).
   A part of the setPage component (components/set-page.js composes the parts). */
import { makeJobContext } from '../../../core/job-context.js';
import { deepFreeze, viewCache } from '../../view-cache.ts';
import { fillPlan } from '../../sheets/fill.js';
import { fillSettingsOf, goalText } from '../../sheets/fill-settings.js';
import { mealBestKeys } from '../../views/meal-menu.js';
import { holdsPiece } from '../../sheets/saved-set.js';
import { draftView, samePieces } from '../../views/set-draft.js';
import { setMealMenuView } from '../../views/set-meal-menu.js';
import { setRowsView } from '../../views/set-rows.js';
import { suggestionView } from '../../views/set-suggestion.js';
import { bonusNote, evaluateInSheet, figureColumns, setFigures, setTotalsView } from '../../views/set-totals.js';

/* The line shown after a click on the table while an Auto-fill result waits. */
export const LOCKED_TABLE_TEXT = 'Pieces and stones can be changed after Apply or Discard.';

/* The note shown after an Auto-fill is cancelled while it runs (Cancel, or Leave on the leave question). */
export const FILL_CANCELLED_TEXT = 'Auto-fill cancelled.';

/* The note shown after an Auto-fill result is discarded (the Discard button, Escape, or Leave on the leave question). */
export const RESULT_DISCARDED_TEXT = 'Discarded: Auto-fill result.';

/* The Auto-fill button's title while Gear to search leaves no piece in the pool; also the chip's tooltip and spoken text. */
export const NO_PIECES_TEXT = 'No piece matches Gear to search.';

/* The chip beside the gear button while Gear to search leaves no piece in the pool. */
export const NO_PIECES_SHORT = 'No pieces to search';

/* A number per object, for a cache key that names a draft or a suggestion without serializing it (0 for none). Both are
   replaced on every change, never changed in place (the edits in sheets/set-edits.js and setTake return new objects),
   so the same object always holds the same set. */
const objectNumbers = new WeakMap();
let nextObjectNumber = 1;
function objectNumber(value) {
  if (value == null) {
    return 0;
  }
  if (!objectNumbers.has(value)) {
    objectNumbers.set(value, nextObjectNumber++);
  }
  return objectNumbers.get(value);
}

/* The set page view's cache key: the sheet store's change counter, the saved set's id, the draft and the suggestion.
   The view is read by about 70 bindings of the page on each change, so the key is made without serializing. */
function viewKey(rev, saved, draft, suggestion) {
  return `${rev}|${saved.id}|${objectNumber(draft)}|${objectNumber(suggestion)}`;
}

/* Returns the part's members. */
export function viewPart() {
  const cache = viewCache();
  const mealCache = viewCache();
  // the set the last built view shows and its evaluation (evaluateInSheet), for the Food menu; kept here, out of
  // reactive state
  let viewShown = null;

  return {
    /* ---- the set and its views ---- */

    get sheet() {
      return this.$store.sheets.currentSheet;
    },
    get saved() {
      return this.$store.sheets.currentSet;
    },
    get job() {
      return makeJobContext(this.sheet.job);
    },
    /* Every edit is off: an Auto-fill runs (anywhere on the tab) or its result waits. */
    get locked() {
      return this.$store.sheets.busy || !!this.suggestion;
    },
    /* The set's Auto-fill settings (fillSettingsOf: its own or the defaults). */
    get fillSettings() {
      return fillSettingsOf(this.job, this.saved);
    },

    /* What the page draws, built once per change of the set, the draft or the suggestion: {mode ('rest', 'draft',
       'suggestion'), rows (setRowsView of the set shown), totals (setTotalsView), head: the stat block {names, rows}
       ([] rows while a set at rest holds no piece), plan (fillPlan of the saved set), fillLabel, goalLine ("for MND ›
       CRT", '' while the set has no Auto-fill settings), apply {text, disabled} in a draft or a suggestion, leaveText, the
       views behind them (draftView or suggestionView, as `draft` or `suggest`)}. */
    get view() {
      const sheet = this.sheet;
      const saved = this.saved;
      const draft = this.draft;
      const suggestion = this.suggestion;
      return cache.get(viewKey(this.$store.sheets.rev, saved, draft, suggestion), () =>
        deepFreeze(this.buildView(sheet, saved, draft, suggestion)),
      );
    },
    buildView(sheet, saved, draft, suggestion) {
      const job = makeJobContext(sheet.job);
      const plan = fillPlan(job, saved);
      // the goal Auto-fill would use: the set's own Auto-fill settings, or the defaults while it has none (the goal line and the
      // rank badges show from the start)
      const goal = fillSettingsOf(job, saved).goal;

      // 1. the set shown and how it differs from the saved one
      let mode = 'rest';
      let shown = saved;
      // the meals tagged "best for goal": the saved list; a draft that changes only the meal or the pins keeps it, one that
      // changes a piece or a stone does not (nor does a suggestion)
      let bestKeys = mealBestKeys(saved);
      let options = { goal, bestKeys };
      let headRows;
      let apply = null;
      let leaveText = '';
      let suggest = null;
      let draftV = null;
      if (suggestion) {
        mode = 'suggestion';
        suggest = suggestionView(sheet, saved, suggestion.suggested, suggestion.declined);
        shown = suggest.shown;
        bestKeys = [];
        options = {
          goal,
          changedRows: suggest.changedRows,
          mealChanged: suggest.mealChanged,
          takes: suggest.takes,
          mealTake: suggest.mealTake,
        };
        headRows = suggest.header;
        apply = { text: suggest.applyText, disabled: suggest.applyDisabled };
        leaveText = suggest.leaveText;
      } else if (draft) {
        mode = 'draft';
        draftV = draftView(sheet, saved, draft);
        shown = draft;
        if (!samePieces(saved, draft)) {
          bestKeys = [];
        }
        options = { goal, bestKeys, changedRows: draftV.changedRows, mealChanged: draftV.mealChanged };
        headRows = draftV.header;
        apply = { text: draftV.applyText, disabled: draftV.applyDisabled };
        leaveText = draftV.leaveText;
      }

      // 2. the table and the stat block of the set shown
      const context = evaluateInSheet(sheet, shown);
      viewShown = { context, shown, bestKeys };
      const rows = setRowsView(context, shown, options);
      const totals = setTotalsView(context);
      const figures = setFigures(context);
      if (!headRows) {
        headRows = holdsPiece(job, shown) ? [{ label: 'Total', after: false, figures: figures.map(f => ({ ...f, change: null })) }] : [];
      }
      return {
        mode,
        rows,
        totals,
        head: { names: figures.map(f => ({ key: f.key, label: f.label })), columns: figureColumns(figures), rows: headRows },
        plan: { label: plan.label, disabled: plan.disabled, count: plan.count },
        goalLine: goal ? goalText(job, goal) : '',
        apply,
        leaveText,
        draft: draftV && { count: draftV.changes.count },
        suggest: suggest && { total: suggest.total, taken: suggest.taken, appliedNote: suggest.appliedNote, emptyNote: suggest.emptyNote },
        // what the totals count when the sheet sets a clan or a party bonus; else that they leave the clan out
        bonusNote: bonusNote(sheet),
      };
    },
    /* The Food menu of the set shown (setMealMenuView), built only when the menu reads it (while open), once per change
       of the set, the draft or the suggestion. */
    get mealMenuView() {
      const view = this.view; // built with the set it shows (viewShown)
      return mealCache.get(view, () => deepFreeze(setMealMenuView(viewShown.context, viewShown.shown, viewShown.bestKeys)));
    },

    /* The Auto-fill button's text, whether it is off, and its title: off in a draft, while an Auto-fill runs, with every slot
       pinned, and when Gear to search leaves no piece in the pool (the title then says so; null otherwise). */
    get fillButton() {
      const v = this.view;
      const noPieces = this.searchedCount === 0;
      return {
        text: v.plan.label,
        disabled: v.plan.disabled || !!this.draft || this.$store.sheets.busy || noPieces,
        title: noPieces ? NO_PIECES_TEXT : null,
      };
    },
    /* The chip beside the gear button, {short, full}: its few words and its sentence (tooltip, spoken text); null while the pool
       holds a piece or its count has not landed. The same condition as the Auto-fill button's title. */
    get noPiecesFlag() {
      return this.searchedCount === 0 ? { short: NO_PIECES_SHORT, full: NO_PIECES_TEXT } : null;
    },
    /* "for MND › CRT › DET": the goal of the set's Auto-fill settings, or of the defaults while it has none. */
    get goalSummary() {
      const line = this.view.goalLine;
      return line ? { goal: line } : null;
    },
  };
}
