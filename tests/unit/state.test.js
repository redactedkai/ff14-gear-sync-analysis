import { test } from 'node:test';
import assert from 'node:assert/strict';
import { restoreState, defaultState, resetForJob, defaultSubs, DEFAULT_EXCLUDE } from '../../src/ui/state.js';
import { makeJobContext } from '../../src/core/job-context.js';
import { ALL_STATS, DEFAULT_JOB } from '../../src/core/constants.js';
import { MAX_REAL } from '../../src/core/tables.js';
import { newId, browseItems, poolItemFromRow } from '../../src/core/items.js';

const D = defaultState();
const clone = o => JSON.parse(JSON.stringify(o));
/* Defaults for `job`, or with no job chosen (null): placeholder job-dependent defaults from DEFAULT_JOB. */
const fresh = job => {
  const s = defaultState();
  s.job = job;
  resetForJob(s, makeJobContext(job ?? DEFAULT_JOB));
  return s;
};
const stats = o => Object.assign(Object.fromEntries(ALL_STATS.map(k => [k, 0])), o);
const item = o => ({
  id: 'i1',
  name: 'Ring A',
  type: 'ring',
  ilvl: 130,
  stats: stats({ main: 20, vit: 21, spd: 18 }),
  copies: 2,
  src: 'game',
  hq: false,
  ...o,
});

/* A full, valid healer save that differs from the defaults in every field. */
function validSave() {
  return {
    job: 'WHM',
    cap: 290,
    sync: false,
    level: 70,
    tab: 'math',
    mathTab: 'sync',
    syncIlvl: 400,
    piece: { ilvl: 300, slot: 'ring', subs: ['crit', 'spec'] },
    browse: {
      show: 'pool',
      q: 'Robe',
      type: 'body',
      expOff: ['ARR', 'SB'],
      exclude: ['tomestone', 'ultimate'],
      min: 110,
      max: 140,
      lvl: 50,
      sort: 'spd',
    },
    opt: { target: 'spec', tb: '', tb2: 'crit', melds: false },
    pool: [
      item(),
      item({ id: 'i2', name: 'Some head', type: 'head', ilvl: 135, stats: stats({ main: 30, spd: 29 }), copies: 1 }),
      item({ id: 'i3', name: 'Some body', type: 'body', ilvl: 125, stats: stats({ main: 47.5 }), copies: 2 }),
    ],
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
  expectFieldDefault('syncIlvl', 5000, MAX_REAL);
  expectFieldDefault('syncIlvl', {}, 475);
});

test('tab and mathTab', () => {
  expectFieldDefault('tab', 42, 'pool');
  expectFieldDefault('tab', 'nope', 'pool');
  expectFieldDefault('mathTab', 'nope', 'piece');
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
  assert.equal(D.piece.ilvl, MAX_REAL); // the highest real item level
  expectFieldDefault('piece.ilvl', 'abc', MAX_REAL);
  expectFieldDefault('piece.ilvl', 900, MAX_REAL);
  expectFieldDefault('piece.slot', 'belt', 'head');
  expectFieldDefault('piece.slot', 'offhand', 'head');
  const ds = defaultSubs(makeJobContext('WHM'));
  assert.deepEqual(ds, ['spec', null]); // the job's own substat first (Piety), rank 2 empty
  assert.deepEqual(defaultSubs(makeJobContext('MNK')), ['spd', null]); // no special substat: speed
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
  expectFieldDefault('browse.min', '', '');
  expectFieldDefault('browse.min', '120', 120); // number inputs bound with x-model save strings
  expectFieldDefault('browse.min', 'abc', D.browse.min);
  expectFieldDefault('browse.min', -10, 0);
  expectFieldDefault('browse.max', 5000, MAX_REAL);
  expectFieldDefault('browse.max', null, '');
  expectFieldDefault('browse.lvl', 500, 100);
  expectFieldDefault('browse.lvl', true, 100);
  expectFieldDefault('browse.sort', 'nope', 'ilvl');
  expectFieldDefault('browse.expOff', 'SB', []);
  expectFieldDefault('browse.expOff', ['SB', 'XIV', 3, 'ARR'], ['ARR', 'SB']); // unknown values drop; EXPANSIONS order
});

