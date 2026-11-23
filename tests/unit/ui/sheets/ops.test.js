/* Making and changing saved sheets as plain data (src/ui/sheets/ops.js): names and descriptions as stored, the default
   names, a new sheet and gear set (both readable by sheets/storage.js), Copy sheet with the pieces the new job cannot
   wear cleared (a real White Mage cane), and moving a list's rows. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_REAL } from '../../../../src/core/tables.js';
import { capCeiling } from '../../../../src/core/sync-target.js';
import { SET_ROW_SLOTS, parseSheet } from '../../../../src/ui/sheets/storage.js';
import {
  DESCRIPTION_MAX_LENGTH,
  NAME_MAX_LENGTH,
  capFor,
  cleanDescription,
  cleanName,
  copyGearSet,
  copyName,
  copySheet,
  defaultSetName,
  defaultSheetName,
  gameDataStamp,
  levelFor,
  moveItem,
  newGearSet,
  newSheet,
  piecesToClear,
  ranges,
  sheetSettings,
} from '../../../../src/ui/sheets/ops.js';
import { WHM_CANE, piece, sageSet, sheetOf } from '../../helpers/sheet-fixtures.js';

const AT = Date.UTC(2026, 10, 9, 12);

test('names: trimmed, empty means refused, no limit on the data; descriptions keep their lines', () => {
  assert.equal(cleanName('  Bahamut  '), 'Bahamut');
  assert.equal(cleanName('   '), '');
  assert.equal(cleanName('x'.repeat(NAME_MAX_LENGTH + 10)).length, NAME_MAX_LENGTH + 10); // only the text box limits
  assert.equal(cleanDescription('  Week 1\r\nWeek 2  '), 'Week 1\nWeek 2');
  assert.equal(cleanDescription('y'.repeat(DESCRIPTION_MAX_LENGTH + 1)).length, DESCRIPTION_MAX_LENGTH + 1);
});

test('default names: a sheet by job, level and sync; a set "Set N", the smallest unused', () => {
  assert.equal(defaultSheetName({ job: 'SGE', level: 100, sync: { on: false, cap: 795 } }), 'Sage Lv 100');
  assert.equal(defaultSheetName({ job: 'WHM', level: 70, sync: { on: true, cap: 375 } }), 'White Mage Lv 70 ilvl 375');
  assert.equal(defaultSheetName({ job: '', level: 100, sync: { on: false } }), '');
  const sheet = sheetOf('SGE', [sageSet({ name: 'Set 1' }), sageSet({ id: 'g_3', name: 'Set 3' })]);
  assert.equal(defaultSetName(sheet), 'Set 2');
  assert.equal(defaultSetName(sheetOf('SGE', [])), 'Set 1');
});

test('copy names: "(1)", then the first number free; a copy of "X (1)" is "X (2)"; a long name is cut to fit the limit', () => {
  assert.equal(copyName('UwU', ['UwU']), 'UwU (1)');
  assert.equal(copyName('UwU', ['UwU', 'UwU (1)']), 'UwU (2)');
  assert.equal(copyName('UwU (1)', ['UwU', 'UwU (1)']), 'UwU (2)');
  const long = 'z'.repeat(NAME_MAX_LENGTH);
  const copy = copyName(long, [long]);
  assert.equal(copy, `${'z'.repeat(NAME_MAX_LENGTH - 4)} (1)`);
  assert.equal(copy.length, NAME_MAX_LENGTH);
  // a copy of that copy, and a space left at the cut is dropped
  assert.equal(copyName(copy, [long, copy]), `${'z'.repeat(NAME_MAX_LENGTH - 4)} (2)`);
  const spaced = `${'a'.repeat(NAME_MAX_LENGTH - 5)} b`;
  assert.equal(copyName(spaced, [spaced]), `${'a'.repeat(NAME_MAX_LENGTH - 5)} (1)`);
});

test('levels and caps as typed: whole numbers held to the job and the real item levels', () => {
  assert.deepEqual(
    [levelFor('SGE', '90', 1), levelFor('BLU', 95, 1), levelFor('BST', 0, 7), levelFor('SGE', '', 42), levelFor('SGE', 'x', 42)],
    [90, 80, 1, 42, 42],
  );
  assert.deepEqual([capFor('123', 1), capFor(9999, 1), capFor(0, 5), capFor('', 6)], [123, MAX_REAL, 1, 6]);
});

test('a new sheet and a new gear set have the saved shape and read back from storage', () => {
  const sheet = newSheet({ name: 'Bahamut', description: 'Week 1', job: 'SGE', level: 100, sync: { on: true, cap: 123 } }, 's_new', AT);
  assert.deepEqual(sheet.gameData, gameDataStamp());
  assert.match(sheet.gameData.commit, /^[0-9a-f]{7}$/);
  assert.match(sheet.gameData.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual([sheet.v, sheet.sets, sheet.createdAt, sheet.updatedAt], [1, [], AT, AT]);
  const gearSet = newGearSet('Set 1', 'g_new', AT);
  assert.deepEqual(
    gearSet.pieces.map(row => row.slot),
    SET_ROW_SLOTS,
  );
  assert.equal(gearSet.pieces.length, 12);
  assert.deepEqual(
    [gearSet.meal, gearSet.pinned, gearSet.fillSettings, gearSet.description],
    [null, { pieces: [], meal: false }, null, ''],
  );
  const withSet = { ...sheet, sets: [gearSet] };
  assert.deepEqual(parseSheet(JSON.stringify(withSet), 's_new'), { sheet: withSet });
});

test('a copied gear set keeps pieces, stones, pins and notes under a new id and name', () => {
  const original = { ...sageSet({ pinned: { pieces: [2], meal: false } }), description: 'notes' };
  const copy = copyGearSet(original, 'Set 1 (1)', 'g_c', AT);
  assert.deepEqual([copy.id, copy.name, copy.createdAt, copy.description], ['g_c', 'Set 1 (1)', AT, 'notes']);
  assert.deepEqual(copy.pieces, original.pieces);
  assert.notEqual(copy.pieces, original.pieces, 'a deep copy');
  assert.deepEqual(copy.pinned, original.pinned);
});

test("Copy sheet to another healer: the White Mage's cane is listed, emptied in the copy and its pin dropped", () => {
  const whmSet = sageSet({ pinned: { pieces: [0, 2], meal: false } });
  whmSet.pieces[0] = piece('weapon', WHM_CANE);
  const sheet = sheetOf('WHM', [whmSet, sageSet({ id: 'g_2', name: 'Set 2' })], { level: 50, description: 'notes' });
  assert.deepEqual(piecesToClear(sheet, 'WHM'), [], 'its own job clears nothing');
  assert.deepEqual(piecesToClear(sheet, 'AST'), [
    { setId: 'g_1', setName: 'Set 1', index: 0, slot: 'weapon', name: 'Ironworks Magitek Cane' },
  ]);
  let next = 0;
  const copy = copySheet(sheet, { name: 'Astro', job: 'AST', level: 60, sync: { on: false, cap: 300 } }, 's_c', AT, () => `g_${++next}x`);
  assert.deepEqual(
    [copy.id, copy.name, copy.job, copy.level, copy.sync, copy.description],
    ['s_c', 'Astro', 'AST', 60, { on: false, cap: 300 }, 'notes'],
  );
  assert.deepEqual(
    copy.sets.map(s => [s.id, s.name]),
    [
      ['g_1x', 'Set 1'],
      ['g_2x', 'Set 2'],
    ],
  );
  assert.deepEqual(copy.sets[0].pieces[0], { slot: 'weapon' });
  assert.deepEqual(copy.sets[0].pinned.pieces, [2]);
  assert.deepEqual(copy.sets[0].pieces.slice(2), whmSet.pieces.slice(2), 'the armor every healer wears stays');
  assert.equal(sheet.sets[0].pieces[0].gameId, WHM_CANE, 'the original is not changed');
  assert.ok(parseSheet(JSON.stringify(copy), 's_c').sheet);
});

test('moveItem: one row to another place; out of range changes nothing', () => {
  assert.deepEqual(moveItem(['a', 'b', 'c'], 0, 2), ['b', 'c', 'a']);
  assert.deepEqual(moveItem(['a', 'b', 'c'], 2, 0), ['c', 'a', 'b']);
  assert.deepEqual(moveItem(['a', 'b'], 0, 5), ['a', 'b']);
});

/* A sheet's level and cap follow the Job and sync panel's rule (level-cap.js limitCapToLevel; owner's report, 2026-11-10:
   the sheet page took a cap above what its level allows). Level 70: the best gear made for it is item level 405 (the
   level 70 weapons, 5 above the level's 400); level 50: 135. */
