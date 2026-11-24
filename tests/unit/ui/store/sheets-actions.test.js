/* The Sheets tab's actions (src/ui/store/sheets-actions.ts) over a stand-in storage: making, editing, copying, deleting and
   reordering sheets and gear sets, the screens each action leaves open (docs/engineering/sheets.md), the edit lock while a
   Auto-fill runs, a full storage keeping the edit in memory, and a second store (a reload) reading back what was saved. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_REAL } from '../../../../src/core/tables.js';
import { capCeiling } from '../../../../src/core/sync-target.js';
import { QUOTA_MESSAGE, saveSheet, sheetKey } from '../../../../src/ui/sheets/storage.js';
import {
  ACK_REQUIRED_TEXT,
  EMPTY_NAME_TEXT,
  JOB_REQUIRED_TEXT,
  LOCKED_TEXT,
  SHEET_GONE_TEXT,
  copiedNote,
} from '../../../../src/ui/sheets/store-shared.js';
import { createSheetStore } from '../../helpers/store-adapters.ts';
import { FORM_FIELD, NEW_SHEET_CAP } from '../../../../src/ui/sheets/ops.js';
import { WHM_CANE, fakeStorage, piece, quotaError, sageSet, sheetOf } from '../../helpers/sheet-fixtures.js';

/* A store over `storage` with a clock that ticks 1 s per call and numbered ids. */
function makeStore(storage = fakeStorage()) {
  let clock = Date.UTC(2026, 10, 9, 12);
  let next = 0;
  return createSheetStore({ storage, now: () => (clock += 1000), makeId: prefix => `${prefix}${++next}` });
}
const FIELDS = { name: 'Bahamut', description: 'Week 1', job: 'SGE', level: 100, sync: { on: true, cap: 123 } };

test('a new sheet: a job and a name are required; it goes to the top, is saved and opens', () => {
  const storage = fakeStorage();
  const store = makeStore(storage);
  assert.deepEqual(store.createSheet({ ...FIELDS, job: '' }), { ok: false, error: JOB_REQUIRED_TEXT, field: FORM_FIELD.job });
  assert.deepEqual(store.createSheet({ ...FIELDS, name: '   ' }), { ok: false, error: EMPTY_NAME_TEXT, field: FORM_FIELD.name });
  const first = store.createSheet(FIELDS);
  assert.deepEqual([first.ok, store.screen, store.sheetId], [true, 'sheet', first.id]);
  const second = store.createSheet({ ...FIELDS, name: 'UwU', job: 'BLU', level: 95, sync: { on: false, cap: '' } });
  assert.deepEqual(
    store.list().sheets.map(s => s.name),
    ['UwU', 'Bahamut'],
  );
  // the level is held to Blue Mage's cap; an empty cap starts at the highest real item level
  const blu = store.sheet(second.id);
  assert.deepEqual([blu.level, blu.sync], [80, { on: false, cap: NEW_SHEET_CAP }]);
  assert.equal(NEW_SHEET_CAP, MAX_REAL);
  assert.ok(storage.getItem(sheetKey(first.id)));
  // a reload (a second store on the same storage) reads them back in the same order
  assert.deepEqual(
    makeStore(storage)
      .list()
      .sheets.map(s => s.name),
    ['UwU', 'Bahamut'],
  );
});

test('screens: the manager, a sheet, a set; a gone sheet falls back to the manager', () => {
  const store = makeStore();
  const { id } = store.createSheet(FIELDS);
  store.openManager();
  assert.deepEqual([store.screen, store.currentSheet], ['sheets', null]);
  store.openSheet(id);
  assert.equal(store.currentSheet.id, id);
  const set = store.newSet();
  assert.deepEqual([store.screen, store.setId, store.currentSet.name], ['set', set.id, 'Set 1']);
  store.closeSet();
  assert.deepEqual([store.screen, store.setId, store.currentSet], ['sheet', null, null]);
  store.openSet('nope');
  assert.equal(store.screen, 'sheet');
  store.openSheet('s_gone');
  assert.equal(store.screen, 'sheets');
});

