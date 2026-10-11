/* The Alpine store's actions, driven from Node (the store module has no Alpine import). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { restoreState } from '../../src/ui/state.js';
import { createAppStore } from '../../src/ui/store.js';
import { browseItems } from '../../src/core/items.js';
import { makeJobContext } from '../../src/core/job-context.js';

function storeWithPool(job) {
  const store = createAppStore(restoreState({ job }));
  store.addRows(browseItems(makeJobContext(job), { q: '', type: 'any', ilvlMin: 130, ilvlMax: 135, lvlMax: 50 }));
  assert.ok(store.pool.length > 0);
  return store;
}

test('A1: switching to another job in the same role clears the pool and job-specific settings', () => {
  const store = storeWithPool('SGE');
  store.opt.target = 'crit';
  store.browse.sort = 'det';
  store.poolFilter = 'ring';
  store.cap = 200;
  const version = store.poolVersion;
  store.setJob('WHM');
  assert.equal(store.job, 'WHM');
  assert.equal(store.jobCtx.jobId, 'WHM');
  assert.deepEqual(store.pool, []);
  assert.equal(store.opt.target, 'spd');
  assert.equal(store.browse.sort, 'ilvl');
  assert.equal(store.poolFilter, 'all');
  assert.equal(store.cap, 200); // not job-specific: kept
  assert.ok(store.poolVersion > version);
});

test('switching to another role clears the pool too', () => {
  const store = storeWithPool('WAR');
  store.setJob('BLM');
  assert.deepEqual(store.pool, []);
  assert.equal(store.jobCtx.weaponMode, '2h');
});

test('choosing the current job again changes nothing', () => {
  const store = storeWithPool('DRG');
  const before = store.pool.length;
  store.setJob('DRG');
  assert.equal(store.pool.length, before);
});
