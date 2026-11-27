/* The Gear browser's column tint (src/styles/gear-browser.css): the table's data-hot and data-sorted keys pair with the cells of that
   column, one selector per key, so a stat the game adds without a selector here would not be tinted. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ITEM_STAT_ORDER } from '../../../src/core/constants.ts';
import { readStyles } from '../../../scripts/build/styles.ts';

// the columns the table shows: the stats a piece has (not the main or secondary attribute totals, which are not cells)
const STAT_COLUMNS = ITEM_STAT_ORDER.filter(key => !/Attr$/.test(key));

const css = readStyles();

test('the Gear browser tints the pointed-at and the sorted column for lvl, ilvl and every stat key', () => {
  for (const key of ['lvl', 'ilvl', ...STAT_COLUMNS]) {
    for (const selector of [
      `#gear-table[data-hot="${key}"] td[data-col="${key}"]`,
      `#gear-table[data-hot="${key}"] th[data-col="${key}"]`,
      `#gear-table[data-sorted="${key}"] td[data-col="${key}"]`,
    ]) {
      assert.ok(css.includes(selector), `no rule for ${selector}`);
    }
  }
});
