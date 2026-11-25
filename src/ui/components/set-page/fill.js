/* A set page's Auto-fill and its answer: running the solver for the set's unpinned slots, Cancel, the suggestion with its Take
   boxes, and Apply or Discard on it. While an Auto-fill runs, $store.sheets.busy locks every edit on the Sheets tab.
   A part of the setPage component (components/set-page.js composes the parts). */
import { clone } from '../../text.ts';
import { frozenCopy } from '../../view-cache.ts';
import { overlays } from '../../overlays.js';
import { isCancelled, solverRequest } from '../../solver.js';
import { fillPlan } from '../../sheets/fill.js';
import { fillRecipe } from '../../sheets/fill-settings.js';
import { appliedFields, failedText, fillAnswerView, suggestionView } from '../../views/set-suggestion.js';
import { evaluateInSheet } from '../../views/set-totals.js';
import { FILL_CANCELLED_TEXT, LOCKED_TABLE_TEXT, RESULT_DISCARDED_TEXT } from './view.js';

/* A suggestion as the store keeps it: {suggested, declined} frozen all through (`suggested` is {pieces, meal, bestMeals}, as
   suggestionView reads it; `declined` {rows, meal}, the Take boxes switched off). */
function frozenSuggestion(suggested, declined) {
  return frozenCopy({ suggested, declined });
}

/* `solver`: ui/solver.js's; `page`: {el, refs, setId} (frame.js). Returns the part's members. The Auto-fill's status, the search's
   id, the result waiting and the line about it are in the store (page-state.js reads them; `pages` changes them). */
