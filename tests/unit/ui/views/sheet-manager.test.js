/* The sheet manager and a sheet's page (src/ui/views/sheet-manager.js, sheet-sets.js): list rows, empty states, the
   unreadable records, the settings fields and the set list, with real Sage and Warrior sets. */
// the manager's dates are in the reader's time zone: the test reads them in UTC
process.env.TZ = 'UTC';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_REAL } from '../../../../src/core/tables.ts';
import { UNAVAILABLE_MESSAGE } from '../../../../src/ui/sheets/storage.js';
import { sheetManagerView } from '../../../../src/ui/views/sheet-manager.js';
import {
  firstSortDir,
  nextListSort,
  setHeaderView,
  sheetListView,
  sheetPageView,
  sheetSwitcherView,
  sortSetRows,
} from '../../../../src/ui/views/sheet-sets.js';
import { plural } from '../../../../src/ui/text.ts';
import { localDate, settingsLine, syncShort } from '../../../../src/ui/views/sheet-text.ts';
import { sageSet, sheetOf, warSet } from '../../helpers/sheet-fixtures.js';

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
  assert.deepEqual(v.columns, ['Sheet', 'Job', 'Level / IL', 'Sets', 'Created', 'Changed', 'Patch']);
  assert.deepEqual(v.rows[0], {
    id: 's_a',
    href: '#/sheets/s_a',
    name: 'Bahamut T13 Healer',
    descriptionLine: 'Savage Bahamut, week 1',
    hasDescription: true,
    jobId: 'SGE',
    jobName: 'Sage',
    settingsText: 'Lv 100 / IL 123',
    setCount: 2,
    created: '2025-11-09',
    changed: '2025-11-09',
    patch: '7.56', // the data's date, 2026-09-30, is after 7.56 (2026-09-08) and before 7.57 (2026-10-13)
    patchTitle: 'Game data d9582a6, 2026-09-30',
  });
  assert.deepEqual(
    [v.rows[1].jobName, v.rows[1].settingsText, v.rows[1].descriptionLine, v.rows[1].hasDescription, v.rows[1].setCount],
    ['Warrior', 'Lv 70 / IL sync off', 'No description', false, 0],
  );
});

test('the manager: the Patch cell names the patch of the data date; a missing commit, a missing date and a date before every patch', () => {
  const stamped = gameData => ({ ...sheetOf('SGE', [], { id: 's_x' }), gameData });
  const [boundary, noCommit, noDate, noStamp, ancient] = sheetManagerView(
    loaded([
      stamped({ commit: 'd9582a6', date: '2026-09-08' }), // 7.56's release day
      stamped({ commit: '', date: '2026-04-30' }),
      stamped({ commit: 'd9582a6', date: '' }),
      stamped(undefined),
      stamped({ commit: 'abc1234', date: '2001-01-01' }),
    ]),
  ).rows;
  assert.deepEqual([boundary.patch, boundary.patchTitle], ['7.56', 'Game data d9582a6, 2026-09-08']);
  assert.deepEqual([noCommit.patch, noCommit.patchTitle], ['7.5', 'Game data 2026-04-30']);
  assert.deepEqual([noDate.patch, noDate.patchTitle], ['', '']);
  assert.deepEqual([noStamp.patch, noStamp.patchTitle], ['', '']);
  assert.deepEqual([ancient.patch, ancient.patchTitle], ['', 'Game data abc1234, 2001-01-01']);
});

test('the manager: the empty state, storage that cannot be used, an unreadable order and unreadable records', () => {
  const none = sheetManagerView(loaded([]));
  assert.deepEqual([none.empty, none.showNewButton], [true, false]);
  assert.ok(none.emptyCard.title.length > 0 && none.emptyCard.buttonText.length > 0, 'the empty card offers the first sheet');
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
      text: damaged.unreadable[0].text,
    },
  ]);
  assert.ok(damaged.unreadable[0].text.includes('written by a newer version of the page (v2)'), 'the cause is shown'); // the stored cause
  assert.ok(damaged.unreadableTitle.length > 0);
});

