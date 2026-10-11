import { test } from 'node:test';
import assert from 'node:assert/strict';
import { restoreState, defaultState, resetForJob, defaultSubs } from '../../src/ui/state.js';
import { makeJobContext } from '../../src/core/job-context.js';
import { ALL_STATS } from '../../src/core/constants.js';
import { MAX_REAL } from '../../src/core/tables.js';
import { newId } from '../../src/core/items.js';

const clone = o => JSON.parse(JSON.stringify(o));
const fresh = job => {
  const s = defaultState();
  s.job = job;
  resetForJob(s, makeJobContext(job));
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
    piece: { ilvl: 300, slot: 'ring', subs: ['crit', 'det', 'spec'] },
    browse: { q: 'Robe', type: 'body', min: 110, max: 140, lvl: 50, sort: 'spd' },
    opt: { target: 'spec', tb: '', tb2: 'crit', avg: false, avgMin: 130 },
    poolFilter: 'ring',
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
  const def = fresh('SGE');
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

test('an empty object gives the defaults for the default job', () => {
  assert.deepEqual(restoreState({}), fresh('SGE'));
});

test('unknown job falls back to the default job, other fields kept', () => {
  const s = corrupt('job', 'XYZ');
  assert.equal(s.job, 'SGE');
  assert.equal(s.cap, 290);
  assert.equal(corrupt('job', 7).job, 'SGE');
});

test('top-level scalars of the wrong type or out of range fall back field by field', () => {
  expectFieldDefault('cap', '123', 123);
  expectFieldDefault('cap', null, 123);
  expectFieldDefault('cap', Number.NaN, 123);
  expectFieldDefault('cap', -5, 1);
  expectFieldDefault('cap', 99999, MAX_REAL);
  expectFieldDefault('cap', 200.6, 201);
  expectFieldDefault('sync', 'yes', true);
  expectFieldDefault('sync', 1, true);
  expectFieldDefault('level', 9999, 100);
  expectFieldDefault('level', 0, 1);
  expectFieldDefault('level', '50', 50);
  expectFieldDefault('syncIlvl', 5000, MAX_REAL);
  expectFieldDefault('syncIlvl', {}, 475);
  expectFieldDefault('poolFilter', 'offhand', 'all'); // not an active slot for a two-handed job
  expectFieldDefault('poolFilter', 3, 'all');
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
  expectFieldDefault('piece.ilvl', 'abc', 475);
  expectFieldDefault('piece.ilvl', 900, MAX_REAL);
  expectFieldDefault('piece.slot', 'belt', 'head');
  expectFieldDefault('piece.slot', 'offhand', 'head');
  const ds = defaultSubs(makeJobContext('WHM'));
  expectFieldDefault('piece.subs', 'crit', ds);
  expectFieldDefault('piece.subs', { 0: 'crit' }, ds);
  expectFieldDefault('piece.subs', ['crit', 'crit', 'det'], ['crit', ds[1], 'det']);
  expectFieldDefault('piece.subs', ['crit', 'det', 'crit'], ['crit', 'det', null]);
  expectFieldDefault('piece.subs', [1, 'det'], [ds[0], 'det', null]);
});

test('browse fields', () => {
  expectFieldDefault('browse.q', 5, '');
  expectFieldDefault('browse.type', 'belt', 'any');
  expectFieldDefault('browse.min', '', '');
  expectFieldDefault('browse.min', '120', 120); // number inputs bound with x-model save strings
  expectFieldDefault('browse.min', 'abc', 100);
  expectFieldDefault('browse.min', -10, 0);
  expectFieldDefault('browse.max', 5000, MAX_REAL);
  expectFieldDefault('browse.max', null, '');
  expectFieldDefault('browse.lvl', 500, 100);
  expectFieldDefault('browse.lvl', true, 100);
  expectFieldDefault('browse.sort', 'nope', 'ilvl');
});

test('opt fields', () => {
  expectFieldDefault('opt.target', 'nope', 'spd');
  expectFieldDefault('opt.target', '', 'spd');
  expectFieldDefault('opt.tb', 'nope', 'main');
  expectFieldDefault('opt.tb', null, 'main');
  expectFieldDefault('opt.tb2', 3, 'vit');
  expectFieldDefault('opt.avg', 'true', true);
  expectFieldDefault('opt.avgMin', 'abc', 123);
  expectFieldDefault('opt.avgMin', 0, 1);
  expectFieldDefault('opt.avgMin', 99999, MAX_REAL);
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
    { id: 'i20', name: 'Ring custom', type: 'ring', ilvl: 130, stats: stats({ main: 10 }), copies: 1, src: 'game' },
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
  assert.deepEqual(s.piece.subs, ['crit', 'det', 'spec']); // WAR has Tenacity as its spec
  // melee: no spec stat at all
  raw.job = 'MNK';
  const m = restoreState(raw);
  const mnk = makeJobContext('MNK');
  assert.deepEqual(m.piece.subs, ['crit', 'det', null]);
  assert.equal(m.opt.target, 'spd');
  // PLD keeps an off-hand piece slot, two-handed jobs do not
  raw.job = 'PLD';
  raw.piece.slot = 'offhand';
  raw.poolFilter = 'offhand';
  assert.equal(restoreState(raw).piece.slot, 'offhand');
  assert.equal(restoreState(raw).poolFilter, 'offhand');
  raw.job = 'WAR';
  const w = restoreState(raw);
  assert.equal(w.piece.slot, 'head');
  assert.equal(w.poolFilter, 'all');
  assert.ok(!mnk.substats.includes('spec'));
});
