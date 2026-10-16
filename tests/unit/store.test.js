/* The Alpine store's actions, driven from Node (the store module has no Alpine import). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { restoreState } from '../../src/ui/state.js';
import { createAppStore } from '../../src/ui/store.js';

const storeFor = job => createAppStore(restoreState({ job }));

test('A1: switching to another job in the same role resets the job-specific settings and keeps the rest', () => {
  const store = storeFor('SGE');
  store.opt.target = 'crit';
  store.opt.exclude = ['crafted'];
  store.browse.sort = 'det';
  store.cap = 200;
  store.opt.gcd = 2.45;
  store.opt.gcdMode = 'min';
  store.setJob('WHM');
  assert.equal(store.job, 'WHM');
  assert.equal(store.jobCtx.jobId, 'WHM');
  assert.equal(store.opt.target, 'main');
  assert.equal(store.browse.sort, 'ilvl');
  assert.equal(store.cap, 200); // not job-specific: kept
  assert.equal(store.opt.gcd, ''); // the GCDs a job can reach depend on its haste: cleared
  assert.equal(store.opt.gcdMode, 'min'); // the mode is a preference: kept
  assert.deepEqual(store.opt.exclude, ['crafted']); // gear groups are not job-specific: kept
});

test('switching to a job with a lower level cap clamps the synced level and the equip level filter to it', () => {
  const store = createAppStore(restoreState({ job: 'SGE', level: 90, browse: { lvl: 100 }, opt: { lvl: 95 } }));
  store.setJob('BLU');
  assert.equal(store.level, 80);
  assert.equal(store.browse.lvl, 80);
  assert.equal(store.opt.lvl, 80);
  store.setJob('BST');
  assert.equal(store.level, 50);
  assert.equal(store.browse.lvl, 50);
  store.setJob('WAR'); // a higher cap keeps the lower level
  assert.equal(store.level, 50);
  store.level = 40;
  store.browse.lvl = '';
  store.setJob('BST'); // below the cap, and an empty filter: untouched
  assert.equal(store.level, 40);
  assert.equal(store.browse.lvl, '');
});

test('choosing the current job again changes nothing', () => {
  const store = storeFor('DRG');
  store.opt.target = 'crit';
  store.setJob('DRG');
  assert.equal(store.opt.target, 'crit');
});

test('reset to defaults: every saved setting back to its default, no job, the open tab kept', () => {
  const store = storeFor('SGE');
  Object.assign(store, { cap: 123, level: 50, sync: false, tab: 'browse' });
  store.browse.q = 'Dread';
  store.browse.min = 100;
  store.opt.target = 'crit';
  store.opt.exclude = [];
  store.resetAll();
  const { tab, ...want } = restoreState(null);
  const got = store.persisted();
  assert.equal(got.tab, 'browse');
  delete got.tab;
  assert.deepEqual(got, want);
  assert.equal(want.job, null);
  assert.equal(store.job, null);
});

test('tabs: an unknown tab opens the optimizer; a math sub-view opens the math tab on it', () => {
  const store = storeFor('SGE');
  store.showTab('browse');
  assert.equal(store.tab, 'browse');
  store.showTab('pool'); // the old Gear pool tab no longer exists
  assert.equal(store.tab, 'opt');
  store.showTab('gcd');
  assert.deepEqual([store.tab, store.mathTab], ['math', 'gcd']);
});
