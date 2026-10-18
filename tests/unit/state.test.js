/* Restoring saved state (restoreState, src/ui/state.js): a valid save round-trips, and every damaged or outdated field
   falls back to its default on its own, leaving the rest. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { restoreState, defaultState, resetForJob, defaultSubs, DEFAULT_EXCLUDE } from '../../src/ui/state.js';
import { makeJobContext } from '../../src/core/job-context.js';
import { DEFAULT_JOB } from '../../src/core/constants.js';
import { MAX_REAL } from '../../src/core/tables.js';

const D = defaultState();
const clone = o => JSON.parse(JSON.stringify(o));
/* Defaults for `job`, or with no job chosen (null): placeholder job-dependent defaults from DEFAULT_JOB. */
const fresh = job => {
  const s = defaultState();
  s.job = job;
  resetForJob(s, makeJobContext(job ?? DEFAULT_JOB));
  return s;
};
/* A full, valid healer save that differs from the defaults in every field. */
function validSave() {
  return {
    job: 'WHM',
    cap: 290,
    sync: false,
    level: 70,
    tab: 'math',
    mathTab: 'gcd',
    piece: { ilvl: 300, slot: 'ring', subs: ['crit', 'spec'] },
    browse: {
      q: 'Robe',
      type: 'body',
      expOff: ['ARR', 'SB'],
      exclude: ['tomestone', 'ultimate'],
      min: 110,
      max: 140,
      lvl: 50,
      sort: 'spd',
    },
    opt: {
      target: 'spec',
      tb: '',
      tb2: 'crit',
      melds: false,
      expOff: ['HW'],
      exclude: ['crafted', 'pvp'],
      min: '',
      max: 300,
      lvl: 60,
      food: true,
      foodPair: 'det+crit',
      gcd: 2.4,
      gcdMode: 'min',
      byTier: false,
    },
  };
}

/* Restore a valid save with one field replaced; the result must equal the valid restore with only that field reset. */
function corrupt(path, value) {
  const raw = validSave();
  const keys = path.split('.');
  const last = keys.pop();
  keys.reduce((o, k) => o[k], raw)[last] = value;
  return restoreState(raw);
}
function expectFieldDefault(path, value, expected) {
  const got = corrupt(path, value);
  const want = restoreState(validSave());
  const keys = path.split('.');
  const last = keys.pop();
  keys.reduce((o, k) => o[k], want)[last] = expected;
  assert.deepEqual(got, want, `${path} = ${JSON.stringify(value)}`);
}

test('null, undefined and non-object input give the defaults', () => {
  const def = fresh(null);
  for (const raw of [null, undefined, 0, 42, 'state', true, [], [1, 2]]) {
    assert.deepEqual(restoreState(raw), def, JSON.stringify(raw));
  }
});

test('a valid full saved state round-trips unchanged', () => {
  const raw = validSave();
  assert.deepEqual(restoreState(clone(raw)), raw);
  // and the restored state survives a second save/restore
  assert.deepEqual(restoreState(clone(restoreState(clone(raw)))), raw);
});

test('an empty object gives the defaults, with no job chosen', () => {
  assert.deepEqual(restoreState({}), fresh(null));
});

test('unknown job means no job chosen, other fields kept', () => {
  const s = corrupt('job', 'XYZ');
  assert.equal(s.job, null);
  assert.equal(s.cap, 290);
  assert.equal(corrupt('job', 7).job, null);
});

test('top-level scalars of the wrong type or out of range fall back field by field', () => {
  expectFieldDefault('cap', '123', D.cap);
  expectFieldDefault('cap', null, D.cap);
  expectFieldDefault('cap', Number.NaN, D.cap);
  expectFieldDefault('cap', -5, 1);
  expectFieldDefault('cap', 99999, MAX_REAL);
  expectFieldDefault('cap', 200.6, 201);
  expectFieldDefault('sync', 'yes', D.sync);
  expectFieldDefault('sync', 1, D.sync);
  expectFieldDefault('level', 9999, 100);
  expectFieldDefault('level', 0, 1);
  expectFieldDefault('level', '50', D.level); // strings are not accepted here
});

test('older saves: the removed Sync limits sub-tab opens Piece stats, and its comparison item level is dropped', () => {
  const s = restoreState({ ...validSave(), mathTab: 'sync', syncIlvl: 400 });
  assert.equal(s.mathTab, 'piece');
  assert.equal('syncIlvl' in s, false);
});

test('tab and mathTab', () => {
  assert.equal(D.tab, 'opt'); // the optimizer opens first
  expectFieldDefault('tab', 42, 'opt');
  expectFieldDefault('tab', 'nope', 'opt');
  expectFieldDefault('tab', 'pool', 'browse'); // the old Gear pool tab is now the Gear browser
  expectFieldDefault('mathTab', 'nope', 'piece');
  assert.equal(corrupt('mathTab', 'tiers').mathTab, 'tiers'); // the Tiers sub-tab is kept
  // older saves used the sub-view names as tabs
  const s = corrupt('tab', 'piece');
  assert.equal(s.tab, 'math');
  assert.equal(s.mathTab, 'piece');
});