test('the sheet page: settings fields with their ranges, the job fixed, a one-line description state', () => {
  const sheet = sheetOf('SGE', [sageSet()], { name: 'Bahamut T13 Healer', description: '' });
  const v = sheetPageView(sheet);
  assert.deepEqual(v.crumbs, [
    { text: 'Sheets', to: 'sheets', href: '#/sheets' },
    { text: 'Bahamut T13 Healer', here: true },
  ]);
  assert.equal(v.id, sheet.id);
  assert.equal(v.description.empty, true);
  assert.ok(v.description.text.length > 0, 'a dim placeholder shows');
  assert.deepEqual(v.job, { id: 'SGE', name: 'Sage' });
  assert.deepEqual(v.level, { value: 100, max: 100 });
  assert.deepEqual(v.sync, { on: true, cap: 123, max: MAX_REAL });
  // Blue Mage and Beastmaster stop below the game's level cap
  assert.equal(sheetPageView(sheetOf('BLU', [], { level: 80 })).level.max, 80);
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
  // the stat points (the Total row of the set's page): one per stat of the job; the main stat is the one the header shows
  assert.deepEqual(v.pointColumns, ['MND', 'VIT', 'CRT', 'DET', 'DHT', 'SpS', 'PIE']);
  assert.deepEqual(
    v.rows[0].points.map(point => point.label),
    v.pointColumns,
  );
  assert.equal(v.rows[0].points[0].text, '785');
  // a set with every row filled has no empty note
  assert.equal(v.rows[1].originText, '0 pinned, 11 unpinned');
});

test('the sheet page: no sets gives the empty card and keeps the settings', () => {
  const v = sheetPageView(sheetOf('SGE', []));
  assert.deepEqual([v.empty, v.rows, v.columns], [true, [], []]);
  assert.ok(v.emptyCard.title.length > 0);
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
  assert.equal(v.jobId, 'SGE');
  assert.ok(
    ['Sage', '100', '123'].every(part => v.settingsText.includes(part)),
    v.settingsText,
  );
  // the description as saved, or a dim "No description"
  assert.equal(v.notes.empty, true);
  assert.ok(v.notes.text.length > 0, 'a dim placeholder shows');
  const described = setHeaderView(sheet, { ...sheet.sets[0], description: 'Week 1\nsecond line' });
  assert.deepEqual(described.notes, { text: 'Week 1\nsecond line', empty: false });
  const off = setHeaderView(sheetOf('WAR', [], { level: 70, sync: { on: false, cap: 375 } }), sageSet());
  assert.ok(
    ['Warrior', '70'].every(part => off.settingsText.includes(part)),
    off.settingsText,
  );
  assert.ok(!off.settingsText.includes('375'), 'no cap while sync is off');
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
  assert.equal(syncShort({ level: 90, sync: { on: true, cap: 660 } }), 'Lv 90 / IL 660');
  assert.equal(settingsLine({ level: 90, sync: { on: false, cap: 660 } }, 'Gunbreaker'), 'Gunbreaker · Level 90 · IL Sync off');
});

/* The gear sets list sorts like the Gear browser's table: a click sorts best first, again flips, a third goes back to the
   saved order. */
test('the sheet page: a heading starts best first (the GCD lowest first, names A to Z), flips, then returns to the saved order', () => {
  assert.deepEqual(
    [firstSortDir('name', 'effects'), firstSortDir('gcd', 'effects'), firstSortDir('crit', 'effects')],
    ['asc', 'asc', 'desc'],
  );
  // in the stat points view there is no GCD column: every number starts high first
  assert.equal(firstSortDir('gcd', 'points'), 'desc');
  const none = { key: '', dir: '' };
  const first = nextListSort(none, 'crit', 'effects');
  assert.deepEqual(first, { key: 'crit', dir: 'desc' });
  const second = nextListSort(first, 'crit', 'effects');
  assert.deepEqual(second, { key: 'crit', dir: 'asc' });
  assert.deepEqual(nextListSort(second, 'crit', 'effects'), none);
  // another heading starts its own sort
  assert.deepEqual(nextListSort(second, 'det', 'effects'), { key: 'det', dir: 'desc' });
  assert.deepEqual(nextListSort(nextListSort(none, 'gcd', 'effects'), 'gcd', 'effects'), { key: 'gcd', dir: 'desc' });
});

