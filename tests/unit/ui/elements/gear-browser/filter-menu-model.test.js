/* What the Expansion and Gear categories menus work out (src/ui/elements/gear-browser/filter-menu-model.ts). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACTIVITIES, EXPANSIONS } from '../../../../../src/core/constants.js';
import {
  GEAR_FROM_SECTIONS,
  excludeAfterAll,
  excludeAfterToggle,
  expOffAfterToggle,
  expansionSummary,
  gearFromCountText,
  gearFromCountWords,
  gearFromSummary,
  tabCountText,
} from '../../../../../src/ui/elements/gear-browser/filter-menu-model.ts';
import { DEFAULT_EXCLUDE } from '../../../../../src/ui/job-sync-panel.js';

test('Gear categories button text: All, None, All but N up to five left out, then N of M', () => {
  const keys = ACTIVITIES.map(a => a.key);
  assert.equal(gearFromSummary([]), 'All');
  assert.equal(gearFromSummary(keys), 'None');
  for (let n = 1; n <= 5; n++) {
    assert.equal(gearFromSummary(keys.slice(0, n)), `All but ${n}`);
  }
  assert.equal(gearFromSummary(DEFAULT_EXCLUDE), `${keys.length - DEFAULT_EXCLUDE.length} of ${keys.length}`);
});

test('Gear categories tabs: every box once, in its section, with its hint filled in and the tab counts following the boxes', () => {
  assert.deepEqual(
    GEAR_FROM_SECTIONS.map(tab => [tab.title, tab.boxes.length, tab.byRow]),
    [
      ['Everyday', 8, false],
      ['Side content', 7, false],
      ['Hard content', 5, true],
    ],
  );
  assert.deepEqual(GEAR_FROM_SECTIONS.flatMap(tab => tab.boxes.map(box => box.key)).sort(), ACTIVITIES.map(a => a.key).sort());
  for (const box of GEAR_FROM_SECTIONS.flatMap(tab => tab.boxes)) {
    assert.ok(box.hint.length > 0 && !/[{}]/.test(box.hint), `${box.key}: the hint's placeholders are filled in`);
  }
  // Hard content reads row by row, Current before Legacy
  assert.deepEqual(
    GEAR_FROM_SECTIONS[2].boxes.map(box => box.key),
    ['extreme_current', 'extreme_legacy', 'savage_current', 'savage_legacy', 'ultimate'],
  );
  // the default leaves out Miscellaneous (Everyday), five Side content boxes and three Hard content boxes
  assert.deepEqual(
    GEAR_FROM_SECTIONS.map(tab => tabCountText(tab, DEFAULT_EXCLUDE)),
    ['7/8', '2/7', '2/5'],
  );
});

test('Gear categories boxes: a box on or off keeps ACTIVITIES order; All, None and Default give fresh lists', () => {
  const keys = ACTIVITIES.map(a => a.key);
  assert.ok(!excludeAfterToggle(DEFAULT_EXCLUDE, 'pvp', true).includes('pvp'));
  assert.deepEqual(
    excludeAfterToggle(DEFAULT_EXCLUDE, 'crafted', false),
    keys.filter(k => k === 'crafted' || DEFAULT_EXCLUDE.includes(k)),
  );
  assert.deepEqual([excludeAfterAll('all'), excludeAfterAll('none')], [[], keys]);
  assert.deepEqual(excludeAfterAll('default'), DEFAULT_EXCLUDE);
  assert.notEqual(excludeAfterAll('default'), DEFAULT_EXCLUDE, 'a copy, so a later box does not change the default');
});

test('Gear categories piece counts: thousands separators, none before the count has landed, a sentence for a screen reader', () => {
  assert.deepEqual([gearFromCountText(88888), gearFromCountText(0), gearFromCountText(null)], ['88,888', '0', '']);
  assert.equal(gearFromCountWords(2), '2 pieces in this category under the current filters.');
  assert.equal(gearFromCountWords(1), '1 piece in this category under the current filters.');
  assert.equal(gearFromCountWords(0), 'No pieces in this category for this job and filters.');
  assert.equal(gearFromCountWords(null), '');
});

test('Expansion menu: the button text and the list of switched-off expansions after a tick, oldest first', () => {
  const shorts = EXPANSIONS.map(e => e.short);
  assert.equal(expansionSummary([]), 'All expansions');
  assert.equal(expansionSummary(shorts), 'None');
  assert.equal(expansionSummary(shorts.slice(1)), EXPANSIONS[0].name);
  assert.equal(expansionSummary(shorts.slice(2)), '2 expansions');
  assert.deepEqual(expOffAfterToggle(['ARR'], 'HW', false), ['ARR', 'HW']);
  assert.deepEqual(expOffAfterToggle(['ARR', 'HW'], 'ARR', true), ['HW']);
});