test('nested objects that are not objects fall back to their defaults', () => {
  const def = fresh('WHM');
  for (const k of ['piece', 'gen', 'browse', 'opt']) {
    for (const bad of [null, 'x', 5, []]) {
      const s = corrupt(k, bad);
      assert.deepEqual(s[k], def[k], `${k} = ${JSON.stringify(bad)}`);
      assert.equal(s.cap, 290);
    }
  }
});

test('piece fields', () => {
  assert.equal(D.piece.ilvl, null); // null: 60 above the cap (DEFAULT_OVER in views/sync-explainer.js)
  expectFieldDefault('piece.ilvl', 'abc', null);
  expectFieldDefault('piece.ilvl', null, null);
  expectFieldDefault('piece.ilvl', 900, MAX_REAL); // an older save's number is kept, held to the real item levels
  expectFieldDefault('piece.slot', 'belt', 'head');
  expectFieldDefault('piece.slot', 'offhand', 'head');
  const ds = defaultSubs();
  assert.deepEqual(ds, ['crit', 'spd']); // Critical Hit, then speed, for every job (the GCD sub-tab needs speed)
  expectFieldDefault('piece.subs', 'crit', ds);
  expectFieldDefault('piece.subs', { 0: 'crit' }, ds);
  expectFieldDefault('piece.subs', ['crit', 'crit'], ['crit', null]); // the repeat drops
  expectFieldDefault('piece.subs', [1, 'det'], [ds[0], 'det']);
  // an older save's third rank (20%, removed) is dropped
  expectFieldDefault('piece.subs', ['crit', 'det', 'dh'], ['crit', 'det']);
});

test('browse fields', () => {
  expectFieldDefault('browse.q', 5, '');
  expectFieldDefault('browse.type', 'belt', 'any');
  expectFieldDefault('browse.sort', 'nope', 'ilvl');
});

test('the gear filters, the same rules in the browser and the optimizer (each its own values)', () => {
  for (const part of ['browse', 'opt']) {
    assert.deepEqual([D[part].expOff, D[part].min, D[part].max, D[part].lvl], [[], '', '', 100]);
    expectFieldDefault(`${part}.min`, '', '');
    expectFieldDefault(`${part}.min`, '120', 120); // number inputs bound with x-model save strings
    expectFieldDefault(`${part}.min`, 'abc', D[part].min);
    expectFieldDefault(`${part}.min`, -10, 0);
    expectFieldDefault(`${part}.max`, 5000, MAX_REAL);
    expectFieldDefault(`${part}.max`, null, '');
    expectFieldDefault(`${part}.lvl`, 500, 100);
    expectFieldDefault(`${part}.lvl`, true, 100);
    expectFieldDefault(`${part}.expOff`, 'SB', []);
    expectFieldDefault(`${part}.expOff`, ['SB', 'XIV', 3, 'ARR'], ['ARR', 'SB']); // unknown values drop; EXPANSIONS order
  }
  // a save from before the optimizer had them: the defaults, not the browser's values
  const older = validSave();
  for (const k of ['expOff', 'min', 'max', 'lvl']) delete older.opt[k];
  const s = restoreState(older);
  assert.deepEqual([s.opt.expOff, s.opt.min, s.opt.max, s.opt.lvl], [[], '', '', 100]);
});