test('opt fields', () => {
  assert.deepEqual([D.opt.target, D.opt.tb, D.opt.tb2], ['main', '', '']); // main stat first, no tiebreaks
  expectFieldDefault('opt.target', 'nope', D.opt.target);
  expectFieldDefault('opt.target', '', D.opt.target);
  expectFieldDefault('opt.tb', 'nope', D.opt.tb);
  expectFieldDefault('opt.tb', null, D.opt.tb);
  expectFieldDefault('opt.tb2', 3, D.opt.tb2);
  assert.deepEqual(D.browse.exclude, ['savage', 'ultimate', 'pvp']); // Current Savage, Ultimate and PvP excluded
  assert.deepEqual(DEFAULT_EXCLUDE, D.browse.exclude);
  expectFieldDefault('browse.exclude', 'ultimate', D.browse.exclude); // not a list: the default
  expectFieldDefault('browse.exclude', null, D.browse.exclude);
  expectFieldDefault('browse.exclude', [], []); // every group ticked back in: kept, not the default
  const older = validSave();
  delete older.browse.exclude; // a save from before the field existed
  assert.deepEqual(restoreState(older).browse.exclude, D.browse.exclude);
  expectFieldDefault('browse.exclude', ['ultimate', 'nope', 3, 'crafted'], ['crafted', 'ultimate']); // unknown keys drop; SOURCES order
  assert.equal(D.opt.melds, true); // melds on by default
  expectFieldDefault('opt.melds', 'yes', true);
  expectFieldDefault('opt.melds', null, true);
});

test('pool: unusable items are dropped, usable ones repaired', () => {
  const good = item();
  const pool = [
    good,
    null,
    'item',
    item({ id: 5 }),
    item({ id: '' }),
    item({ id: 'i9', type: 'belt' }),
    item({ id: 'i10', ilvl: -3 }),
    item({ id: 'i11', ilvl: 5000 }),
    item({ id: 'i12', ilvl: 130.5 }),
    item({ id: 'i13', ilvl: '130' }),
    item({ id: 'i14', stats: null }),
    item({ id: 'i15', stats: stats({ spd: 'x' }) }),
    item({ id: 'i16', stats: stats({ spd: -1 }) }),
    item({ id: 'i17', stats: stats({ spd: Number.NaN }) }),
    item({ id: 'i18', src: 'preset' }),
    // hypothetical and hand-entered pieces from the removed Advanced section
    item({ id: 'i19', src: 'generated' }),
    item({ id: 'i21', src: 'custom' }),
    item({ id: 'i22', src: 'weird' }),
    item({ id: 'i1', name: 'duplicate id' }),
    // repaired, not dropped
    item({ id: 'i20', stats: { main: 10, extra: 99 }, copies: 7, name: undefined, foo: 1 }),
  ];
  const s = restoreState({ job: 'SGE', pool });
  assert.deepEqual(s.pool, [
    good,
    { id: 'i20', name: 'Ring custom', type: 'ring', ilvl: 130, stats: stats({ main: 10 }), copies: 1, src: 'game', hq: false },
  ]);
  assert.deepEqual(restoreState({ job: 'SGE', pool: 'x' }).pool, []);
  assert.deepEqual(restoreState({ job: 'SGE', pool: { 0: good } }).pool, []);
});

test('restored item ids are reserved', () => {
  restoreState({ job: 'SGE', pool: [item({ id: 'i90000' })] });
  assert.ok(+newId().slice(1) > 90000);
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

test("a saved level above the job's level cap is clamped to it, and pool pieces above the cap are dropped", () => {
  const bst = makeJobContext('BST');
  const rows = browseItems(makeJobContext('MNK'), { ilvlMin: 130, ilvlMax: 135 }).filter(r => r.mask & (1 << bst.jobIndex));
  const low = rows.find(r => r.lvl <= 50);
  const high = rows.find(r => r.lvl > 50); // Monk gear Beastmaster's mask allows, above its level cap
  assert.ok(low && high);
  const pool = [low, high].map(r => ({ ...poolItemFromRow(bst, r), id: newId() }));
  const s = restoreState({ job: 'BST', level: 90, browse: { lvl: 70 }, pool });
  assert.equal(s.level, 50);
  assert.equal(s.browse.lvl, 50);
  assert.deepEqual(
    s.pool.map(i => i.name),
    [low.name],
  );
  // a level at or below the cap is kept; Blue Mage caps at 80
  assert.equal(restoreState({ job: 'BST', level: 30 }).level, 30);
  assert.equal(restoreState({ job: 'BLU', level: 100 }).level, 80);
  assert.equal(restoreState({ job: 'BLU' }).level, 80); // the default (100) too
  // with no job chosen the game's cap applies
  assert.equal(restoreState({ level: 100 }).level, 100);
});
