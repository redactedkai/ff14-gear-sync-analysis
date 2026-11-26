/* A set page's Auto-fill (src/ui/elements/set-page/fill-run.ts) bound to a real sheet store: a real Auto-fill on the
   page's thread with its suggestion (Take boxes, Apply, Discard), the edit lock while it runs or its result waits, Cancel,
   a failing solver and replies that arrive late. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeFrames } from '../../../helpers/frames.js';
import {
  FILL_CANCELLED_TEXT,
  LOCKED_TABLE_TEXT,
  NO_PIECES_SHORT,
  NO_PIECES_TEXT,
  RESULT_DISCARDED_TEXT,
} from '../../../../../src/ui/views/set-page.js';
import { LOCKED_TEXT } from '../../../../../src/ui/sheets/store-shared.js';
import { inProcessSolver } from '../../../../../src/ui/solver.js';
import { makeSession } from '../../../../../src/core/session.ts';
import { bind, heldSolver, lateSolver, refusingSolver, tick, twoToFill } from '../../../helpers/set-page-bind.js';
import { hasNumber } from '../../../helpers/common.js';
import { sageSet } from '../../../helpers/sheet-fixtures.js';
import { MEAL_ROW_LABEL } from '../../../../../src/ui/sheets/saved-set.js';
import { makeJobContext } from '../../../../../src/core/job-context.ts';
import { defaultFillSettings } from '../../../../../src/ui/sheets/fill-settings.js';

const HEAD = 2;
const HANDS = 4;
const FEET = 6;

test('Auto-fill: a real search fills the unpinned rows; Take boxes choose what Apply saves; the page is locked meanwhile', async () => {
  const { session, sheets, view, fillButton } = bind(twoToFill());
  await tick(); // the first piece count lands before a person presses the button
  assert.ok(hasNumber(fillButton().text, 4), fillButton().text);
  const running = session.fill.fill();
  assert.deepEqual([session.running, sheets.busy, session.locked], [true, true, true]);
  assert.deepEqual(sheets.editSet('g_1', { name: 'x', description: '' }), { ok: false, error: LOCKED_TEXT });
  await running;
  assert.deepEqual([session.running, sheets.busy], [false, false]);
  assert.ok(sheets.currentSet.fillSettings, 'the Auto-fill settings are saved with the first Auto-fill');
  assert.equal(view().mode, 'suggestion');
  assert.equal(view().suggest.total, 4, 'the weapon, the hands, the feet and the meal proposed (Food is on by default)');

  // locked: a piece cannot be changed, and a click on the table says why
  session.edits.pick(HEAD, null);
  assert.equal(session.draft, null);
  session.fill.tableClick({ closest: () => null });
  assert.equal(sheets.note, LOCKED_TABLE_TEXT);

  // decline the feet: the weapon, the hands and the meal are applied
  session.fill.setTake(FEET, false);
  assert.equal(view().suggest.taken, 3, 'the weapon, the hands and the meal');
  session.fill.applySuggestion();
  assert.equal(session.suggestion, null);
  assert.notEqual(sheets.currentSet.pieces[HANDS].gameId, undefined);
  assert.notEqual(sheets.currentSet.pieces[0].gameId, undefined);
  assert.equal(sheets.currentSet.pieces[FEET].gameId, undefined);
  const appliedNote = sheets.note;
  assert.ok(appliedNote, 'Apply leaves a note');

  // a second Auto-fill, then Discard: the set stays as it is
  await session.fill.fill();
  assert.equal(view().mode, 'suggestion');
  session.fill.discardSuggestion();
  assert.deepEqual([session.suggestion, sheets.currentSet.pieces[FEET].gameId], [null, undefined]);
  assert.equal(sheets.note, RESULT_DISCARDED_TEXT);
});

test('Auto-fill: a failing solver shows "Auto-fill failed" on the page, frees the lock and applies nothing', async () => {
  const solver = refusingSolver(['solve']);
  const { session, sheets, calls } = bind(twoToFill(), solver);
  const before = JSON.stringify(sheets.currentSet.pieces);
  await session.fill.fill();
  assert.ok(session.fillLine.includes('worker crashed'), session.fillLine); // the solver's own error
  assert.deepEqual([session.running, sheets.busy, session.locked], [false, false, false]);
  assert.deepEqual([session.suggestion, session.draft], [null, null]);
  assert.equal(JSON.stringify(sheets.currentSet.pieces), before, 'the saved set is untouched');
  assert.ok(
    calls.some(([name, method]) => name === 'cancel' && method === 'focus'),
    'Cancel took focus while it ran',
  );
  // a second Auto-fill starts again and clears the old line
  await session.fill.fill();
  assert.equal(solver.started.filter(kind => kind === 'solve').length, 2);
});

test("Auto-fill: on the page's thread the search starts two painted frames after the button changes", async () => {
  const frames = fakeFrames();
  try {
    const solver = refusingSolver([], { blocksPage: true });
    const { session, view } = bind(twoToFill(), solver);
    await tick(); // the Gear to search line's request
    const before = solver.started.filter(kind => kind === 'solve').length;
    const running = session.fill.fill();
    assert.deepEqual([session.running, frames.pending.length], [true, 1], 'the first frame is waiting');
    assert.equal(frames.step(), 1);
    assert.equal(frames.pending.length, 1, 'the second frame was asked for in the first');
    assert.equal(frames.step(), 1);
    assert.equal(solver.started.filter(kind => kind === 'solve').length, before, 'not yet: the search starts in a task after the frame');
    await running;
    assert.equal(solver.started.filter(kind => kind === 'solve').length, before + 1);
    assert.equal(view().mode, 'suggestion');
  } finally {
    fakeFrames({ immediate: true });
  }
});

test('an Auto-fill cancelled by leaving the page touches no element: the page and its refs are gone by then', async () => {
  const solver = heldSolver();
  const { session, sheets, host } = bind(twoToFill(), solver);
  const running = session.fill.fill();
  sheets.closeSet();
  host.isConnected = false;
  host.query = () => null;
  session.leave.answerLeave('leave'); // cancels the Auto-fill and asks for focus on an Auto-fill button that no longer exists
  await running;
  assert.deepEqual([sheets.busy, session.running, sheets.screen], [false, false, 'sheet']);
});

test("Cancel: the page is idle at once, the set is untouched, the solver is told to stop this set's search", async () => {
  const solver = heldSolver();
  const { session, sheets } = bind(twoToFill(), solver);
  await tick(); // the first piece count lands before a person presses the button
  const before = JSON.stringify(sheets.currentSet.pieces);
  const running = session.fill.fill();
  assert.deepEqual([session.running, sheets.busy], [true, true]);
  session.fill.cancelFill();
  assert.deepEqual([session.running, sheets.busy, session.locked], [false, false, false]);
  assert.equal(sheets.note, FILL_CANCELLED_TEXT);
  assert.deepEqual(solver.cancelled, [['solve', 'g_1']]);
  await running; // the cancelled search's error is not a failure
  assert.deepEqual([session.fillLine, session.suggestion, session.draft], ['', null, null]);
  assert.equal(JSON.stringify(sheets.currentSet.pieces), before);

  // Cancel with nothing running does nothing; an Auto-fill after a Cancel runs again
  session.fill.cancelFill();
  assert.equal(solver.cancelled.length, 1);
  const again = session.fill.fill();
  assert.equal(session.running, true);
  session.fill.cancelFill();
  await again;
});

test('Auto-fill pressed while an Auto-fill runs asks the solver once', async () => {
  const solver = heldSolver();
  const { session } = bind(twoToFill(), solver);
  const running = session.fill.fill();
  await session.fill.fill();
  assert.equal(solver.held.length, 1);
  session.fill.cancelFill();
  await running;
});

test("a reply for an Auto-fill that was cancelled is dropped; the newer Auto-fill's reply is the one shown", async () => {
  const solver = lateSolver();
  const { session, sheets, view } = bind(twoToFill(), solver);
  await tick(); // the first piece count lands before a person presses the button
  const first = session.fill.fill();
  session.fill.cancelFill();
  const second = session.fill.fill();
  assert.equal(solver.held.length, 2);

  // the cancelled search's reply arrives while the new one still runs: nothing shows, the new Auto-fill keeps running
  await solver.held[0].answer();
  await tick();
  assert.deepEqual([session.suggestion, session.running, sheets.busy], [null, true, true]);

  await solver.held[1].answer();
  await Promise.all([first, second]);
  assert.equal(view().mode, 'suggestion');
  const shown = session.suggestion;

  // the old reply again, late: still not shown
  await solver.held[0].answer();
  await tick();
  assert.equal(session.suggestion, shown);
  assert.deepEqual([session.running, sheets.busy], [false, false]);
});

test("Cancel before an Auto-fill on the page's thread has started its search drops it", async () => {
  const frames = fakeFrames();
  try {
    const solver = refusingSolver([], { blocksPage: true });
    const { session, sheets } = bind(twoToFill(), solver);
    await tick();
    const running = session.fill.fill();
    session.fill.cancelFill();
    while (frames.step()) {
      await tick();
    }
    await running;
    assert.equal(solver.started.filter(kind => kind === 'solve').length, 0, 'the search never started');
    assert.deepEqual([session.running, sheets.busy, session.suggestion], [false, false, null]);
  } finally {
    fakeFrames({ immediate: true });
  }
});

test("an Auto-fill and the Gear to search line share one solver session: the job's gear is built once", async () => {
  const inner = makeSession();
  let gearBuilt = 0;
  const solverSession = makeSession({
    gear: job => {
      gearBuilt++;
      return inner.gear(job);
    },
  });
  const { session } = bind(twoToFill(), inProcessSolver(solverSession));
  await tick();
  await session.fill.fill();
  session.settings.editFill(s => {
    s.goal.tb = 'crit';
  });
  await tick();
  assert.equal(gearBuilt, 1);
});

test('no pieces to search: the chip, the button title and the spoken line share one flag, null until the count lands', () => {
  const { session, fillButton, noPiecesFlag } = bind(twoToFill());
  assert.equal(noPiecesFlag(), null, 'no count yet');
  // a count lands with the pool's size, through the store's actions as the solver's answer does
  const landCount = searched => {
    const id = session.pages.startCount(session.setId, 'test');
    session.pages.countLanded(session.setId, id, 'test', {
      countText: '',
      searched,
      fromCounts: null,
      gcdLabel: session.pageState.gearToSearch.gcdLabel,
    });
  };
  landCount(12);
  assert.equal(noPiecesFlag(), null, 'the pool holds pieces');
  landCount(0);
  assert.deepEqual(noPiecesFlag(), { short: NO_PIECES_SHORT, full: NO_PIECES_TEXT });
  assert.equal(fillButton().title, noPiecesFlag().full, 'the button and the chip say the same sentence');
  assert.equal(fillButton().disabled, true);
});

/* Owner's L1 review, 2026-11-20: an Auto-fill pressed within about 70 ms of opening a set (before the first piece count landed)
   ran with no piece to search and ended in the line "found no gear to search". The button is off only once the count is in. */
