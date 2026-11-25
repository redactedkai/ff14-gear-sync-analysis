/* The gear set pages' actions (src/ui/store/set-page-actions.ts): the draft, the Auto-fill's status and its search ids, the result
   waiting, the Gear to search count, and what the leave and reload guards ask (`unsettled`). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAppStore, setPageOf, unsettled, unsettledKind } from '../../../../src/ui/store/app-state.ts';
import type { GearSet, RestoredState, Suggestion } from '../../../../src/ui/store/app-state.ts';
import { createSetPageActions } from '../../../../src/ui/store/set-page-actions.ts';
import { frozenCopy } from '../../../../src/ui/view-cache.ts';
import { restoreOpen } from '../../helpers/common.js';

const NO_SHEETS = { available: false, sheets: [], unreadable: [], indexProblem: null };

/* A store with no page open, and the actions on it. */
function start() {
  const store = createAppStore(restoreOpen(null) as RestoredState, NO_SHEETS);
  return { store, pages: createSetPageActions(store) };
}

/* A frozen draft of the gear set `id`. */
const draftOf = (id: string): GearSet => frozenCopy({ id, name: `Set ${id}`, pieces: [{ slot: 'head', gameId: 41 }] });

/* A frozen result waiting, with the Take boxes in `declinedRows` switched off. */
const resultOf = (declinedRows: number[] = []): Suggestion =>
  frozenCopy({
    suggested: { pieces: [{ slot: 'head', gameId: 42 }], meal: null, bestMeals: null },
    declined: { rows: declinedRows, meal: false },
  });

test('a page is open from openPage to closePage; an action on a page that is not open does nothing and says so', () => {
  const { store, pages } = start();
  assert.equal(pages.setDraft('g_1', draftOf('g_1')), false);
  assert.equal(pages.startFill('g_1'), null);
  assert.equal(pages.startCount('g_1', 'x'), null);
  assert.equal(pages.cancelFill('g_1'), false);
  assert.equal(store.rev, 0, 'nothing was counted');
  pages.openPage('g_1');
  pages.openPage('g_1');
  assert.deepEqual(store.log, ['setPages/openPage'], 'opening an open page changes nothing');
  assert.ok(Object.isFrozen(setPageOf(store.state, 'g_1')));
  pages.closePage('g_1');
  pages.closePage('g_1');
  assert.deepEqual(store.state.setPages, {});
  assert.deepEqual(store.log, ['setPages/openPage', 'setPages/closePage']);
});

test('the draft: edits replace it, Apply and Discard clear it; the same draft again is no change; an unfrozen one is refused', () => {
  const { store, pages } = start();
  pages.openPage('g_1');
  const first = draftOf('g_1');
  assert.equal(pages.setDraft('g_1', first), true);
  assert.equal(setPageOf(store.state, 'g_1').draft, first, 'stored by reference');
  const revisions = store.rev;
  pages.setDraft('g_1', first);
  assert.equal(store.rev, revisions, 'the same draft counts nothing');
  const second = draftOf('g_1');
  pages.setDraft('g_1', second);
  assert.equal(setPageOf(store.state, 'g_1').draft, second);
  assert.throws(() => pages.setDraft('g_1', { id: 'g_1', name: 'x', pieces: [] } as unknown as GearSet), /frozen/);
  pages.setDraft('g_1', null);
  assert.equal(setPageOf(store.state, 'g_1').draft, null);
  assert.equal(unsettled(store.state), false);
});

test('the status of an Auto-fill: idle, running, waiting with a result, failed, cancelled', () => {
  const { store, pages } = start();
  pages.openPage('g_1');
  const page = () => setPageOf(store.state, 'g_1');
  assert.equal(page().fill, 'idle');

  // an answer with a suggestion: running, then waiting, and the run ends with the result kept
  let id = pages.startFill('g_1') as number;
  assert.equal(page().fill, 'running');
  assert.equal(page().fillId, id);
  assert.equal(pages.fillSuggested('g_1', id, resultOf()), true);
  assert.equal(page().fill, 'waiting');
  pages.endFill('g_1');
  assert.deepEqual([page().fill, page().fillId, unsettledKind(page())], ['waiting', null, 'result']);
  // Apply or Discard drops the result
  pages.setSuggestion('g_1', null);
  assert.deepEqual([page().fill, page().suggestion], ['idle', null]);

  // a failure, with its line; the next run clears the line
  id = pages.startFill('g_1') as number;
  assert.equal(pages.fillEnded('g_1', id, { line: 'Auto-fill failed: worker crashed.', failed: true }), true);
  assert.deepEqual([page().fill, page().fillLine], ['failed', 'Auto-fill failed: worker crashed.']);
  pages.endFill('g_1');
  assert.equal(page().fill, 'failed', 'ending the run keeps the failure');
  assert.equal(unsettled(store.state), false, 'a failure holds nothing');
  id = pages.startFill('g_1') as number;
  assert.deepEqual([page().fill, page().fillLine], ['running', '']);

  // an answer with a line only (a pin dropped): idle
  assert.equal(pages.fillEnded('g_1', id, { line: 'Ring 2 unpinned.' }), true);
  assert.deepEqual([page().fill, page().fillLine], ['idle', 'Ring 2 unpinned.']);
  pages.endFill('g_1');

  // Cancel: cancelled, no id kept; Cancel with nothing running does nothing
  assert.equal(pages.cancelFill('g_1'), false);
  pages.startFill('g_1');
  assert.equal(pages.cancelFill('g_1'), true);
  assert.deepEqual([page().fill, page().fillId], ['cancelled', null]);
  assert.equal(unsettled(store.state), false);

  // a run that ends with nothing answered is idle
  pages.startFill('g_1');
  pages.endFill('g_1');
  assert.equal(page().fill, 'idle');
});

