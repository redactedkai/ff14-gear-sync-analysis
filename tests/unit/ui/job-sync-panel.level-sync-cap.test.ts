/* The math tab's cap while its IL Sync is off (src/ui/job-sync-panel.ts levelSyncCap, holdLevelSyncCap), the job each math
   sub-tab owns (mathJobOwner) and the Substat tiers panel (panelOf). Expected numbers are the game's ParamGrow.ItemLevelSync
   (core/sync-target.ts): level 50 gives item level 130, 60 gives 270, 70 gives 400, 80 gives 530, 90 gives 660, 100 gives 690;
   levels 1 to 49 give their own number; level 85 gives 536. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { holdLevelSyncCap, levelSyncCap, mathJobOwner, panelOf } from '../../../src/ui/job-sync-panel.ts';
import type { PanelSource } from '../../../src/ui/job-sync-panel.ts';
import { makeJobContext } from '../../../src/core/job-context.ts';
import { restoreOpen } from '../helpers/fixtures/common.ts';
import { createAppFacade } from '../helpers/fixtures/stores.ts';

test("levelSyncCap: the item level level sync gives, none at the job's level cap", () => {
  const sage = makeJobContext('SGE');
  assert.equal(levelSyncCap(sage, 85), 536);
  assert.equal(levelSyncCap(sage, 90), 660);
  assert.equal(levelSyncCap(sage, 70), 400);
  assert.equal(levelSyncCap(sage, 40), 40);
  assert.equal(levelSyncCap(sage, 100), null, 'level 100 is the cap: no level sync');
  assert.equal(levelSyncCap(sage, null), null);
  // the cap is the job's own: Blue Mage tops out at 80, Beastmaster at 50
  assert.equal(levelSyncCap(makeJobContext('BLU'), 80), null);
  assert.equal(levelSyncCap(makeJobContext('BLU'), 70), 400);
  assert.equal(levelSyncCap(makeJobContext('BST'), 50), null);
  assert.equal(levelSyncCap(makeJobContext('BST'), 40), 40);
});

test("holdLevelSyncCap: with IL Sync off the cap becomes level sync's item level; with it on, nothing changes", () => {
  const off = { job: 'WHM', cap: 123, sync: false, level: 80 };
  holdLevelSyncCap(off);
  assert.equal(off.cap, 530);
  const atCap = { job: 'WHM', cap: 123, sync: false, level: 100 };
  holdLevelSyncCap(atCap);
  assert.equal(atCap.cap, null);
  const on = { job: 'WHM', cap: 123, sync: true, level: 80 };
  holdLevelSyncCap(on);
  assert.equal(on.cap, 123);
  const none = { job: 'WHM', cap: null, sync: true, level: 80 };
  holdLevelSyncCap(none);
  assert.equal(none.cap, null, 'IL Sync on with no cap stays that way');
});

test('mathJobOwner: Substat tiers has its own job, the other sub-tabs use the math panel', () => {
  assert.equal(mathJobOwner('tiers'), 'tiers');
  assert.equal(mathJobOwner('piece'), 'math');
  assert.equal(mathJobOwner('gcd'), 'math');
});

test("panelOf('tiers'): the tiers job, no cap, IL Sync off, the job's level cap as its level; the same whichever tab is open", () => {
  const store = createAppFacade(
    restoreOpen({ tab: 'browse', browse: { job: 'WAR', level: 90 }, piece: { job: 'BLM', level: 70 }, tiers: { job: 'BLU' } }),
  );
  for (const tab of ['browse', 'math']) {
    store.showTab(tab);
    const panel = store.panel('tiers');
    assert.deepEqual([panel.job, panel.cap, panel.sync, panel.level, panel.jobCtx.jobId], ['BLU', null, false, 80, 'BLU'], tab);
  }
  const source: PanelSource = {
    tab: 'browse',
    ...store.panel('browse'),
    browse: store.panel('browse'),
    piece: store.panel('math'),
    tiers: { job: 'BLU' },
  };
  assert.deepEqual(panelOf(source, 'tiers'), store.panel('tiers'));
  // the other panels are as they were
  assert.deepEqual([store.panel('math').job, store.panel('browse').job], ['BLM', 'WAR']);
});