test('name and description: an empty name is refused and the old one kept; changes stamp updatedAt', () => {
  const store = makeStore();
  const { id } = store.createSheet(FIELDS);
  const before = store.sheet(id).updatedAt;
  assert.deepEqual(store.editSheet(id, { name: '  ', description: 'x' }), { ok: false, error: EMPTY_NAME_TEXT, field: FORM_FIELD.name });
  assert.equal(store.sheet(id).name, 'Bahamut');
  assert.deepEqual(store.editSheet(id, { name: ' T13 ', description: ' Savage\nweek 2 ' }), { ok: true });
  assert.deepEqual([store.sheet(id).name, store.sheet(id).description], ['T13', 'Savage\nweek 2']);
  assert.ok(store.sheet(id).updatedAt > before);
});

test('level and item level sync on the open sheet: applied at once, held to their ranges', () => {
  const store = makeStore();
  store.createSheet({ ...FIELDS, job: 'BST' });
  store.setLevel(70);
  assert.equal(store.currentSheet.level, 50, "Beastmaster's level cap");
  store.setLevel('');
  assert.equal(store.currentSheet.level, 50, 'no number keeps the level');
  // level 50 is Beastmaster's own level cap; the level limits the cap whatever the job: 135, the best gear made for it
  store.setCap(5000);
  assert.equal(store.currentSheet.sync.cap, 135);
  store.setSyncOn(false);
  assert.deepEqual(store.currentSheet.sync, { on: false, cap: 135 }, 'the cap is kept while sync is off');
  // a Sage at level 50: the same
  store.createSheet({ ...FIELDS, level: 50 });
  store.setCap(5000);
  assert.equal(store.currentSheet.sync.cap, 135);
});

test('gear sets: New set opens it; Copy goes next to the original; Edit sets name and notes; Delete asks nothing here', () => {
  const store = makeStore();
  store.createSheet(FIELDS);
  const a = store.newSet();
  store.closeSet();
  const b = store.newSet();
  store.closeSet();
  assert.deepEqual(
    store.currentSheet.sets.map(s => s.name),
    ['Set 1', 'Set 2'],
  );
  const copy = store.copySet(a.id);
  assert.deepEqual(
    store.currentSheet.sets.map(s => s.name),
    ['Set 1', 'Set 1 (1)', 'Set 2'],
  );
  assert.equal(store.screen, 'sheet', 'copying a set stays on the list');
  assert.ok(store.note.includes('Set 1 (1)'), store.note); // the new set's name
  assert.deepEqual(store.editSet(copy.id, { name: '', description: '' }), { ok: false, error: EMPTY_NAME_TEXT, field: FORM_FIELD.name });
  store.editSet(copy.id, { name: 'Mine', description: 'My own set\nwith a crafted body' });
  assert.deepEqual([store.currentSheet.sets[1].name, store.currentSheet.sets[1].description], ['Mine', 'My own set\nwith a crafted body']);
  // deleting from the list stays on the list; from the set's own page goes to the list
  store.deleteSet(b.id);
  assert.equal(store.screen, 'sheet');
  store.openSet(a.id);
  store.deleteSet(a.id);
  assert.equal(store.screen, 'sheet');
  assert.ok(store.note.includes('Set 1'), store.note);
  assert.deepEqual(
    store.currentSheet.sets.map(s => s.name),
    ['Mine'],
  );
});

test('updateSet: the set page saves pieces, pins and the meal through it', () => {
  const store = makeStore();
  store.createSheet(FIELDS);
  const { id } = store.newSet();
  const pieces = sageSet().pieces;
  assert.deepEqual(store.updateSet(id, { pieces, pinned: { pieces: [2], meal: false } }), { ok: true });
  assert.deepEqual(store.currentSet.pieces, pieces);
  const gone = store.updateSet('nope', {});
  assert.deepEqual([gone.ok, gone.error !== ''], [false, true]);
});

