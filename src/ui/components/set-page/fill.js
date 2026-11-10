/* A set page's Fill and its answer: running the solver for the set's unpinned slots, Cancel, the suggestion with its Take
   boxes, and Apply or Discard on it. While a Fill runs, $store.sheets.busy locks every edit on the Sheets tab.
   A part of the setPage component (components/set-page.js composes the parts). */
import { clone } from '../../helpers.js';
import { isCancelled, solverRequest } from '../../solver.js';
import { fillPlan } from '../../views/fill.js';
import { fillRecipe } from '../../views/fill-settings.js';
import { appliedFields, fillAnswerView, suggestionView } from '../../views/set-suggestion.js';
import { evaluateInSheet } from '../../views/set-totals.js';
import { LOCKED_TABLE_TEXT } from './view.js';

/* `solver`: ui/solver.js's; `raw`: Alpine.raw or a stand-in; `page`: {el, refs} (frame.js). Returns the part's members. */
export function fillPart(solver, raw, page) {
  let fillId = 0;
  // the gear set id Fill is running for (its solver lane's key), or null
  let fillKey = null;

  return {
    // the Fill result waiting for Apply or Discard: {suggested ({pieces, meal}), declined: {rows, meal}}, or null
    suggestion: null,
    // this page's Fill is running
    running: false,
    // the tie list of a Fill with nothing to change, saved when the Fill ends (finishFill, endFill)
    bestMealsAfterFill: null,
    // a click on the table while a Fill result waits: the line saying why nothing changed
    // the line after a Fill that gave no suggestion (no set found, a pin dropped), '' for none
    fillLine: '',

    /* ---- Fill ---- */

    /* Fill the unpinned slots: the solver is asked with the set's Fill settings (saved the first time) and its pins, in
       the set's own lane (its id as the key); the answer shows as a suggestion, or as a line when there is none. */
    async fill() {
      const store = this.$store.sheets;
      const saved = this.saved;
      if (!saved || this.draft || store.busy || this.suggestion) return;
      const job = this.job;
      const plan = fillPlan(job, saved);
      if (plan.disabled) return;
      const settings = this.fillSettings;
      if (!saved.fillSettings) store.updateSet(saved.id, { fillSettings: settings });
      this.settingsOpen = false;
      this.open = null;
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
      // Cancel has the focus unless the Fill is already over (answered, or cancelled) by the time it is drawn
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
        if (id === fillId) this.finishFill(result, pins);
      } catch (error) {
        if (!isCancelled(error) && id === fillId) this.fillLine = `Fill failed: ${String(error?.message || error).replace(/\.$/, '')}.`;
      } finally {
        if (id === fillId) this.endFill();
      }
    },
    /* The solver's answer (`result`, views/solve.js solveView's) for the pins sent. */
    finishFill(result, pins) {
      const answer = fillAnswerView(this.sheet, this.saved, result, pins);
      if (answer.kind === 'suggestion') {
        this.suggestion = { suggested: answer.suggested, declined: { rows: [], meal: false } };
        // nothing to change: the set is already what Fill makes, so it keeps the meals tagged "best for goal" (Apply is off);
        // saved by endFill, once the sheet is no longer busy
        const bestMeals = answer.suggested.bestMeals;
        if (bestMeals && !suggestionView(this.sheet, this.saved, answer.suggested, this.suggestion.declined).total)
          this.bestMealsAfterFill = bestMeals;
        this.afterDraw(() =>
          requestAnimationFrame(() => {
            if (!page.el.isConnected) return;
            page.el.querySelector('tr.changed')?.scrollIntoView({ block: 'nearest' });
            (page.refs.apply.disabled ? page.refs.discard : page.refs.apply).focus({ preventScroll: true });
          }),
        );
        return;
      }
      if (answer.kind === 'badpin') {
        if (answer.droppedRows.length)
          this.$store.sheets.updateSet(this.saved.id, { pinned: { ...this.saved.pinned, pieces: answer.pinnedRows } });
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
    },
    /* Cancel: the Fill stops (the worker is replaced, ui/solver.js), the set stays as it is. */
    cancelFill() {
      if (!this.running) return;
      this.stopFill();
      this.$store.sheets.note = 'Fill cancelled.';
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
      this.$store.sheets.updateSet(this.saved.id, appliedFields(this.saved, s.suggested, s.declined));
      this.suggestion = null;
      this.$store.sheets.note = view.appliedNote;
      this.focusFill();
    },
    discardSuggestion() {
      if (!this.suggestion) return;
      this.suggestion = null;
      this.$store.sheets.note = 'Fill result discarded.';
      this.focusFill();
    },
    /* A click on the table while a Fill result waits: say why nothing happens, as a toast. */
    tableClick(event) {
      if (this.suggestion && !event.target.closest?.('.takebox')) this.$store.sheets.note = LOCKED_TABLE_TEXT;
    },
  };
}
