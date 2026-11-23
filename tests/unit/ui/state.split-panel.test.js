/* splitPanelSettings (src/ui/state.js): the saved settings with the Job and sync panel split between the Gear browser and
   How the math works, and the old optimizer's `opt` dropped. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitPanelSettings } from '../../../src/ui/state.js';

/* A save of the shape before the split: the panel at the top, the old optimizer's settings in `opt`. */
const OLD = {
  job: 'SGE',
  cap: 123,
  sync: true,
  level: 100,
  tab: 'browse',
  mathTab: 'gcd',
  piece: { ilvl: 123, slot: 'head', subs: ['crit', 'spd'] },
  browse: { q: 'rakshasa', type: 'any', sort: 'ilvl' },
  opt: { target: 'spd', gcd: '2.4', byTier: true },
};

test('the top-level panel goes into both tabs and opt is dropped', () => {
  const split = splitPanelSettings(OLD);
  const panel = { job: 'SGE', cap: 123, sync: true, level: 100 };
  assert.deepEqual(split.piece, { ...OLD.piece, ...panel });
  assert.deepEqual(split.browse, { ...OLD.browse, ...panel });
  assert.deepEqual(Object.keys(split).sort(), ['browse', 'mathTab', 'piece', 'tab']);
  assert.ok('opt' in OLD && 'job' in OLD, 'the input is not changed');
});

test('a group that already has its own panel keeps it', () => {
  const split = splitPanelSettings({ ...OLD, browse: { ...OLD.browse, job: 'WAR', cap: 705, sync: false, level: 90 } });
  assert.deepEqual([split.browse.job, split.browse.cap, split.browse.sync, split.browse.level], ['WAR', 705, false, 90]);
  assert.equal(split.piece.job, 'SGE');
});

test('a save with no panel or no groups gets empty groups; a non-object comes back as it is', () => {
  assert.deepEqual(splitPanelSettings({ tab: 'math' }), { tab: 'math', piece: {}, browse: {} });
  assert.deepEqual(splitPanelSettings({ job: null, cap: null }).browse, { job: null, cap: null });
  for (const bad of [null, undefined, 7, 'x', []]) assert.equal(splitPanelSettings(bad), bad);
});
