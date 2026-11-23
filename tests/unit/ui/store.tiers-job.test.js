/* The math sub-tabs' own jobs and the math panel's cap in the store (src/ui/store.js): Substat tiers has its own saved job
   (setTiersJob; setJob routes owner 'tiers' to it) that never touches Stat Allocation's panel, and the other way round; with IL
   Sync off the math panel's cap follows level sync's item level on the user actions that change it (the level box, a job
   change, Reset, a link), and never on a tab change. Item levels are the game's ParamGrow.ItemLevelSync: level 85 gives 536,
   level 80 gives 530, level 100 has no level sync. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createAppStore } from '../../../src/ui/store.js';
import { restoreOpen } from '../helpers/common.js';

const SAVE = {
  tab: 'math',
  mathTab: 'piece',
  browse: { job: 'WAR', cap: 705, sync: false, level: 90 },
  piece: { job: 'BLM', cap: 300, sync: true, level: 70, slot: 'ring', subs: ['crit', 'sps'] },
  tiers: { job: 'WHM' },
};

test("setTiersJob changes only Substat tiers' job: the math panel and the browser keep theirs", () => {
  const store = createAppStore(restoreOpen(SAVE));
  store.setTiersJob('DRG');
  assert.equal(store.tiers.job, 'DRG');
  assert.deepEqual([store.job, store.cap, store.sync, store.level], ['BLM', 300, true, 70]);
  assert.deepEqual([store.piece.job, store.piece.slot, store.piece.subs], ['BLM', 'ring', ['crit', 'sps']]);
  assert.equal(store.browse.job, 'WAR');
  assert.equal(store.panel('tiers').jobCtx.jobId, 'DRG');
});

test("setJob with owner 'tiers' is setTiersJob; with 'math' it changes Stat Allocation's job and leaves Substat tiers' alone", () => {
  const store = createAppStore(restoreOpen(SAVE));
  store.setJob('NIN', 'tiers');
  assert.deepEqual([store.tiers.job, store.job, store.piece.job === 'BLM'], ['NIN', 'BLM', true]);
  store.setJob('SGE', 'math');
  assert.deepEqual([store.job, store.tiers.job], ['SGE', 'NIN']);
  assert.equal(store.panel('math').job, 'SGE');
  assert.equal(store.browse.job, 'WAR');
  // no owner: the open tab's panel, as before
  store.setJob('GNB');
  assert.deepEqual([store.job, store.tiers.job], ['GNB', 'NIN']);
});

test("setJob for Substat tiers with the same job changes nothing; a typed level the new job's cap does not allow is dropped", () => {
  const store = createAppStore(restoreOpen(SAVE));
  store.tiers.level = 85;
  store.setTiersJob('WHM');
  assert.equal(store.tiers.level, 85);
  store.setTiersJob('BLU'); // Blue Mage's level cap is 80: level 85 is more than it has
  assert.equal(store.tiers.level, null);
  store.tiers.level = 60;
  store.setTiersJob('SGE');
  assert.equal(store.tiers.level, 60);
});

test("a tab change never changes either tab's job; the tiers job survives switching tabs and sub-tabs", () => {
  const store = createAppStore(restoreOpen(SAVE));
  store.setTiersJob('MNK');
  for (const t of ['browse', 'piece', 'tiers', 'gcd', 'sheets', 'tiers']) store.showTab(t);
  assert.deepEqual([store.panel('tiers').job, store.panel('math').job, store.panel('browse').job], ['MNK', 'BLM', 'WAR']);
});

test("persisted: Substat tiers' job is saved apart from the math panel's, and restores", () => {
  const store = createAppStore(restoreOpen(SAVE));
  store.setTiersJob('MNK');
  store.setJob('SGE', 'math');
  const saved = JSON.parse(JSON.stringify(store.persisted()));
  assert.deepEqual(saved.tiers, { job: 'MNK' });
  assert.equal(saved.piece.job, 'SGE');
  const again = createAppStore(restoreOpen({ ...saved, tab: 'math' }));
  assert.deepEqual([again.panel('tiers').job, again.panel('math').job], ['MNK', 'SGE']);
});

/* ---- the cap while IL Sync is off ---- */
const OFF = { tab: 'math', piece: { job: 'SGE', cap: 123, sync: true, level: 85 } };

