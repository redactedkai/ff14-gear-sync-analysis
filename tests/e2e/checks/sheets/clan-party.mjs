// The Sheets tab: a sheet's Race / Clan and Party bonus boxes.

import { NARROW } from '../../lib/constants.mjs';
import { check, expect, poll } from '../../lib/expect.mjs';
import { pieceSheet } from '../../lib/fixtures.mjs';
import { hasHScroll } from '../../lib/nav.mjs';
import { pickOption } from '../../lib/select.mjs';
import { seedSheet } from '../../lib/sheets.mjs';

// Warrior (a Strength job), one gear set holding the Ironworks head piece (game id 9901), level 100, no item level sync
const WAR_SHEET = pieceSheet('s_clan', 'Clan check', 'WAR', 2, 9901, []);

/** A sheet's Clan and Party bonus boxes on the real page: picking the Midlander clan and 5 unique roles turns the first gear set's
 * main stat into floor((value + 2) x 1.05) (the Midlander clan's +2 Strength, then 5%, rounded down; the Wiki's formula and
 * xivgear's), the line under the table names both, the set page's line follows, and both back to none brings the figure back. The
 * boxes' names, entries, height, widths and the line's place are `sheet-page.spec.ts`'s; the clan's and the roles' own numbers are
 * `core/set.bonuses`', `views/set-totals.bonuses`' and `sheets/bonus-options`'; keeping them across a reload is
 * `sheets/storage.clan-party`'s and `store/sheets-actions.clan-party`'s. */
export async function checkClanParty(pg) {
  await pg.setViewportSize(NARROW);
  await seedSheet(pg, WAR_SHEET);
  await pg.click('[data-tab=sheets]');
  await pg.locator('#sh-list a.sname', { hasText: 'Clan check' }).click();
  await expect(pg.locator('#sh-sets')).toBeVisible();

  const mainStat = async () => Number((await pg.locator('#sh-sets tbody tr td.n').first().innerText()).trim());
  const noteVisibility = () => pg.locator('#sh-bonus-note').evaluate(el => getComputedStyle(el).visibility);
  const base = await mainStat();
  check(base > 0, `the main stat of the first set is a number (${base})`);
  check((await noteVisibility()) === 'hidden', 'with no bonus the line under the table is hidden');

  // Midlander and 5 unique roles: the main stat is floor((value + 2) x 1.05), and the line under the table says so
  await pickOption(pg, '#sh-clan', 'Midlander');
  await pickOption(pg, '#sh-party', '5');
  const bonused = Math.floor(((base + 2) * 105) / 100);
  await poll('the main stat with the Midlander clan and 5 unique roles', async () => {
    const got = await mainStat();
    return { ok: got === bonused, got: `${got}, expected ${bonused} (from ${base})` };
  });
  check((await noteVisibility()) === 'visible', 'with a bonus the line under the table shows');
  const note = (await pg.locator('#sh-bonus-note').innerText()).trim();
  check(/Midlander/.test(note) && /5%/.test(note), `the line under the table names the clan and the party bonus: ${note}`);
  check(!(await hasHScroll(pg)), 'no sideways scroll at 960 px with a bonus');

  // the set page's line follows the sheet: it names what the totals count
  await pg.locator('#sh-sets a.sname').first().click();
  await expect(pg.locator('#sh-set')).toBeVisible();
  const counted = (await pg.locator('#sh-set-bonus-note').innerText()).trim();
  check(/Midlander/.test(counted) && /5%/.test(counted), `the set page's line with a clan and a party bonus: ${counted}`);
  await pg.click('#sh-set .setcrumb a:nth-of-type(2)');
  await expect(pg.locator('#sh-sets')).toBeVisible();

  // both back to none: the figure is back and the line is empty again
  await pickOption(pg, '#sh-clan', '');
  await pickOption(pg, '#sh-party', '0');
  await poll('the main stat with no bonus', async () => {
    const got = await mainStat();
    return { ok: got === base, got: `${got}, expected ${base}` };
  });
  check((await noteVisibility()) === 'hidden', 'the line under the table is hidden again');
}
