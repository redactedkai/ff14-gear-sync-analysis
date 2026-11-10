/* Restoring saved state (restoreState, src/ui/state.js): a valid save round-trips, and every damaged or outdated field
   falls back to its default on its own, leaving the rest. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  restoreState,
  defaultState,
  defaultBrowse,
  resetForJob,
  defaultSubs,
  SEARCH_MAX_LENGTH,
  limitCapToLevel,
  capLoweredText,
  loadSaved,
  save,
  STORE_KEY,
} from '../../src/ui/state.js';
import { DEFAULT_EXCLUDE } from '../../src/ui/settings.js';
import { browseFiltered } from '../../src/ui/views/gear.js';
import { makeJobContext } from '../../src/core/job-context.js';
import { DEFAULT_JOB, JOBS } from '../../src/core/constants.js';
import { MAX_REAL } from '../../src/core/tables.js';
import { capCeiling } from '../../src/core/sync-target.js';

const D = defaultState();
const clone = o => JSON.parse(JSON.stringify(o));
/* Defaults for `job`, or with no job chosen (null): placeholder job-dependent defaults from DEFAULT_JOB. */
const fresh = job => {
  const s = defaultState();
  for (const target of [s, s.piece, s.browse]) target.job = job;
  resetForJob(s, makeJobContext(job ?? DEFAULT_JOB));
  return s;
};
/* The Job and sync panel's fields: the open tab's copy at the top and each tab's own in its group. */
const PANEL_KEYS = ['job', 'cap', 'sync', 'level'];
const PANEL_FIELDS = [null, 'piece', 'browse'];
const withoutPanel = o => Object.fromEntries(Object.entries(o).filter(([k]) => !PANEL_KEYS.includes(k)));
/* The state as the page saves it (store.persisted): without the open tab's top-level copy of its panel. */
const savedForm = s => withoutPanel(s);
/* A full, valid healer save that differs from the defaults in every field. */
function validSave() {
  return {
    job: 'WHM',
    cap: 290,
    sync: false,
    level: 70,
    tab: 'math',
    mathTab: 'gcd',
    piece: { ilvl: 300, slot: 'ring', subs: ['crit', 'piety'] },
    browse: {
      q: 'Robe',
      type: 'body',
      expOff: ['ARR', 'SB'],
      exclude: ['tomes_current', 'ultimate'],
      market: false,
      min: 110,
      max: 140,
      lvl: 50,
      sort: 'sps',
      dir: 'asc',
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
  if (keys.length === 0 && PANEL_KEYS.includes(last)) {
    // the save is the older one panel: a panel field is every tab's
    for (const group of PANEL_FIELDS) (group ? want[group] : want)[last] = expected;
  }
  keys.reduce((o, k) => o[k], want)[last] = expected;
  assert.deepEqual(got, want, `${path} = ${JSON.stringify(value)}`);
}

test('null, undefined and non-object input give the defaults', () => {
  const def = fresh(null);
  for (const raw of [null, undefined, 0, 42, 'state', true, [], [1, 2]]) {
    assert.deepEqual(restoreState(raw), def, JSON.stringify(raw));
  }
});

test('a valid full saved state keeps every field, and the restored state survives a second save and restore', () => {
  const raw = validSave();
  const s = restoreState(clone(raw));
  // an older save has one panel, which every tab takes; the open tab (math) shows its copy
  const { job, cap, sync, level, ...rest } = raw;
  const panel = { job, cap, sync, level };
  assert.deepEqual(withoutPanel(s), { ...rest, piece: { ...rest.piece, ...panel }, browse: { ...rest.browse, ...panel } });
  assert.deepEqual(
    PANEL_KEYS.map(k => s[k]),
    PANEL_KEYS.map(k => panel[k]),
  );
  assert.deepEqual(restoreState(clone(savedForm(s))), s);
  // an older save's Gear optimizer settings are dropped, the rest kept
  assert.deepEqual(restoreState({ ...clone(raw), opt: { target: 'crit' }, optPanel: { job: 'SGE' } }), s);
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

test('tab and math sub-tab: an unknown one opens the default; old tab names open their new place', () => {
  assert.equal(D.tab, 'sheets'); // the Sheets tab opens first
  expectFieldDefault('tab', 42, 'sheets');
  expectFieldDefault('tab', 'nope', 'sheets');
  expectFieldDefault('tab', 'opt', 'sheets'); // the old Gear optimizer tab: its place is the Sheets tab
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
  for (const k of ['piece', 'gen', 'browse']) {
    for (const bad of [null, 'x', 5, []]) {
      const s = corrupt(k, bad);
      assert.deepEqual(withoutPanel(s[k] ?? {}), withoutPanel(def[k] ?? {}), `${k} = ${JSON.stringify(bad)}`);
      assert.equal(s.cap, 290);
    }
  }
});

test('Piece stats fields: a bad item level, slot or substat list falls back; repeats and an old third rank drop', () => {
  assert.equal(D.piece.ilvl, null); // null: the cap (explainerItemLevel in views/sync-explainer.js)
  expectFieldDefault('piece.ilvl', 'abc', null);
  expectFieldDefault('piece.ilvl', null, null);
  expectFieldDefault('piece.ilvl', 900, MAX_REAL); // an older save's number is kept, held to the real item levels
  expectFieldDefault('piece.slot', 'belt', 'head');
  expectFieldDefault('piece.slot', 'offhand', 'head');
  const ds = defaultSubs(makeJobContext('WHM'));
  assert.deepEqual(ds, ['crit', 'sps']); // Critical Hit, then speed, for every job (the GCD sub-tab needs speed)
  assert.deepEqual(defaultSubs(makeJobContext('WAR')), ['crit', 'sks']);
  expectFieldDefault('piece.subs', 'crit', ds);
  expectFieldDefault('piece.subs', { 0: 'crit' }, ds);
  expectFieldDefault('piece.subs', ['crit', 'crit'], ['crit', null]); // the repeat drops
  expectFieldDefault('piece.subs', [1, 'det'], [ds[0], 'det']);
  // an older save's third rank (20%, removed) is dropped
  expectFieldDefault('piece.subs', ['crit', 'det', 'dh'], ['crit', 'det']);
});

test('gear browser fields: a bad search, slot, sort or order falls back to its default', () => {
  expectFieldDefault('browse.q', 5, '');
  expectFieldDefault('browse.type', 'belt', 'any');
  expectFieldDefault('browse.sort', 'nope', 'ilvl');
  expectFieldDefault('browse.sort', 'name', 'name');
  expectFieldDefault('browse.dir', 'up', 'desc');
  expectFieldDefault('browse.dir', 'asc', 'asc');
});

test("the gear browser's gear filters: each falls back on its own", () => {
  const part = 'browse';
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
});

test("the gear browser's Gear from boxes and market board each fall back on their own", () => {
  // nine "Gear from" boxes left out by default; the market board switch on
  assert.deepEqual(DEFAULT_EXCLUDE, [
    'misc',
    'deep_dungeons',
    'wondrous_tails',
    'variant',
    'pvp',
    'extreme_current',
    'savage_current',
    'ultimate',
    'events',
  ]);
  assert.equal(D.browse.market, true);
  assert.deepEqual(D.browse.exclude, DEFAULT_EXCLUDE);
  assert.notEqual(D.browse.exclude, DEFAULT_EXCLUDE, 'a copy');
  const part = 'browse';
  expectFieldDefault(`${part}.exclude`, 'ultimate', DEFAULT_EXCLUDE); // not a list: the default
  expectFieldDefault(`${part}.exclude`, [], []); // every box ticked: kept, not the default
  expectFieldDefault(`${part}.exclude`, ['ultimate', 'crafted'], ['crafted', 'ultimate']); // ACTIVITIES order
  // a list with a key that is no box (an old gear-group save: 'savage', 'tomestone') starts over from the default
  expectFieldDefault(`${part}.exclude`, ['ultimate', 'savage'], DEFAULT_EXCLUDE);
  expectFieldDefault(`${part}.exclude`, ['ultimate', 3], DEFAULT_EXCLUDE);
  expectFieldDefault(`${part}.market`, 'yes', true); // not a boolean: the default
  expectFieldDefault('browse.exclude', null, DEFAULT_EXCLUDE);
  const older = validSave();
  delete older.browse.exclude; // a save from before the field existed
  assert.deepEqual(restoreState(older).browse.exclude, DEFAULT_EXCLUDE);
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
  raw.piece.subs = ['crit', 'ten'];
  const s = restoreState(raw);
  assert.equal(s.job, 'WAR');
  assert.deepEqual(s.piece.subs, ['crit', 'ten']); // WAR has Tenacity as its special substat
  // Piety is no stat of a Warrior: the second substat is dropped
  raw.piece.subs = ['crit', 'piety'];
  assert.deepEqual(restoreState(raw).piece.subs, ['crit', null]);
  // melee: no spec stat at all
  raw.job = 'MNK';
  const m = restoreState(raw);
  const mnk = makeJobContext('MNK');
  assert.deepEqual(m.piece.subs, ['crit', null]);
  // PLD keeps an off-hand piece slot, two-handed jobs do not
  raw.job = 'PLD';
  raw.piece.slot = 'offhand';
  assert.equal(restoreState(raw).piece.slot, 'offhand');
  raw.job = 'WAR';
  const w = restoreState(raw);
  assert.equal(w.piece.slot, 'head');
  assert.ok(!mnk.substats.includes('piety') && !mnk.substats.includes('ten'));
});

test("a saved level above the job's level cap is clamped to it", () => {
  const s = restoreState({ job: 'BST', level: 90, browse: { lvl: 70 } });
  assert.equal(s.level, 50);
  assert.equal(s.browse.lvl, 50);
  // a level at or below the cap is kept; Blue Mage caps at 80
  assert.equal(restoreState({ job: 'BST', level: 30 }).level, 30);
  assert.equal(restoreState({ job: 'BLU', level: 100 }).level, 80);
  assert.equal(restoreState({ job: 'BLU' }).level, 80); // the default (100) too
  // with no job chosen the game's cap applies
  assert.equal(restoreState({ level: 100 }).level, 100);
});

test('resetForJob: a job switch keeps the substats the new job can use (audit 11 #2)', () => {
  const switched = (fromId, toId, subs) => {
    const s = fresh(fromId);
    s.piece.subs = subs;
    resetForJob(s, makeJobContext(toId), makeJobContext(fromId));
    return s;
  };
  // Sage to Scholar: the same stats: the substats stay
  assert.deepEqual(switched('SGE', 'SCH', ['det', 'sps']).piece.subs, ['det', 'sps']);
  // Sage to Warrior: Spell Speed is not Skill Speed: the pair goes back
  assert.deepEqual(switched('SGE', 'WAR', ['sps', 'crit']).piece.subs, defaultSubs(makeJobContext('WAR')));
  // Sage to Black Mage: Spell Speed both: kept
  assert.deepEqual(switched('SGE', 'BLM', ['crit', 'sps']).piece.subs, ['crit', 'sps']);
  // Sage to Warrior with Piety chosen: Warrior has no Piety (it has Tenacity): back to the defaults
  assert.deepEqual(switched('SGE', 'WAR', ['det', 'piety']).piece.subs, defaultSubs(makeJobContext('WAR')));
  // no job before: the defaults
  const s = fresh('SGE');
  s.piece.subs = ['det', 'sps'];
  resetForJob(s, makeJobContext('SCH'));
  assert.deepEqual(s.piece.subs, defaultSubs(makeJobContext('SCH')));
});

/* The cap follows the synced level (owner's decision, 2026-10-18): a cap above the best gear made for the level
   (capCeiling) is lowered to it, never raised, and only while item level sync is on and level sync can apply. */
test('limitCapToLevel: lowers a cap above what the level allows, and leaves every other cap', () => {
  const app = s => Object.assign(defaultState(), { sync: true }, s);
  for (const [cap, level, want] of [
    [500, 50, 135], // level 50's weapons
    [500, 55, 136], // between level caps: the level's own item level
    [700, 90, 665], // Aloalo Island's cap
    [999, 50, 135], // above the highest real item level too
  ]) {
    const a = app({ cap, level });
    assert.deepEqual(limitCapToLevel(a), { from: cap, to: want, level }, `cap ${cap} level ${level}`);
    assert.equal(a.cap, want);
  }
  // at the job's level cap too: the level's ceiling is the highest real item level at level 100
  const top = app({ cap: 999, level: 100 });
  assert.deepEqual(limitCapToLevel(top), { from: 999, to: MAX_REAL, level: 100 });
  for (const s of [
    { cap: 123, level: 50 }, // T13: never raised
    { cap: 135, level: 50 },
    { cap: MAX_REAL, level: 100 }, // no gear above level 100
    { cap: 500, level: 50, sync: false },
    { cap: null, level: 50 },
  ]) {
    const a = app(s);
    assert.equal(limitCapToLevel(a), null, JSON.stringify(s));
    assert.equal(a.cap, s.cap);
  }
});

/* The note under a cap field after limitCapToLevel lowered it: the Job and sync panel and a sheet's page share it. */
test('capLoweredText: names the level, or the highest real item level', () => {
  assert.equal(capLoweredText({ from: 500, to: 405, level: 70 }), 'Lowered to 405, the highest for level 70.');
  assert.equal(capLoweredText({ from: 900, to: MAX_REAL, level: null }), `Lowered to ${MAX_REAL}, the highest item level.`);
  assert.equal(capLoweredText(null), '');
});

test('restoreState: a saved cap above what the saved level allows is lowered', () => {
  const s = restoreState({ job: 'SGE', sync: true, cap: 500, level: 50 });
  assert.equal(s.cap, 135);
  assert.equal(restoreState({ job: 'SGE', sync: false, cap: 500, level: 50 }).cap, 500);
});

/* The level limits the cap whatever the job: a Blue Mage at 80 or a Beastmaster at 50 (their own level caps) get the
   level's ceiling, the same on restore as on the live page. */
test("restoreState: a job at its own level cap gets the level's ceiling, as the live page does", () => {
  for (const [job, level] of [
    ['BLU', 80],
    ['BST', 50],
  ]) {
    const restored = restoreState({ job, sync: true, cap: 700, level });
    assert.equal(restored.cap, capCeiling(level), job);
    const live = { ...restored, jobCtx: makeJobContext(job) };
    assert.equal(limitCapToLevel(live), null, job);
  }
  // below the job's level cap, level sync applies and the cap is still lowered
  assert.equal(restoreState({ job: 'BLU', sync: true, cap: 700, level: 70 }).cap, capCeiling(70));
});

/* Audit 02, finding 7: the browser's defaults were written in defaultState, Reset filters and browseFiltered, with
   the equip level as 100 in one and the job's level cap in the others. defaultBrowse is the one copy. */
test('defaultBrowse: what a job starts with, and no filter by its own check', () => {
  for (const { id } of JOBS) {
    const job = makeJobContext(id);
    assert.deepEqual(withoutPanel(restoreState({ job: id }).browse), defaultBrowse(job), id);
    assert.equal(defaultBrowse(job).lvl, job.maxLevel, id);
    assert.equal(browseFiltered(job, defaultBrowse(job)), false, id);
  }
  assert.deepEqual(withoutPanel(defaultState().browse), defaultBrowse(null));
  assert.equal(defaultBrowse(null).lvl, 100);
  // each call is a fresh object: Reset filters assigns its arrays into the store
  assert.notEqual(defaultBrowse(null).exclude, defaultBrowse(null).exclude);
});

/* Audit 12, finding 9: the browser's name search was the one saved field with no bound (a 5 MB string restored). */
test('restore: a saved name search is cut to SEARCH_MAX_LENGTH', () => {
  assert.equal(SEARCH_MAX_LENGTH, 100);
  assert.equal(restoreState({ job: 'SGE', browse: { q: 'x'.repeat(5000) } }).browse.q, 'x'.repeat(SEARCH_MAX_LENGTH));
  assert.equal(restoreState({ job: 'SGE', browse: { q: 'ring of healing' } }).browse.q, 'ring of healing');
});

/* localStorage is a convenience only (CLAUDE.md, Page rules): a storage that throws on every access (private mode,
   blocked site data) gives no saved state and a save that does nothing, and the page starts from its defaults. A
   working one round-trips the state under STORE_KEY. */
test('loadSaved and save: a throwing localStorage is ignored; a working one round-trips', t => {
  // Node may have a localStorage of its own: put back exactly what was there
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  t.after(() => {
    delete globalThis.localStorage;
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
  });
  delete globalThis.localStorage;
  const blocked = () => {
    throw new Error('SecurityError: storage is blocked');
  };
  globalThis.localStorage = { getItem: blocked, setItem: blocked };
  assert.equal(loadSaved(), null);
  assert.doesNotThrow(() => save('{"job":"SGE"}'));
  assert.deepEqual(restoreState(loadSaved()), restoreState(null));

  // the accessor itself throws (a sandboxed page)
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: blocked });
  assert.equal(loadSaved(), null);
  assert.doesNotThrow(() => save('{}'));

  const kept = new Map();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: { getItem: key => kept.get(key) ?? null, setItem: (key, value) => kept.set(key, value) },
  });
  save(JSON.stringify({ job: 'WAR' }));
  assert.deepEqual([...kept.keys()], [STORE_KEY]);
  assert.equal(restoreState(loadSaved()).job, 'WAR');
});

