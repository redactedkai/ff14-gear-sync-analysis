/* Leaving a set page (src/ui/components/set-page/leave.js) bound to a real sheet store, as Alpine binds it: the question
   before leaving for each kind of unsaved or running work. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runningLeaveText } from '../../../../../src/ui/components/set-page/leave.js';
import { FILL_CANCELLED_TEXT, RESULT_DISCARDED_TEXT } from '../../../../../src/ui/components/set-page/view.js';
import { overlays } from '../../../../../src/ui/overlays.js';
import { inProcessSolver } from '../../../../../src/ui/solver.js';
import { bind, heldSolver, tick, twoToFill } from '../../../helpers/set-page-bind.js';
import { SAGE_IDS } from '../../../helpers/sheet-fixtures.js';

const HEAD = 2;

test('leaving: a draft asks Apply or Discard, Keep stays; a running Auto-fill asks to cancel it; a result asks to drop it', async () => {
  const solver = heldSolver();
  const { c, sheets } = bind(twoToFill(), solver);

  // a draft
  c.pick(HEAD, SAGE_IDS.head);
  sheets.closeSet();
  assert.deepEqual([sheets.screen, c.leaveAsk.kind], ['set', 'draft']);
  c.answerLeave('keep');
  assert.deepEqual([sheets.screen, c.leaveAsk, !!c.draft], ['set', null, true]);
  sheets.openManager();
  c.answerLeave('discard');
  assert.deepEqual([sheets.screen, c.draft], ['sheets', null]);

  // a running Auto-fill: Leave cancels it in the set's own lane
  sheets.openSheet('s_1');
  sheets.openSet('g_1');
  await tick(); // the first piece count lands before a person presses the button
  const running = c.fill();
  assert.equal(solver.held.length, 1);
  assert.equal(solver.held[0].request.key, 'g_1');
  sheets.closeSet();
  assert.equal(c.leaveAsk.kind, 'running');
  assert.equal(c.leaveQuestion, runningLeaveText('Set 1'));
  c.answerLeave('leave');
  await running;
  assert.deepEqual(solver.cancelled, [['solve', 'g_1']]);
  assert.deepEqual([sheets.busy, c.running, sheets.screen], [false, false, 'sheet']);
  assert.equal(sheets.note, FILL_CANCELLED_TEXT);

  // a waiting result: Leave drops it
  sheets.openSet('g_1');
  const answered = c.fill();
  const { request, resolve } = solver.held.shift();
  resolve(await inProcessSolver().request(request));
  await answered;
  assert.ok(c.suggestion);
  sheets.openManager();
  assert.equal(c.leaveAsk.kind, 'result');
  c.answerLeave('leave');
  assert.deepEqual([c.suggestion, sheets.screen], [null, 'sheets']);
  assert.equal(sheets.note, RESULT_DISCARDED_TEXT);
});

test('unsettled: the store asks the open set page, with no side effect, for a draft, a running Auto-fill and a waiting result', async () => {
  const solver = heldSolver();
  const { c, sheets } = bind(twoToFill(), solver);
  assert.equal(sheets.hasUnsettled(), false);

  c.pick(HEAD, SAGE_IDS.head);
  assert.equal(sheets.hasUnsettled(), true);
  assert.equal(c.leaveAsk, null); // asking changes nothing
  c.discardDraft();
  assert.equal(sheets.hasUnsettled(), false);

  await tick();
  const answered = c.fill();
  assert.equal(sheets.hasUnsettled(), true); // running
  const { request, resolve } = solver.held.shift();
  resolve(await inProcessSolver().request(request));
  await answered;
  assert.ok(c.suggestion);
  assert.equal(sheets.hasUnsettled(), true); // waiting result
  c.suggestion = null;
  assert.equal(sheets.hasUnsettled(), false);

  c.pick(HEAD, SAGE_IDS.head);
  sheets.openManager();
  c.answerLeave('discard');
  assert.equal(sheets.hasUnsettled(), false); // off the set page
});

test('unsettled: only the set page counts; the same draft shows on another screen as nothing to lose', () => {
  const { c, sheets } = bind(twoToFill());
  c.pick(HEAD, SAGE_IDS.head);
  assert.equal(c.unsettledKind(), 'draft');
  assert.equal(sheets.hasUnsettled(), true);

  // the draft is still held, but the open screen is no longer the set page
  for (const screen of ['sheet', 'sheets']) {
    sheets.screen = screen;
    assert.equal(c.unsettledKind(), 'draft', `the draft is held on ${screen}`);
    assert.equal(sheets.hasUnsettled(), false, `${screen} screen`);
  }
  sheets.screen = 'set';
  assert.equal(sheets.hasUnsettled(), true);
});

/* A key event as pageKey reads it. */
function keyEvent(key, extra = {}) {
  return {
    key,
    target: null,
    prevented: false,
    preventDefault() {
      this.prevented = true;
    },
    ...extra,
  };
}

test('Escape on the set page: layers of the overlay manager take it first; with none open it discards a waiting result', () => {
  overlays.closeAll();
  const { c } = bind(twoToFill());
  c.suggestion = { waiting: true };
  c.openSettings();
  const first = keyEvent('Escape');
  c.pageKey(first);
  assert.deepEqual([c.suggestion !== null, first.prevented], [true, false], 'a popover is open: the page leaves the key to the manager');
  overlays.pressEscape(first);
  assert.equal(c.settingsOpen, false);
  const second = keyEvent('Escape');
  c.pageKey(second);
  assert.deepEqual([c.suggestion, second.prevented], [null, true]);
});

test('Escape with a menu open in the Auto-fill settings: the menu closes first, then the settings; the key never reaches the page', () => {
  overlays.closeAll();
  const { c } = bind(twoToFill());
  c.openSettings();
  c.toggleRankHelp();
  assert.deepEqual(overlays.openIds, ['settings', 'rankNote']);
  overlays.pressEscape({});
  assert.deepEqual([c.rankHelp, c.settingsOpen], [false, true]);
  overlays.pressEscape({});
  assert.deepEqual([c.settingsOpen, overlays.openIds], [false, []]);
});
