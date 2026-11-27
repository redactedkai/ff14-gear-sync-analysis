/* The reordering controller of the Sheets screens' lists (src/ui/elements/sheets/row-reorder.ts) over a real sheets store: Up and Down
   on a handle move the row, a drop moves it above or below the row under the pointer, and nothing moves while the list is locked.
   The events are stand-ins shaped like the browser's. */
import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { RowReorder } from '../../../../../src/ui/elements/sheets/row-reorder.ts';
import { fakeStorage } from '../../../helpers/sheet-fixtures.ts';
import { createSheetsFacade } from '../../../helpers/stores.ts';

// the controller moves the focus a frame after a step: run those frames at once
beforeEach(() => {
  globalThis.requestAnimationFrame = callback => callback();
});
afterEach(() => {
  delete globalThis.requestAnimationFrame;
});

/* A controller over three sheets (listed A, B, C) of a store, with `locks` ({drag, step}) and the handles it was asked to focus. */
function bind(locks = {}) {
  let next = 0;
  const sheets = createSheetsFacade({ storage: fakeStorage(), makeId: prefix => `${prefix}${++next}` });
  for (const name of ['C', 'B', 'A']) {
    sheets.createSheet({ name, job: 'SGE', level: 100, sync: { on: false, cap: 795 } });
  }
  sheets.openManager();
  const focused = [];
  const host = { addController() {}, requestUpdate() {}, isConnected: true, updateComplete: Promise.resolve(true) };
  const reorder = new RowReorder(host, {
    dragLocked: () => Boolean(locks.drag),
    stepLocked: () => Boolean(locks.step),
    move: (_kind, from, to) => sheets.moveSheet(from, to),
    step: (_kind, index, step) => sheets.stepSheet(index, step),
    focusHandle: (_kind, index) => focused.push(index),
  });
  const names = () => sheets.list().sheets.map(sheet => sheet.name);
  return { reorder, names, focused, host };
}

const key = name => ({ key: name, preventDefault() {} });
const transfer = { setData() {}, setDragImage() {} };
const dragEvent = extra => ({ dataTransfer: transfer, target: { closest: () => null }, preventDefault() {}, ...extra });
/* A pointer at `clientY` over a row 40 px tall that starts at 0. */
const over = clientY => ({ clientY, currentTarget: { getBoundingClientRect: () => ({ top: 0, height: 40 }) }, preventDefault() {} });

test('Up and Down on a handle move the row one place and the focus follows it; other keys do nothing', async () => {
  const { reorder, names, focused, host } = bind();
  assert.deepEqual(names(), ['A', 'B', 'C']);
  reorder.handleKey('sheet', 0, key('ArrowDown'));
  await host.updateComplete;
  assert.deepEqual(names(), ['B', 'A', 'C']);
  assert.deepEqual(focused, [1]);
  reorder.handleKey('sheet', 1, key('Enter'));
  assert.deepEqual(names(), ['B', 'A', 'C']);
});

test('a drop moves the dragged row above or below the row under the pointer, by its half of the row', () => {
  const { reorder, names } = bind();
  // drag C (row 2) onto the upper half of row 0: it goes first
  reorder.dragStart('sheet', 2, dragEvent());
  reorder.dragOver('sheet', 0, over(10));
  assert.deepEqual([reorder.dropMark('sheet', 0), reorder.dropMark('set', 0)], ['before', ''], 'only rows of the same list');
  reorder.drop('sheet', 0, over(10));
  assert.deepEqual(names(), ['C', 'A', 'B']);
  assert.equal(reorder.dragging, null);
  // drag the first row onto the lower half of the last: after it
  reorder.dragStart('sheet', 0, dragEvent());
  reorder.drop('sheet', 2, over(30));
  assert.deepEqual(names(), ['A', 'B', 'C']);
});

test('nothing moves while the list is locked: a drag is refused and the keys do nothing', () => {
  const { reorder, names } = bind({ drag: true, step: true });
  let refused = false;
  reorder.dragStart('sheet', 2, dragEvent({ preventDefault: () => (refused = true) }));
  assert.deepEqual([refused, reorder.dragging], [true, null]);
  reorder.handleKey('sheet', 0, key('ArrowDown'));
  assert.deepEqual(names(), ['A', 'B', 'C']);
});
