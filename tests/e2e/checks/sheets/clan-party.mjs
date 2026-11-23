// The Sheets tab: a sheet's Race / Clan and Party bonus boxes.

import { NARROW } from '../../lib/constants.mjs';
import { check, expect, poll, same } from '../../lib/expect.mjs';
import { pieceSheet } from '../../lib/fixtures.mjs';
import { hasHScroll, waitReady } from '../../lib/nav.mjs';
import { seedSheet, reloadAtSheets } from '../../lib/sheets.mjs';

// Warrior (a Strength job), one gear set holding the Ironworks head piece (game id 9901), level 100, no item level sync
const WAR_SHEET = pieceSheet('s_clan', 'Clan check', 'WAR', 2, 9901, []);

/** A sheet's Clan and Party bonus boxes: in the settings row, level with the Level box, named "Race and clan" and "Party
 * bonus"; picking the Midlander clan and 5 unique roles turns the first gear set's main stat into
 * floor((value + 2) x 1.05) (the Midlander clan's +2 Strength, then 5%, rounded down; the Wiki's formula and xivgear's);
 * the line under the table then says so; both values are still picked after a reload; picking "Select Race/Clan" and
 * "No party bonus" brings the figure back and empties the line; and nothing moves: each box keeps its width, the table and
 * the line under it keep their place, and the page has no sideways scroll at 960 px. */