test('the sheet page: a hasted GCD column sorts by the hasted GCD, then by the GCD shown in front of it', () => {
  // Monk-style figures: `text` is the hasted GCD (2.22s for all three sets), `shown` leads with the GCD without the haste
  const row = (name, shown) => ({
    name,
    figures: [{ key: 'gcd', text: '2.22s', shown }],
    points: [],
  });
  const rows = [row('B', '2.47s (2.22s)'), row('A', '2.46s (2.22s)'), row('C', '2.48s (2.22s)')];
  const names = dir => sortSetRows(rows, { key: 'gcd', dir }, 'effects').map(r => r.name);
  assert.deepEqual(names('asc'), ['A', 'B', 'C']);
  assert.deepEqual(names('desc'), ['C', 'B', 'A']);
  // a different hasted GCD still comes first: 2.21s beats 2.22s whatever the number in front
  const hastier = { name: 'D', figures: [{ key: 'gcd', text: '2.21s', shown: '2.50s (2.21s)' }], points: [] };
  assert.equal(sortSetRows([...rows, hastier], { key: 'gcd', dir: 'asc' }, 'effects')[0].name, 'D');
});

test('the sheet page: sorting the set rows by the numbers in their figures; ties and no sort keep the saved order', () => {
  const row = (name, gcd, crit) => ({
    name,
    figures: [
      { key: 'gcd', text: gcd },
      { key: 'crit', text: crit },
    ],
    points: [{ key: 'crit', text: '1,000'.replace(',', '') }],
  });
  const rows = [row('B', '2.48s', '22.9%'), row('A', '2.37s', '14.0%'), row('C', '2.45s', '22.9%')];
  const names = sort => sortSetRows(rows, sort, 'effects').map(r => r.name);
  assert.deepEqual(names({ key: '', dir: '' }), ['B', 'A', 'C']);
  assert.deepEqual(names({ key: 'gcd', dir: 'asc' }), ['A', 'C', 'B']);
  assert.deepEqual(names({ key: 'crit', dir: 'desc' }), ['B', 'C', 'A']); // B and C tie: the saved order
  assert.deepEqual(names({ key: 'name', dir: 'asc' }), ['A', 'B', 'C']);
  assert.deepEqual(names({ key: 'name', dir: 'desc' }), ['C', 'B', 'A']);
  assert.deepEqual(
    rows.map(r => r.name),
    ['B', 'A', 'C'],
    'the rows themselves are not reordered',
  );
  // a real sheet: the main stat, highest first
  const v = sheetPageView(sheetOf('SGE', [sageSet(), warSet()]));
  const main = r => Number(r.figures[0].text);
  const sorted = sortSetRows(v.rows, { key: 'main', dir: 'desc' }, 'effects');
  assert.ok(main(sorted[0]) >= main(sorted[1]));
});

test('the sheet page: the list draws the figures of the mode in the sort in force; a sort whose column is not on the page is dropped', () => {
  const page = sheetPageView(sheetOf('SGE', [sageSet(), warSet()]));
  const none = { key: '', dir: '' };
  const effects = sheetListView(page, none, 'effects');
  assert.deepEqual(
    effects.columns.map(column => column.key),
    page.columnKeys,
  );
  assert.deepEqual(
    effects.rows.map(row => row.cells[0].text),
    page.rows.map(row => row.figures[0].shown ?? row.figures[0].text),
  );
  assert.deepEqual(
    [effects.orderLocked, effects.nameAriaSort, effects.rows[0].href],
    [false, 'none', `#/sheets/${page.id}/sets/${page.rows[0].id}`],
  );
  // a sort by a heading: its aria-sort says so, and the list cannot be reordered by hand
  const byName = sheetListView(page, { key: 'name', dir: 'desc' }, 'effects');
  assert.deepEqual([byName.nameAriaSort, byName.orderLocked], ['descending', true]);
  assert.deepEqual(
    byName.rows.map(row => row.name),
    page.rows.map(row => row.name).sort((a, b) => b.localeCompare(a)),
  );
  // the stat points have other columns than the effects: the GCD heading's sort does not carry over
  const points = sheetListView(page, { key: 'gcd', dir: 'asc' }, 'points');
  assert.deepEqual([points.sort, points.orderLocked, points.columns.length], [none, false, page.pointKeys.length]);
});

test('the sheet switcher: a link to the manager, one row per sheet with the open one marked, off while an Auto-fill runs', () => {
  const view = sheetManagerView(loaded([sheetOf('SGE', [], { id: 's_a', name: 'A' }), sheetOf('WAR', [], { id: 's_b', name: 'B' })]));
  const switcher = sheetSwitcherView(view.rows, 's_b', true);
  assert.deepEqual(
    switcher.items.map(item => [item.id, item.current, item.href]),
    [
      ['s_a', false, '#/sheets/s_a'],
      ['s_b', true, '#/sheets/s_b'],
    ],
  );
  assert.deepEqual([switcher.allHref, switcher.disabled, switcher.allLabel.includes('2')], ['#/sheets', true, true]);
});