test('sheetSettings: the cap is lowered to what the level allows, as on the Job and sync panel', () => {
  const at = (jobId, level, on, cap, fallback) => sheetSettings(jobId, { level, sync: { on, cap } }, fallback);
  assert.deepEqual(at('SGE', 70, true, 500), { level: 70, sync: { on: true, cap: 405 }, lowered: { from: 500, to: 405, level: 70 } });
  assert.deepEqual(at('SGE', 50, true, '300'), { level: 50, sync: { on: true, cap: 135 }, lowered: { from: 300, to: 135, level: 50 } });
  // at level 100 the ceiling is the highest real item level
  assert.deepEqual(at('SGE', 100, true, 900), {
    level: 100,
    sync: { on: true, cap: MAX_REAL },
    lowered: { from: 900, to: MAX_REAL, level: 100 },
  });
  assert.deepEqual(at('BLU', 80, true, 700).sync, { on: true, cap: capCeiling(80) }, "Blue Mage's own level cap: the level's ceiling");
  // never raised (a real duty's low cap), and kept while sync is off (it is lowered when sync is switched on)
  assert.deepEqual(at('SGE', 70, true, 123), { level: 70, sync: { on: true, cap: 123 }, lowered: null });
  assert.deepEqual(at('SGE', 70, false, 500), { level: 70, sync: { on: false, cap: 500 }, lowered: null });
  assert.deepEqual(at('SGE', 70, false, 5000).sync.cap, MAX_REAL, 'held to the real item levels while sync is off too');
  // the level is held to the job first, then the cap follows it; no number keeps the fallback
  assert.deepEqual(at('SGE', 120, true, 795).level, 100);
  assert.deepEqual(at('SGE', '', true, '', { level: 70, cap: 405 }), { level: 70, sync: { on: true, cap: 405 }, lowered: null });
  assert.deepEqual(at('SGE', 0, true, 0).sync.cap, 1);
});

