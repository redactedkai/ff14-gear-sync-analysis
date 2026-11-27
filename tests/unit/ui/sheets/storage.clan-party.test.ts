/* A sheet's clan and party bonus in the saved record (src/ui/sheets/storage.ts): a record from before them reads as no
   clan and no party bonus, a field of the wrong type makes the record unreadable like any other damaged field, a clan
   name this build does not know is not damage (it reads as no clan), and both fields survive a save and a read. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSheets, parseSheet, saveSheet } from '../../../../src/ui/sheets/storage.ts';
import { mustFind } from '../../helpers/fixtures/common.ts';
import { causeOf, fakeStorage, readable, sageSet, sheetOf } from '../../helpers/fixtures/sheet-fixtures.ts';

/* The text of a saved record of a Sage sheet with `extra` fields added (or replaced). */
const record = (extra: object) => JSON.stringify({ ...sheetOf('SGE', [sageSet()]), ...extra });

test('a record saved before the clan and party bonus is read as written: the fields stay missing, which means none', () => {
  const read = parseSheet(record({}), 's_1');
  assert.deepEqual(read.sheet, sheetOf('SGE', [sageSet()]));
  assert.deepEqual([readable(read).clan ?? null, readable(read).partyRoles ?? 0], [null, 0]);
});

test('a clan and a party bonus are read back as saved, through a save and a load', () => {
  const storage = fakeStorage();
  assert.ok(saveSheet({ ...sheetOf('SGE', [sageSet()]), clan: 'Midlander', partyRoles: 5 }, storage).ok);
  const sheet = mustFind(loadSheets(storage).sheets[0], 'the saved sheet');
  assert.deepEqual([sheet.clan, sheet.partyRoles], ['Midlander', 5]);
});

test('a clan name this build does not know reads as no clan, and the record stays readable', () => {
  const read = parseSheet(record({ clan: 'Gridanian', partyRoles: 2 }), 's_1');
  assert.deepEqual([read.cause, readable(read).clan, readable(read).partyRoles], [undefined, null, 2]);
});

test('a clan that is not text or null, and party roles that are not a whole number from 0 to 5, make the record unreadable', () => {
  for (const clan of [3, true, {}, ['Midlander']]) {
    assert.match(causeOf(parseSheet(record({ clan }), 's_1')), /clan/, JSON.stringify(clan));
  }
  for (const partyRoles of [-1, 6, 2.5, '3', null, NaN, true, [1]]) {
    assert.match(causeOf(parseSheet(record({ partyRoles }), 's_1')), /party/, JSON.stringify(partyRoles));
  }
  // an explicit null clan is no clan, not damage
  assert.equal(readable(parseSheet(record({ clan: null }), 's_1')).clan, null);
});

test('a damaged record is listed with its cause and never rewritten by a load', () => {
  const storage = fakeStorage();
  saveSheet(sheetOf('SGE', [sageSet()]), storage);
  const key = mustFind(
    [...storage.data.keys()].find(name => name.includes(':sheet:')),
    'the sheet record key',
  );
  const damaged = record({ partyRoles: 9 });
  storage.setItem(key, damaged);
  const loaded = loadSheets(storage);
  assert.equal(loaded.sheets.length, 0);
  assert.equal(loaded.unreadable.length, 1);
  assert.match(mustFind(mustFind(loaded.unreadable[0], 'the unreadable record').cause, 'its cause'), /party/);
  assert.equal(storage.getItem(key), damaged);
});