test('switching IL Sync off stores the level-sync item level as the cap: 536 at level 85, none at the level cap', () => {
  const store = createAppStore(restoreOpen(OFF));
  assert.equal(store.cap, 123);
  store.sync = false;
  store.followLevelSync();
  assert.equal(store.cap, 536);
  // level 100: no level sync
  store.sync = true;
  store.cap = 690;
  store.level = 100;
  store.sync = false;
  store.followLevelSync();
  assert.equal(store.cap, null);
});

test('while IL Sync is off the cap follows the level box, a job change and Reset; switching on keeps it', () => {
  const store = createAppStore(restoreOpen({ ...OFF, piece: { ...OFF.piece, sync: false } }));
  assert.equal(store.cap, 536, 'load');
  store.level = 80;
  store.followLevelSync(); // the level box's commit
  assert.equal(store.cap, 530);
  store.level = 100;
  store.followLevelSync();
  assert.equal(store.cap, null);
  store.level = 50;
  store.followLevelSync();
  assert.equal(store.cap, 130);
  // a job with a lower level cap: Blue Mage tops out at 80, so level 80 is its cap and has no level sync
  store.level = 80;
  store.followLevelSync();
  store.setJob('BLU');
  assert.deepEqual([store.job, store.level, store.cap], ['BLU', 80, null]);
  // switching on keeps the stored cap (no copying: a cap typed afterwards is the user's)
  store.setJob('SGE');
  store.level = 70;
  store.followLevelSync();
  assert.equal(store.cap, 400);
  store.sync = true;
  assert.equal(store.cap, 400);
  // Reset: the default job at level 100 with no cap
  store.resetAll();
  assert.deepEqual([store.job, store.level, store.sync, store.cap], ['PLD', 100, false, null]);
});

test('with IL Sync on the cap is not touched by the level box or a job change', () => {
  const store = createAppStore(restoreOpen(OFF));
  store.level = 80;
  store.followLevelSync();
  assert.equal(store.cap, 123);
  store.setJob('WHM');
  assert.equal(store.cap, 123);
});

test("a tab change leaves both tabs' caps as they were (no watcher swaps them)", () => {
  const store = createAppStore(
    restoreOpen({ tab: 'math', piece: { job: 'SGE', cap: 123, sync: false, level: 85 }, browse: { cap: 405, sync: false, level: 70 } }),
  );
  assert.equal(store.panel('math').cap, 536);
  store.showTab('browse');
  assert.equal(store.cap, 405, 'the Gear browser keeps its own cap with IL Sync off: nothing follows level sync there');
  assert.equal(store.panel('math').cap, 536);
  store.showTab('math');
  assert.equal(store.cap, 536);
  assert.equal(store.panel('browse').cap, 405);
});

test("setPanel('math'): a link's panel with IL Sync off gets level sync's item level, with it on keeps its cap", () => {
  const store = createAppStore(restoreOpen({ tab: 'browse' }));
  store.setPanel('math', { job: 'SGE', cap: 77, sync: false, level: 90 });
  assert.equal(store.piece.cap, 660);
  store.setPanel('math', { job: 'SGE', cap: 270, sync: true, level: 90 });
  assert.equal(store.piece.cap, 270);
  // the Gear browser's panel (the open tab's copy here) is not held to level sync
  store.setPanel('browse', { job: 'WAR', cap: 77, sync: false, level: 90 });
  assert.equal(store.cap, 77);
  // the open math tab: the top-level copy
  store.showTab('math');
  store.setPanel('math', { job: 'SGE', cap: 77, sync: false, level: 80 });
  assert.equal(store.cap, 530);
});
