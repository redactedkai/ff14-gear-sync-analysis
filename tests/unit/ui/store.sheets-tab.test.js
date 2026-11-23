/* The Sheets tab in the app store (store.js, state.js): it has no Job and sync panel, so going to it and back leaves
   every tab's panel as it was, and the save holds no panel for it. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TABS } from '../../../src/ui/state.js';
import { createAppStore } from '../../../src/ui/store.js';
import { restoreOpen } from '../helpers/common.js';

const SAVE = {
  tab: 'browse',
  browse: { job: 'WAR', cap: 705, sync: false, level: 90 },
  piece: { job: 'BLM', cap: 300, sync: true, level: 70 },
};

test("the Sheets tab is the first tab; going there and back keeps every tab's panel", () => {
  assert.equal(TABS[0], 'sheets');
  const store = createAppStore(restoreOpen(SAVE));
  store.level = 80; // an edit of the browser's panel, then the Sheets tab
  store.showTab('sheets');
  assert.equal(store.tab, 'sheets');
  assert.deepEqual(
    ['browse', 'math'].map(tab => store.panel(tab).job),
    ['WAR', 'BLM'],
  );
  assert.equal(store.panel('browse').level, 80, 'the leaving tab kept its panel');
  const saved = store.persisted();
  assert.deepEqual([saved.browse.level, saved.browse.job, saved.piece.job], [80, 'WAR', 'BLM']);
  assert.equal('sheets' in saved, false, 'no panel group for the Sheets tab');
  store.showTab('math');
  assert.deepEqual([store.job, store.cap, store.level], ['BLM', 300, 70]);
  // Reset on the Sheets tab changes nothing (it has no panel)
  store.showTab('sheets');
  store.resetAll();
  assert.equal(store.panel('browse').job, 'WAR');
  assert.equal(store.panel('math').job, 'BLM');
});

test('a restore opening on the Sheets tab keeps each other tab with its own panel', () => {
  const store = createAppStore(restoreOpen({ ...SAVE, tab: 'sheets' }));
  assert.equal(store.tab, 'sheets');
  assert.deepEqual(
    ['browse', 'math'].map(tab => store.panel(tab).job),
    ['WAR', 'BLM'],
  );
  store.showTab('math');
  assert.deepEqual([store.job, store.level], ['BLM', 70]);
});