test('Copy sheet: asks to accept clearing pieces the job cannot wear, then lands on the manager with the copy on top', () => {
  const store = makeStore();
  const { id } = store.createSheet({ ...FIELDS, job: 'WHM', name: 'White' });
  const set = store.newSet();
  const pieces = sageSet().pieces.map((row, i) => (i === 0 ? piece('weapon', WHM_CANE) : row));
  store.updateSet(set.id, { pieces, pinned: { pieces: [0], meal: false } });
  const fields = { name: 'Astro', job: 'AST', level: 90, sync: { on: true, cap: 660 } };
  assert.deepEqual(
    store.copySheet(id, fields),
    { ok: false, error: ACK_REQUIRED_TEXT, field: FORM_FIELD.ack },
    'not without accepting the cleared cane',
  );
  const copied = store.copySheet(id, fields, true);
  assert.equal(copied.ok, true);
  assert.deepEqual([store.screen, store.list().sheets[0].id], ['sheets', copied.id]);
  assert.equal(store.note, copiedNote('Astro')); // the new name only: the cleared pieces are not counted
  const copy = store.sheet(copied.id);
  assert.deepEqual(
    [copy.job, copy.level, copy.sync, copy.sets[0].pieces[0], copy.sets[0].pinned.pieces],
    ['AST', 90, { on: true, cap: 660 }, { slot: 'weapon' }, []],
  );
  assert.deepEqual(store.copySheet(id, { ...fields, name: ' ' }, true), { ok: false, error: EMPTY_NAME_TEXT, field: FORM_FIELD.name });
  // to its own job: nothing to clear, no question
  assert.equal(store.copySheet(id, { ...fields, job: 'WHM', name: 'White (1)' }).ok, true);
});

test('a sheet that is gone is refused with no field: the reason is about the sheet, not a box', () => {
  const store = makeStore();
  const { id } = store.createSheet(FIELDS);
  store.deleteSheet(id);
  const gone = { ok: false, error: SHEET_GONE_TEXT };
  assert.deepEqual(store.editSheet(id, { name: 'x', description: '' }), gone);
  assert.deepEqual(store.copySheet(id, FIELDS, true), gone);
  assert.deepEqual(store.deleteSheet(id), gone);
});

test('deleting a sheet: from its page goes to the manager; from the manager stays there; the record is gone', () => {
  const storage = fakeStorage();
  const store = makeStore(storage);
  const a = store.createSheet(FIELDS);
  const b = store.createSheet({ ...FIELDS, name: 'Other' });
  store.deleteSheet(b.id);
  assert.equal(store.screen, 'sheets');
  assert.ok(store.note.includes('Other'), store.note);
  assert.equal(storage.getItem(sheetKey(b.id)), null);
  store.openManager();
  store.deleteSheet(a.id);
  assert.equal(store.screen, 'sheets');
  assert.deepEqual(makeStore(storage).list().sheets, []);
});

test('reordering: a drop moves the row and saves the order; the keyboard says where it went', () => {
  const storage = fakeStorage();
  const store = makeStore(storage);
  for (const name of ['C', 'B', 'A']) store.createSheet({ ...FIELDS, name });
  store.openManager();
  store.moveSheet(0, 2);
  assert.deepEqual(
    store.list().sheets.map(s => s.name),
    ['B', 'C', 'A'],
  );
  assert.equal(store.stepSheet(2, -1), 1);
  assert.equal(store.stepSheet(0, -1), 0);
  assert.deepEqual(
    makeStore(storage)
      .list()
      .sheets.map(s => s.name),
    ['B', 'A', 'C'],
  );
  // gear sets of the open sheet, the same way
  store.openSheet(store.list().sheets[0].id);
  store.newSet();
  store.closeSet();
  store.newSet();
  store.closeSet();
  assert.equal(store.stepSet(1, -1), 0);
  store.moveSet(0, 1);
  assert.deepEqual(
    store.currentSheet.sets.map(s => s.name),
    ['Set 1', 'Set 2'],
  );
});