export function fillPart(solver, page) {
  // TODO: the two lists below stay in this closure, as the component's fields were: an answer sets one and the run's end saves it in
  // the same task. They would go into the page's entry in the store if an Auto-fill could end in a later task than its answer.
  // the tie list of an Auto-fill with nothing to change, saved when the Auto-fill ends (finishFill, endFill)
  let bestMealsAfterFill = null;
  // the pins left after an answer named pins it cannot keep, {pieces (the pinned rows left), meal (whether the meal stays
  // pinned)}, saved when the Auto-fill ends (finishFill, endFill): the sheet is busy until then, so an edit made as the
  // answer arrives is refused
  let pinsAfterFill = null;

  return {
    /* ---- Auto-fill ---- */

    /* Auto-fill the unpinned slots: the solver is asked with the set's Auto-fill settings (saved the first time) and its pins, in
       the set's own lane (its id as the key); the answer shows as a suggestion, or as a line when there is none. */
    async fill() {
      const store = this.$store.sheets;
      const saved = this.saved;
      if (!saved || this.draft || store.busy || this.suggestion) {
        return;
      }
      // the button is off with no piece to search, but only once the count is in: wait for it, then ask again
      if (this.countPending()) {
        await this.countLanded();
        if (this.searchedCount === 0 || this.saved !== saved || this.draft || store.busy || this.suggestion) {
          return;
        }
      }
      const job = this.job;
      const plan = fillPlan(job, saved);
      if (plan.disabled) {
        return;
      }
      const settings = this.fillSettings;
      if (!saved.fillSettings) {
        store.updateSet(saved.id, { fillSettings: settings });
      }
      overlays.closeAll();

      // the request: plain data only (a worker cannot be sent a proxy)
      const context = evaluateInSheet(this.sheet, saved);
      const pins = plan.pins && clone(plan.pins);
      const request = solverRequest(
        'solve',
        { job, sync: context.sync, level: context.level, recipe: fillRecipe(settings) },
        { key: saved.id, pins },
      );
      const id = this.pages.startFill(this.setId); // the status is 'running', and the line is cleared
      // TODO: the edit lock (`busy`, the Sheets tab's) is set beside the status, as before; it would follow `fill === 'running'`
      // if the lock were derived from the page entries instead of set by the page.
      store.setBusy(true);
      // Cancel has the focus unless the Auto-fill is already over (answered, or cancelled) by the time it is drawn
      this.afterDraw(() => {
        if (this.running) {
          page.refs.cancel.focus();
        }
      });
      // on the page's thread the solve holds it: paint "Solving…" first. Two frames: the first lays the button out, the
      // second paints it; the solve starts in a task after that frame (setTimeout), not in its callback, which runs
      // before the frame is painted
      if (solver.blocksPage) {
        await new Promise(painted => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(painted))));
      }
      try {
        if (!this.searchIs(id)) {
          return;
        }
        const { result, ms } = await solver.request(request);
        // the search's own time, not the wait for the worker's reply; read by scripts/perf/browser.mjs
        if (Number.isFinite(ms)) {
          performance.measure('fill', { start: performance.now() - ms, duration: ms });
        }
        if (this.searchIs(id)) {
          this.finishFill(id, result);
        }
      } catch (error) {
        if (!isCancelled(error)) {
          this.pages.fillEnded(this.setId, id, { line: failedText(error?.message || error), failed: true });
        }
      } finally {
        if (this.searchIs(id)) {
          this.endFill();
        }
      }
    },
    /* Whether search `id` is the one this page runs (an answer of a cancelled search, or of a page left, is not). */
    searchIs(id) {
      return this.pageState.fillId === id;
    },
    /* The solver's answer (`result`, solve.js solveView's) to search `id`. */
    finishFill(id, result) {
      const answer = fillAnswerView(this.sheet, this.saved, result);
      if (answer.kind === 'suggestion') {
        const suggestion = frozenSuggestion(answer.suggested, { rows: [], meal: false });
        if (!this.pages.fillSuggested(this.setId, id, suggestion)) {
          return;
        }
        // nothing to change: the set is already what Auto-fill makes, so it keeps the meals tagged "best for goal" (Apply is off);
        // saved by endFill, once the sheet is no longer busy
        const bestMeals = suggestion.suggested.bestMeals;
        if (bestMeals && !suggestionView(this.sheet, this.saved, suggestion.suggested, suggestion.declined).total) {
          bestMealsAfterFill = bestMeals;
        }
        this.afterDraw(() =>
          requestAnimationFrame(() => {
            if (!page.el.isConnected) {
              return;
            }
            page.el.querySelector('tr.changed')?.scrollIntoView({ block: 'nearest' });
            const { apply, discard } = page.refs;
            (apply?.disabled ? discard : apply)?.focus({ preventScroll: true });
          }),
        );
        return;
      }
      if (answer.kind === 'badpin') {
        if (answer.droppedRows.length || answer.mealDropped) {
          pinsAfterFill = { pieces: answer.pinnedRows, meal: Boolean(this.saved.pinned?.meal) && !answer.mealDropped };
        }
        this.pages.fillEnded(this.setId, id, { line: [...answer.messages, answer.droppedText].filter(Boolean).join(' ') });
        return;
      }
      this.pages.fillEnded(this.setId, id, { line: answer.text, failed: true });
    },
    /* The run is over (answered, failed or stopped): the sheet is no longer busy, and what the answer left to save is saved. */
    endFill() {
      this.pages.endFill(this.setId);
      this.$store.sheets.setBusy(false);
      if (bestMealsAfterFill) {
        this.$store.sheets.updateSet(this.saved.id, { bestMeals: bestMealsAfterFill });
      }
      bestMealsAfterFill = null;
      if (pinsAfterFill) {
        this.$store.sheets.updateSet(this.saved.id, { pinned: { ...this.saved.pinned, ...pinsAfterFill } });
      }
      pinsAfterFill = null;
    },
    /* Cancel: the Auto-fill stops (the worker is replaced, ui/solver.js), the set stays as it is. */
    cancelFill() {
      if (!this.running) {
        return;
      }
      this.stopFill();
      this.$store.sheets.setNote(FILL_CANCELLED_TEXT);
      this.focusFill();
    },
    stopFill() {
      this.pages.cancelFill(this.setId); // drops the search's id: its answer, if it still comes, is ignored
      this.endFill();
      solver.cancel('solve', this.setId);
    },
    /* A Take box of the suggestion: row `index` (or the meal, index null) taken or declined. */
    setTake(index, taken) {
      const s = this.suggestion;
      if (!s) {
        return;
      }
      const declined =
        index == null
          ? { ...s.declined, meal: !taken }
          : { ...s.declined, rows: taken ? s.declined.rows.filter(i => i !== index) : [...s.declined.rows, index] };
      this.pages.setSuggestion(this.setId, frozenSuggestion(s.suggested, declined));
    },
    /* Apply the suggestion as taken: final (no undo); the pins stay. */
    applySuggestion() {
      const s = this.suggestion;
      if (!s) {
        return;
      }
      const view = suggestionView(this.sheet, this.saved, s.suggested, s.declined);
      if (view.applyDisabled) {
        return;
      }
      this.$store.sheets.updateSet(this.saved.id, appliedFields(this.saved, s.suggested, s.declined, this.job));
      this.pages.setSuggestion(this.setId, null);
      this.$store.sheets.setNote(view.appliedNote);
      this.focusFill();
    },
    discardSuggestion() {
      if (!this.suggestion) {
        return;
      }
      this.pages.setSuggestion(this.setId, null);
      this.$store.sheets.setNote(RESULT_DISCARDED_TEXT);
      this.focusFill();
    },
    /* A click on the table while an Auto-fill result waits: say why nothing happens, as a toast. */
    tableClick(event) {
      if (this.suggestion && !event.target.closest?.('.takebox')) {
        this.$store.sheets.setNote(LOCKED_TABLE_TEXT);
      }
    },
  };
}