export async function checkClanParty(pg) {
  await pg.setViewportSize(NARROW);
  await seedSheet(pg, WAR_SHEET);
  const openSheet = async () => {
    await pg.click('[data-tab=sheets]');
    await pg.locator('#sh-list a.sname', { hasText: 'Clan check' }).click();
    await expect(pg.locator('#sh-sets')).toBeVisible();
  };
  await openSheet();

  const clan = pg.locator('#sh-clan');
  const party = pg.locator('#sh-party');
  const mainStat = async () => Number((await pg.locator('#sh-sets tbody tr td.n').first().innerText()).trim());
  const box = locator => locator.evaluate(el => ({ ...el.getBoundingClientRect().toJSON() }));
  /* Where the things that must stay are: the two boxes' widths and the table's and the note's places. */
  const places = async () => {
    const [clanBox, partyBox, table, note, levelBox] = await Promise.all([
      box(clan),
      box(party),
      box(pg.locator('#sh-sets')),
      box(pg.locator('#sh-bonus-note')),
      box(pg.locator('#sh-level')),
    ]);
    return { clanWidth: clanBox.width, partyWidth: partyBox.width, table, note, clanHeight: clanBox.height, levelHeight: levelBox.height };
  };

  // 1. what is there: the names, the first entries, the groups of the Clan box, the Party bonus entries
  check((await clan.getAttribute('aria-label')) === 'Race and clan', 'the Clan box is named "Race and clan"');
  check((await party.getAttribute('aria-label')) === 'Party bonus', 'the Party bonus box is named "Party bonus"');
  check((await clan.locator('option').first().innerText()) === 'Select Race/Clan', 'the Clan box starts with "Select Race/Clan"');
  check((await clan.locator('optgroup').count()) === 8, 'the Clan box has 8 race groups');
  check((await clan.locator('optgroup option').count()) === 16, 'the Clan box has 16 clans');
  check(
    same(await party.locator('option').evaluateAll(options => options.map(option => option.value)), ['0', '1', '2', '3', '4', '5']),
    'the Party bonus entries are 0 to 5 roles',
  );
  const partyTexts = await party.locator('option').allInnerTexts();
  check(
    partyTexts.every((text, roles) => text.length > 0 && (roles === 0 || text.includes(`${roles}%`))),
    `each Party bonus entry names its percent: ${partyTexts}`,
  );
  check((await clan.inputValue()) === '' && (await party.inputValue()) === '0', 'a new sheet has no clan and no party bonus');

  // 2. the boxes are as tall as the Level box (within 1 px)
  const before = await places();
  const base = await mainStat();
  check(base > 0, `the main stat of the first set is a number (${base})`);
  check(
    Math.abs(before.clanHeight - before.levelHeight) <= 1,
    `the Clan box is as tall as the Level box (${before.clanHeight} and ${before.levelHeight})`,
  );
  check(
    (await pg.locator('#sh-bonus-note').evaluate(el => getComputedStyle(el).visibility)) === 'hidden',
    'with no bonus the line under the table is hidden',
  );

  // 3. Midlander and 5 unique roles: the main stat is floor((value + 2) x 1.05)
  await clan.selectOption('Midlander');
  await party.selectOption('5');
  const bonused = Math.floor(((base + 2) * 105) / 100);
  await poll('the main stat with the Midlander clan and 5 unique roles', async () => {
    const got = await mainStat();
    return { ok: got === bonused, got: `${got}, expected ${bonused} (from ${base})` };
  });
  check(
    (await pg.locator('#sh-bonus-note').evaluate(el => getComputedStyle(el).visibility)) === 'visible',
    'with a bonus the line under the table shows',
  );
  const note = (await pg.locator('#sh-bonus-note').innerText()).trim();
  check(/Midlander/.test(note) && /5%/.test(note), `the line under the table names the clan and the party bonus: ${note}`);

  // 4. nothing moved: the boxes' widths, the table and the line under it
  const after = await places();
  check(same(before, after), `a bonus moved something: ${JSON.stringify(before)} then ${JSON.stringify(after)}`);
  // the widths hold for every entry of each box
  for (const value of ['Highlander', 'Seeker of the Sun', '']) {
    await clan.selectOption(value);
    check((await box(clan)).width === before.clanWidth, `the Clan box keeps its width with "${value}"`);
  }
  await clan.selectOption('Midlander');
  await poll('the main stat back with the Midlander clan', async () => ({ ok: (await mainStat()) === bonused, got: await mainStat() }));
  check(!(await hasHScroll(pg)), 'no sideways scroll at 960 px with a bonus');

  // 5. a reload: both are still picked and the figure is the same
  await reloadAtSheets(pg);
  await waitReady(pg);
  await openSheet();
  check((await clan.inputValue()) === 'Midlander', `the clan after a reload: "${await clan.inputValue()}"`);
  check((await party.inputValue()) === '5', `the party bonus after a reload: "${await party.inputValue()}"`);
  check((await mainStat()) === bonused, `the main stat after a reload: ${await mainStat()}, expected ${bonused}`);

  // 6. both back to none: the figure is back and the line is empty again, in the same place
  await clan.selectOption('');
  await party.selectOption('0');
  await poll('the main stat with no bonus', async () => {
    const got = await mainStat();
    return { ok: got === base, got: `${got}, expected ${base}` };
  });
  check(
    (await pg.locator('#sh-bonus-note').evaluate(el => getComputedStyle(el).visibility)) === 'hidden',
    'the line under the table is hidden again',
  );
  check(same(await places(), before), 'both back to none: everything is where it was');

  // 7. a clan alone changes only the clan's points; a party bonus alone changes only the 5%
  await clan.selectOption('Highlander');
  await poll('the main stat with the Highlander clan', async () => ({ ok: (await mainStat()) === base + 3, got: await mainStat() }));
  await clan.selectOption('');
  await party.selectOption('3');
  const threePercent = Math.floor((base * 103) / 100);
  await poll('the main stat with 3 unique roles', async () => ({ ok: (await mainStat()) === threePercent, got: await mainStat() }));
  await party.selectOption('0');

  // 8. the set page's totals follow the sheet, and so does its line under the table: with no bonus there is no line; with a
  // clan and a party bonus it says what the totals count
  const setNote = pg.locator('#sh-set-bonus-note');
  const openFirstSet = async () => {
    await pg.locator('#sh-sets a.sname').first().click();
    await expect(pg.locator('#sh-set')).toBeVisible();
  };
  await openFirstSet();
  await expect(setNote).toHaveCount(0);
  await pg.click('#sh-set .setcrumb a:nth-of-type(2)');
  await expect(pg.locator('#sh-sets')).toBeVisible();
  await clan.selectOption('Midlander');
  await party.selectOption('5');
  await openFirstSet();
  const counted = (await setNote.innerText()).trim();
  check(/Midlander/.test(counted) && /5%/.test(counted), `the set page's line with a clan and a party bonus: ${counted}`);
  await pg.click('#sh-set .setcrumb a:nth-of-type(2)');
  await expect(pg.locator('#sh-sets')).toBeVisible();
  await clan.selectOption('');
  await party.selectOption('0');
}