test('while an Auto-fill runs every edit is refused; opening screens still works', () => {
  const store = makeStore();
  const { id } = store.createSheet(FIELDS);
  store.busy = true;
  const refused = { ok: false, error: LOCKED_TEXT };
  assert.deepEqual(store.createSheet(FIELDS), refused);
  assert.deepEqual(store.editSheet(id, { name: 'x' }), refused);
  assert.deepEqual(store.copySheet(id, FIELDS, true), refused);
  assert.deepEqual(store.deleteSheet(id), refused);
  assert.deepEqual(store.moveSheet(0, 0), refused);
  assert.deepEqual(store.setLevel(50), refused);
  assert.deepEqual(store.newSet(), refused);
  assert.equal(store.stepSheet(0, 1), 0);
  store.openManager();
  store.openSheet(id);
  assert.equal(store.screen, 'sheet');
});

test('a full storage: the edit stays in memory with the message, and survives a reload until a save works', () => {
  const storage = fakeStorage();
  const store = makeStore(storage);
  const { id } = store.createSheet(FIELDS);
  storage.failWith = quotaError();
  const result = store.editSheet(id, { name: 'Renamed', description: '' });
  assert.deepEqual(result, { ok: true });
  assert.equal(store.saveMessage, QUOTA_MESSAGE);
  assert.equal(store.sheet(id).name, 'Renamed');
  store.openSheet(id); // reads storage again
  assert.equal(store.sheet(id).name, 'Renamed', 'the unsaved edit is kept');
  storage.failWith = null;
  store.setLevel(90);
  assert.equal(store.saveMessage, '');
  assert.equal(makeStore(storage).sheet(id).name, 'Renamed');
});

test('a full storage on a reorder: the order stays in memory with the message, and survives a reload until a save works', () => {
  const storage = fakeStorage();
  const store = makeStore(storage);
  const a = store.createSheet({ ...FIELDS, name: 'A' }).id;
  const b = store.createSheet({ ...FIELDS, name: 'B' }).id;
  store.openManager();
  assert.deepEqual(
    store.list().sheets.map(s => s.name),
    ['B', 'A'],
  );
  storage.failWith = quotaError();
  assert.equal(store.moveSheet(0, 1).ok, false);
  assert.equal(store.saveMessage, QUOTA_MESSAGE);
  // the manager reads storage again: the order from memory, not the old index
  store.openManager();
  assert.deepEqual(
    store.list().sheets.map(s => s.id),
    [a, b],
  );
  assert.equal(store.saveMessage, QUOTA_MESSAGE, 'the message stays while the order is unsaved');
  // a sheet saved meanwhile does not clear the message: the order is still only in memory
  storage.failWith = null;
  store.openSheet(a);
  store.setLevel(90);
  assert.equal(store.saveMessage, QUOTA_MESSAGE);
  // the next reorder saves: the message goes, and a new store (a reload) reads that order
  store.openManager();
  store.moveSheet(0, 1);
  store.moveSheet(0, 1);
  assert.equal(store.saveMessage, '');
  assert.deepEqual(
    makeStore(storage)
      .list()
      .sheets.map(s => s.id),
    [a, b],
  );
});

test('no storage at all: sheets live in memory; a record that cannot be read is listed and can be deleted', () => {
  const memory = makeStore(null);
  assert.equal(memory.list().available, false);
  const { id } = memory.createSheet(FIELDS);
  memory.openManager();
  assert.equal(memory.sheet(id).name, 'Bahamut');

  const storage = fakeStorage();
  saveSheet(sheetOf('SGE', [], { id: 's_ok' }), storage);
  storage.setItem(sheetKey('s_bad'), '{not json');
  const store = makeStore(storage);
  assert.deepEqual(
    store.list().unreadable.map(u => [u.id, u.cause]),
    [['s_bad', 'not valid JSON']],
  );
  assert.deepEqual(store.deleteUnreadable('s_bad'), { ok: true });
  assert.deepEqual(store.list().unreadable, []);
  assert.equal(storage.getItem(sheetKey('s_bad')), null);
});

/* The set page holds a move off it back while it has something unsaved or running (components/set-page.js guardLeave):
   the store asks its leave guard first, on a set page only, and the move runs again once answered. */
