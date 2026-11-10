/* A set page's Fill (src/ui/components/set-page/fill.js) bound to a real sheet store, as Alpine binds it: a real Fill on the
   page's thread with its suggestion (Take boxes, Apply, Discard), the edit lock while it runs or its result waits, Cancel,
   a failing solver and replies that arrive late. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeFrames } from './helpers/page-magics.js';
import { LOCKED_TABLE_TEXT } from '../../src/ui/components/set-page.js';
import { LOCKED_TEXT } from '../../src/ui/sheet-store.js';
import { inProcessSolver } from '../../src/ui/solver.js';
import { makeSession } from '../../src/core/session.js';
import { bind, heldSolver, lateSolver, refusingSolver, tick, twoToFill } from './helpers/set-page-bind.js';

const HEAD = 2;
const HANDS = 4;
const FEET = 6;

test('Fill: a real search fills the unpinned rows; Take boxes choose what Apply saves; the page is locked meanwhile', async () => {
  const { c, sheets } = bind(twoToFill());
  assert.equal(c.fillButton.text, 'Fill 4 unpinned slots');
  const running = c.fill();
  assert.deepEqual([c.running, sheets.busy, c.locked], [true, true, true]);
  assert.deepEqual(sheets.editSet('g_1', { name: 'x', description: '' }), { ok: false, error: LOCKED_TEXT });
  await running;
  assert.deepEqual([c.running, sheets.busy], [false, false]);
  assert.ok(sheets.currentSet.fillSettings, 'the Fill settings are saved with the first Fill');
  assert.equal(c.view.mode, 'suggestion');
  assert.equal(c.view.suggest.total, 3, 'the weapon, the hands and the feet proposed (no food in the goal)');

  // locked: a piece cannot be changed, and a click on the table says why
  c.pick(HEAD, null);
  assert.equal(c.draft, null);
  c.tableClick({ target: { closest: () => null } });
  assert.equal(sheets.note, LOCKED_TABLE_TEXT);

  // decline the feet: the weapon and the hands are applied
  c.setTake(FEET, false);
  assert.equal(c.view.suggest.taken, 2);
  c.applySuggestion();
  assert.equal(c.suggestion, null);
  assert.notEqual(sheets.currentSet.pieces[HANDS].gameId, undefined);
  assert.notEqual(sheets.currentSet.pieces[0].gameId, undefined);
  assert.equal(sheets.currentSet.pieces[FEET].gameId, undefined);
  assert.ok(sheets.note);

  // a second Fill, then Discard: the set stays as it is
  await c.fill();
  assert.equal(c.view.mode, 'suggestion');
  c.discardSuggestion();
  assert.deepEqual([c.suggestion, sheets.note, sheets.currentSet.pieces[FEET].gameId], [null, 'Fill result discarded.', undefined]);
});

test('Fill: a failing solver shows "Fill failed" on the page, frees the lock and applies nothing', async () => {
  const solver = refusingSolver(['solve']);
  const { c, sheets, calls } = bind(twoToFill(), solver);
  const before = JSON.stringify(sheets.currentSet.pieces);
  await c.fill();
  assert.equal(c.fillLine, 'Fill failed: worker crashed.');
  assert.deepEqual([c.running, sheets.busy, c.locked], [false, false, false]);
  assert.deepEqual([c.suggestion, c.draft], [null, null]);
  assert.equal(JSON.stringify(sheets.currentSet.pieces), before, 'the saved set is untouched');
  assert.ok(
    calls.some(([name, method]) => name === 'cancel' && method === 'focus'),
    'Cancel took focus while it ran',
  );
  // a second Fill starts again and clears the old line
  await c.fill();
  assert.equal(solver.started.filter(kind => kind === 'solve').length, 2);
});

test("Fill: on the page's thread the search starts two painted frames after the button changes", async () => {
  const frames = fakeFrames();
  try {
    const solver = refusingSolver([], { blocksPage: true });
    const { c } = bind(twoToFill(), solver);
    await tick(); // the Gear to search line's request
    const before = solver.started.filter(kind => kind === 'solve').length;
    const running = c.fill();
    assert.deepEqual([c.running, frames.pending.length], [true, 1], 'the first frame is waiting');
    assert.equal(frames.step(), 1);
    assert.equal(frames.pending.length, 1, 'the second frame was asked for in the first');
    assert.equal(frames.step(), 1);
    assert.equal(solver.started.filter(kind => kind === 'solve').length, before, 'not yet: the search starts in a task after the frame');
    await running;
    assert.equal(solver.started.filter(kind => kind === 'solve').length, before + 1);
    assert.equal(c.view.mode, 'suggestion');
  } finally {
    fakeFrames({ immediate: true });
  }
});

test('a Fill cancelled by leaving the page touches no element: the page and its refs are gone by then', async () => {
  const solver = heldSolver();
  const { c, sheets } = bind(twoToFill(), solver);
  const running = c.fill();
  sheets.closeSet();
  c.$el.isConnected = false;
  c.$refs = {};
  c.answerLeave('leave'); // cancels the Fill and asks for focus on a Fill button that no longer exists
  await running;
  assert.deepEqual([sheets.busy, c.running, sheets.screen], [false, false, 'sheet']);
});

test("Cancel: the page is idle at once, the set is untouched, the solver is told to stop this set's search", async () => {
  const solver = heldSolver();
  const { c, sheets } = bind(twoToFill(), solver);
  const before = JSON.stringify(sheets.currentSet.pieces);
  const running = c.fill();
  assert.deepEqual([c.running, sheets.busy], [true, true]);
  c.cancelFill();
  assert.deepEqual([c.running, sheets.busy, c.locked, sheets.note], [false, false, false, 'Fill cancelled.']);
  assert.deepEqual(solver.cancelled, [['solve', 'g_1']]);
  await running; // the cancelled search's error is not a failure
  assert.deepEqual([c.fillLine, c.suggestion, c.draft], ['', null, null]);
  assert.equal(JSON.stringify(sheets.currentSet.pieces), before);

  // Cancel with nothing running does nothing; a Fill after a Cancel runs again
  c.cancelFill();
  assert.equal(solver.cancelled.length, 1);
  const again = c.fill();
  assert.equal(c.running, true);
  c.cancelFill();
  await again;
});

test('Fill pressed while a Fill runs asks the solver once', async () => {
  const solver = heldSolver();
  const { c } = bind(twoToFill(), solver);
  const running = c.fill();
  await c.fill();
  assert.equal(solver.held.length, 1);
  c.cancelFill();
  await running;
});

test("a reply for a Fill that was cancelled is dropped; the newer Fill's reply is the one shown", async () => {
  const solver = lateSolver();
  const { c, sheets } = bind(twoToFill(), solver);
  const first = c.fill();
  c.cancelFill();
  const second = c.fill();
  assert.equal(solver.held.length, 2);

  // the cancelled search's reply arrives while the new one still runs: nothing shows, the new Fill keeps running
  await solver.held[0].answer();
  await tick();
  assert.deepEqual([c.suggestion, c.running, sheets.busy], [null, true, true]);

  await solver.held[1].answer();
  await Promise.all([first, second]);
  assert.equal(c.view.mode, 'suggestion');
  const shown = c.suggestion;

  // the old reply again, late: still not shown
  await solver.held[0].answer();
  await tick();
  assert.equal(c.suggestion, shown);
  assert.deepEqual([c.running, sheets.busy], [false, false]);
});

test("Cancel before a Fill on the page's thread has started its search drops it", async () => {
  const frames = fakeFrames();
  try {
    const solver = refusingSolver([], { blocksPage: true });
    const { c, sheets } = bind(twoToFill(), solver);
    await tick();
    const running = c.fill();
    c.cancelFill();
    while (frames.step()) await tick();
    await running;
    assert.equal(solver.started.filter(kind => kind === 'solve').length, 0, 'the search never started');
    assert.deepEqual([c.running, sheets.busy, c.suggestion], [false, false, null]);
  } finally {
    fakeFrames({ immediate: true });
  }
});

test("a Fill and the Gear to search line share one solver session: the job's gear is built once", async () => {
  const inner = makeSession();
  let gearBuilt = 0;
  const session = makeSession({
    gear: job => {
      gearBuilt++;
      return inner.gear(job);
    },
  });
  const { c } = bind(twoToFill(), inProcessSolver(session));
  await tick();
  await c.fill();
  c.editFill(s => {
    s.goal.tb = 'crit';
  });
  await tick();
  assert.equal(gearBuilt, 1);
});
