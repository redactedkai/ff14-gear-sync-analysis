/* A set page's Auto-fill and its answer: running the solver for the set's unpinned slots, Cancel, the suggestion with its Take boxes,
   and Apply or Discard on it. While an Auto-fill runs, `sheets.busy` locks every edit on the Sheets tab. Part of the page's session
   (session.ts). The Auto-fill's status, the search's id, the result waiting and the line about it are in the store (`session.running`,
   `suggestion`, `fillLine`; `pages` changes them). */
import { overlays } from '../../overlays.js';
import { clone, messageOf } from '../../text.ts';
import { frozenCopy } from '../../view-cache.ts';
import { isCancelled, solverRequest } from '../../solver.ts';
import { fillPlan } from '../../sheets/fill.ts';
import { fillRecipe } from '../../sheets/fill-settings.ts';
import { appliedFields, failedText, fillAnswerView, suggestionView } from '../../views/set-suggestion.js';
import { evaluateInSheet } from '../../views/set-totals.js';
import { FILL_CANCELLED_TEXT, LOCKED_TABLE_TEXT, RESULT_DISCARDED_TEXT } from '../../views/set-page.js';
import type { Suggestion } from '../../store/app-state.ts';
import type { PageSession } from './session.ts';
import type { FillAnswer, GearPins } from './session-types.ts';

/* A suggestion as the store keeps it: {suggested, declined} frozen all through (`suggested` is {pieces, meal, bestMeals}, as
   suggestionView reads it; `declined` {rows, meal}, the Take boxes switched off). */
function frozenSuggestion(suggested: Suggestion['suggested'], declined: Suggestion['declined']): Suggestion {
  return frozenCopy({ suggested, declined });
}

/* The page's Auto-fill (`session.fill`): running it, Cancel, the suggestion with its Take boxes, Apply and Discard. */
export class PageFill {
  private readonly session: PageSession;
  // TODO: the two fields below stay here: an answer sets one and the run's end saves it in the same
  // task. They would go into the page's entry in the store if an Auto-fill could end in a later task than its answer.
  // the tie list of an Auto-fill with nothing to change, saved when the Auto-fill ends (finishFill, endFill)
  private bestMealsAfterFill: string[] | null;
  // the pins left after an answer named pins it cannot keep, {pieces (the pinned rows left), meal (whether the meal stays pinned)},
  // saved when the Auto-fill ends (finishFill, endFill): the sheet is busy until then, so an edit made as the answer arrives is
  // refused
  private pinsAfterFill: GearPins | null;

  /* `session`: the page's session (session.ts). */
  constructor(session: PageSession) {
    this.session = session;
    this.bestMealsAfterFill = null;
    this.pinsAfterFill = null;
  }