/* A save from before the stat keys were the game's own names the speed, special and main stats by position (`spd`, `spec`,
   `main`) in piece.subs and browse.sort. restoreState reads them as the saved job's own stat at that position. */
test("an older save with position keys: piece.subs and browse.sort are read as the job's own stats", () => {
  // job: [the saved subs, the saved sort] -> [the restored subs, the restored sort]
  const cases = [
    ['WHM', ['spd', 'crit'], 'spd', ['sps', 'crit'], 'sps'],
    ['WHM', ['crit', 'spec'], 'spec', ['crit', 'piety'], 'piety'],
    ['SGE', ['det', 'spd'], 'main', ['det', 'sps'], 'mind'],
    ['WAR', ['crit', 'spec'], 'spec', ['crit', 'ten'], 'ten'],
    ['WAR', ['spd', 'det'], 'main', ['sks', 'det'], 'str'],
    ['SAM', ['crit', 'spd'], 'spd', ['crit', 'sks'], 'sks'],
    ['NIN', ['spd', 'dh'], 'main', ['sks', 'dh'], 'dex'],
    ['BLM', ['crit', 'spd'], 'main', ['crit', 'sps'], 'int'],
  ];
  for (const [job, subs, sort, wantSubs, wantSort] of cases) {
    const s = restoreState({ job, piece: { subs }, browse: { sort } });
    assert.deepEqual(s.piece.subs, wantSubs, `${job} subs`);
    assert.equal(s.browse.sort, wantSort, `${job} sort`);
  }
  // a special substat the job lacks was never valid: dropped as before; a sort by it falls back to the default
  const caster = restoreState({ job: 'BLM', piece: { subs: ['crit', 'spec'] }, browse: { sort: 'spec' } });
  assert.deepEqual(caster.piece.subs, ['crit', null]);
  assert.equal(caster.browse.sort, defaultBrowse().sort);
  // each tab is read for its own job
  const two = restoreState({ piece: { job: 'WHM', subs: ['crit', 'spd'] }, browse: { job: 'WAR', sort: 'spd' } });
  assert.deepEqual([two.piece.subs, two.browse.sort], [['crit', 'sps'], 'sks']);
  // the restored state saves and restores to itself (no old key survives)
  const again = restoreState(JSON.parse(JSON.stringify(two)));
  assert.deepEqual(again, two);
});
