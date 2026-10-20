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
  loadSaved,
  save,
  STORE_KEY,
} from '../../src/ui/state.js';
import { DEFAULT_EXCLUDE, TARGET_GCD_RANGE } from '../../src/ui/settings.js';
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
      exclude: ['tomes_current', 'ultimate'],
      market: false,
      min: 110,
      max: 140,
      lvl: 50,
      sort: 'spd',
      dir: 'asc',
    },
    opt: {
      target: 'spec',
      tb: '',
      tb2: 'crit',
      melds: false,
      expOff: ['HW'],
      exclude: ['crafted', 'pvp'],
      market: false,
      min: '',
      max: 300,
      lvl: 60,
      food: true,
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

test('tab and math sub-tab: an unknown one opens the default; old tab names open their new place', () => {
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

test('Piece stats fields: a bad item level, slot or substat list falls back; repeats and an old third rank drop', () => {
  assert.equal(D.piece.ilvl, null); // null: the cap (explainerItemLevel in views/sync-explainer.js)
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

test('gear browser fields: a bad search, slot, sort or order falls back to its default', () => {
  expectFieldDefault('browse.q', 5, '');
  expectFieldDefault('browse.type', 'belt', 'any');
  expectFieldDefault('browse.sort', 'nope', 'ilvl');
  expectFieldDefault('browse.sort', 'name', 'name');
  expectFieldDefault('browse.dir', 'up', 'desc');
  expectFieldDefault('browse.dir', 'asc', 'asc');
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

test('optimizer fields: goal, Gear from boxes, market board, melds, Target GCD and Rank by tier each fall back on their own', () => {
  assert.deepEqual([D.opt.target, D.opt.tb, D.opt.tb2], ['main', '', '']); // main stat first, no tiebreaks
  expectFieldDefault('opt.target', 'nope', D.opt.target);
  expectFieldDefault('opt.target', '', D.opt.target);
  expectFieldDefault('opt.tb', 'nope', D.opt.tb);
  expectFieldDefault('opt.tb', null, D.opt.tb);
  expectFieldDefault('opt.tb2', 3, D.opt.tb2);
  // nine "Gear from" boxes left out by default (owner, 2026-10-18), in the optimizer and the browser, each its own list;
  // the market board switch on
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
  assert.equal(D.opt.market, true);
  assert.deepEqual(D.browse.exclude, DEFAULT_EXCLUDE);
  assert.deepEqual(D.opt.exclude, DEFAULT_EXCLUDE);
  assert.notEqual(D.opt.exclude, D.browse.exclude);
  for (const part of ['browse', 'opt']) {
    expectFieldDefault(`${part}.exclude`, 'ultimate', DEFAULT_EXCLUDE); // not a list: the default
    expectFieldDefault(`${part}.exclude`, [], []); // every box ticked: kept, not the default
    expectFieldDefault(`${part}.exclude`, ['ultimate', 'crafted'], ['crafted', 'ultimate']); // ACTIVITIES order
    // a list with a key that is no box (an old gear-group save: 'savage', 'tomestone') starts over from the default
    expectFieldDefault(`${part}.exclude`, ['ultimate', 'savage'], DEFAULT_EXCLUDE);
    expectFieldDefault(`${part}.exclude`, ['ultimate', 3], DEFAULT_EXCLUDE);
    expectFieldDefault(`${part}.market`, 'yes', true); // not a boolean: the default
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
  assert.deepEqual(restoreState(shared).opt.exclude, ['tomes_current', 'ultimate']);
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
  // every value the box can hold survives a reload: its own range (audit 2: a typed 3.00 used to become "Any")
  for (const seconds of TARGET_GCD_RANGE) expectFieldDefault('opt.gcd', seconds, seconds);
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

test('resetForJob: a job switch keeps the goal, tiebreaks, Target GCD and substats the new job can use (audit 11 #2)', () => {
  const switched = (fromId, toId, opt, subs = ['crit', 'spd']) => {
    const s = fresh(fromId);
    Object.assign(s.opt, opt);
    s.piece.subs = subs;
    resetForJob(s, makeJobContext(toId), makeJobContext(fromId));
    return s;
  };
  // Sage to Scholar: the same stats under the same names, the same speed and no haste: everything stays
  let s = switched('SGE', 'SCH', { target: 'spec', tb: 'spd', tb2: 'crit', gcd: 2.4 }, ['det', 'spd']);
  assert.deepEqual([s.opt.target, s.opt.tb, s.opt.tb2, s.opt.gcd], ['spec', 'spd', 'crit', 2.4]);
  assert.deepEqual(s.piece.subs, ['det', 'spd']);
  // Sage to Warrior: Piety is not Tenacity and Spell Speed is not Skill Speed; Critical Hit stays
  s = switched('SGE', 'WAR', { target: 'spec', tb: 'crit', tb2: 'spd', gcd: 2.4 }, ['spd', 'crit']);
  assert.deepEqual([s.opt.target, s.opt.tb, s.opt.tb2, s.opt.gcd], ['main', 'crit', '', '']);
  assert.deepEqual(s.piece.subs, defaultSubs());
  // Sage to Black Mage: Spell Speed both, no haste either: the GCD stays; Mind is not Intelligence
  s = switched('SGE', 'BLM', { target: 'main', tb: 'spd', gcd: 2.4 });
  assert.deepEqual([s.opt.target, s.opt.tb, s.opt.gcd], ['main', 'spd', 2.4]);
  // Warrior (goal Tenacity, tiebreak Strength) to Dragoon: the goal goes back to the main stat, which the tiebreak
  // held, so the tiebreak clears (a stat holds one rank)
  s = switched('WAR', 'DRG', { target: 'spec', tb: 'main' });
  assert.deepEqual([s.opt.target, s.opt.tb], ['main', '']);
  // Samurai to Monk: Skill Speed both, but another haste: the GCD goes
  s = switched('SAM', 'MNK', { tb: 'spd', gcd: 2.1 });
  assert.deepEqual([s.opt.tb, s.opt.gcd], ['spd', '']);
  // no job before: the defaults
  s = fresh('SGE');
  Object.assign(s.opt, { target: 'crit', gcd: 2.4 });
  resetForJob(s, makeJobContext('SCH'));
  assert.deepEqual([s.opt.target, s.opt.gcd], ['main', '']);
});

test("Food: off by default, a wrong type falls back; a save's old meal choice (foodPair) is dropped", () => {
  assert.equal(restoreState(null).opt.food, false);
  const s = restoreState({ job: 'SGE', opt: { food: true, foodPair: 'spd+spec' } });
  assert.equal(s.opt.food, true);
  // the Meal box is gone (2026-10-18): a meal is picked from the Food row's menu and not saved
  assert.equal('foodPair' in s.opt, false);
  assert.equal(restoreState({ job: 'SGE', opt: { food: 'yes' } }).opt.food, false);
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
  // with no level sync (level 100), only the highest real item level limits it
  const top = app({ cap: 999, level: 100 });
  assert.deepEqual(limitCapToLevel(top), { from: 999, to: MAX_REAL, level: null });
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

test('restoreState: a saved cap above what the saved level allows is lowered', () => {
  const s = restoreState({ job: 'SGE', sync: true, cap: 500, level: 50 });
  assert.equal(s.cap, 135);
  assert.equal(restoreState({ job: 'SGE', sync: false, cap: 500, level: 50 }).cap, 500);
});

/* Audit 02, finding 1: restore ran limitCapToLevel without the job context, so a Blue Mage or Beastmaster at its own
   level cap counted as level synced and a saved cap of 700 came back as 535. The live store keeps 700. */
test('restoreState: a job at its own level cap keeps its saved cap, as the live page does', () => {
  for (const [job, level] of [
    ['BLU', 80],
    ['BST', 50],
  ]) {
    const restored = restoreState({ job, sync: true, cap: 700, level });
    assert.equal(restored.cap, 700, job);
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
    assert.deepEqual(restoreState({ job: id }).browse, defaultBrowse(job), id);
    assert.equal(defaultBrowse(job).lvl, job.maxLevel, id);
    assert.equal(browseFiltered(job, defaultBrowse(job)), false, id);
  }
  assert.deepEqual(defaultState().browse, defaultBrowse(null));
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
