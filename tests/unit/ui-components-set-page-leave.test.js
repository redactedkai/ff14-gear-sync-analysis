/* Leaving a set page (src/ui/components/set-page/leave.js) bound to a real sheet store, as Alpine binds it: the question
   before leaving for each kind of unsaved or running work. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runningLeaveText } from '../../src/ui/components/set-page.js';
import { inProcessSolver } from '../../src/ui/solver.js';
import { bind, heldSolver, twoToFill } from './helpers/set-page-bind.js';
import { SAGE_IDS } from './helpers/sheet-fixtures.js';

const HEAD = 2;

test('leaving: a draft asks Apply or Discard, Keep stays; a running Fill asks to cancel it; a result asks to drop it', async () => {
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

  // a running Fill: Leave cancels it in the set's own lane
  sheets.openSheet('s_1');
  sheets.openSet('g_1');
  const running = c.fill();
  assert.equal(solver.held.length, 1);
  assert.equal(solver.held[0].request.key, 'g_1');
  sheets.closeSet();
  assert.equal(c.leaveAsk.kind, 'running');
  assert.equal(c.leaveQuestion, runningLeaveText('Set 1'));
  c.answerLeave('leave');
  await running;
  assert.deepEqual(solver.cancelled, [['solve', 'g_1']]);
  assert.deepEqual([sheets.busy, c.running, sheets.screen, sheets.note], [false, false, 'sheet', 'Fill cancelled.']);

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
  assert.deepEqual([c.suggestion, sheets.screen, sheets.note], [null, 'sheets', 'Fill result dropped.']);
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

test('Escape on the set page: the open note, then the Fill settings, each on its own press', () => {
  const { c } = bind(twoToFill());
  c.settingsOpen = true;
  c.rankHelp = true;
  c.pageKey(keyEvent('Escape'));
  assert.deepEqual([c.rankHelp, c.settingsOpen], [false, true]);
  const event = keyEvent('Escape');
  c.pageKey(event);
  assert.deepEqual([c.settingsOpen, event.prevented], [false, true]);
});

test('Escape with a Fill settings menu open: the menu closes and focus returns to its button; the next Escape reaches the page', () => {
  const { c } = bind(twoToFill());
  c.settingsOpen = true;
  const menu = { open: true };
  const button = {
    focused: 0,
    focus() {
      this.focused++;
    },
  };
  const first = {
    stopped: 0,
    prevented: 0,
    preventDefault() {
      this.prevented++;
    },
    stopPropagation() {
      this.stopped++;
    },
  };
  // what the menu's own handler does with the first Escape: it takes the key, so the page's handler never sees it
  assert.equal(c.closeMenuOnEscape(menu, first, button), true);
  assert.deepEqual([menu.open, button.focused, first.stopped, first.prevented], [false, 1, 1, 1]);
  assert.equal(c.settingsOpen, true);
  // the second Escape: no menu open, so the menu's handler leaves it alone and the page closes the dialog
  const second = {
    stopped: 0,
    preventDefault() {},
    stopPropagation() {
      this.stopped++;
    },
  };
  assert.equal(c.closeMenuOnEscape(menu, second, button), false);
  assert.deepEqual([second.stopped, button.focused], [0, 1]);
  c.pageKey(keyEvent('Escape'));
  assert.equal(c.settingsOpen, false);
});
