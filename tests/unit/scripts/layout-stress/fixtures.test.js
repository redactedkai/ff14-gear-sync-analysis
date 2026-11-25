/* The layout stress tool's saved sheets (scripts/layout-stress/fixtures.mjs): every record is one the page reads, and the extremes are at the page's own limits. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSheet } from '../../../../src/ui/sheets/storage.js';
import {
  DESCRIPTION_MAX,
  MANY_SETS,
  NAME_MAX,
  emptyFixture,
  extremeFixture,
  longestPieces,
  noSheetsFixture,
  readJobIds,
  readTestSheets,
  seedArgument,
  standardFixture,
  withStressNumbers,
} from '../../../../scripts/layout-stress/fixtures.mjs';

const testSheets = readTestSheets();
const jobIds = await readJobIds();
const longest = await longestPieces();

/* The page reads each record: a fixture the page cannot read would be a finding about the fixture. */
function assertReadable(fixture) {
  for (const sheet of fixture.sheets) {
    const read = parseSheet(JSON.stringify(sheet), sheet.id);
    assert.ok(read.sheet, `${sheet.id}: ${read.cause}`);
  }
  assert.equal(new Set(fixture.sheets.map(sheet => sheet.id)).size, fixture.sheets.length, 'sheet ids are unique');
}

test('the page limits the tool copies are the real ones: names of 60 characters, descriptions of 400', () => {
  assert.equal(NAME_MAX, 60);
  assert.equal(DESCRIPTION_MAX, 400);
});

test('the standard fixture is the shipped test sheets, with a set that holds pieces to open', () => {
  const fixture = standardFixture(testSheets);
  assertReadable(fixture);
  assert.equal(fixture.sheets.length, testSheets.length);
  const sheet = fixture.sheets.find(item => item.id === fixture.open.sheetId);
  const set = sheet.sets.find(item => item.id === fixture.open.setId);
  assert.ok(set.pieces.some(piece => piece.gameId));
});

test('the extreme fixture has all 23 jobs, the longest names, 40 gear sets on one sheet and the longest pieces', () => {
  const fixture = extremeFixture(testSheets, jobIds, longest);
  assertReadable(fixture);
  assert.equal(jobIds.length, 23);
  for (const job of jobIds) {
    assert.ok(
      fixture.sheets.some(sheet => sheet.job === job),
      job,
    );
  }
  for (const sheet of fixture.sheets) {
    assert.ok(sheet.name.length <= NAME_MAX, sheet.name);
    assert.ok(sheet.description.length <= DESCRIPTION_MAX);
    for (const set of sheet.sets) {
      assert.ok(set.name.length <= NAME_MAX && set.description.length <= DESCRIPTION_MAX, set.name);
    }
  }
  const wide = fixture.sheets.find(sheet => sheet.id === fixture.open.sheetId);
  assert.equal(wide.sets.length, MANY_SETS);
  assert.equal(wide.name.length, NAME_MAX);
  const open = wide.sets.find(set => set.id === fixture.open.setId);
  assert.ok(open.pieces.filter(piece => piece.gameId).length >= 8, 'the open set holds the longest pieces');
});

test('the empty fixture has a sheet with no gear sets and a set with no pieces; the none fixture has no sheets', () => {
  const fixture = emptyFixture(testSheets);
  assertReadable(fixture);
  assert.equal(fixture.sheets.find(sheet => sheet.id === fixture.open.emptySheetId).sets.length, 0);
  assert.ok(fixture.sheets.find(sheet => sheet.id === fixture.open.emptySetSheetId).sets[0].pieces.every(piece => !piece.gameId));
  assert.deepEqual(noSheetsFixture().sheets, []);
});

test('the stress numbers put every sheet at the widest level and item level, with sync on, and leave the original alone', () => {
  const fixture = standardFixture(testSheets);
  const wide = withStressNumbers(fixture, 888, 8888);
  assert.ok(wide.sheets.every(sheet => sheet.level === 888 && sheet.sync.cap === 8888 && sheet.sync.on));
  assert.ok(fixture.sheets.every(sheet => sheet.level !== 888));
});

test("the seed argument holds the sheets and the failing-writes switch for the page's storage", () => {
  const argument = seedArgument(noSheetsFixture(), true);
  assert.equal(argument.failWrites, true);
  assert.match(argument.recordKeyPrefix, /:sheet:$/);
  assert.match(argument.indexKey, /:sheets$/);
});
