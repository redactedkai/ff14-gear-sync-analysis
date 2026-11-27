/* The two reference tabs' own Job and sync panels, through the app facade (src/ui/store/app-facade.ts): the panel edits the open
   tab's job, cap, sync and level; the facade's job, cap, sync and level read the open tab's; panel(tab) reads any tab's;
   persisted() puts each into its own group. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createAppFacade } from '../../helpers/stores.ts';
import { restoreOpen } from '../../helpers/common.ts';

/* A save in the new shape: a different job, level and sync on each tab (a Warrior at item level 705 for the browser, a
   Black Mage at level 70 for the math). */
const SAVE = {
  tab: 'browse',
  mathTab: 'gcd',
  browse: { job: 'WAR', cap: 705, sync: false, level: 90, sort: 'det', q: 'axe' },
  piece: { job: 'BLM', cap: 300, sync: true, level: 70, slot: 'ring', subs: ['crit', 'sps'] },
};

test("each tab opens with its own panel; the open tab's is the store's job, cap, sync and level", () => {
  const store = createAppFacade(restoreOpen(SAVE));
  assert.deepEqual([store.job, store.cap, store.sync, store.level], ['WAR', 705, false, 90]);
  assert.equal(store.jobCtx.jobId, 'WAR');
  assert.deepEqual(
    ['browse', 'math'].map(tab => store.panel(tab).job),
    ['WAR', 'BLM'],
  );
  const math = store.panel('math');
  assert.deepEqual([math.cap, math.sync, math.level, math.jobCtx.jobId], [300, true, 70, 'BLM']);
});

test("changing the open tab's panel leaves the other tabs' alone, and switching tabs swaps the panel", () => {
  const store = createAppFacade(restoreOpen(SAVE));
  store.setJob('DRG');
  store.editPanel({ cap: 650, sync: true, level: 80 });
  assert.equal(store.panel('math').job, 'BLM');
  assert.equal(store.panel('math').cap, 300);
  store.showTab('math');
  assert.deepEqual([store.job, store.cap, store.sync, store.level], ['BLM', 300, true, 70]);
  assert.equal(store.jobCtx.jobId, 'BLM');
  // the browser's edits were kept in its group
  const browse = store.panel('browse');
  assert.deepEqual([browse.job, browse.cap, browse.sync, browse.level], ['DRG', 650, true, 80]);
  store.showTab('gcd'); // a math sub-tab: the same panel
  assert.deepEqual([store.tab, store.mathTab, store.job], ['math', 'gcd', 'BLM']);
  store.showTab('browse');
  assert.deepEqual([store.job, store.cap, store.sync, store.level], ['DRG', 650, true, 80]);
});

test("a job change resets only the open tab's own selections", () => {
  const store = createAppFacade(restoreOpen(SAVE));
  store.setJob('WHM'); // the browser: the sort by Determination stays; the piece is untouched
  assert.equal(store.browse.sort, 'det');
  assert.equal(store.piece.slot, 'ring');
  store.showTab('math');
  store.setJob('WAR');
  assert.equal(store.piece.slot, 'ring');
  assert.equal(store.panel('browse').job, 'WHM', 'the browser panel keeps the job it was left with');
  assert.equal(store.browse.q, 'axe');
});

test("persisted: each tab's panel in its own group, the open tab's edits included, nothing written to the store", () => {
  const store = createAppFacade(restoreOpen(SAVE));
  store.setField('cap', 710);
  const saved = store.persisted();
  assert.deepEqual(Object.keys(saved).sort(), ['browse', 'piece', 'sheetFigures', 'tiers']);
  assert.equal(saved.browse.cap, 710);
  assert.equal(store.panel('browse').cap, 710, 'a tab has one panel: the saved copy is never behind it');
  assert.deepEqual([saved.piece.job, saved.piece.cap, saved.piece.sync, saved.piece.level], ['BLM', 300, true, 70]);
  // the open tab and math view are not saved (the address names them)
  assert.equal('tab' in saved || 'mathTab' in saved, false);
  // and it restores to the same tabs
  const again = createAppFacade(restoreOpen(JSON.parse(JSON.stringify(saved))));
  assert.deepEqual(
    ['browse', 'math'].map(tab => [again.panel(tab).job, again.panel(tab).cap]),
    [
      ['WAR', 710],
      ['BLM', 300],
    ],
  );
});
