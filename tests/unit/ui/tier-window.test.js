/* The window of rows a Substat tiers card draws (src/ui/tier-window.js): which rows show for a scroll position, which are
   drawn, when to draw again and where to scroll to center a row. Sizes are those of the page's cards: rows 31 px, the area
   492 px (27 px of column names and 15 rows). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OVERSCAN_ROWS, rowsInView, rowsToDraw, scrollTopToCenter, viewLeavesDrawn } from '../../../src/ui/tier-window.js';

const ROW = 31;
const AREA = 492;
const NAMES = 27;
/* Critical Hit at level 100: 235 rows */
const COUNT = 235;

test('rows in view: from the scroll position down the area, held to the rows there are', () => {
  assert.deepEqual(rowsInView(0, AREA, ROW, COUNT), { first: 0, last: 16 });
  // 3100 px down: row 100 (3100 / 31) is the first, and 492 px more reach row 116
  assert.deepEqual(rowsInView(3100, AREA, ROW, COUNT), { first: 100, last: 116 });
  // scrolled to the end: 235 rows of 31 px and the 27 px of column names, less the area
  assert.deepEqual(rowsInView(COUNT * ROW + NAMES - AREA, AREA, ROW, COUNT), { first: 220, last: 235 });
  // a list shorter than the area
  assert.deepEqual(rowsInView(0, AREA, ROW, 5), { first: 0, last: 5 });
});

test('rows to draw: the rows in view and 20 more each side, held to the rows there are', () => {
  assert.equal(OVERSCAN_ROWS, 20);
  assert.deepEqual(rowsToDraw({ first: 100, last: 116 }, COUNT), { from: 80, to: 136 });
  assert.deepEqual(rowsToDraw({ first: 0, last: 16 }, COUNT), { from: 0, to: 36 });
  assert.deepEqual(rowsToDraw({ first: 220, last: 235 }, COUNT), { from: 200, to: 235 });
});

test('drawing again: only when the view leaves the rows drawn, and not for the ends of the list', () => {
  const drawn = { from: 80, to: 136 };
  assert.equal(viewLeavesDrawn(drawn, { first: 100, last: 116 }, COUNT), false);
  assert.equal(viewLeavesDrawn(drawn, { first: 80, last: 96 }, COUNT), false);
  assert.equal(viewLeavesDrawn(drawn, { first: 79, last: 95 }, COUNT), true);
  assert.equal(viewLeavesDrawn(drawn, { first: 121, last: 137 }, COUNT), true);
  // the first and last rows drawn are the list's own: nothing more to draw there
  assert.equal(viewLeavesDrawn({ from: 0, to: 36 }, { first: 0, last: 16 }, COUNT), false);
  assert.equal(viewLeavesDrawn({ from: 200, to: 235 }, { first: 220, last: 235 }, COUNT), false);
});

test('centering a row: its middle at the middle of the rows under the column names', () => {
  // row 187 starts 5,797 px down; its middle is 15.5 px further; the rows' part of the area is 465 px, its middle 232.5
  assert.equal(scrollTopToCenter(187, AREA, NAMES, ROW), 187 * 31 + 15.5 - 232.5);
  assert.equal(scrollTopToCenter(187, AREA, NAMES, ROW), 5580);
  // row 0 would scroll above the top: the area clamps it
  assert.ok(scrollTopToCenter(0, AREA, NAMES, ROW) < 0);
});