/* The Job and sync panel's cases (ui/level-cap.test.js, limitCapToLevel) through a sheet's settings: the same rule. */
test("sheetSettings: the Job and sync panel's cap cases", () => {
  for (const [cap, level, want] of [
    [500, 50, 135], // level 50's weapons
    [500, 55, 136], // between level caps: the level's own item level
    [700, 90, 665], // Aloalo Island's cap
    [999, 50, 135], // above the highest real item level too
  ]) {
    const got = sheetSettings('SGE', { level, sync: { on: true, cap } });
    assert.deepEqual([got.sync.cap, got.lowered], [want, { from: cap, to: want, level }], `cap ${cap} level ${level}`);
  }
  assert.deepEqual(sheetSettings('SGE', { level: 100, sync: { on: true, cap: 999 } }).lowered, { from: 999, to: MAX_REAL, level: 100 });
  for (const [cap, level, on] of [
    [123, 50, true], // T13: never raised
    [135, 50, true],
    [MAX_REAL, 100, true], // no gear above level 100
    [500, 50, false],
  ]) {
    const got = sheetSettings('SGE', { level, sync: { on, cap } });
    assert.deepEqual([got.sync.cap, got.lowered], [cap, null], `cap ${cap} level ${level} sync ${on}`);
  }
});

test('ranges: the level cap of the job and the highest real item level, with their range texts', () => {
  assert.deepEqual(ranges('SGE'), { level: { max: 100, rangeText: '1–100' }, cap: { max: MAX_REAL, rangeText: `1–${MAX_REAL}` } });
  assert.deepEqual(ranges('BLU').level, { max: 80, rangeText: '1–80' });
  assert.deepEqual(ranges('BST').level, { max: 50, rangeText: '1–50' });
  assert.equal(ranges(null).level.max, 100, 'no job chosen: the default job');
  assert.equal(MAX_REAL, 795);
});
