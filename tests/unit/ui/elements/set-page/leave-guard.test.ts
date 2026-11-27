/* Leaving a set page (src/ui/elements/set-page/leave-guard.ts) bound to a real sheet store: the question
   before leaving for each kind of unsaved or running work. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { LeaveQuestion } from '../../../../../src/ui/elements/set-page/leave-guard.ts';
import { runningLeaveText } from '../../../../../src/ui/elements/set-page/leave-guard.ts';
import { FILL_CANCELLED_TEXT, RESULT_DISCARDED_TEXT } from '../../../../../src/ui/views/set-page.ts';
import { overlays } from '../../../../../src/ui/overlays.ts';
import { unsettledKind } from '../../../../../src/ui/store/app-state.ts';
import { bind, heldSolver, tick, twoToFill } from '../../../helpers/set-page-bind.ts';
import { SAGE_IDS } from '../../../helpers/sheet-fixtures.ts';

const HEAD = 2;

test('leaving: a draft asks Apply or Discard, Keep stays; a running Auto-fill asks to cancel it; a result asks to drop it', async () => {
  const solver = heldSolver();
  const { session, sheets, view } = bind(twoToFill(), solver);

  // a draft
  session.edits.pick(HEAD, SAGE_IDS.head);
  sheets.closeSet();
  assert.deepEqual([sheets.screen, asked(session).kind], ['set', 'draft']);
  session.leave.answerLeave('keep');
  assert.deepEqual([sheets.screen, session.leave.ask, Boolean(session.draft)], ['set', null, true]);
  sheets.openManager();
  session.leave.answerLeave('discard');
  assert.deepEqual([sheets.screen, session.draft], ['sheets', null]);

  // a running Auto-fill: Leave cancels it in the set's own lane
  sheets.openSheet('s_1');
  sheets.openSet('g_1');
  await tick(); // the first piece count lands before a person presses the button
  const running = session.fill.fill();
  assert.equal(solver.held.length, 1);
  assert.equal(solver.held[0].request.key, 'g_1');
  sheets.closeSet();
  assert.equal(asked(session).kind, 'running');
  assert.equal(session.leave.questionText(view()), runningLeaveText('Set 1'));
  session.leave.answerLeave('leave');
  await running;
  assert.deepEqual(solver.cancelled, [['solve', 'g_1']]);
  assert.deepEqual([sheets.busy, session.running, sheets.screen], [false, false, 'sheet']);
  assert.equal(sheets.note, FILL_CANCELLED_TEXT);

  // a waiting result: Leave drops it
  sheets.openSet('g_1');
  const answered = session.fill.fill();
  const heldRequest = solver.held.shift();
  assert.ok(heldRequest, 'the solve is held');
  await heldRequest.answer();
  await answered;
  assert.ok(session.suggestion);
  sheets.openManager();
  assert.equal(asked(session).kind, 'result');
  session.leave.answerLeave('leave');
  assert.deepEqual([session.suggestion, sheets.screen], [null, 'sheets']);
  assert.equal(sheets.note, RESULT_DISCARDED_TEXT);
});

test('unsettled: the store asks the open set page, with no side effect, for a draft, a running Auto-fill and a waiting result', async () => {
  const solver = heldSolver();
  const { session, sheets } = bind(twoToFill(), solver);
  assert.equal(sheets.hasUnsettled(), false);

  session.edits.pick(HEAD, SAGE_IDS.head);
  assert.equal(sheets.hasUnsettled(), true);
  assert.equal(session.leave.ask, null); // asking changes nothing
  session.edits.discardDraft();
  assert.equal(sheets.hasUnsettled(), false);

  await tick();
  const answered = session.fill.fill();
  assert.equal(sheets.hasUnsettled(), true); // running
  const heldRequest = solver.held.shift();
  assert.ok(heldRequest, 'the solve is held');
  await heldRequest.answer();
  await answered;
  assert.ok(session.suggestion);
  assert.equal(sheets.hasUnsettled(), true); // waiting result
  session.pages.setSuggestion(session.setId, null);
  assert.equal(sheets.hasUnsettled(), false);

  session.edits.pick(HEAD, SAGE_IDS.head);
  sheets.openManager();
  session.leave.answerLeave('discard');
  assert.equal(sheets.hasUnsettled(), false); // off the set page
});

test('unsettled: the store holds a page only while it is open; a page left holds nothing, and a late answer of it is ignored', async () => {
  const solver = heldSolver();
  const { session, sheets, store } = bind(twoToFill(), solver);
  session.edits.pick(HEAD, SAGE_IDS.head);
  assert.equal(unsettledKind(session.pageState), 'draft');
  assert.equal(sheets.hasUnsettled(), true);
  session.edits.discardDraft();
  await tick();
  const running = session.fill.fill();
  assert.equal(unsettledKind(session.pageState), 'running');
  const setId = session.setId;
  // the page is taken away with its search still running: the entry goes, the search is cancelled
  session.stop();
  await running;
  assert.equal(sheets.hasUnsettled(), false, 'the page left holds nothing');
  assert.equal(unsettledKind(sheets.page(setId)), null);
  assert.deepEqual(solver.cancelled, [['solve', setId]]);
  assert.deepEqual(Object.keys(store.state.setPages), [], 'no entry is kept');
});

/* A result waiting, as the store keeps it (frozen): no piece taken or declined. */
function waitingResult() {
  return Object.freeze({ suggested: Object.freeze({}), declined: Object.freeze({ rows: Object.freeze([]), meal: false }) });
}