test('a stale answer is ignored: after Cancel, after a newer search, and after the page was left and opened again', () => {
  const { store, pages } = start();
  pages.openPage('g_1');
  const page = () => setPageOf(store.state, 'g_1');

  // cancelled: the answer of the cancelled search comes late
  const cancelled = pages.startFill('g_1') as number;
  pages.cancelFill('g_1');
  const before = store.rev;
  assert.equal(pages.fillSuggested('g_1', cancelled, resultOf()), false);
  assert.equal(pages.fillEnded('g_1', cancelled, { line: 'late', failed: true }), false);
  assert.equal(store.rev, before, 'nothing counted');
  assert.deepEqual([page().fill, page().suggestion, page().fillLine], ['cancelled', null, '']);

  // a newer search runs: the older one's answer does not land
  const older = pages.startFill('g_1') as number;
  pages.cancelFill('g_1');
  const newer = pages.startFill('g_1') as number;
  assert.notEqual(older, newer);
  assert.equal(pages.fillSuggested('g_1', older, resultOf()), false);
  assert.equal(page().fill, 'running');
  assert.equal(pages.fillSuggested('g_1', newer, resultOf()), true);

  // the page is left while a search runs, then opened again and searched again: ids do not repeat
  pages.setSuggestion('g_1', null);
  const left = pages.startFill('g_1') as number;
  pages.closePage('g_1');
  assert.equal(pages.fillSuggested('g_1', left, resultOf()), false, 'no page: nothing opens');
  assert.deepEqual(store.state.setPages, {});
  pages.openPage('g_1');
  const again = pages.startFill('g_1') as number;
  assert.notEqual(again, left);
  assert.equal(pages.fillSuggested('g_1', left, resultOf()), false, 'the old page was another run');
  assert.equal(page().fill, 'running');
});

test('the result waiting: a Take box replaces it, Discard drops it, it is stored as given and must be frozen', () => {
  const { store, pages } = start();
  pages.openPage('g_1');
  const shown = resultOf();
  pages.setSuggestion('g_1', shown);
  assert.equal(setPageOf(store.state, 'g_1').suggestion, shown, 'by reference');
  assert.equal(setPageOf(store.state, 'g_1').fill, 'waiting');
  const taken = resultOf([2]);
  pages.setSuggestion('g_1', taken);
  assert.equal(setPageOf(store.state, 'g_1').suggestion, taken);
  assert.throws(() => pages.setSuggestion('g_1', { suggested: {}, declined: { rows: [], meal: false } }), /frozen/);
  const revisions = store.rev;
  pages.setSuggestion('g_1', taken);
  assert.equal(store.rev, revisions, 'the same result counts nothing');
  pages.setSuggestion('g_1', null);
  assert.deepEqual([setPageOf(store.state, 'g_1').fill, setPageOf(store.state, 'g_1').suggestion], ['idle', null]);
});

