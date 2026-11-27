/* A sheet's clan and party bonus in the sheet ops (src/ui/sheets/ops.ts): a new sheet has none, a copy keeps both
   whatever job and settings it is copied to, and the source sheet is not changed. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copySheet, newSheet } from '../../../../src/ui/sheets/ops.ts';
import { sageSet, sheetOf } from '../../helpers/fixtures/sheet-fixtures.ts';

const FIELDS = { name: 'Bahamut', job: 'SGE', level: 100, sync: { on: true, cap: 123 } };

test('a new sheet has no clan and no party bonus', () => {
  const sheet = newSheet(FIELDS, 's_1', 1000);
  assert.deepEqual([sheet.clan, sheet.partyRoles, sheet.v], [null, 0, 1]);
});

test('Copy sheet keeps the clan and the party bonus, for the same job and for another', () => {
  const sheet = { ...sheetOf('SGE', [sageSet()]), clan: 'Highlander', partyRoles: 3 };
  const same = copySheet(sheet, { ...FIELDS, name: 'Copy' }, 's_2', 2000, () => 'g_2');
  assert.deepEqual([same.clan, same.partyRoles], ['Highlander', 3]);
  const other = copySheet(
    sheet,
    { ...FIELDS, name: 'Copy', job: 'WHM', level: 90, sync: { on: false, cap: 400 } },
    's_3',
    2000,
    () => 'g_3',
  );
  assert.deepEqual([other.clan, other.partyRoles], ['Highlander', 3]);
  assert.deepEqual([sheet.clan, sheet.partyRoles], ['Highlander', 3]);
});

test('Copy sheet of a sheet from before the clan and party bonus gives a copy with none', () => {
  const copy = copySheet(sheetOf('SGE', [sageSet()]), { ...FIELDS, name: 'Copy' }, 's_2', 2000, () => 'g_2');
  assert.deepEqual([copy.clan, copy.partyRoles], [null, 0]);
});
