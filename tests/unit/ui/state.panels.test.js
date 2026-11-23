/* restoreState with a Job and sync panel on each tab (src/ui/state.js): the saved shapes it reads. An older save has one
   panel (top-level job, cap, sync, level), which the two tabs with a panel share at first; a newer one has a panel in
   each of `piece` and `browse`; a broken one is repaired field by field. An older save's Gear optimizer settings (`opt`,
   `optPanel`) are dropped. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { restoreOpen } from '../helpers/common.js';
import { capCeiling } from '../../../src/core/sync-target.js';

/* [job, cap, sync, level] of the open tab's panel (no group) or of a tab's group */
const panelOf = (s, group) => {
  const o = group ? s[group] : s;
  return [o.job, o.cap, o.sync, o.level];
};

test('an older save with one panel gives both tabs that panel, and loses no other value', () => {
  const old = {
    job: 'SGE',
    cap: 123,
    sync: true,
    level: 100,
    tab: 'math',
    mathTab: 'tiers',
    piece: { ilvl: 150, slot: 'ring', subs: ['crit', 'det'] },
    browse: { q: 'staff', sort: 'det' },
    opt: { target: 'crit', food: true, min: 100 },
  };
  const s = restoreOpen(old);
  for (const group of [null, 'piece', 'browse']) assert.deepEqual(panelOf(s, group), ['SGE', 123, true, 100], String(group));
  assert.deepEqual([s.piece.ilvl, s.piece.slot, s.piece.subs], [150, 'ring', ['crit', 'det']]);
  assert.deepEqual([s.browse.q, s.browse.sort], ['staff', 'det']);
  assert.deepEqual([s.tab, s.mathTab], ['math', 'tiers']);
  assert.equal('opt' in s, false, "the old optimizer's settings are dropped");
});

test("a newer save keeps a different panel on each tab; the open tab's is the top-level copy", () => {
  const saved = {
    tab: 'math',
    optPanel: { job: 'SGE', cap: 123, sync: true, level: 100 },
    browse: { job: 'WAR', cap: 705, sync: false, level: 90, type: 'body' },
    piece: { job: 'BLM', cap: 300, sync: true, level: 70, slot: 'ring', subs: ['crit', 'dh'] },
    opt: { target: 'det' },
  };
  const s = restoreOpen(saved);
  assert.deepEqual(panelOf(s, 'browse'), ['WAR', 705, false, 90]);
  assert.deepEqual(panelOf(s, 'piece'), ['BLM', 300, true, 70]);
  assert.equal('optPanel' in s, false);
  assert.deepEqual(panelOf(s), ['BLM', 300, true, 70]);
  // each group is checked for its own job
  assert.equal(s.browse.type, 'body');
  assert.deepEqual(s.piece.subs, ['crit', 'dh']);
  // the Sheets tab has no panel: the Gear browser's stands in (an old optimizer tab opens Sheets)
  assert.equal(restoreOpen({ ...saved, tab: 'opt' }).tab, 'sheets');
  assert.equal(restoreOpen({ ...saved, tab: 'opt' }).job, 'WAR');
  assert.equal(restoreOpen({ ...saved, tab: 'browse' }).job, 'WAR');
});

test("a group's own panel wins over the older top-level one; a group without one takes the top-level", () => {
  const s = restoreOpen({ job: 'SGE', cap: 123, sync: true, level: 100, browse: { job: 'WAR', cap: 705, sync: false, level: 90 } });
  assert.deepEqual(panelOf(s, 'browse'), ['WAR', 705, false, 90]);
  assert.deepEqual(panelOf(s, 'piece'), ['SGE', 123, true, 100]);
});

test("each panel is repaired on its own: an unknown job, a level over the job's cap, a cap over the level's", () => {
  const s = restoreOpen({
    tab: 'browse',
    browse: { job: 'BST', cap: 700, sync: true, level: 90 },
    piece: { job: 'XYZ', cap: 'high', sync: 'yes', level: 40 },
  });
  // an unknown job goes back to the default one, Paladin; with IL Sync off the math panel holds level sync's item level (level 40: 40)
  assert.deepEqual(panelOf(s, 'piece'), ['PLD', 40, false, 40]);
  assert.deepEqual(panelOf(s, 'browse'), ['BST', capCeiling(50), true, 50]); // Beastmaster at its own level cap: the level's ceiling
  assert.deepEqual(panelOf(restoreOpen({ piece: { job: 'SGE', cap: 5000, sync: true, level: 50 } }), 'piece'), [
    'SGE',
    capCeiling(50),
    true,
    50,
  ]);
  // a damaged group falls back to the top-level panel
  const damaged = restoreOpen({ job: 'WHM', level: 70, piece: 'x', browse: null });
  assert.deepEqual(panelOf(damaged, 'browse'), ['WHM', null, false, 70]);
  assert.deepEqual(panelOf(damaged, 'piece'), ['WHM', 400, false, 70]); // the math panel: level 70's item level is 400
});

test('no saved state, or none usable, gives every tab the default job and the defaults', () => {
  for (const raw of [null, undefined, 'x', 7, [], {}]) {
    const s = restoreOpen(raw);
    for (const group of [null, 'piece', 'browse']) assert.deepEqual(panelOf(s, group), ['PLD', null, false, 100], String(group));
  }
});

test('a restored state read again gives the same state', () => {
  const s = restoreOpen({ tab: 'browse', browse: { job: 'WAR', cap: 705, sync: true, level: 90 }, piece: { job: 'BLM', level: 70 } });
  assert.deepEqual(restoreOpen(JSON.parse(JSON.stringify(s))), s);
});