test('opt fields', () => {
  assert.deepEqual([D.opt.target, D.opt.tb, D.opt.tb2], ['main', '', '']); // main stat first, no tiebreaks
  expectFieldDefault('opt.target', 'nope', D.opt.target);
  expectFieldDefault('opt.target', '', D.opt.target);
  expectFieldDefault('opt.tb', 'nope', D.opt.tb);
  expectFieldDefault('opt.tb', null, D.opt.tb);
  expectFieldDefault('opt.tb2', 3, D.opt.tb2);
  // Current Savage, Ultimate and PvP left out by default, in the optimizer and the browser, each its own list
  assert.deepEqual(DEFAULT_EXCLUDE, ['savage', 'ultimate', 'pvp']);
  assert.deepEqual(D.browse.exclude, DEFAULT_EXCLUDE);
  assert.deepEqual(D.opt.exclude, DEFAULT_EXCLUDE);
  assert.notEqual(D.opt.exclude, D.browse.exclude);
  for (const part of ['browse', 'opt']) {
    expectFieldDefault(`${part}.exclude`, 'ultimate', DEFAULT_EXCLUDE); // not a list: the default
    expectFieldDefault(`${part}.exclude`, [], []); // every group ticked back in: kept, not the default
    expectFieldDefault(`${part}.exclude`, ['ultimate', 'nope', 3, 'crafted'], ['crafted', 'ultimate']); // unknown keys drop; SOURCES order
  }
  expectFieldDefault('browse.exclude', null, DEFAULT_EXCLUDE);
  const older = validSave();
  delete older.browse.exclude; // a save from before the field existed
  delete older.opt.exclude;
  assert.deepEqual(restoreState(older).browse.exclude, DEFAULT_EXCLUDE);
  assert.deepEqual(restoreState(older).opt.exclude, DEFAULT_EXCLUDE);
  // saves from the gear pool days had one list, browse.exclude, for both: the optimizer starts from it
  const shared = validSave();
  delete shared.opt.exclude;
  assert.deepEqual(restoreState(shared).opt.exclude, ['tomestone', 'ultimate']);
  assert.equal(D.opt.melds, true); // melds on by default
  expectFieldDefault('opt.melds', 'yes', true);
  expectFieldDefault('opt.melds', null, true);
  // Target GCD: empty (any GCD) and "exactly" by default; a number of seconds, a numeric string (x-model on a number
  // input) taken to 0.01, anything else the default
  assert.deepEqual([D.opt.gcd, D.opt.gcdMode], ['', 'exact']);
  expectFieldDefault('opt.gcd', '', '');
  expectFieldDefault('opt.gcd', '2.456', 2.46);
  expectFieldDefault('opt.gcd', 'fast', D.opt.gcd);
  expectFieldDefault('opt.gcd', 3, D.opt.gcd);
  expectFieldDefault('opt.gcd', 0, D.opt.gcd);
  expectFieldDefault('opt.gcd', null, D.opt.gcd);
  expectFieldDefault('opt.gcdMode', 'faster', D.opt.gcdMode);
  // Rank by tier: on by default (owner's decision 2026-10-16), also for a save from before the switch existed
  assert.equal(D.opt.byTier, true);
  expectFieldDefault('opt.byTier', 'no', true);
  const beforeTiers = validSave();
  delete beforeTiers.opt.byTier;
  assert.equal(restoreState(beforeTiers).opt.byTier, true);
});

test("a save from the gear pool days: the pool and the browser's list switch are dropped, the rest kept", () => {
  const raw = validSave();
  raw.pool = [{ id: 'i1', name: 'Ring A', type: 'ring', ilvl: 130, stats: { main: 20 }, copies: 2, src: 'game' }];
  raw.browse.show = 'pool';
  const s = restoreState(raw);
  assert.equal('pool' in s, false);
  assert.equal('show' in s.browse, false);
  assert.deepEqual(s, restoreState(validSave()));
});

test('a save from another role is repaired as before', () => {
  // tank: no Piety; DH is not a tank's default third substat
  const raw = validSave();
  raw.job = 'WAR';
  const s = restoreState(raw);
  assert.equal(s.job, 'WAR');
  assert.deepEqual(s.piece.subs, ['crit', 'spec']); // WAR has Tenacity as its spec
  // melee: no spec stat at all
  raw.job = 'MNK';
  const m = restoreState(raw);
  const mnk = makeJobContext('MNK');
  assert.deepEqual(m.piece.subs, ['crit', null]);
  assert.equal(m.opt.target, 'main');
  // PLD keeps an off-hand piece slot, two-handed jobs do not
  raw.job = 'PLD';
  raw.piece.slot = 'offhand';
  assert.equal(restoreState(raw).piece.slot, 'offhand');
  raw.job = 'WAR';
  const w = restoreState(raw);
  assert.equal(w.piece.slot, 'head');
  assert.ok(!mnk.substats.includes('spec'));
});

test("a saved level above the job's level cap is clamped to it", () => {
  const s = restoreState({ job: 'BST', level: 90, browse: { lvl: 70 }, opt: { lvl: 70 } });
  assert.equal(s.level, 50);
  assert.equal(s.browse.lvl, 50);
  assert.equal(s.opt.lvl, 50);
  assert.equal(restoreState({ job: 'BST' }).opt.lvl, 50); // the default (100) too
  // a level at or below the cap is kept; Blue Mage caps at 80
  assert.equal(restoreState({ job: 'BST', level: 30 }).level, 30);
  assert.equal(restoreState({ job: 'BLU', level: 100 }).level, 80);
  assert.equal(restoreState({ job: 'BLU' }).level, 80); // the default (100) too
  // with no job chosen the game's cap applies
  assert.equal(restoreState({ level: 100 }).level, 100);
});

test('Food fields: off by default; a meal the job cannot use, a wrong type or an unknown meal falls back', () => {
  assert.deepEqual([restoreState(null).opt.food, restoreState(null).opt.foodPair], [false, '']);
  const s = restoreState({ job: 'SGE', opt: { food: true, foodPair: 'spd+spec' } });
  assert.deepEqual([s.opt.food, s.opt.foodPair], [true, 'spd+spec']);
  // a Piety meal saved for a job without Piety, a bad type, an unknown key
  assert.equal(restoreState({ job: 'DRG', opt: { food: true, foodPair: 'spd+spec' } }).opt.foodPair, '');
  assert.equal(restoreState({ job: 'SGE', opt: { food: 'yes', foodPair: 7 } }).opt.food, false);
  assert.equal(restoreState({ job: 'SGE', opt: { foodPair: 'nope' } }).opt.foodPair, '');
});
