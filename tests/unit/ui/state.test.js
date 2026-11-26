/* Restoring saved state (restoreState, src/ui/state.ts): a valid save round-trips, and every damaged or outdated field
   falls back to its default on its own, leaving the rest. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  restoreState,
  cutText,
  defaultState,
  defaultBrowse,
  resetForJob,
  defaultSubs,
  SEARCH_MAX_LENGTH,
  loadSaved,
  save,
} from '../../../src/ui/state.ts';
import { limitCapToLevel } from '../../../src/ui/level-cap.ts';
import { DEFAULT_EXCLUDE } from '../../../src/ui/job-sync-panel.ts';
import { STORE_KEY } from '../../../src/ui/store-key.ts';
import { browseFiltered } from '../../../src/ui/views/gear.ts';
import { makeJobContext } from '../../../src/core/job-context.ts';
import { DEFAULT_JOB, JOBS } from '../../../src/core/constants.ts';
import { MAX_REAL } from '../../../src/core/tables.ts';
import { capCeiling } from '../../../src/core/sync-target.ts';

const D = defaultState();
const clone = o => JSON.parse(JSON.stringify(o));
/* Defaults for `job`, or for the default job (null; DEFAULT_JOB, Paladin). */
const fresh = job => {
  const s = defaultState();
  for (const target of [s, s.piece, s.browse]) {
    target.job = job ?? DEFAULT_JOB;
  }
  resetForJob(s, makeJobContext(job ?? DEFAULT_JOB));
  return s;
};
/* The Job and sync panel's fields: the open tab's copy at the top and each tab's own in its group. */
const PANEL_KEYS = ['job', 'cap', 'sync', 'level'];
const PANEL_FIELDS = [null, 'piece', 'browse'];
const withoutPanel = o => Object.fromEntries(Object.entries(o).filter(([k]) => !PANEL_KEYS.includes(k)));
/* The state as the page saves it (store.persisted): without the open tab's top-level copy of its panel. */
const savedForm = s => withoutPanel(s);
/* The screen a restore opens on (the address names it; it is not saved): the math tab on its GCD view. */
const OPEN = { tab: 'math', mathTab: 'gcd' };
/* A full, valid healer save that differs from the defaults in every field. */
function validSave() {
  return {
    job: 'WHM',
    cap: 290,
    sync: true,
    level: 70,
    sheetFigures: 'points',
    tiers: { job: 'SGE' }, // Substat tiers' own job, apart from the math panel's (WHM)
    piece: { ilvl: 300, slot: 'ring', subs: ['crit', 'piety'], slots: 2 },
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
    for (const group of PANEL_FIELDS) {
      (group ? want[group] : want)[last] = expected;
    }
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
  const s = restoreState(clone(raw), OPEN);
  // an older save has one panel, which every tab takes; the open tab (math) shows its copy
  const { job, cap, sync, level, ...rest } = raw;
  const panel = { job, cap, sync, level };
  assert.deepEqual(withoutPanel(s), { ...rest, ...OPEN, piece: { ...rest.piece, ...panel }, browse: { ...rest.browse, ...panel } });
  assert.deepEqual(
    PANEL_KEYS.map(k => s[k]),
    PANEL_KEYS.map(k => panel[k]),
  );
  assert.deepEqual(restoreState(clone(savedForm(s)), OPEN), s);
  // an older save's Gear optimizer settings are dropped, the rest kept
  assert.deepEqual(restoreState({ ...clone(raw), opt: { target: 'crit' }, optPanel: { job: 'SGE' } }, OPEN), s);
});

test('an empty object gives the defaults, with the default job', () => {
  assert.deepEqual(restoreState({}), fresh(null));
});

test('an unknown job means the default job, other fields kept', () => {
  const s = corrupt('job', 'XYZ');
  assert.equal(s.job, DEFAULT_JOB);
  assert.equal(s.cap, 290);
  assert.equal(corrupt('job', 7).job, DEFAULT_JOB);
});

test('top-level scalars of the wrong type or out of range fall back field by field', () => {
  expectFieldDefault('cap', '123', D.cap);
  expectFieldDefault('cap', null, D.cap);
  expectFieldDefault('cap', Number.NaN, D.cap);
  expectFieldDefault('cap', -5, 1);
  expectFieldDefault('cap', 99999, capCeiling(70)); // IL Sync is on: a cap over what level 70 allows is lowered to it
  expectFieldDefault('cap', 200.6, 201);
  // a sync that is no boolean falls back to off (state.tiers-job.test.js: the math panel then holds level sync's item level)
  for (const notBoolean of ['yes', 1, null]) {
    assert.equal(corrupt('sync', notBoolean).sync, D.sync, `sync = ${JSON.stringify(notBoolean)}`);
  }
  expectFieldDefault('level', 9999, 100);
  // a level of 0 becomes 1, and the saved cap (IL Sync on) is lowered to what level 1 allows
  const lowest = corrupt('level', 0);
  assert.deepEqual([lowest.level, lowest.cap, lowest.piece.cap, lowest.browse.cap], [1, capCeiling(1), capCeiling(1), capCeiling(1)]);
  expectFieldDefault('level', '50', D.level); // strings are not accepted here
});

test('older saves: the removed Sync limits sub-tab opens Piece stats, and its comparison item level is dropped', () => {
  const s = restoreState({ ...validSave(), syncIlvl: 400 }, { tab: 'math', mathTab: 'sync' });
  assert.equal(s.mathTab, 'piece');
  assert.equal('syncIlvl' in s, false);
});