test('leaving a set page asks its leave guard first; other screens never ask', () => {
  const store = makeStore();
  const { id } = store.createSheet(FIELDS);
  const asked = [];
  let hold = true;
  store.leaveGuard = move => {
    asked.push(move);
    return hold;
  };
  store.openManager();
  assert.equal(asked.length, 0, 'not on a set page');
  store.openSheet(id);
  store.newSet();
  const setId = store.setId;
  assert.equal(store.screen, 'set');
  for (const leave of [() => store.closeSet(), () => store.openManager(), () => store.openSheet(id)]) leave();
  assert.deepEqual([asked.length, store.screen, store.setId], [3, 'set', setId], 'every way off is held');
  store.openSet(setId);
  assert.equal(asked.length, 3, 'the set already open is no move');
  hold = false;
  asked[0]();
  assert.deepEqual([store.screen, store.setId], ['sheet', null], 'the held move, run once answered');
});

/* The sheet's cap follows its level as on the Job and sync panel (level-cap.js limitCapToLevel; owner's report, 2026-11-10).
   Level 70 allows item level 405 at most (its weapons), level 50 allows 135. Each change returns what it lowered. */
test('the cap follows the level: lowered when typed, when the level changes, when sync is switched on', () => {
  const store = makeStore();
  store.createSheet({ ...FIELDS, level: 70, sync: { on: true, cap: 300 } });
  assert.deepEqual(store.setCap(500), { ok: true, lowered: { from: 500, to: 405, level: 70 } });
  assert.equal(store.currentSheet.sync.cap, 405);
  assert.deepEqual(store.setCap(500).lowered, { from: 500, to: 405, level: 70 }, 'typed again: nothing to save, the note again');
  assert.deepEqual(store.setLevel(50), { ok: true, lowered: { from: 405, to: 135, level: 50 } });
  assert.equal(store.currentSheet.sync.cap, 135);
  assert.deepEqual(store.setLevel(70), { ok: true, lowered: null }, 'never raised');
  assert.equal(store.currentSheet.sync.cap, 135);
  store.setSyncOn(false);
  store.setCap(700);
  assert.deepEqual(store.currentSheet.sync, { on: false, cap: 700 }, 'kept while sync is off');
  assert.deepEqual(store.setSyncOn(true).lowered, { from: 700, to: 405, level: 70 });
  assert.deepEqual(store.currentSheet.sync, { on: true, cap: 405 });
  // at level 100 the ceiling is the highest real item level
  store.setLevel(100);
  assert.deepEqual(store.setCap(900).lowered, { from: 900, to: MAX_REAL, level: 100 });
});

test('New sheet and Copy sheet: a cap above what the level allows is lowered', () => {
  const store = makeStore();
  const { id } = store.createSheet({ ...FIELDS, level: 70, sync: { on: true, cap: 500 } });
  assert.deepEqual(store.sheet(id).sync, { on: true, cap: 405 });
  const copied = store.copySheet(id, { name: 'Lv 50', job: 'SGE', level: 50, sync: { on: true, cap: 405 } });
  assert.deepEqual([store.sheet(copied.id).level, store.sheet(copied.id).sync], [50, { on: true, cap: 135 }]);
});

test('a saved sheet whose level or cap is out of range is repaired as it is read', () => {
  const storage = fakeStorage();
  saveSheet(sheetOf('SGE', [], { id: 's_cap', level: 70, sync: { on: true, cap: 500 } }), storage);
  saveSheet(sheetOf('BLU', [], { id: 's_lvl', level: 95, sync: { on: true, cap: 2000 } }), storage);
  saveSheet(sheetOf('SGE', [], { id: 's_off', level: 70, sync: { on: false, cap: 500 } }), storage);
  const store = makeStore(storage);
  const read = id => [store.sheet(id).level, store.sheet(id).sync];
  assert.deepEqual(read('s_cap'), [70, { on: true, cap: 405 }]);
  assert.deepEqual(read('s_lvl'), [80, { on: true, cap: capCeiling(80) }], "Blue Mage's level cap, then that level's ceiling");
  assert.deepEqual(read('s_off'), [70, { on: false, cap: 500 }], 'kept while sync is off');
  store.reload();
  assert.deepEqual(read('s_cap'), [70, { on: true, cap: 405 }], 'read again');
});
