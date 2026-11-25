// How the math works: Substat tiers and GCD.

import { NARROW, shot } from '../../lib/constants.mjs';
import { check, checkNoBadText, expect, same } from '../../lib/expect.mjs';
import { hasHScroll, setCap, setJob, setNumber, showMath } from '../../lib/nav.mjs';
import { setUpShared } from '../../lib/setup.mjs';
import { pickOption } from '../../lib/select.mjs';

// How the math works, Substat tiers. Sage at level 100 (SUB 420, MAIN 440): Spell Speed 624 is in AkhMorning's 2.47 s tier, which
// starts at 613 on the panel (gear speed 193; validation.md section 5).

/** Tiers (its own job, Sage, at its level cap 100): each value starts at its base; a typed Spell Speed lands in
 * AkhMorning's tier; a value out of range is held to it, with no note; a level typed into the sub-tab's own box shows its tiers
 * as each valid level is typed (no change event, no typing wait) and an empty box goes back to the job's level cap; Stat Allocation's
 * level and sync settings do not reach it (with IL Sync on and no item level there, Tiers shows no "enter an item level" message);
 * Paladin's Tenacity has two effect columns; no sideways scroll at NARROW. */
export async function checkTiers(pg) {
  await pg.setViewportSize(NARROW);
  await showMath(pg, 'tiers');
  await setJob(pg, 'SGE');
  await expect(pg.locator('#t-level')).toHaveValue('100');
  await expect(pg.locator('#t-table [data-n="crit"]')).toHaveValue('420');
  await expect(pg.locator('#t-table [data-n="det"]')).toHaveValue('440');
  await setNumber(pg, '#t-table [data-n="sps"]', '624');
  await expect(pg.locator('#t-table [data-stat="sps"] .lrow.cur span').first()).toHaveText('613–697');
  await expect(pg.locator('#t-table [data-stat="sps"] .lrow.cur span').nth(1)).toHaveText('2.47s');

  // a value under the base is shown at the base, a speed above the most any job can have at the most; no note
  await setNumber(pg, '#t-table [data-n="crit"]', '5');
  await expect(pg.locator('#t-table [data-n="crit"]')).toHaveValue('420');
  await setNumber(pg, '#t-table [data-n="sps"]', '99999');
  await expect(pg.locator('#t-table [data-n="sps"]')).toHaveValue('3679');
  await setNumber(pg, '#t-table [data-n="sps"]', '624');
  // a level change drops the typed value for good: back at level 100, the base again (it used to come back)
  await setNumber(pg, '#t-level', '90');
  await setNumber(pg, '#t-level', '');
  await expect(pg.locator('#t-level')).toHaveValue('100');
  await expect(pg.locator('#t-table [data-n="sps"]')).toHaveValue('420');

  // the level follows each valid keystroke, while the field keeps focus
  await pg.focus('#t-level');
  await pg.keyboard.press('Control+A');
  await pg.keyboard.type('90');
  await expect(pg.locator('#t-level')).toHaveValue('90');
  check((await pg.evaluate(() => document.activeElement?.id)) === 't-level', 'the tiers level box lost focus while typing');
  await pg.keyboard.press('Tab');

  // the sub-tab's own level: Spell Speed's base at level 80 (the shared setup's level is 50 on Stat Allocation and does not
  // matter); an empty box goes back to the job's level cap
  await setNumber(pg, '#t-level', '80');
  await expect(pg.locator('#t-table [data-n="sps"]')).toHaveValue('380');
  await setNumber(pg, '#t-level', '');
  await expect(pg.locator('#t-level')).toHaveValue('100');

  // the sub-tab's level follows each valid keystroke too (no Enter needed), and keeps focus
  await pg.focus('#t-level');
  await pg.keyboard.press('Control+A');
  await pg.keyboard.type('80');
  await expect(pg.locator('#t-table [data-n="sps"]')).toHaveValue('380');
  check((await pg.evaluate(() => document.activeElement?.id)) === 't-level', 'the tiers level box lost focus while typing');
  await setNumber(pg, '#t-level', '');
  await expect(pg.locator('#t-level')).toHaveValue('100');

  // a ? note says what the substat does and how big its tiers are here (level 90 DIV 1900: 1900/200 = 9.5)
  await setNumber(pg, '#t-level', '90');
  await pg.click('#t-table [data-help="crit"]');
  await expect(pg.locator('#t-pop')).toHaveTextParts([90, 9, 10]);
  await pg.keyboard.press('Escape');
  await expect(pg.locator('#t-pop')).toBeHidden();
  await setNumber(pg, '#t-level', '');

  // Stat Allocation's sync settings do not matter here: IL Sync on with no item level there says nothing on Tiers
  await pg.click('[data-sub=piece]');
  await setNumber(pg, '#level', '100'); // at the level cap no level sync applies, so Stat Allocation needs the item level
  await setCap(pg, '123');
  await setNumber(pg, '#cap', '');
  await expect(pg.locator('#m-off')).toBeVisible(); // Stat Allocation asks for the item level
  await pg.click('[data-sub=tiers]');
  await expect(pg.locator('#t-table')).toBeVisible();
  check(!(await pg.isVisible('#m-off')), 'the "enter an item level" message shows on Tiers');

  await setJob(pg, 'PLD');
  const names = (await pg.locator('#t-table [data-stat="ten"] .lhead span').allInnerTexts()).map(t => t.trim().toLowerCase());
  check(same(names, ['points', 'dmg & heal', 'dmg taken']), `Paladin's Tenacity columns: ${JSON.stringify(names)}`);
  await checkNoBadText(pg, 'math:tiers');
  check(!(await hasHScroll(pg)), `Tiers: horizontal page scroll at ${NARROW.width} px`);
  await pg.screenshot({ path: shot('tiers.png'), fullPage: true });
  await setJob(pg, 'SGE'); // Substat tiers' own job, which no carry-over from another tab resets
  await setUpShared(pg); // the job, cap and level the next step starts from
}

