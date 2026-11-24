/* The saved sheets (src/ui/sheets/storage.js): the index and one record per sheet, read and written through a stand-in
   for localStorage. The sheets are real: a Sage set solved from the item data, in a record shaped as
   docs/engineering/sheets.md describes. The broken records are the ways a record can fail. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeJobContext } from '../../../../src/core/job-context.js';
import { evaluateSet, makeSet } from '../../../../src/core/set.js';
import {
  QUOTA_MESSAGE,
  SHEETS_KEY,
  UNAVAILABLE_MESSAGE,
  deleteSheet,
  loadSheets,
  parseSheet,
  saveOrder,
  saveSheet,
  sheetKey,
  storageAvailable,
} from '../../../../src/ui/sheets/storage.js';
import { newGearSet } from '../../../../src/ui/sheets/ops.js';
import { syncSettings } from '../../../../src/ui/job-sync-panel.js';
import { makeSolverHandler, solverRequest } from '../../../../src/ui/solver.js';
import { applyFill } from '../../../../src/ui/sheets/fill.js';
import { defaultFillSettings, fillRecipe } from '../../../../src/ui/sheets/fill-settings.js';
import { localDate } from '../../../../src/ui/views/sheet-text.js';
import { createSheetsFacade } from '../../helpers/stores.js';

/* A Storage stand-in. `failWith`: an error every setItem throws (a full storage: name 'QuotaExceededError'). */
function fakeStorage({ failWith = null } = {}) {
  const data = new Map();
  return {
    data,
    get length() {
      return data.size;
    },
    key: i => [...data.keys()][i] ?? null,
    getItem: k => (data.has(k) ? data.get(k) : null),
    setItem(k, v) {
      if (failWith) throw failWith;
      data.set(k, String(v));
    },
    removeItem: k => data.delete(k),
  };
}
const quotaError = () => Object.assign(new Error('full'), { name: 'QuotaExceededError', code: 22 });

/* A real set: a Sage Auto-fill at item level 123 with food, as the solve reply carries it, put on a gear set's 12 rows. */
const SGE = makeJobContext('SGE');
const settings = defaultFillSettings(SGE);
settings.goal.food = true;
const INPUTS = { job: SGE, sync: syncSettings({ cap: 123, sync: true, level: 100 }), level: 100, recipe: fillRecipe(settings) };
const SOLVED = makeSolverHandler()(solverRequest('solve', INPUTS)).result;
const FILLED = applyFill(SGE, newGearSet('Set 1', 'g_1', 1), SOLVED.set);

/* A sheet record (data-model-types.md) holding that set; `id` and `name` vary. */
function makeSheet(id, name = 'Sage Lv 100') {
  return {
    v: 1,
    id,
    name,
    description: '',
    job: 'SGE',
    level: 100,
    sync: { on: true, cap: 123 },
    sets: [
      {
        id: 'g_1',
        name: 'Set 1',
        description: '',
        pieces: FILLED.pieces.map(p => ({ ...p })),
        meal: FILLED.meal,
        pinned: { pieces: [0], meal: false },
        fillSettings: null,
        createdAt: 1,
        updatedAt: 2,
      },
    ],
    gameData: { commit: 'd9582a6', date: '2026-09-30' },
    createdAt: 1,
    updatedAt: 2,
  };
}

/* makeSheet(id) with its one gear set changed by `fields` (replaced), or by `change(set)` when given a function. */
function withSet(id, fields) {
  const sheet = makeSheet(id);
  const [set] = sheet.sets;
  sheet.sets = [typeof fields === 'function' ? fields(structuredClone(set)) : { ...set, ...fields }];
  return sheet;
}

test('a saved sheet reads back as it was written, and its set still evaluates to the solve', () => {
  const storage = fakeStorage();
  const sheet = makeSheet('s_a');
  assert.deepEqual(saveSheet(sheet, storage), { ok: true });
  const read = loadSheets(storage);
  assert.equal(read.available, true);
  assert.deepEqual(read.sheets, [sheet]);
  assert.deepEqual(read.unreadable, []);
  const { job, sync, level } = INPUTS;
  const saved = read.sheets[0].sets[0];
  const kept = evaluateSet(job, makeSet(saved.pieces, saved.meal), sync, level);
  assert.deepEqual(kept.gear, evaluateSet(job, SOLVED.set, sync, level).gear);
});

