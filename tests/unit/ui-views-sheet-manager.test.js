/* The sheet manager and a sheet's page (src/ui/views/sheet-manager.js, sheet-sets.js): list rows, empty states, the
   unreadable records, the settings fields and the set list, with real Sage and Warrior sets. */
// the manager's dates are in the reader's time zone: the test reads them in UTC
process.env.TZ = 'UTC';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_REAL } from '../../src/core/tables.js';
import { UNAVAILABLE_MESSAGE } from '../../src/ui/sheet-storage.js';
import { sheetManagerView } from '../../src/ui/views/sheet-manager.js';
import { setHeaderView, sheetPageView } from '../../src/ui/views/sheet-sets.js';
import { plural } from '../../src/ui/helpers.js';
import { localDate, settingsLine, syncShort } from '../../src/ui/views/sheet-text.js';
import { sageSet, sheetOf, warSet } from './helpers/sheet-fixtures.js';

const loaded = (sheets, extra = {}) => ({ available: true, sheets, unreadable: [], indexProblem: null, ...extra });

test('the manager: one row per sheet in the given order, with job, settings, set count, dates and game data', () => {
  const bahamut = sheetOf('SGE', [sageSet(), sageSet({ id: 'g_2', name: 'Set 2' })], {
    id: 's_a',
    name: 'Bahamut T13 Healer',
    description: 'Savage Bahamut, week 1\nsecond line',
  });
  const uwu = sheetOf('WAR', [], { id: 's_b', name: 'UwU', level: 70, sync: { on: false, cap: 375 } });
  const v = sheetManagerView(loaded([bahamut, uwu]));
  assert.deepEqual([v.empty, v.showNewButton, v.unavailableText], [false, true, '']);
  assert.deepEqual(v.columns, ['Sheet', 'Job', 'Level, sync', 'Sets', 'Created', 'Changed', 'Game data']);
  assert.deepEqual(v.rows[0], {
    id: 's_a',
    name: 'Bahamut T13 Healer',
    descriptionLine: 'Savage Bahamut, week 1',
    hasDescription: true,
    jobId: 'SGE',
    jobName: 'Sage',
    settingsText: 'Lv 100, ilvl 123',
    setCount: 2,
    created: '2025-11-09',
    changed: '2025-11-09',
    gameData: '2026-09-30',
  });
  assert.deepEqual(
    [v.rows[1].jobName, v.rows[1].settingsText, v.rows[1].descriptionLine, v.rows[1].hasDescription, v.rows[1].setCount],
    ['Warrior', 'Lv 70, ilvl sync off', 'No description', false, 0],
  );
});

test('the manager: the empty state, storage that cannot be used, an unreadable order and unreadable records', () => {
  const none = sheetManagerView(loaded([]));
  assert.deepEqual(
    [none.empty, none.showNewButton, none.emptyCard.title, none.emptyCard.buttonText],
    [true, false, 'No sheets yet', 'New sheet'],
  );
  const blocked = sheetManagerView({ available: false, sheets: [], unreadable: [], indexProblem: null });
  assert.equal(blocked.unavailableText, UNAVAILABLE_MESSAGE);
  const damaged = sheetManagerView(
    loaded([], {
      unreadable: [{ id: 's_x', key: 'ilvl-stat-lab-v4:sheet:s_x', cause: 'written by a newer version of the page (v2)' }],
    }),
  );
  assert.deepEqual(damaged.unreadable, [
    {
      id: 's_x',
      key: 'ilvl-stat-lab-v4:sheet:s_x',
      cause: 'written by a newer version of the page (v2)',
      text: 'Could not be read: written by a newer version of the page (v2)',
    },
  ]);
  assert.equal(damaged.unreadableTitle, 'Could not be read');
});

