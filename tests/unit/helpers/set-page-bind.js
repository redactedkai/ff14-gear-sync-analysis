/* Shared by the tests of a set page's logic (tests/unit/ui/elements/set-page/*.test.js): its session (elements/set-page/session.ts) bound to
   a real sheet store over a stand-in storage, with a stand-in for the element it serves, and solver stand-ins (held, refused, late
   replies). */
import { saveSheet } from '../../../src/ui/sheets/storage.ts';
import { PageSession } from '../../../src/ui/elements/set-page/session.ts';
import { inProcessSolver } from '../../../src/ui/solver.ts';
import { placePiece } from '../../../src/ui/sheets/set-edits.ts';
import { makeJobContext } from '../../../src/core/job-context.ts';
import { fillButtonView, noPiecesFlag, setPageViews } from '../../../src/ui/views/set-page.ts';
import { fakeStorage, sageSet, sheetOf } from './sheet-fixtures.js';
import { fakeFrames, stubElement } from './frames.js';
import { createStores } from './stores.js';

/* The elements of the page the logic reaches by selector, by the name `calls` records them under; the frame callback runs at once in Node */
const PAGE_ELEMENTS = {
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
export function pageThreadSolver() {
  const inner = inProcessSolver();
  return { blocksPage: false, request: request => inner.request(request), cancel: () => false };
}
/* A solver whose solves wait until the test answers them; Gear to search requests answer at once. */
export function heldSolver() {
  const inner = inProcessSolver();
  const held = [];
  const cancelled = [];
  return {
    held,
    cancelled,
    blocksPage: false,
    request(request) {
      if (request.kind !== 'solve') {
        return inner.request(request);
      }
      return new Promise((resolve, reject) => held.push({ request, resolve, reject }));
    },
    cancel(kind, key) {
      cancelled.push([kind, key]);
      for (const h of held.splice(0)) {
        h.reject(Object.assign(new Error('cancelled'), { cancelled: true }));
      }
      return true;
    },
  };
}

/* The Sage set `gearSet` saved in a sheet (made with `sheetOptions`: sheetOf's level, sync), its page open, and the session over it.
   Returns {session, host (the element's stand-in: `isConnected` false is a page left), store, sheets, storage, solver, calls (what the page's elements recorded, as [name, method, argument]), view() (the
   page's view now), mealMenu() (its Food menu), fillButton() (the Auto-fill button)}. */
export function bind(gearSet = sageSet(), solver = pageThreadSolver(), sheetOptions = {}) {
  const storage = fakeStorage();
  saveSheet(sheetOf('SGE', [gearSet], sheetOptions), storage);
  const { store, sheets } = createStores(undefined, { storage });
  sheets.openSheet('s_1');
  sheets.openSet(gearSet.id);
  const calls = [];
  const elements = Object.fromEntries(Object.entries(PAGE_ELEMENTS).map(([selector, name]) => [selector, stubElement(calls, name)]));
  const host = {
    isConnected: true,
    dialogOpen: false,
    requestUpdate() {},
    afterDraw: callback => {
      if (host.isConnected) {
        callback();
      }
    },
    query: selector => elements[selector] ?? null,
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
    set = placePiece(SGE, set, row, null).gearSet;
  }
  return set;
}

/* The page's thread solver with `failing` kinds of request refused, as a crashed or broken worker does; `blocksPage`
   and `started` (the kinds requested so far) let a test watch the paint wait. */
export function refusingSolver(failing, { blocksPage = false } = {}) {
  const inner = inProcessSolver();
  const started = [];
  return {
    blocksPage,
    started,
    request(request) {
      started.push(request.kind);
      if (failing.includes(request.kind)) {
        return Promise.reject(new Error('worker crashed.'));
      }
      return inner.request(request);
    },
    cancel: () => false,
  };
}
export const tick = () => new Promise(resolve => setTimeout(resolve));

/* A solver whose replies the test sends, any time and in any order (a worker's reply already on its way when Cancel is
   pressed still arrives). `kinds` are the request kinds it holds; the others are answered at once. held[i].answer()
   replies to held request i with the page thread's own answer. cancel() only records: it does not reject what is held. */
export function lateSolver(kinds = ['solve']) {
  const inner = inProcessSolver();
  const held = [];
  const cancelled = [];
  return {
    held,
    cancelled,
    blocksPage: false,
    request(request) {
      if (!kinds.includes(request.kind)) {
        return inner.request(request);
      }
      return new Promise(resolve => held.push({ request, answer: async () => resolve(await inner.request(request)) }));
    },
    cancel(kind, key) {
      cancelled.push([kind, key]);
      return true;
    },
  };
}