test('the saved data has no text limit: a long name and long notes are read back as written', () => {
  const storage = fakeStorage();
  const sheet = makeSheet('s_long');
  sheet.name = 'n'.repeat(300);
  sheet.sets[0].name = 's'.repeat(300);
  sheet.sets[0].description = 'x'.repeat(5000);
  assert.deepEqual(saveSheet(sheet, storage), { ok: true });
  const read = loadSheets(storage);
  assert.deepEqual(read.unreadable, []);
  assert.deepEqual(read.sheets, [sheet]);
});

test('the index lists the ids; a new sheet goes to the top and a changed one keeps its place', () => {
  const storage = fakeStorage();
  for (const id of ['s_a', 's_b', 's_c']) saveSheet(makeSheet(id), storage);
  assert.deepEqual(JSON.parse(storage.getItem(SHEETS_KEY)), { v: 1, order: ['s_c', 's_b', 's_a'] });
  saveSheet({ ...makeSheet('s_b'), name: 'Renamed' }, storage);
  assert.deepEqual(
    loadSheets(storage).sheets.map(s => [s.id, s.name]),
    [
      ['s_c', 'Sage Lv 100'],
      ['s_b', 'Renamed'],
      ['s_a', 'Sage Lv 100'],
    ],
  );
});

test('a save writes only its own record (and the index when the sheet is new)', () => {
  const storage = fakeStorage();
  saveSheet(makeSheet('s_a'), storage);
  saveSheet(makeSheet('s_b'), storage);
  const before = new Map(storage.data);
  saveSheet({ ...makeSheet('s_b'), name: 'Changed' }, storage);
  const changed = [...storage.data].filter(([k, v]) => before.get(k) !== v).map(([k]) => k);
  assert.deepEqual(changed, [sheetKey('s_b')]);
});

test('saveOrder reorders; an id with no record is skipped; a record the index lacks is added at the end', () => {
  const storage = fakeStorage();
  for (const id of ['s_a', 's_b', 's_c']) saveSheet(makeSheet(id), storage);
  saveOrder(['s_a', 's_gone', 's_c', 's_a'], storage);
  assert.deepEqual(
    loadSheets(storage).sheets.map(s => s.id),
    ['s_a', 's_c', 's_b'],
  );
  storage.removeItem(SHEETS_KEY);
  assert.deepEqual(
    loadSheets(storage).sheets.map(s => s.id),
    ['s_a', 's_b', 's_c'],
  );
});

test('a record that cannot be read is listed with its cause and left alone', () => {
  const storage = fakeStorage();
  saveSheet(makeSheet('s_ok'), storage);
  const broken = {
    s_json: '{"v":1,"id":"s_json"',
    s_new: JSON.stringify({ ...makeSheet('s_new'), v: 2 }),
    s_job: JSON.stringify({ ...makeSheet('s_job'), job: 'XYZ' }),
    s_old: JSON.stringify({ ...makeSheet('s_old'), v: 0 }),
    s_key: JSON.stringify(makeSheet('s_other')),
    s_sets: JSON.stringify({ ...makeSheet('s_sets'), sets: 'none' }),
    s_set: JSON.stringify({ ...makeSheet('s_set'), sets: [{ id: 'g' }] }),
    s_desc_type: JSON.stringify(withSet('s_desc_type', { description: 5 })),
    s_null: 'null',
  };
  for (const [id, text] of Object.entries(broken)) storage.setItem(sheetKey(id), text);
  const before = new Map(storage.data);
  const read = loadSheets(storage);
  assert.deepEqual(
    read.sheets.map(s => s.id),
    ['s_ok'],
  );
  const causes = Object.fromEntries(read.unreadable.map(u => [u.id, u.cause]));
  assert.deepEqual(causes, {
    s_json: 'not valid JSON',
    s_new: 'written by a newer version of the page (v2)',
    s_job: 'unknown job "XYZ"',
    s_old: 'unknown version',
    s_key: 'its id does not match its key',
    s_sets: 'no list of sets',
    s_set: 'a damaged gear set',
    s_desc_type: 'a gear set with a damaged description',
    s_null: 'not a sheet',
  });
  assert.equal(read.unreadable.find(u => u.id === 's_job').key, sheetKey('s_job'));
  assert.deepEqual([...storage.data], [...before], 'reading changes nothing');
});

