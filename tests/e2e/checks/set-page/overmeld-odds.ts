// The overmeld odds in a set page's materia menu.

import { NARROW, shot } from '../../lib/constants.ts';
import { check, checkNoBadText, expect, same } from '../../lib/expect.ts';
import { pieceSheet } from '../../lib/fixtures.ts';
import { hasHScroll } from '../../lib/nav.ts';
import { openSet, seedSheets } from '../../lib/sheets.ts';
import type { Page } from 'playwright';

/** The overmeld odds in a set page's materia menu (docs/mechanics/materia.md): an overmeld slot's menu has an "odds" row with
 * one figure per grade column, a guaranteed slot's has none, and a piece that cannot be high quality says its odds are
 * lower. Expected values are the game's MateriaGrade sheet's rates: Courtly Lover's Earrings (49309, high quality
 * possible) in its second overmeld slot give 10% for each of the four grades shown, and have no note; its guaranteed slot
 * has no odds row; Axe of the Fury (14756, no high quality) in its first overmeld slot give 12% 48% 60% 72% and the note.
 * Overmeld chips stay locked until the slots before them hold a stone, so those are seeded. */
export async function checkOvermeldOdds(pg: Page) {
  await pg.setViewportSize(NARROW);
  const stone = (stat, grade) => ({ stat, grade });
  await seedSheets(pg, [
    pieceSheet('s_odds_sge', 'Odds Sage', 'SGE', 7, 49309, [stone('crit', 12), stone('crit', 12)]),
    pieceSheet('s_odds_war', 'Odds Warrior', 'WAR', 0, 14756, [stone('crit', 7), stone('crit', 7)]),
  ]);
  const popup = pg.locator('.matpop');
  const note = popup.locator('.rmnote'); // the note that the odds are for a piece that cannot be high quality

  // Courtly Lover's Earrings: an overmeld slot has odds, the guaranteed slot has none
  await openSet(pg, 'Odds Sage', 'Mine');
  await pg.click('[data-chip="7:2"]');
  await expect(popup.locator('h5')).toHaveTextParts(['Earring', 'overmeld', 2]);
  await expect(popup.locator('.pc')).toHaveCount(4); // one odds figure per grade shown
  // an empty slot has no Remove (B17 leaves the place empty); a filled slot behind a later stone has one, disabled
  await expect(popup.locator('.matfoot button')).toHaveCount(2); // the grades switch and Close, no Remove
  check(
    same(await popup.locator('.pc').allInnerTexts(), ['10%', '10%', '10%', '10%']),
    `the earring's overmeld odds are ${await popup.locator('.pc').allInnerTexts()}, not 10% 10% 10% 10%`,
  );
  await expect(note).toHaveCount(0); // a piece that can be high quality has no not-high-quality note
  await pg.screenshot({ path: shot('overmeld-odds.png') });
  // every grade: those the slot cannot take (the high grades in a small slot) have no odds, shown as a dash, not 0%
  await popup.locator('.matfoot button').first().click(); // Show all grades
  const allOdds = await popup.locator('.pc').allInnerTexts();
  check(
    same(allOdds, ['–', '10%', '–', '10%', '–', '10%', '–', '10%', '32%', '38%', '44%', '48%']),
    `the earring's odds for every grade are ${allOdds}, not a dash for the grades the slot cannot take`,
  );
  await pg.screenshot({ path: shot('overmeld-odds-all.png') });
  await pg.keyboard.press('Escape');
  await expect(popup).toBeHidden(); // the one menu element stays, hidden
  await pg.click('[data-chip="7:0"]');
  await expect(popup.locator('h5')).toHaveTextParts(['Earring', 1]);
  await expect(popup.locator('.matfoot button').first()).toHaveText('Remove');
  await expect(popup.locator('.matfoot button').first()).toBeDisabled();
  await expect(popup.locator('.pc')).toHaveCount(0);
  await pg.keyboard.press('Escape');

  // Axe of the Fury: the lower rates and the note
  await pg.click('#sh-set .setcrumb a');
  await openSet(pg, 'Odds Warrior', 'Mine');
  await pg.click('[data-chip="0:2"]');
  await expect(popup.locator('h5')).toHaveTextParts(['Weapon', 'overmeld', 1]);
  check(
    same(await popup.locator('.pc').allInnerTexts(), ['12%', '48%', '60%', '72%']),
    `the axe's overmeld odds are ${await popup.locator('.pc').allInnerTexts()}, not 12% 48% 60% 72%`,
  );
  await expect(note).toHaveCount(1);
  check(!(await hasHScroll(pg)), `the materia menu scrolls the page sideways at ${NARROW.width} px`);
  await checkNoBadText(pg, 'the materia menu');
  await pg.keyboard.press('Escape');
  await pg.setViewportSize({ width: 1000, height: 900 });
  await pg.click('[data-tab=browse]');
}
