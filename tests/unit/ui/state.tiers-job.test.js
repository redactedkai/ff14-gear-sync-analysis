/* Substat tiers' own job in the saved shape (src/ui/state.ts restoreState, defaultState): `tiers: { job }`. A save without a
   valid one (from before it had one: a single job for the three math sub-tabs) gives it Stat Allocation's restored job; a valid
   one is kept apart from it. The math panel with IL Sync off holds level sync's item level as its cap, at load too. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { defaultState, restoreState } from '../../../src/ui/state.ts';
import { DEFAULT_JOB } from '../../../src/core/constants.ts';
import { restoreOpen } from '../helpers/common.ts';

test('the default state has Substat tiers on the default job', () => {
  assert.deepEqual(defaultState().tiers, { job: DEFAULT_JOB });
  assert.deepEqual(restoreState(null).tiers, { job: DEFAULT_JOB });
  assert.equal(DEFAULT_JOB, 'PLD');
});

test("a valid tiers.job is kept, apart from the math panel's job", () => {
  const s = restoreOpen({ tab: 'math', piece: { job: 'SGE', level: 90 }, tiers: { job: 'WAR' } });
  assert.deepEqual([s.job, s.piece.job, s.tiers.job], ['SGE', 'SGE', 'WAR']);
});

test('an old save with one math job gives Substat tiers that job', () => {
  const old = restoreOpen({ tab: 'math', mathTab: 'tiers', piece: { job: 'BRD', cap: 500, sync: true, level: 90 } });
  assert.equal(old.tiers.job, 'BRD');
  // the one-panel shape (top-level job) too
  assert.equal(restoreOpen({ job: 'DRG', level: 100 }).tiers.job, 'DRG');
});

test("a bad tiers.job is repaired to the math panel's job, whatever else the save holds", () => {
  for (const bad of ['XYZ', 7, null, '', undefined, {}, ['WAR']]) {
    const s = restoreOpen({ tab: 'math', piece: { job: 'NIN' }, tiers: { job: bad } });
    assert.equal(s.tiers.job, 'NIN', JSON.stringify(bad));
  }
  for (const bad of ['x', null, 5, []]) {
    assert.equal(restoreOpen({ piece: { job: 'NIN' }, tiers: bad }).tiers.job, 'NIN', JSON.stringify(bad));
  }
  // the math panel's own job is itself repaired first: an unknown one is the default job
  assert.equal(restoreOpen({ piece: { job: 'XYZ' }, tiers: { job: 'nope' } }).tiers.job, DEFAULT_JOB);
});

test("a restored state read again gives the same state, Substat tiers' job included", () => {
  const s = restoreOpen({ tab: 'math', piece: { job: 'SGE' }, tiers: { job: 'WAR' } });
  assert.deepEqual(restoreOpen(JSON.parse(JSON.stringify(s))), s);
});

test("load: the math panel with IL Sync off holds level sync's item level as its cap", () => {
  // level 85 gives item level 536 (ParamGrow.ItemLevelSync); the saved cap 123 is dropped with the switch off
  const off = restoreOpen({ tab: 'math', piece: { job: 'SGE', cap: 123, sync: false, level: 85 } });
  assert.equal(off.piece.cap, 536);
  assert.equal(off.cap, 536, "the open tab's copy");
  // at the level cap no level sync applies: no cap
  assert.equal(restoreOpen({ tab: 'math', piece: { job: 'SGE', cap: 123, sync: false, level: 100 } }).piece.cap, null);
  // with the switch on, the saved cap stays
  assert.equal(restoreOpen({ tab: 'math', piece: { job: 'SGE', cap: 270, sync: true, level: 85 } }).piece.cap, 270);
  // an older save with one panel: the math tab holds level sync's cap, the Gear browser keeps the saved one
  const old = restoreOpen({ job: 'SGE', cap: 123, sync: false, level: 80, tab: 'browse' });
  assert.deepEqual([old.piece.cap, old.browse.cap], [530, 123]);
  // the Sheets tab: the Gear browser's panel stands in at the top; the math panel still holds level sync's item level
  const sheets = restoreOpen({ tab: 'sheets', piece: { job: 'SGE', cap: 123, sync: false, level: 90 }, browse: { cap: 400 } });
  assert.deepEqual([sheets.piece.cap, sheets.cap], [660, 400]);
});