/** How the math works, GCD: its own level (Stat Allocation's synced level until one is typed), haste and speed. The level box waits
 * for typing to stop and corrects a level out of range (its note as hover text); the speed box holds a typed speed to the level's
 * range once typing stops; a row or a bar clicked sets the speed or the level; a haste marks its levels; Piece stats'
 * controls stay off the tab, and the step table never has empty rows. */
export async function checkGcdTab(pg) {
  await showMath(pg, 'gcd');
  await expect(pg.locator('#p-slot')).toBeHidden();
  await expect(pg.locator('#p-range')).toBeHidden();
  await expect(pg.locator('#g-level')).toHaveValue('50');
  // the base: 341 at level 50, its step first in the table, no empty rows
  await expect(pg.locator('#g-speed')).toHaveValue('341');
  await expect(pg.locator('#g-table tbody tr')).toHaveCount(13);
  check((await pg.locator('#g-table tbody tr').first().getAttribute('class'))?.includes('cur'), 'at the base the base step is not first');
  // the speed box waits for typing to stop, then holds the speed to the range ("1" is the base only afterwards)
  await pg.focus('#g-speed');
  await pg.keyboard.press('Control+A');
  await pg.keyboard.type('753');
  await expect(pg.locator('#g-facts')).toContainText('2.10s');
  await expect(pg.locator('#g-facts')).toContainText('2.09s');
  await expect(pg.locator('#g-table tbody tr.cur')).toHaveText(/753\s*2\.10s\s*−15\.7%/);
  check(
    (await pg.locator('#g-table tbody tr').nth(6).getAttribute('class'))?.includes('cur'),
    'the step of the speed is not in the middle row',
  );
  await pg.keyboard.press('Control+A');
  await pg.keyboard.type('1');
  check((await pg.inputValue('#g-speed')) === '1', 'the speed box changed while typing');
  await expect(pg.locator('#g-speed')).toHaveValue('341');
  await setNumber(pg, '#g-speed', '5000');
  await expect(pg.locator('#g-speed')).toHaveValue('800');
  await expect(pg.locator('#g-most')).toHaveText('800');
  // a row sets the speed; the steps past the most are greyed out and do nothing
  await pg.locator('#g-table tbody tr:not(.out)').nth(2).click();
  check((await pg.inputValue('#g-speed')) !== '800', 'a row click did not set the speed');
  await pg.click('#g-reset');
  await expect(pg.locator('#g-speed')).toHaveValue('341');
  // the level box: a level out of range is corrected once typing stops, the note as hover text; a bar sets the level
  await pg.focus('#g-level');
  await pg.keyboard.press('Control+A');
  await pg.keyboard.type('150');
  await expect(pg.locator('#g-level')).toHaveValue('100');
  await expect(pg.locator('#g-speed')).toHaveValue('420');
  await pg.locator('#g-chart [data-level="78"]').click();
  await expect(pg.locator('#g-level')).toHaveValue('78');
  // a haste: its levels marked on the chart, its percent among the facts
  await pickOption(pg, '#g-haste', 'SAM');
  await expect(pg.locator('#g-chart .hasteline')).toHaveCount(2);
  await expect(pg.locator('#g-facts')).toContainText('Fuka');
  await checkNoBadText(pg, 'math:gcd');
  await pickOption(pg, '#g-haste', '');
  await setNumber(pg, '#g-level', '');
  await expect(pg.locator('#g-level')).toHaveValue('50');
}