test('the Gear to search count: the newest answer is kept, a failure keeps the old count, box counts follow their filters', () => {
  const { store, pages } = start();
  pages.openPage('g_1');
  const page = () => setPageOf(store.state, 'g_1');
  const label = { name: 'Target GCD', range: '2.00 to 2.50', haste: null, off: null, full: 'Target GCD 2.00 to 2.50' };
  const answer = (searched: number, boxes: Record<string, number> | null) => ({
    countText: `searching ${searched} of 2,000 pieces`,
    searched,
    fromCounts: boxes,
    gcdLabel: label,
  });
  assert.deepEqual([page().gearToSearch.searched, page().gearToSearch.countText, page().countId], [null, '', null]);

  const first = pages.startCount('g_1', 'A') as number;
  assert.equal(page().countId, first, 'the count is on its way');
  const second = pages.startCount('g_1', 'A') as number;
  assert.equal(pages.countLanded('g_1', first, 'A', answer(10, { crafted: 3 })), false, 'the older count is ignored');
  assert.equal(page().gearToSearch.searched, null);
  assert.equal(pages.countLanded('g_1', second, 'A', answer(12, { crafted: 4 })), true);
  assert.deepEqual(
    [page().gearToSearch.searched, page().gearToSearch.fromCounts, page().gearToSearch.fromCountsFor, page().countId],
    [12, { crafted: 4 }, 'A', null],
  );
  assert.ok(Object.isFrozen(page().gearToSearch) && Object.isFrozen(page().gearToSearch.fromCounts));
  assert.ok(Object.isFrozen(page().gearToSearch.gcdLabel));

  // other filters: the box counts go when the count starts, the line and the count stay until the new ones land
  const third = pages.startCount('g_1', 'B') as number;
  assert.deepEqual([page().gearToSearch.fromCounts, page().gearToSearch.searched], [null, 12]);
  // a failed count keeps the old count and says so on the line
  pages.countFailed('g_1', third, 'count failed: worker crashed', false);
  assert.deepEqual(
    [page().gearToSearch.countText, page().gearToSearch.searched, page().countId],
    ['count failed: worker crashed', 12, null],
  );
  const fourth = pages.startCount('g_1', 'B') as number;
  assert.equal(pages.countLanded('g_1', fourth, 'B', answer(7, { crafted: 2 })), true);
  pages.startCount('g_1', 'B');
  assert.deepEqual(page().gearToSearch.fromCounts, { crafted: 2 }, 'the same filters keep their box counts');

  // a count cancelled by a newer one leaves the line alone; a second failure of the same count is ignored
  const fifth = pages.startCount('g_1', 'B') as number;
  assert.equal(pages.countFailed('g_1', fifth, 'ignored', true), true);
  assert.equal(page().gearToSearch.countText, 'searching 7 of 2,000 pieces');
  assert.equal(pages.countFailed('g_1', fifth, 'late', false), false);

  // the page left: the answer finds no page
  const sixth = pages.startCount('g_1', 'B') as number;
  pages.closePage('g_1');
  assert.equal(pages.countLanded('g_1', sixth, 'B', answer(1, null)), false);
  assert.deepEqual(store.state.setPages, {});
});

test('two pages open at once keep their own draft, result and status; unsettled sees either; closing one leaves the other', () => {
  const { store, pages } = start();
  pages.openPage('g_1');
  pages.openPage('g_2');
  assert.equal(unsettled(store.state), false);

  const draft = draftOf('g_1');
  pages.setDraft('g_1', draft);
  const id = pages.startFill('g_2') as number;
  assert.deepEqual([setPageOf(store.state, 'g_1').fill, setPageOf(store.state, 'g_2').fill], ['idle', 'running']);
  assert.deepEqual([setPageOf(store.state, 'g_1').draft, setPageOf(store.state, 'g_2').draft], [draft, null]);
  assert.deepEqual([unsettledKind(setPageOf(store.state, 'g_1')), unsettledKind(setPageOf(store.state, 'g_2'))], ['draft', 'running']);

  // the answer of g_2's search lands on g_2 only
  assert.equal(pages.fillSuggested('g_1', id, resultOf()), false);
  assert.equal(pages.fillSuggested('g_2', id, resultOf()), true);
  assert.equal(setPageOf(store.state, 'g_1').suggestion, null);

  pages.setDraft('g_1', null);
  assert.equal(unsettled(store.state), true, 'g_2 still holds a result');
  pages.closePage('g_2');
  assert.equal(unsettled(store.state), false);
  assert.deepEqual(Object.keys(store.state.setPages), ['g_1']);
});

test('unsettled over several pages: any one with a draft, a running search or a waiting result', () => {
  const { store, pages } = start();
  for (const id of ['g_1', 'g_2', 'g_3']) {
    pages.openPage(id);
  }
  assert.equal(unsettled(store.state), false);
  pages.setDraft('g_3', draftOf('g_3'));
  assert.equal(unsettled(store.state), true);
  pages.setDraft('g_3', null);
  const id = pages.startFill('g_2') as number;
  assert.equal(unsettled(store.state), true);
  pages.cancelFill('g_2');
  assert.equal(unsettled(store.state), false, 'cancelled holds nothing');
  pages.fillEnded('g_2', id, { line: 'x', failed: true });
  assert.equal(unsettled(store.state), false, 'a stale answer changes nothing');
  pages.setSuggestion('g_1', resultOf());
  assert.equal(unsettled(store.state), true);
});
