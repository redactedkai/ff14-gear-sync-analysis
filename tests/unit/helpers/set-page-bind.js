/* Shared by the tests of a set page's component (tests/unit/ui/components/set-page/*.test.js): the component bound to a real
   sheet store over a stand-in storage, as Alpine binds it, and solver stand-ins (held, refused, late replies). */
import { createSheetStore } from '../../../src/ui/sheets/store.js';
import { saveSheet } from '../../../src/ui/sheets/storage.js';
import { setPage } from '../../../src/ui/components/set-page.js';
import { inProcessSolver } from '../../../src/ui/solver.js';
import { placePiece } from '../../../src/ui/sheets/set-edits.js';
import { makeJobContext } from '../../../src/core/job-context.js';
import { fakeStorage, sageSet, sheetOf } from './sheet-fixtures.js';
import { fakeFrames, pageMagics } from './page-magics.js';

/* the page's refs (x-ref names in src/partials/set-page.html); the frame callback runs at once in Node */
const SET_PAGE_REFS = ['head', 'table', 'cancel', 'apply', 'discard', 'fill', 'gear', 'settings', 'leave', 'leaveKeep', 'setsButton'];
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
      if (request.kind !== 'solve') return inner.request(request);
      return new Promise((resolve, reject) => held.push({ request, resolve, reject }));
    },
    cancel(kind, key) {
      cancelled.push([kind, key]);
      for (const h of held.splice(0)) h.reject(Object.assign(new Error('cancelled'), { cancelled: true }));
      return true;
    },
  };
}

/* The Sage set `gearSet` saved in a sheet (made with `sheetOptions`: sheetOf's level, sync), its page open, and the
   component over it. */
export function bind(gearSet = sageSet(), solver = pageThreadSolver(), sheetOptions = {}) {
  const storage = fakeStorage();
  saveSheet(sheetOf('SGE', [gearSet], sheetOptions), storage);
  const sheets = createSheetStore({ storage });
  sheets.openSheet('s_1');
  sheets.openSet(gearSet.id);
  const c = setPage({ raw: value => value }, solver);
  const magics = pageMagics(SET_PAGE_REFS);
  // $watch records {getter, callback}; a test runs a callback by hand
  const watches = [];
  Object.assign(c, { $store: { sheets }, ...magics, $watch: (getter, callback) => watches.push({ getter, callback }), dialog: null });
  c.init();
  return { c, sheets, storage, solver, calls: magics.calls, watches };
}
/* The Sage set with the hands and feet rows empty and every other row pinned: an Auto-fill has the empty weapon row (a pin on
   an empty row keeps nothing), the hands, the feet and the meal to fill. */
export function twoToFill() {
  let set = sageSet({ pinned: { pieces: [0, 1, 2, 3, 5, 7, 8, 9, 10, 11], meal: false } });
  for (const row of [HANDS, FEET]) set = placePiece(SGE, set, row, null).gearSet;
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
      if (failing.includes(request.kind)) return Promise.reject(new Error('worker crashed.'));
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
      if (!kinds.includes(request.kind)) return inner.request(request);
      return new Promise(resolve => held.push({ request, answer: async () => resolve(await inner.request(request)) }));
    },
    cancel(kind, key) {
      cancelled.push([kind, key]);
      return true;
    },
  };
}