test('an Auto-fill pressed before the piece count lands waits for it: with no piece to search it does nothing', async () => {
  const settings = defaultFillSettings(makeJobContext('SGE'));
  settings.searchCriteria = { ...settings.searchCriteria, min: 999 }; // no piece is that good: an empty pool
  const { session, fillButton } = bind({ ...twoToFill(), fillSettings: settings });
  assert.equal(session.searchedCount, null, 'the count has not landed yet');
  await session.fill.fill();
  assert.equal(session.searchedCount, 0, 'the fill waited for the count');
  assert.deepEqual([session.fillLine, session.running, session.suggestion], ['', false, null], 'and then did nothing');
  assert.equal(fillButton().disabled, true);
});

test('a bad pin: the row the line names is unpinned and the unpin is saved, although the sheet is busy while the answer arrives', async () => {
  const inner = inProcessSolver();
  const badPinSolver = {
    blocksPage: false,
    cancel: () => false,
    request: request =>
      request.kind === 'solve'
        ? Promise.resolve({
            result: {
              kind: 'badpin',
              messages: [],
              badPins: [{ index: 1, reason: 'wearable' }],
            },
            ms: 1,
          })
        : inner.request(request),
  };
  const { session, sheets, fillButton } = bind(sageSet({ pinned: { pieces: [2, 11], meal: false } }), badPinSolver);
  await session.fill.fill();
  assert.ok(session.fillLine.includes('Ring 2'), session.fillLine);
  assert.deepEqual(sheets.currentSet.pinned.pieces, [2], 'Ring 2 is no longer pinned in the saved set');
  assert.equal(sheets.busy, false);
  // the line's promise holds: pressing Auto-fill again does not meet the same bad pin
  assert.equal(fillButton().disabled, false);
});

