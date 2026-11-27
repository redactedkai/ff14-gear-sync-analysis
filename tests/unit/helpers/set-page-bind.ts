/* Shared by the tests of a set page's logic (tests/unit/ui/elements/set-page/*.test.ts): its session (elements/set-page/session.ts) bound to
   a real sheet store over a stand-in storage, with a stand-in for the element it serves, and solver stand-ins (held, refused, late
   replies). */
import { saveSheet } from '../../../src/ui/sheets/storage.ts';
import { PageSession } from '../../../src/ui/elements/set-page/session.ts';
import { inProcessSolver } from '../../../src/ui/solver.ts';
import { makeJobContext } from '../../../src/core/job-context.ts';
import { fillButtonView, noPiecesFlag, setPageViews } from '../../../src/ui/views/set-page.ts';
import { standsFor } from './dom-fakes.ts';
import { mustFind } from './common.ts';
import { fakeStorage, placed, sageSet, sheetOf } from './sheet-fixtures.ts';
import { fakeFrames, stubElement } from './frames.ts';
import type { ElementCall } from './frames.ts';
import { createStores } from './stores.ts';
import type { SolveAnswer } from '../../../src/ui/solve.ts';
import type { Solver, SolverKind, SolverReply, SolverRequest } from '../../../src/ui/solver.ts';
import type { SessionHost } from '../../../src/ui/elements/set-page/session-types.ts';
import type { SavedGearSet } from '../../../src/ui/sheets/saved-types.ts';

/* The elements of the page the logic reaches by selector, by the name `calls` records them under; the frame callback runs at once in Node */
const PAGE_ELEMENTS: Record<string, string> = {
  '#sh-cancel': 'cancel',
  '#sh-apply': 'apply',
  '#sh-discard': 'discard',
  '#sh-fill': 'fill',
  '.gearbtn': 'gear',
  '#sh-set-switch': 'leaveKeep',
};
fakeFrames({ immediate: true });

const SGE = makeJobContext('SGE');
const HANDS = 4;
const FEET = 6;

/* The page's thread solver without its wait for a painted frame (Node paints nothing). */
export function pageThreadSolver(): Solver {
  const inner = inProcessSolver();
  return { blocksPage: false, request: request => inner.request(request), cancel: () => false };
}

/* A request that heldSolver holds: the request, `answer()` (sends the page thread's own reply to it) and `reject` (the
   rejection of its reply that Cancel sends). */
export interface HeldRequest {
  request: SolverRequest;
  answer: () => Promise<void>;
  reject: (error: Error) => void;
}

/* What heldSolver returns: a Solver with the requests it holds and the `[kind, key]` of each cancel. */
export interface HeldSolver extends Solver {
  held: HeldRequest[];
  cancelled: [SolverKind, string | number | undefined][];
}

/* A solver whose solves wait until the test answers them; Gear to search requests answer at once. */
export function heldSolver(): HeldSolver {
  const inner = inProcessSolver();
  const held: HeldRequest[] = [];
  const cancelled: HeldSolver['cancelled'] = [];
  return {
    held,
    cancelled,
    blocksPage: false,
    request<Result = unknown>(request: SolverRequest): Promise<SolverReply<Result>> {
      if (request.kind !== 'solve') {
        return inner.request<Result>(request);
      }
      return new Promise((resolve, reject) =>
        held.push({ request, answer: async () => resolve(await inner.request<Result>(request)), reject }),
      );
    },
    cancel(kind, key) {
      cancelled.push([kind, key]);
      for (const heldRequest of held.splice(0)) {
        heldRequest.reject(Object.assign(new Error('cancelled'), { cancelled: true }));
      }
      return true;
    },
  };
}

/* The element stand-in a bound session serves (SessionHost, with `isConnected` and `dialogOpen` the test can set). */
export interface FakeHost extends SessionHost {
  isConnected: boolean;
  dialogOpen: boolean;
}

/* The Sage set `gearSet` saved in a sheet (made with `sheetOptions`: sheetOf's level, sync), its page open, and the session over it.
   Returns {session, host (the element's stand-in: `isConnected` false is a page left), store, sheets, storage, solver, openSet() (the open set, saved; throws when none is open), calls (what the page's elements recorded, as [name, method, argument]), view() (the
   page's view now), mealMenu() (its Food menu), fillButton() (the Auto-fill button)}. */