  /* Auto-fill the unpinned slots: the solver is asked with the set's Auto-fill settings (saved the first time) and its pins, in the
     set's own lane (its id as the key); the answer shows as a suggestion, or as a line when there is none. */
  async fill(): Promise<void> {
    const { session } = this;
    const { sheets, solver } = session;
    const saved = session.saved;
    if (!saved || session.draft || sheets.busy || session.suggestion) {
      return;
    }
    // the button is off with no piece to search, but only once the count is in: wait for it, then ask again
    if (session.settings.countPending()) {
      await session.settings.countLanded();
      if (session.searchedCount === 0 || session.saved !== saved || session.draft || sheets.busy || session.suggestion) {
        return;
      }
    }
    const job = session.job;
    const plan = fillPlan(job, saved);
    if (plan.disabled) {
      return;
    }
    const settings = session.fillSettings;
    if (!saved.fillSettings) {
      sheets.updateSet(saved.id, { fillSettings: settings });
    }
    overlays.closeAll();

    // the request: plain data only (a worker cannot be sent a proxy)
    const context = evaluateInSheet(session.sheet, saved);
    const pins = plan.pins && clone(plan.pins);
    const request = solverRequest(
      'solve',
      { job, sync: context.sync, level: context.level, recipe: fillRecipe(settings) },
      { key: saved.id, pins },
    );
    const id = session.pages.startFill(session.setId); // the status is 'running', and the line is cleared
    // no page is open for the set (it was left while the count was awaited): there is nothing to run for
    if (id === null) {
      return;
    }
    // TODO: the edit lock (`busy`, the Sheets tab's) is set beside the status, as before; it would follow `fill === 'running'` if the
    // lock were derived from the page entries instead of set by the page.
    sheets.setBusy(true);
    // Cancel has the focus unless the Auto-fill is already over (answered, or cancelled) by the time it is drawn
    session.afterDraw(() => {
      if (session.running) {
        session.host.query('#sh-cancel')?.focus();
      }
    });
    // on the page's thread the solve holds it: paint "Solving…" first. Two frames: the first lays the button out, the second paints
    // it; the solve starts in a task after that frame (setTimeout), not in its callback, which runs before the frame is painted
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
        session.pages.fillEnded(session.setId, id, { line: failedText(messageOf(error)), failed: true });
      }
    } finally {
      if (this.searchIs(id)) {
        this.endFill();
      }
    }
  }

  /* Whether search `id` is the one this page runs (an answer of a cancelled search, or of a page left, is not). */
  searchIs(id: number): boolean {
    return this.session.pageState.fillId === id;
  }

  /* The solver's answer (`result`, solve.ts solveView's) to search `id`. */
  finishFill(id: number, result: unknown): void {
    const { session } = this;
    const answer = fillAnswerView(session.sheet, session.saved, result) as FillAnswer;
    if (answer.kind === 'suggestion') {
      const suggestion = frozenSuggestion(answer.suggested, { rows: [], meal: false });
      if (!session.pages.fillSuggested(session.setId, id, suggestion)) {
        return;
      }
      // nothing to change: the set is already what Auto-fill makes, so it keeps the meals tagged "best for goal" (Apply is off); saved
      // by endFill, once the sheet is no longer busy
      const bestMeals = suggestion.suggested.bestMeals as string[] | null | undefined;
      if (bestMeals && !suggestionView(session.sheet, session.saved, suggestion.suggested, suggestion.declined).total) {
        this.bestMealsAfterFill = bestMeals;
      }
      session.afterDraw(() =>
        requestAnimationFrame(() => {
          if (!session.host.isConnected) {
            return;
          }
          session.host.query('tr.changed')?.scrollIntoView({ block: 'nearest' });
          const apply = session.host.query('#sh-apply') as HTMLButtonElement | null;
          const discard = session.host.query('#sh-discard');
          (apply?.disabled ? discard : apply)?.focus({ preventScroll: true });
        }),
      );
      return;
    }
    if (answer.kind === 'badpin') {
      if (answer.droppedRows.length || answer.mealDropped) {
        this.pinsAfterFill = { pieces: answer.pinnedRows, meal: Boolean(session.saved.pinned?.meal) && !answer.mealDropped };
      }
      session.pages.fillEnded(session.setId, id, { line: [...answer.messages, answer.droppedText].filter(Boolean).join(' ') });
      return;
    }
    session.pages.fillEnded(session.setId, id, { line: answer.text, failed: true });
  }

  /* The run is over (answered, failed or stopped): the sheet is no longer busy, and what the answer left to save is saved. */
  endFill(): void {
    const { session } = this;
    session.pages.endFill(session.setId);
    session.sheets.setBusy(false);
    if (this.bestMealsAfterFill) {
      session.sheets.updateSet(session.saved.id, { bestMeals: this.bestMealsAfterFill });
    }
    this.bestMealsAfterFill = null;
    if (this.pinsAfterFill) {
      session.sheets.updateSet(session.saved.id, { pinned: { ...session.saved.pinned, ...this.pinsAfterFill } });
    }
    this.pinsAfterFill = null;
  }

  /* Cancel: the Auto-fill stops (the worker is replaced, ui/solver.ts), the set stays as it is. */
  cancelFill(): void {
    const { session } = this;
    if (!session.running) {
      return;
    }
    this.stopFill();
    session.sheets.setNote(FILL_CANCELLED_TEXT);
    session.focusFill();
  }

  stopFill(): void {
    const { session } = this;
    session.pages.cancelFill(session.setId); // drops the search's id: its answer, if it still comes, is ignored
    this.endFill();
    session.solver.cancel('solve', session.setId);
  }

  /* A Take box of the suggestion: row `index` (or the meal, index null) taken or declined. */
  setTake(index: number | null, taken: boolean): void {
    const { session } = this;
    const { suggestion } = session;
    if (!suggestion) {
      return;
    }
    const declined =
      index == null
        ? { ...suggestion.declined, meal: !taken }
        : {
            ...suggestion.declined,
            rows: taken ? suggestion.declined.rows.filter(i => i !== index) : [...suggestion.declined.rows, index],
          };
    session.pages.setSuggestion(session.setId, frozenSuggestion(suggestion.suggested, declined));
  }

  /* Apply the suggestion as taken: final (no undo); the pins stay. */
  applySuggestion(): void {
    const { session } = this;
    const { suggestion } = session;
    if (!suggestion) {
      return;
    }
    const view = suggestionView(session.sheet, session.saved, suggestion.suggested, suggestion.declined);
    if (view.applyDisabled) {
      return;
    }
    session.sheets.updateSet(session.saved.id, appliedFields(session.saved, suggestion.suggested, suggestion.declined, session.job));
    session.pages.setSuggestion(session.setId, null);
    session.sheets.setNote(view.appliedNote);
    session.focusFill();
  }

  discardSuggestion(): void {
    const { session } = this;
    if (!session.suggestion) {
      return;
    }
    session.pages.setSuggestion(session.setId, null);
    session.sheets.setNote(RESULT_DISCARDED_TEXT);
    session.focusFill();
  }

  /* A click on the table while an Auto-fill result waits: say why nothing happens, as a toast. `target`: the element clicked. */
  tableClick(target: Element): void {
    if (this.session.suggestion && !target.closest?.('.takebox')) {
      this.session.sheets.setNote(LOCKED_TABLE_TEXT);
    }
  }
}
