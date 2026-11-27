/* The app state's actions (src/ui/store/app-actions.ts), driven from Node through the app facade the screens read (app-facade.ts). */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fakeFrames } from '../../helpers/frames.ts';
import { createAppFacade, createStores } from '../../helpers/stores.ts';
import { restoreOpen } from '../../helpers/common.ts';

/* A store for `job` with the Gear browser open. */
const storeFor = (job: string) => createAppFacade(restoreOpen({ job, tab: 'browse' }));

/* Roadmap A1: a job switch keeps every setting that is not tied to the job. */
test('switching to another job keeps the settings the new job can use and resets the rest (audit 11 #2)', () => {
  const store = storeFor('SGE');
  store.setField('browse.exclude', ['crafted']);
  store.setField('browse.sort', 'det');
  store.setField('browse.type', 'ring');
  store.setField('cap', 200);
  store.setJob('WHM');
  assert.equal(store.job, 'WHM');
  assert.equal(store.jobCtx.jobId, 'WHM');
  // the same stats: the sort stays, and the slot (a ring is worn by every job)
  assert.equal(store.browse.sort, 'det');
  assert.equal(store.browse.type, 'ring');
  assert.equal(store.cap, 200); // not job-specific: kept
  // to a tank: Determination stays; Spell Speed would not
  store.setField('browse.sort', 'sps');
  store.setJob('WAR');
  assert.equal(store.browse.sort, 'ilvl');
  assert.deepEqual(store.browse.exclude, ['crafted']); // "Gear categories" boxes are not job-specific: kept
});

test("switching to a job with a lower level cap clamps the synced level and the open tab's equip level filter to it", () => {
  const store = createAppFacade(restoreOpen({ job: 'SGE', level: 90, tab: 'browse', browse: { lvl: 100 } }));
  store.setJob('BLU');
  assert.equal(store.level, 80);
  assert.equal(store.browse.lvl, 80);
  store.showTab('math');
  assert.equal(store.job, 'SGE', 'How the math works has its own job');
  assert.equal(store.level, 90);
  store.showTab('browse');
  store.setJob('BST');
  assert.equal(store.level, 50);
  assert.equal(store.browse.lvl, 50);
  store.setJob('WAR'); // a higher cap keeps the lower level
  assert.equal(store.level, 50);
  store.setField('level', 40);
  store.setField('browse.lvl', '');
  store.setJob('BST'); // below the cap, and an empty filter: untouched
  assert.equal(store.level, 40);
  assert.equal(store.browse.lvl, '');
});

test('choosing the current job again changes nothing', () => {
  const store = storeFor('DRG');
  store.setField('browse.sort', 'crit');
  store.setJob('DRG');
  assert.equal(store.browse.sort, 'crit');
});

test("reset to defaults: the open tab's settings back to their defaults (Paladin, the default job); the other tabs stay", () => {
  const store = storeFor('SGE');
  store.setJob('WAR');
  store.editPanel({ cap: 123, level: 50, sync: true });
  store.setField('browse.q', 'Dread');
  store.setField('browse.min', 100);
  store.resetAll();
  const want = restoreOpen(null);
  const got = store.persisted();
  assert.equal(store.tab, 'browse');
  assert.deepEqual(got.browse, want.browse);
  assert.equal(store.job, 'PLD');
  assert.deepEqual([store.cap, store.sync, store.level], [want.cap, want.sync, want.level]);
  // the math tab's settings are as they were
  assert.equal(got.piece.job, 'SGE');
  // the math tab's reset takes its own and nothing else
  store.showTab('math');
  store.setField('piece.slot', 'ring');
  store.resetAll();
  assert.equal(store.persisted().piece.job, 'PLD');
  assert.equal(store.persisted().piece.slot, want.piece.slot);
  assert.deepEqual(store.persisted().browse, want.browse);
});

test('tabs: an unknown tab opens the Sheets tab; a math sub-view opens the math tab on it', () => {
  const store = storeFor('SGE');
  assert.equal(store.tab, 'browse');
  store.showTab('pool'); // the old Gear pool tab no longer exists
  assert.equal(store.tab, 'sheets');
  store.showTab('opt'); // nor the old Gear optimizer tab
  assert.equal(store.tab, 'sheets');
  store.showTab('gcd');
  assert.deepEqual([store.tab, store.mathTab], ['math', 'gcd']);
});

test('openTab: a newer request replaces one still waiting, so the older tab is never shown (Back while a tab opens)', async () => {
  const frames = fakeFrames();
  try {
    const { app: store, store: raw } = createStores(restoreOpen({ job: 'PLD', tab: 'sheets' }));
    store.openTab('browse');
    store.openTab('sheets'); // the player went Back before the first frame
    assert.equal(store.pendingTab, 'sheets');
    frames.step();
    await new Promise(resolve => setTimeout(resolve, 10));
    // the older request never showed its tab: one tab was shown, by the newer request
    assert.deepEqual(
      raw.log.filter(name => name === 'screen/showTab'),
      ['screen/showTab'],
    );
    assert.equal(store.tab, 'sheets');
    assert.equal(store.pendingTab, null);
  } finally {
    frames.restore();
  }
});