test('deleteSheet removes a record and its id; it also removes an unreadable record', () => {
  const storage = fakeStorage();
  for (const id of ['s_a', 's_b']) saveSheet(makeSheet(id), storage);
  storage.setItem(sheetKey('s_bad'), 'not json');
  saveOrder(['s_bad', 's_b', 's_a'], storage);
  assert.equal(loadSheets(storage).unreadable.length, 1);
  assert.deepEqual(deleteSheet('s_bad', storage), { ok: true });
  assert.deepEqual(deleteSheet('s_b', storage), { ok: true });
  assert.deepEqual(deleteSheet('s_never', storage), { ok: true });
  assert.equal(storage.getItem(sheetKey('s_bad')), null);
  assert.deepEqual(JSON.parse(storage.getItem(SHEETS_KEY)).order, ['s_a']);
  const read = loadSheets(storage);
  assert.deepEqual([read.sheets.map(s => s.id), read.unreadable], [['s_a'], []]);
});

test('an index that cannot be read leaves the sheets listed by id and says why', () => {
  const storage = fakeStorage();
  saveSheet(makeSheet('s_b'), storage);
  saveSheet(makeSheet('s_a'), storage);
  storage.setItem(SHEETS_KEY, JSON.stringify({ v: 2, order: ['s_b'] }));
  const read = loadSheets(storage);
  assert.equal(read.indexProblem, 'index not readable');
  assert.deepEqual(
    read.sheets.map(s => s.id),
    ['s_a', 's_b'],
  );
});

test('a full storage: the save reports it, nothing is written and the sheet is unchanged', () => {
  const storage = fakeStorage({ failWith: quotaError() });
  const sheet = makeSheet('s_a');
  const copy = structuredClone(sheet);
  const result = saveSheet(sheet, storage);
  assert.deepEqual(result, { ok: false, reason: 'quota', message: QUOTA_MESSAGE });
  assert.deepEqual(sheet, copy);
  assert.equal(storage.data.size, 0);
  assert.equal(saveOrder(['s_a'], storage).reason, 'quota');
});

test('storage that is missing or throws: unavailable, never an exception', () => {
  const refuse = () => {
    throw new Error('blocked');
  };
  const blocked = {
    get length() {
      return refuse();
    },
    key: refuse,
    getItem: refuse,
    setItem: refuse,
    removeItem: refuse,
  };
  for (const storage of [null, blocked]) {
    assert.equal(storageAvailable(storage), false);
    assert.deepEqual(loadSheets(storage), { available: false, sheets: [], unreadable: [], indexProblem: null });
    assert.deepEqual(saveSheet(makeSheet('s_a'), storage), { ok: false, reason: 'unavailable', message: UNAVAILABLE_MESSAGE });
    assert.equal(deleteSheet('s_a', storage).reason, 'unavailable');
    assert.equal(saveOrder([], storage).reason, 'unavailable');
  }
  assert.equal(storageAvailable(fakeStorage()), true);
  assert.equal(storageAvailable(fakeStorage({ failWith: quotaError() })), false);
});

test('parseSheet takes a record text and the id of its key', () => {
  assert.deepEqual(parseSheet(JSON.stringify(makeSheet('s_a')), 's_a').sheet, makeSheet('s_a'));
  assert.equal(parseSheet(JSON.stringify(makeSheet('s_a')), 's_b').cause, 'its id does not match its key');
});

/* A record a hand edit or an older build damaged in a field a view reads: listed as unreadable with the cause, so the
   manager lists it with a Delete button instead of a view breaking on it (fillPlan reads row.slot, the manager reads
   the dates, fillRecipe copies the Auto-fill settings' lists). */