/* A key event as pageKey reads it, and whether the page took it (`prevented`). */
interface FakeKeyEvent {
  key: string;
  target: null;
  defaultPrevented: boolean;
  prevented: boolean;
  preventDefault(): void;
}
function keyEvent(key: string, { defaultPrevented = false } = {}): FakeKeyEvent {
  return {
    key,
    target: null,
    defaultPrevented,
    prevented: false,
    preventDefault() {
      this.prevented = true;
    },
  };
}

/* The question the leave guard is asking; fails the test when there is none. */
function asked(session: { leave: { ask: LeaveQuestion | null } }): LeaveQuestion {
  assert.ok(session.leave.ask, 'no question is asked');
  return session.leave.ask;
}

test('Escape on the set page: layers of the overlay manager take it first; with none open it discards a waiting result', () => {
  overlays.closeAll();
  const { session } = bind(twoToFill());
  session.pages.setSuggestion(session.setId, waitingResult());
  // a layer of the manager stands for an open popover (the Auto-fill settings popover registers one when it opens)
  let popoverOpen = true;
  overlays.open({ id: 'popover', root: () => null, opener: () => null, close: () => (popoverOpen = false) });
  const first = keyEvent('Escape');
  session.leave.pageKey(first);
  assert.deepEqual(
    [session.suggestion !== null, first.prevented],
    [true, false],
    'a popover is open: the page leaves the key to the manager',
  );
  overlays.pressEscape(first);
  assert.equal(popoverOpen, false);
  const second = keyEvent('Escape');
  session.leave.pageKey(second);
  assert.deepEqual([session.suggestion, second.prevented], [null, true]);
});

test('Escape that a layer already handled (defaultPrevented) does not also answer the Leave question or discard a waiting result', () => {
  overlays.closeAll();
  const { session, sheets } = bind(twoToFill());
  session.edits.pick(HEAD, SAGE_IDS.head);
  sheets.closeSet();
  assert.equal(asked(session).kind, 'draft');
  const handled = keyEvent('Escape', { defaultPrevented: true });
  session.leave.pageKey(handled);
  assert.deepEqual([session.leave.ask?.kind, handled.prevented], ['draft', false], 'the question is still asked');
  const fresh = keyEvent('Escape');
  session.leave.pageKey(fresh);
  assert.deepEqual([session.leave.ask, fresh.prevented], [null, true], 'an unhandled Escape answers Keep');
});
