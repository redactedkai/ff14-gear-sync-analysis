/* The settings an address names (src/ui/router/query.ts) over real jobs: what each name reads as, what falls back, and what a
   view's settings write back. Sage (a healer: Mind, Spell Speed, Piety), Paladin (a tank: Tenacity) and Blue Mage (level cap
   80) are the jobs. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeJobContext } from '../../../../src/core/job-context.ts';
import {
  PANEL_NAMES,
  QUERY_NAMES,
  queryViewOf,
  readJobQuery,
  readPanelQuery,
  readQuery,
  writePanelQuery,
  writeQuery,
} from '../../../../src/ui/router/query.ts';
import { capCeiling } from '../../../../src/core/sync-target.ts';
import { MAX_SPEED } from '../../../../src/core/tables.ts';
import { DEFAULT_EXCLUDE } from '../../../../src/ui/job-sync-panel.ts';
import { defaultBrowse, defaultSubs } from '../../../../src/ui/state.ts';
import { GCD_LEVELS } from '../../../../src/ui/views/gcd.ts';

const SGE = makeJobContext('SGE');
const PLD = makeJobContext('PLD');
const BLU = makeJobContext('BLU');

test('queryViewOf: the Gear browser and the math views have a query, the Sheets screens have none', () => {
  assert.equal(queryViewOf({ tab: 'browse' }), 'gear');
  assert.equal(queryViewOf({ tab: 'math', mathTab: 'piece' }), 'piece');
  assert.equal(queryViewOf({ tab: 'math', mathTab: 'gcd' }), 'gcd');
  assert.equal(queryViewOf({ tab: 'math', mathTab: 'tiers' }), 'tiers');
  assert.equal(queryViewOf({ tab: 'sheets', screen: 'sheets' }), null);
  assert.equal(readQuery(null, { sort: 'det' }, SGE, 100), null);
  assert.deepEqual(writeQuery(null, {}, SGE), {});
});

test('the names of each view, in the order they are written: the panel names, then the view names', () => {
  assert.deepEqual(PANEL_NAMES, ['job', 'level', 'il']);
  assert.deepEqual(QUERY_NAMES.gear, [...PANEL_NAMES, 'q', 'slot', 'min', 'max', 'equip', 'noexp', 'skip', 'market', 'sort', 'dir']);
  assert.deepEqual(QUERY_NAMES.piece, [...PANEL_NAMES, 'slot', 'item', 'subs', 'meld']);
  assert.deepEqual(QUERY_NAMES.gcd, ['gcdlevel', 'haste', 'speed'], 'GCD Scaling has no job');
  assert.deepEqual(QUERY_NAMES.tiers, ['job', 'tierlevel'], 'Substat tiers has its own job and no other panel');
});

test('Gear browser: a query with no names is the defaults, whatever the job, and writes nothing', () => {
  for (const job of [SGE, PLD, BLU]) {
    const read = readQuery('gear', {}, job, job.maxLevel);
    assert.deepEqual(read, defaultBrowse(job), job.jobId);
    assert.deepEqual(writeQuery('gear', read, job), {}, job.jobId);
  }
  assert.equal(readQuery('gear', {}, BLU, 80).lvl, 80, 'the Equip level default is the job level cap');
});

test('Gear browser: every name sets its field', () => {
  const read = readQuery(
    'gear',
    {
      q: 'Moon Staff',
      slot: 'ring',
      min: '700',
      max: '790',
      equip: '90',
      noexp: 'ARR,HW',
      skip: 'misc,pvp',
      market: '0',
      sort: 'mind',
      dir: 'asc',
    },
    SGE,
    100,
  );
  assert.deepEqual(read, {
    q: 'Moon Staff',
    type: 'ring',
    min: 700,
    max: 790,
    lvl: 90,
    expOff: ['ARR', 'HW'],
    exclude: ['misc', 'pvp'],
    market: false,
    sort: 'mind',
    dir: 'asc',
  });
});

test('Gear browser: a name the query leaves out is its default, not what the reader had', () => {
  const read = readQuery('gear', { sort: 'det' }, SGE, 100);
  assert.deepEqual(read, { ...defaultBrowse(SGE), sort: 'det' });
  assert.deepEqual(read.exclude, DEFAULT_EXCLUDE);
});

test('Gear browser: a value that is no good falls back; a name the page does not have is ignored', () => {
  const read = readQuery(
    'gear',
    {
      slot: 'offhand',
      min: 'lots',
      max: '-5',
      equip: '999',
      noexp: 'ARR,Gen9,ARR',
      skip: 'misc,nothing,pvp',
      market: 'maybe',
      sort: 'ten',
      dir: 'up',
      colour: 'red',
    },
    SGE,
    100,
  );
  assert.equal(read.type, 'any', 'Sage wears no off-hand');
  assert.equal(read.min, '', 'text is no item level: no filter');
  assert.equal(read.max, 0, 'held to the lowest item level');
  assert.equal(read.lvl, 100, 'held to the job level cap');
  assert.deepEqual(read.expOff, ['ARR'], 'an unknown expansion is dropped, a repeat is one');
  assert.deepEqual(read.exclude, DEFAULT_EXCLUDE, 'a list with a category that is not one is no good: the default');
  assert.equal(read.market, true);
  assert.equal(read.sort, 'ilvl', 'Sage has no Tenacity');
  assert.equal(read.dir, 'desc');
  assert.equal('colour' in read, false);
  // a stat of the job is a sort; Paladin has Tenacity
  assert.equal(readQuery('gear', { sort: 'ten' }, PLD, 100).sort, 'ten');
});

test('Gear browser: a list written empty is an empty list; the Equip level written empty is no filter', () => {
  assert.deepEqual(readQuery('gear', { skip: '' }, SGE, 100).exclude, []);
  assert.equal(readQuery('gear', { equip: '' }, SGE, 100).lvl, '');
  assert.equal(readQuery('gear', { market: 'false' }, SGE, 100).market, false);
  assert.equal(readQuery('gear', { market: '1' }, SGE, 100).market, true);
});

test('Gear browser: the search text is cut at the longest search', () => {
  assert.equal(readQuery('gear', { q: 'x'.repeat(250) }, SGE, 100).q.length, 100);
});

test('Gear browser: only what differs from the defaults is written, in the order of the names', () => {
  const browse = {
    ...defaultBrowse(PLD),
    q: 'sword',
    type: 'weapon',
    min: 600,
    lvl: 80,
    expOff: ['HW', 'ARR'],
    exclude: [],
    market: false,
    sort: 'ten',
    dir: 'asc',
  };
  const query = writeQuery('gear', browse, PLD);
  assert.deepEqual(query, {
    q: 'sword',
    slot: 'weapon',
    min: '600',
    equip: '80',
    noexp: 'ARR,HW',
    skip: '',
    market: '0',
    sort: 'ten',
    dir: 'asc',
  });
  assert.deepEqual(Object.keys(query), ['q', 'slot', 'min', 'equip', 'noexp', 'skip', 'market', 'sort', 'dir']);
});

test('Gear browser: the categories are the defaults whatever order they are held in', () => {
  const reversed = [...DEFAULT_EXCLUDE].reverse();
  assert.deepEqual(writeQuery('gear', { ...defaultBrowse(SGE), exclude: reversed }, SGE), {});
  const others = DEFAULT_EXCLUDE.slice(1);
  assert.equal(writeQuery('gear', { ...defaultBrowse(SGE), exclude: others }, SGE).skip, others.join(','));
});

test('Gear browser: a query read and written again is the same query', () => {
  const queries = [
    { q: 'Moon Staff', slot: 'ring', sort: 'mind' },
    { min: '700', max: '790', equip: '90', noexp: 'ARR,SB', dir: 'asc' },
    { skip: '', market: '0' },
    { equip: '' },
  ];
  for (const query of queries) {
    const settings = readQuery('gear', query, SGE, 100);
    assert.deepEqual(writeQuery('gear', settings, SGE), query);
  }
});

test('Stat Allocation: defaults write nothing; every name sets its field', () => {
  const defaults = readQuery('piece', {}, SGE, 100);
  assert.deepEqual(defaults, { ilvl: null, slot: 'head', subs: defaultSubs(SGE), slots: null });
  assert.deepEqual(writeQuery('piece', defaults, SGE), {});
  const read = readQuery('piece', { slot: 'ear', item: '710', subs: 'det,dh', meld: '1' }, SGE, 100);
  assert.deepEqual(read, { ilvl: 710, slot: 'ear', subs: ['det', 'dh'], slots: 1 });
  assert.deepEqual(writeQuery('piece', read, SGE), { slot: 'ear', item: '710', subs: 'det,dh', meld: '1' });
});

test('Stat Allocation: one substat is a pair with no second; a bad one falls back', () => {
  assert.deepEqual(readQuery('piece', { subs: 'det' }, SGE, 100).subs, ['det', null]);
  assert.equal(writeQuery('piece', { ...readQuery('piece', {}, SGE, 100), subs: ['det', null] }, SGE).subs, 'det');
  assert.deepEqual(readQuery('piece', { subs: 'sks,crit' }, SGE, 100).subs, ['crit', null], 'Sage has no Skill Speed');
  assert.deepEqual(readQuery('piece', { subs: 'det,det' }, SGE, 100).subs, ['det', null]);
  assert.deepEqual(readQuery('piece', { subs: 'piety,ten' }, SGE, 100).subs, ['piety', null], 'a healer has Piety, not Tenacity');
});

test('Stat Allocation: the item level, the slot and the materia slots are held to what exists', () => {
  assert.equal(readQuery('piece', { item: '99999' }, SGE, 100).ilvl, 795, 'the highest real item level');
  assert.equal(readQuery('piece', { item: 'x' }, SGE, 100).ilvl, null);
  assert.equal(readQuery('piece', { item: '' }, SGE, 100).ilvl, null);
  assert.equal(readQuery('piece', { slot: 'offhand' }, SGE, 100).slot, 'head', 'Sage wears no off-hand');
  assert.equal(readQuery('piece', { slot: 'ring', meld: '2' }, SGE, 100).slots, 2);
  assert.equal(readQuery('piece', { slot: 'ring', meld: '3' }, SGE, 100).slots, null, 'no ring has 3 slots');
  assert.equal(readQuery('piece', { slot: 'head', meld: '5' }, SGE, 100).slots, 5, 'overmelded armor');
});

test('GCD Scaling: a level, a haste and a speed; the level that is the synced level is no level typed', () => {
  assert.deepEqual(readQuery('gcd', { gcdlevel: '90', haste: 'SAM', speed: '300' }, SGE, 100), { level: 90, haste: 'SAM', speed: 300 });
  assert.deepEqual(readQuery('gcd', {}, SGE, 100), { level: null, haste: '', speed: null });
  assert.equal(readQuery('gcd', { gcdlevel: '100' }, SGE, 100).level, null);
  assert.equal(readQuery('gcd', { gcdlevel: '500' }, SGE, 90).level, GCD_LEVELS, 'held to the levels the tab covers');
  assert.deepEqual(writeQuery('gcd', { level: 90, haste: 'SAM', speed: 300 }, SGE), { gcdlevel: '90', haste: 'SAM', speed: '300' });
  assert.deepEqual(writeQuery('gcd', { level: null, haste: '', speed: null }, SGE), {});
});

test('GCD Scaling: a bad value falls back', () => {
  assert.deepEqual(readQuery('gcd', { gcdlevel: 'high', haste: 'PLD', speed: 'fast' }, SGE, 100), { level: null, haste: '', speed: null });
  assert.equal(readQuery('gcd', { speed: '-40' }, SGE, 100).speed, 0);
  assert.equal(readQuery('gcd', { gcdlevel: '0' }, SGE, 90).level, 1, 'held to the lowest level');
  assert.equal(readQuery('gcd', { haste: '__proto__' }, SGE, 100).haste, '');
});

test('Substat tiers: a level held to the job level cap; the job level cap is no level typed', () => {
  assert.deepEqual(readQuery('tiers', { tierlevel: '90' }, SGE, 100), { job: 'SGE', level: 90 });
  assert.deepEqual(readQuery('tiers', { tierlevel: '100' }, SGE, 100), { job: 'SGE', level: null });
  assert.deepEqual(readQuery('tiers', { tierlevel: '100' }, BLU, 70), { job: 'BLU', level: 80 }, 'Blue Mage stops at 80');
  assert.deepEqual(readQuery('tiers', { tierlevel: '100' }, BLU, 80), { job: 'BLU', level: null }, 'and 80 is its level cap');
  assert.deepEqual(readQuery('tiers', { tierlevel: 'x' }, SGE, 100), { job: 'SGE', level: null });
  assert.deepEqual(readQuery('tiers', {}, SGE, 100), { job: 'SGE', level: null });
  assert.deepEqual(writeQuery('tiers', { job: 'SGE', level: 90 }, SGE), { job: 'SGE', tierlevel: '90' });
  assert.deepEqual(writeQuery('tiers', { job: 'PLD', level: null }, PLD), {}, 'the default job and no typed level write nothing');
  assert.deepEqual(writeQuery('tiers', { job: 'WAR', level: null }, makeJobContext('WAR')), { job: 'WAR' });
});

test('Substat tiers: the job a link names is read like a saved one', () => {
  assert.equal(readJobQuery({ job: 'WAR' }).jobId, 'WAR');
  assert.equal(readJobQuery({ job: 'XYZ' }).jobId, 'PLD', 'an unknown job is the default job');
  assert.equal(readJobQuery({}).jobId, 'PLD');
});

test('the panel: a link with no names is the default job at level 100 with item level sync off', () => {
  const panel = readPanelQuery({});
  assert.deepEqual(
    { job: panel.job, level: panel.level, sync: panel.sync, cap: panel.cap },
    { job: 'PLD', level: 100, sync: false, cap: null },
  );
  assert.equal(panel.jobCtx.jobId, 'PLD');
  assert.deepEqual(writePanelQuery(panel), {});
});

test('the panel: Sage at level 100 and item level 123 reads and writes back', () => {
  const panel = readPanelQuery({ job: 'SGE', level: '100', il: '123' });
  assert.deepEqual(
    { job: panel.job, level: panel.level, sync: panel.sync, cap: panel.cap },
    { job: 'SGE', level: 100, sync: true, cap: 123 },
  );
  assert.deepEqual(writePanelQuery(panel), { job: 'SGE', il: '123' });
  assert.deepEqual(writePanelQuery(readPanelQuery({ job: 'SGE', level: '90', il: '123' })), { job: 'SGE', level: '90', il: '123' });
});

test('the panel: a bad job, level or item level falls back; the level is held to the job level cap', () => {
  const unknown = readPanelQuery({ job: 'XYZ', level: 'high', il: 'lots' });
  assert.deepEqual(
    { job: unknown.job, level: unknown.level, sync: unknown.sync, cap: unknown.cap },
    { job: 'PLD', level: 100, sync: false, cap: null },
  );
  const blue = readPanelQuery({ job: 'BLU', level: '200' });
  assert.equal(blue.level, 80, 'Blue Mage stops at 80');
  assert.deepEqual(writePanelQuery(blue), { job: 'BLU' }, 'and 80 is its default level');
  assert.equal(readPanelQuery({ il: '99999' }).cap, 795, 'the highest real item level');
});

test('the panel: a cap above what the level allows is lowered, as for a saved one', () => {
  const panel = readPanelQuery({ job: 'SGE', level: '50', il: '700' });
  assert.equal(panel.cap, capCeiling(50));
  assert.equal(panel.sync, true);
});

test('the panel: a link with no il turns sync off and keeps the cap the reader held', () => {
  const held = readPanelQuery({ job: 'SGE' }, 123);
  assert.deepEqual({ sync: held.sync, cap: held.cap }, { sync: false, cap: 123 });
  assert.equal(readPanelQuery({ job: 'SGE', il: '135' }, 123).cap, 135, 'an il is the cap');
  assert.equal(readPanelQuery({}, null).cap, null);
});

test('the panel: the item level cap is written only while item level sync is on', () => {
  const sage = readPanelQuery({ job: 'SGE', il: '123' });
  assert.equal('il' in writePanelQuery({ ...sage, sync: false }), false, 'a cap held with sync off is no setting');
  assert.equal(writePanelQuery({ ...sage, sync: true }).il, '123');
  assert.equal(writePanelQuery({ ...sage, sync: true, cap: null }).il, '', 'sync on with no cap yet is an empty il');
});

test('the panel: an empty il is sync on with no cap; text that is no item level is sync off', () => {
  const empty = readPanelQuery({ job: 'SGE', il: '' });
  assert.deepEqual({ sync: empty.sync, cap: empty.cap }, { sync: true, cap: null });
  assert.deepEqual(writePanelQuery(empty), { job: 'SGE', il: '' });
  const text = readPanelQuery({ job: 'SGE', il: 'lots' });
  assert.deepEqual({ sync: text.sync, cap: text.cap }, { sync: false, cap: null });
});

test('GCD Scaling: a speed is held to the most any job has', () => {
  const most = readQuery('gcd', { speed: '1e21' }, SGE, 100).speed;
  assert.equal(most, Math.max(...MAX_SPEED));
  assert.equal(writeQuery('gcd', { level: null, haste: '', speed: most }, SGE).speed, String(most));
  assert.equal(readQuery('gcd', { speed: '99999999999' }, SGE, 100).speed, most);
});

test('Gear browser: a search text cut inside an emoji by the longest search is cut before it', () => {
  const text = 'x'.repeat(99) + '\u{1F600}';
  const read = readQuery('gear', { q: text }, SGE, 100);
  assert.equal(read.q, 'x'.repeat(99));
  const written = writeQuery('gear', { ...read, q: text.slice(0, 100) }, SGE);
  assert.equal(typeof written.q, 'string');
});
