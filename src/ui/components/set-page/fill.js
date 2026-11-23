/* A set page's Auto-fill and its answer: running the solver for the set's unpinned slots, Cancel, the suggestion with its Take
   boxes, and Apply or Discard on it. While an Auto-fill runs, $store.sheets.busy locks every edit on the Sheets tab.
   A part of the setPage component (components/set-page.js composes the parts). */
import { clone } from '../../text.js';
import { overlays } from '../../overlays.js';
import { isCancelled, solverRequest } from '../../solver.js';
import { fillPlan } from '../../sheets/fill.js';
import { fillRecipe } from '../../sheets/fill-settings.js';
import { appliedFields, failedText, fillAnswerView, suggestionView } from '../../views/set-suggestion.js';
import { evaluateInSheet } from '../../views/set-totals.js';
import { FILL_CANCELLED_TEXT, LOCKED_TABLE_TEXT, RESULT_DISCARDED_TEXT } from './view.js';

/* `solver`: ui/solver.js's; `raw`: Alpine.raw or a stand-in; `page`: {el, refs} (frame.js). Returns the part's members. */
export function fillPart(solver, raw, page) {
  let fillId = 0;
  // the gear set id Auto-fill is running for (its solver lane's key), or null
  let fillKey = null;

  return {
    // the Auto-fill result waiting for Apply or Discard: {suggested ({pieces, meal}), declined: {rows, meal}}, or null
    suggestion: null,
    // this page's Auto-fill is running
    running: false,
    // the tie list of an Auto-fill with nothing to change, saved when the Auto-fill ends (finishFill, endFill)
    bestMealsAfterFill: null,
    // the pins left after an answer named pins it cannot keep, {pieces (the pinned rows left), meal (whether the meal stays
    // pinned)}, saved when the Auto-fill ends (finishFill, endFill): the sheet is busy until then, so an edit made as the
    // answer arrives is refused
    pinsAfterFill: null,
    // a click on the table while an Auto-fill result waits: the line saying why nothing changed
    // the line after an Auto-fill that gave no suggestion (no set found, a pin dropped), '' for none
    fillLine: '',

    /* ---- Auto-fill ---- */

    /* Auto-fill the unpinned slots: the solver is asked with the set's Auto-fill settings (saved the first time) and its pins, in
       the set's own lane (its id as the key); the answer shows as a suggestion, or as a line when there is none. */
    async fill() {
      const store = this.$store.sheets;
      const saved = this.saved;
      if (!saved || this.draft || store.busy || this.suggestion) return;
      // the button is off with no piece to search, but only once the count is in: wait for it, then ask again
      if (this.countPending()) {
        await this.countLanded();
        if (this.searchedCount === 0 || this.saved !== saved || this.draft || store.busy || this.suggestion) return;
      }
      const job = this.job;
      const plan = fillPlan(job, saved);
      if (plan.disabled) return;
      const settings = this.fillSettings;
      if (!saved.fillSettings) store.updateSet(saved.id, { fillSettings: settings });
      overlays.closeAll();
      this.fillLine = '';

      // the request: plain data only (a worker cannot be sent a proxy)
      const context = evaluateInSheet(this.sheet, saved);
      const pins = plan.pins && clone(plan.pins);
      const request = solverRequest(
        'solve',
        { job, sync: context.sync, level: context.level, recipe: fillRecipe(settings) },
        { key: saved.id, pins },
      );
      const id = ++fillId;
      fillKey = saved.id;
      this.running = true;
      store.busy = true;
      // Cancel has the focus unless the Auto-fill is already over (answered, or cancelled) by the time it is drawn
      this.afterDraw(() => {
        if (this.running) page.refs.cancel.focus();
      });
      // on the page's thread the solve holds it: paint "Solving…" first. Two frames: the first lays the button out, the
      // second paints it; the solve starts in a task after that frame (setTimeout), not in its callback, which runs
      // before the frame is painted
      if (solver.blocksPage) await new Promise(painted => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(painted))));
      try {
        if (id !== fillId) return;
        const { result, ms } = await solver.request(request);
        // the search's own time, not the wait for the worker's reply; read by scripts/perf/browser.mjs
        if (Number.isFinite(ms)) performance.measure('fill', { start: performance.now() - ms, duration: ms });
        if (id === fillId) this.finishFill(result);
      } catch (error) {
        if (!isCancelled(error) && id === fillId) this.fillLine = failedText(error?.message || error);
      } finally {
        if (id === fillId) this.endFill();
      }
    },
    /* The solver's answer (`result`, solve.js solveView's). */
    finishFill(result) {
      const answer = fillAnswerView(this.sheet, this.saved, result);
      if (answer.kind === 'suggestion') {
        this.suggestion = { suggested: answer.suggested, declined: { rows: [], meal: false } };
        // nothing to change: the set is already what Auto-fill makes, so it keeps the meals tagged "best for goal" (Apply is off);
        // saved by endFill, once the sheet is no longer busy
        const bestMeals = answer.suggested.bestMeals;
        if (bestMeals && !suggestionView(this.sheet, this.saved, answer.suggested, this.suggestion.declined).total)
          this.bestMealsAfterFill = bestMeals;
        this.afterDraw(() =>
          requestAnimationFrame(() => {
            if (!page.el.isConnected) return;
            page.el.querySelector('tr.changed')?.scrollIntoView({ block: 'nearest' });
            const { apply, discard } = page.refs;
            (apply?.disabled ? discard : apply)?.focus({ preventScroll: true });
          }),
        );
        return;
      }
      if (answer.kind === 'badpin') {
        if (answer.droppedRows.length || answer.mealDropped)
          this.pinsAfterFill = { pieces: answer.pinnedRows, meal: !!this.saved.pinned?.meal && !answer.mealDropped };
        this.fillLine = [...answer.messages, answer.droppedText].filter(Boolean).join(' ');
        return;
      }
      this.fillLine = answer.text;
    },
    endFill() {
      this.running = false;
      fillKey = null;
      this.$store.sheets.busy = false;
      if (this.bestMealsAfterFill) this.$store.sheets.updateSet(this.saved.id, { bestMeals: this.bestMealsAfterFill });
      this.bestMealsAfterFill = null;
      if (this.pinsAfterFill) this.$store.sheets.updateSet(this.saved.id, { pinned: { ...this.saved.pinned, ...this.pinsAfterFill } });
      this.pinsAfterFill = null;
    },
    /* Cancel: the Auto-fill stops (the worker is replaced, ui/solver.js), the set stays as it is. */
    cancelFill() {
      if (!this.running) return;
      this.stopFill();
      this.$store.sheets.note = FILL_CANCELLED_TEXT;
      this.focusFill();
    },
    stopFill() {
      const key = fillKey;
      fillId++;
      this.endFill();
      solver.cancel('solve', key);
    },
    /* A Take box of the suggestion: row `index` (or the meal, index null) taken or declined. */
    setTake(index, taken) {
      const s = raw(this.suggestion);
      if (!s) return;
      const declined =
        index == null
          ? { ...s.declined, meal: !taken }
          : { ...s.declined, rows: taken ? s.declined.rows.filter(i => i !== index) : [...s.declined.rows, index] };
      this.suggestion = { ...s, declined };
    },
    /* Apply the suggestion as taken: final (no undo); the pins stay. */
    applySuggestion() {
      const s = raw(this.suggestion);
      if (!s) return;
      const view = suggestionView(this.sheet, this.saved, s.suggested, s.declined);
      if (view.applyDisabled) return;
      this.$store.sheets.updateSet(this.saved.id, appliedFields(this.saved, s.suggested, s.declined, this.job));
      this.suggestion = null;
      this.$store.sheets.note = view.appliedNote;
      this.focusFill();
    },
    discardSuggestion() {
      if (!this.suggestion) return;
      this.suggestion = null;
      this.$store.sheets.note = RESULT_DISCARDED_TEXT;
      this.focusFill();
    },
    /* A click on the table while an Auto-fill result waits: say why nothing happens, as a toast. */
    tableClick(event) {
      if (this.suggestion && !event.target.closest?.('.takebox')) this.$store.sheets.note = LOCKED_TABLE_TEXT;
    },
  };
}