test('the open tab and math view are not saved: the screen the restore is given opens', () => {
  assert.equal(D.tab, 'sheets'); // the Sheets tab opens first
  assert.equal(D.mathTab, 'piece');
  // an older save's tab and mathTab are ignored
  assert.deepEqual(restoreState({ ...validSave(), tab: 'math', mathTab: 'gcd' }), restoreState(validSave()));
  const s = restoreState(validSave(), { tab: 'browse', mathTab: 'tiers' });
  assert.deepEqual([s.tab, s.mathTab], ['browse', 'tiers']);
  // an unknown tab or view, or none, opens the first
  for (const open of [{ tab: 42, mathTab: 'nope' }, { tab: 'opt', mathTab: 'sync' }, { tab: 'pool' }, {}, undefined]) {
    const opened = restoreState(validSave(), open);
    assert.deepEqual([opened.tab, opened.mathTab], ['sheets', 'piece'], JSON.stringify(open));
  }
});

test('sheetFigures: an unknown value falls back to the effects view, the stat points view is kept', () => {
  expectFieldDefault('sheetFigures', 'nope', 'effects');
  assert.equal(corrupt('sheetFigures', 'points').sheetFigures, 'points');
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
  assert.equal(D.piece.ilvl, null); // null: the cap (explainerItemLevel in views/sync-explainer.ts)
  expectFieldDefault('piece.ilvl', 'abc', null);
  expectFieldDefault('piece.ilvl', null, null);
  expectFieldDefault('piece.ilvl', 900, MAX_REAL); // an older save's number is kept, held to the real item levels
  assert.equal(D.piece.slots, null); // null: the slot's usual total (meldSlotsOf in job-sync-panel.ts)
  expectFieldDefault('piece.slots', 4, null); // no piece has 4 slots in all
  expectFieldDefault('piece.slots', 6, null);
  expectFieldDefault('piece.slots', 'two', null);
  expectFieldDefault('piece.slots', 1.5, null);
  expectFieldDefault('piece.slot', 'belt', 'head');
  assert.equal(corrupt('piece.slot', 'offhand').piece.slot, 'offhand'); // White Mage uses the Off-hand row (a shield beside a wand)
  // a job without a shield falls back to the head, in a save and on a job switch
  const sageSave = { job: 'SGE', piece: { job: 'SGE', slot: 'offhand' }, browse: { job: 'SGE', type: 'offhand' } };
  assert.equal(restoreState(sageSave).piece.slot, 'head');
  assert.equal(restoreState(sageSave).browse.type, 'any');
  const switched = fresh('WHM');
  switched.piece.slot = 'offhand';
  switched.browse.type = 'offhand';
  resetForJob(switched, makeJobContext('SGE'), makeJobContext('WHM'));
  assert.equal(switched.piece.slot, 'head');
  assert.equal(switched.browse.type, 'any');
  const kept = fresh('WHM');
  kept.piece.slot = 'offhand';
  kept.browse.type = 'offhand';
  resetForJob(kept, makeJobContext('BLM'), makeJobContext('WHM'));
  assert.equal(kept.piece.slot, 'offhand');
  assert.equal(kept.browse.type, 'offhand');
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
  expectFieldDefault(`${part}.min`, '120', 120); // an older save kept number boxes as text
  expectFieldDefault(`${part}.min`, 'abc', D[part].min);
  expectFieldDefault(`${part}.min`, -10, 0);
  expectFieldDefault(`${part}.max`, 5000, MAX_REAL);
  expectFieldDefault(`${part}.max`, null, '');
  expectFieldDefault(`${part}.lvl`, 500, 100);
  expectFieldDefault(`${part}.lvl`, true, 100);
  expectFieldDefault(`${part}.expOff`, 'SB', []);
  expectFieldDefault(`${part}.expOff`, ['SB', 'XIV', 3, 'ARR'], ['ARR', 'SB']); // unknown values drop; EXPANSIONS order
});

test("the gear browser's Gear categories boxes and market board each fall back on their own", () => {
  // nine "Gear categories" boxes left out by default; the market board switch on
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
    if (original) {
      Object.defineProperty(globalThis, 'localStorage', original);
    }
  });
  delete globalThis.localStorage;
  const blocked = () => {
    throw new Error('SecurityError: storage is blocked');
  };
  globalThis.localStorage = { getItem: blocked, setItem: blocked };
  assert.equal(loadSaved(), null);
  assert.doesNotThrow(() => save('{"job":"SGE"}'));
  assert.equal(save('{}'), false, 'a write that did not happen says so');
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
  assert.equal(save(JSON.stringify({ job: 'WAR' })), true);
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

test('cutText: the longest search is cut between characters, never inside an emoji', () => {
  const emoji = '\u{1F600}';
  assert.equal(cutText('abc', 100), 'abc');
  assert.equal(cutText('x'.repeat(100), 100).length, 100);
  assert.equal(cutText('x'.repeat(99) + emoji, 100), 'x'.repeat(99), 'half of the emoji would be left: it goes');
  assert.equal(cutText('x'.repeat(98) + emoji, 100), 'x'.repeat(98) + emoji, 'the whole emoji fits');
  assert.equal(cutText('x'.repeat(99) + '\uD83D', 100), 'x'.repeat(99) + '\uD83D', 'text that already ends in half is not cut again');
});

test('restoreState: a saved search text of 101 units that ends in half an emoji is cut before it', () => {
  const saved = { browse: { q: 'x'.repeat(99) + '\u{1F600}' } };
  assert.equal(restoreState(saved).browse.q, 'x'.repeat(99));
});