test('a damaged row, meal, pin, Auto-fill setting or date makes the record unreadable, with the cause', () => {
  const row = (index, value) => set => {
    set.pieces[index] = value;
    return set;
  };
  const damaged = {
    s_null_row: [withSet('s_null_row', row(0, null)), 'a gear set whose row 1 is not a weapon row'],
    s_order: [withSet('s_order', row(2, { slot: 'body' })), 'a gear set whose row 3 is not a head row'],
    s_eleven: [withSet('s_eleven', set => ({ ...set, pieces: set.pieces.slice(1) })), 'a gear set with 11 of its 12 rows'],
    s_id: [withSet('s_id', row(2, { slot: 'head', gameId: 'x', stones: [] })), 'a gear set whose row 3 has a damaged game id'],
    s_stones: [withSet('s_stones', row(2, { slot: 'head', gameId: 10880, stones: 'none' })), 'a gear set whose row 3 has damaged stones'],
    s_stone: [
      withSet('s_stone', row(2, { slot: 'head', gameId: 10880, stones: [{ stat: 'crit', grade: 13 }] })),
      'a gear set whose row 3 has damaged stones',
    ],
    s_meal: [withSet('s_meal', { meal: 7 }), 'a gear set with a damaged meal'],
    s_pins: [withSet('s_pins', { pinned: { pieces: [12], meal: false } }), 'a gear set with damaged pins'],
    s_pin_meal: [withSet('s_pin_meal', { pinned: { pieces: [], meal: 'yes' } }), 'a gear set with damaged pins'],
    s_fill: [withSet('s_fill', { fillSettings: { searchCriteria: { expOff: 'DT' } } }), 'a gear set with damaged Auto-fill settings'],
    s_goal: [withSet('s_goal', { fillSettings: { goal: { byTier: 'on' } } }), 'a gear set with damaged Auto-fill settings'],
    s_set_time: [withSet('s_set_time', { updatedAt: 'today' }), 'a gear set with a damaged time'],
    s_dates: [{ ...makeSheet('s_dates'), createdAt: undefined }, 'no dates'],
    // a finite number that is no date: Intl.DateTimeFormat.format throws a RangeError on it, which emptied the Sheets tab
    s_far_future: [{ ...makeSheet('s_far_future'), createdAt: 1e300 }, 'no dates'],
    s_far_past: [{ ...makeSheet('s_far_past'), updatedAt: -8.64e15 - 1 }, 'no dates'],
    s_set_far_future: [withSet('s_set_far_future', { updatedAt: 1e300 }), 'a gear set with a damaged time'],
    s_sheet_desc: [{ ...makeSheet('s_sheet_desc'), description: ['notes'] }, 'a damaged description'],
  };
  const storage = fakeStorage();
  for (const [id, [sheet]] of Object.entries(damaged)) storage.setItem(sheetKey(id), JSON.stringify(sheet));
  const read = loadSheets(storage);
  assert.deepEqual(read.sheets, []);
  assert.deepEqual(
    Object.fromEntries(read.unreadable.map(u => [u.id, u.cause])),
    Object.fromEntries(Object.entries(damaged).map(([id, [, cause]]) => [id, cause])),
  );
  // the fields that may be missing: an empty row with a null game id, no stones list, no pins, no Auto-fill settings
  const lean = withSet('s_lean', set => {
    set.pieces[2] = { slot: 'head', gameId: null };
    set.pieces[3] = { slot: 'body', gameId: 10887 };
    delete set.pinned;
    delete set.fillSettings;
    return set;
  });
  assert.ok(parseSheet(JSON.stringify(lean), 's_lean').sheet);
  // Auto-fill settings as the set page saves them read back
  assert.ok(parseSheet(JSON.stringify(withSet('s_fs', { fillSettings: settings })), 's_fs').sheet);
});

/* The saved times must be dates the views can format: the range of a JavaScript Date, 8.64e15 ms either side of 1970. */
test('a time at the end of the Date range is readable; one past it, or not finite, is not', () => {
  const read = createdAt => parseSheet(JSON.stringify({ ...makeSheet('s_t'), createdAt }), 's_t');
  for (const ok of [0, -8.64e15, 8.64e15]) {
    assert.ok(read(ok).sheet, String(ok));
    assert.doesNotThrow(() => localDate(ok, 'UTC'), String(ok));
  }
  for (const bad of [8.64e15 + 2000, -8.64e15 - 2000, 1e300]) assert.equal(read(bad).cause, 'no dates', String(bad));
});

/* The store lists such a record as unreadable and opens the page with the readable ones: no view meets it. */
test('a damaged record next to good ones: the store lists it as unreadable and keeps the others', () => {
  const storage = fakeStorage();
  saveSheet(makeSheet('s_good'), storage);
  storage.setItem(sheetKey('s_bad'), JSON.stringify(withSet('s_bad', set => ({ ...set, pieces: [null] }))));
  const store = createSheetsFacade({ storage });
  assert.deepEqual(
    store.list().sheets.map(sheet => sheet.id),
    ['s_good'],
  );
  assert.deepEqual(
    store.list().unreadable.map(u => [u.id, u.cause]),
    [['s_bad', 'a gear set with 1 of its 12 rows']],
  );
});