test('the sheet page: settings fields with their ranges, the job fixed, a one-line description state', () => {
  const sheet = sheetOf('SGE', [sageSet()], { name: 'Bahamut T13 Healer', description: '' });
  const v = sheetPageView(sheet);
  assert.deepEqual(v.crumbs, [
    { text: 'Sheets', to: 'sheets' },
    { text: 'Bahamut T13 Healer', here: true },
  ]);
  assert.deepEqual(v.description, { text: 'No description', empty: true });
  assert.deepEqual(v.job, { id: 'SGE', name: 'Sage' });
  assert.deepEqual(v.level, { value: 100, max: 100, rangeText: '1–100' });
  assert.deepEqual(v.sync, { on: true, cap: 123, max: MAX_REAL, rangeText: `1–${MAX_REAL}` });
  // Blue Mage and Beastmaster stop below the game's level cap
  assert.equal(sheetPageView(sheetOf('BLU', [], { level: 80 })).level.rangeText, '1–80');
  assert.equal(sheetPageView(sheetOf('BST', [], { level: 50 })).level.max, 50);
  assert.equal(sheetPageView(sheetOf('SGE', [], { description: 'Savage' })).description.text, 'Savage');
});

test('the sheet page: a set row has counts of pinned and unpinned slots and the header figures; empty rows are counted', () => {
  const pinned = sageSet({ pinned: { pieces: [2, 3, 0], meal: false } });
  const v = sheetPageView(sheetOf('SGE', [pinned, warSet()]));
  assert.equal(v.setCount, 2);
  assert.equal(v.empty, false);
  assert.deepEqual(v.columns, ['MND', 'GCD', 'CRT', 'Crit dmg', 'DET', 'DHT', 'PIE', 'DoT']);
  // 11 rows are used: rows 2 and 3 hold a piece and are pinned (row 0 is empty, so its pin counts for nothing); the weapon is empty
  assert.deepEqual([v.rows[0].id, v.rows[0].name, v.rows[0].originText], ['g_1', 'Set 1', '2 pinned, 9 unpinned · 1 slot empty']);
  assert.equal(v.rows[0].figures.length, 8);
  assert.equal(v.rows[0].figures[0].text, '785');
  // a set with every row filled has no empty note
  assert.equal(v.rows[1].originText, '0 pinned, 11 unpinned');
});

test('the sheet page: no sets gives the empty card and keeps the settings', () => {
  const v = sheetPageView(sheetOf('SGE', []));
  assert.deepEqual([v.empty, v.rows, v.columns, v.emptyCard.title], [true, [], [], 'No gear sets yet']);
  assert.equal(v.level.value, 100);
});

test('a set page header: the breadcrumb and the sheet settings as one read-only line', () => {
  const sheet = sheetOf('SGE', [sageSet()], { name: 'Bahamut T13 Healer' });
  const v = setHeaderView(sheet, sheet.sets[0]);
  assert.deepEqual(v.crumbs, [
    { text: 'Sheets', to: 'sheets' },
    { text: 'Bahamut T13 Healer', to: 'sheet' },
    { text: 'Set 1', here: true },
  ]);
  assert.deepEqual([v.jobId, v.settingsText], ['SGE', 'Sage · Level 100 · Item level sync 123']);
  const off = setHeaderView(sheetOf('WAR', [], { level: 70, sync: { on: false, cap: 375 } }), sageSet());
  assert.equal(off.settingsText, 'Warrior · Level 70 · Item level sync off');
});

test('text helpers: plurals, dates in a time zone and the settings texts', () => {
  assert.deepEqual(
    [plural(1, 'slot'), plural(3, 'slot'), plural(2, 'match'), plural(0, 'change')],
    ['1 slot', '3 slots', '2 matches', '0 changes'],
  );
  // a time saved in UTC shows as the date in the reader's time zone
  const lateOnTheNinth = Date.UTC(2026, 10, 9, 23, 59);
  assert.deepEqual(
    ['UTC', 'America/Los_Angeles', 'Asia/Tokyo', 'Pacific/Auckland'].map(zone => localDate(lateOnTheNinth, zone)),
    ['2026-11-09', '2026-11-09', '2026-11-10', '2026-11-10'],
  );
  assert.equal(syncShort({ level: 90, sync: { on: true, cap: 660 } }), 'Lv 90, ilvl 660');
  assert.equal(settingsLine({ level: 90, sync: { on: false, cap: 660 } }, 'Gunbreaker'), 'Gunbreaker · Level 90 · Item level sync off');
});