test('a bad meal pin: the meal is unpinned and the unpin is saved, so Auto-fill does not meet the same line again', async () => {
  const inner = inProcessSolver();
  const badMealSolver = {
    blocksPage: false,
    cancel: () => false,
    request: request =>
      request.kind === 'solve'
        ? Promise.resolve({ result: { kind: 'badpin', messages: ['x'], badPins: [{ index: null, reason: 'meal' }] }, ms: 1 })
        : inner.request(request),
  };
  const { session, sheets } = bind(sageSet({ pinned: { pieces: [2], meal: true } }), badMealSolver);
  await session.fill.fill();
  assert.ok(session.fillLine.includes(MEAL_ROW_LABEL), session.fillLine);
  assert.equal(sheets.currentSet.pinned.meal, false, 'the meal is no longer pinned in the saved set');
  assert.deepEqual(sheets.currentSet.pinned.pieces, [2], 'the pinned piece stays');
  assert.equal(sheets.busy, false);
});

test('a page that was left asks the solver for nothing and leaves the sheet unlocked', async () => {
  const solver = refusingSolver([]);
  const { session, sheets } = bind(twoToFill(), solver);
  await tick(); // the first piece count lands
  solver.started.length = 0;
  session.pages.closePage(session.setId); // the page's entry goes, as when its element leaves the page
  session.settings.refreshCount();
  await session.fill.fill();
  assert.deepEqual(solver.started, []);
  assert.equal(sheets.busy, false);
});