export function bind(
  gearSet: SavedGearSet = sageSet(),
  solver: Solver = pageThreadSolver(),
  sheetOptions: Parameters<typeof sheetOf>[2] = {},
) {
  const storage = fakeStorage();
  saveSheet(sheetOf('SGE', [gearSet], sheetOptions), storage);
  const { store, sheets } = createStores(undefined, { storage });
  sheets.openSheet('s_1');
  sheets.openSet(gearSet.id);
  const calls: ElementCall[] = [];
  const elements = Object.fromEntries(Object.entries(PAGE_ELEMENTS).map(([selector, name]) => [selector, stubElement(calls, name)]));
  const host: FakeHost = {
    isConnected: true,
    dialogOpen: false,
    requestUpdate() {},
    afterDraw: (callback: () => void) => {
      if (host.isConnected) {
        callback();
      }
    },
    query: (selector: string) => elements[selector] ?? null,
  };
  const session = new PageSession({ store, sheets, solver, maxReal: 795 }, gearSet.id, host);
  session.start();
  const views = setPageViews();
  const view = () => views.view(sheets.rev, session.sheet, session.saved, session.draft, session.suggestion);
  return {
    session,
    host,
    store,
    sheets,
    storage,
    solver,
    calls,
    view,
    openSet: () => mustFind(sheets.currentSet, 'the open set'),
    mealMenu: () => {
      view();
      return views.mealMenu();
    },
    fillButton: () => fillButtonView(view(), { draft: session.draft, busy: sheets.busy, searchedCount: session.searchedCount }),
    noPiecesFlag: () => noPiecesFlag(session.searchedCount),
  };
}
/* The Sage set with the hands and feet rows empty and every other row pinned: an Auto-fill has the empty weapon row (a pin on
   an empty row keeps nothing), the hands, the feet and the meal to fill. */
export function twoToFill() {
  let set = sageSet({ pinned: { pieces: [0, 1, 2, 3, 5, 7, 8, 9, 10, 11], meal: false } });
  for (const row of [HANDS, FEET]) {
    set = placed(SGE, set, row, null);
  }
  return set;
}

/* What refusingSolver returns: a Solver and the kinds of request made so far. */
export interface RefusingSolver extends Solver {
  started: SolverKind[];
}

/* The page's thread solver with `failing` kinds of request refused, as a crashed or broken worker does; `blocksPage`
   and `started` (the kinds requested so far) let a test watch the paint wait. */
export function refusingSolver(failing: SolverKind[], { blocksPage = false } = {}): RefusingSolver {
  const inner = inProcessSolver();
  const started: SolverKind[] = [];
  return {
    blocksPage,
    started,
    request<Result = unknown>(request: SolverRequest): Promise<SolverReply<Result>> {
      started.push(request.kind);
      if (failing.includes(request.kind)) {
        return Promise.reject(new Error('worker crashed.'));
      }
      return inner.request<Result>(request);
    },
    cancel: () => false,
  };
}
/* A solver's reply with `result` as it is and the time `ms`. The result stands for the caller's `Result`, as the real solvers'
   replies do (the kind of request fixes it). */
export function solverReply<Result>(result: unknown, ms = 1): SolverReply<Result> {
  const reply = { result, ms };
  standsFor<SolverReply<Result>>(reply);
  return reply;
}

/* The page's thread solver, except that a `solve` request `scripted` answers (with a SolveAnswer) is not run: the answer comes back as
   the solver's own, in 1 ms. A request it answers `null` for goes to the real solver. */
export function scriptedSolver(scripted: (request: SolverRequest) => SolveAnswer | null): Solver {
  const inner = inProcessSolver();
  return {
    blocksPage: false,
    cancel: () => false,
    request<Result = unknown>(request: SolverRequest): Promise<SolverReply<Result>> {
      const answer = request.kind === 'solve' ? scripted(request) : null;
      if (!answer) {
        return inner.request<Result>(request);
      }
      return Promise.resolve(solverReply<Result>(answer));
    },
  };
}
export const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve));

/* A request that lateSolver holds: the request, and `answer()`, which sends the page thread's own reply to it. */
export interface LateRequest {
  request: SolverRequest;
  answer: () => Promise<void>;
}

/* What lateSolver returns: a Solver with the requests it holds and the `[kind, key]` of each cancel. */
export interface LateSolver extends Solver {
  held: LateRequest[];
  cancelled: [SolverKind, string | number | undefined][];
}

/* A solver whose replies the test sends, any time and in any order (a worker's reply already on its way when Cancel is
   pressed still arrives). `kinds` are the request kinds it holds; the others are answered at once. held[i].answer()
   replies to held request i with the page thread's own answer. cancel() only records: it does not reject what is held. */
export function lateSolver(kinds: SolverKind[] = ['solve']): LateSolver {
  const inner = inProcessSolver();
  const held: LateRequest[] = [];
  const cancelled: LateSolver['cancelled'] = [];
  return {
    held,
    cancelled,
    blocksPage: false,
    request<Result = unknown>(request: SolverRequest): Promise<SolverReply<Result>> {
      if (!kinds.includes(request.kind)) {
        return inner.request<Result>(request);
      }
      return new Promise(resolve => held.push({ request, answer: async () => resolve(await inner.request<Result>(request)) }));
    },
    cancel(kind, key) {
      cancelled.push([kind, key]);
      return true;
    },
  };
}
