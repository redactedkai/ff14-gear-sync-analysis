/* Story of <gsa-set-page>: a Sage set page over a real page store (the sheets slice over a stand-in storage), as the Sheets tab's wrapper
   would give it: the store, the set's id and its top line. The solver is a stand-in that answers every Gear to search count with a
   fixed line; no Auto-fill is run here (the page's smoke steps run it with the real solver). */
import { html } from 'lit';
import '../../../src/ui/elements/set-page/set-page.ts';
import { restoreState } from '../../../src/ui/state.ts';
import { saveSheet } from '../../../src/ui/sheets/storage.ts';
import { createPageStore } from '../../../src/ui/store/page-store.ts';
import { setHeaderView } from '../../../src/ui/views/sheet-sets.ts';
import type { Solver, SolverReply, SolverRequest } from '../../../src/ui/solver.ts';
import { fakeStorage, sageSet, sheetOf } from '../../unit/helpers/sheet-fixtures.ts';

/* The row of the head piece and the Sage head piece the story's set holds (SAGE_IDS.head in the unit tests' fixtures). */
export const HEAD_ROW = 2;

/* A solver whose answer to every request is `answer`. `request` is generic in the solver port (the caller names the result's
   type); a stand-in has no way to know it, so it keeps the overload's promise and answers with `unknown`. */
function standInSolver(answer: (request: SolverRequest) => Promise<SolverReply<unknown>>): Solver {
  function request<Result = unknown>(asked: SolverRequest): Promise<SolverReply<Result>>;
  function request(asked: SolverRequest): Promise<SolverReply<unknown>> {
    return answer(asked);
  }
  return { blocksPage: false, cancel: () => false, request };
}

/* The solver stand-in: counts answer at once with a line for the Gear to search count; nothing else is asked. */
export const solver = standInSolver(async () => ({
  result: {
    countText: 'searching 1,939 of 1,999 pieces',
    searched: 1939,
    fromCounts: null,
    gcdLabel: { name: 'Target GCD', range: '', haste: '', off: '', full: 'Target GCD' },
  },
  ms: 1,
}));

/* The set page over a real page store holding the Sage set, asking `answering` for every solver request. */
function setPageWith(answering: Solver) {
  const storage = fakeStorage();
  saveSheet(sheetOf('SGE', [sageSet()]), storage);
  const { store, sheets } = createPageStore({ restored: restoreState(null), storage });
  sheets.openSheet('s_1');
  sheets.openSet('g_1');
  const sheet = sheets.currentSheet;
  const set = sheets.currentSet;
  if (!sheet || !set) {
    throw new Error('the story set did not open');
  }
  const ports = { store, sheets, solver: answering, maxReal: 795 };
  return html`<gsa-set-page .ports=${ports} .setId=${'g_1'} .header=${setHeaderView(sheet, set)}></gsa-set-page>`;
}

export const Default = () => setPageWith(solver);

/* The set page with a solver that fails the Auto-fill (the counts still answer, so the button is on). `failure` is what the
   solver does when asked to solve: 'rejects' (the request itself fails with `message`), 'error' (it answers with an error of
   `message`), or 'infeasible' (it answers that it stopped at its step limit). */
export const FILL_ERROR_MESSAGE = 'the search ran out of memory';

export const FillFails = ({ failure = 'rejects' } = {}) =>
  setPageWith(
    standInSolver(async request => {
      if (request.kind !== 'solve') {
        return solver.request(request);
      }
      if (failure === 'rejects') {
        throw new Error(FILL_ERROR_MESSAGE);
      }
      return { result: failure === 'error' ? { kind: 'error', message: FILL_ERROR_MESSAGE } : { kind: 'infeasible' }, ms: 1 };
    }),
  );

/* The set page with a solver that never answers an Auto-fill (the counts still answer): the run stays on until Cancel, or until the
   page is left (the cancel asks the stand-in, which has nothing to stop). */
export const FillHeld = () =>
  setPageWith(standInSolver(request => (request.kind === 'solve' ? new Promise(() => {}) : solver.request(request))));
