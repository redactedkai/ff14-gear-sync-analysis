// How the math works: Substat tiers and GCD.

import { NARROW, shot } from '../../lib/constants.ts';
import { check, checkNoBadText, expect } from '../../lib/expect.ts';
import { hasHScroll, setCap, setJob, setNumber, showMath } from '../../lib/nav.ts';
import { setUpShared } from '../../lib/setup.ts';
import type { Page } from 'playwright';

// How the math works, Substat tiers. Sage at level 100 (SUB 420, MAIN 440): Spell Speed 624 is in AkhMorning's 2.47 s tier, which
// starts at 613 on the panel (gear speed 193; validation.md section 5).

/** Tiers (its own job, Sage, at its level cap 100), on the real page: each value starts at its base, a typed Spell Speed lands in
 * AkhMorning's tier (the one number kept), the sub-tab's own level changes the bases (80: Spell Speed 380; an empty box goes back to the
 * level cap), Stat Allocation's IL Sync with no item level says nothing here, and no bad text or sideways scroll at NARROW. The rules
 * (a value held to its base and most, the level kept until the job or level changes, the typed texts "60.7" and "1e1", the "?" note,
 * Paladin's Tenacity columns) are `views/tiers`, `number-field` and `tiers-view.spec.ts`'s. */
export async function checkTiers(pg: Page) {
  await pg.setViewportSize(NARROW);
  await showMath(pg, 'tiers');
  await setJob(pg, 'SGE');
  await expect(pg.locator('#t-level')).toHaveValue('100');
  await expect(pg.locator('#t-table [data-n="crit"]')).toHaveValue('420');
  await expect(pg.locator('#t-table [data-n="det"]')).toHaveValue('440');
  await setNumber(pg, '#t-table [data-n="sps"]', '624');
  await expect(pg.locator('#t-table [data-stat="sps"] .lrow.cur span').first()).toHaveText('613–697');
  await expect(pg.locator('#t-table [data-stat="sps"] .lrow.cur span').nth(1)).toHaveText('2.47s');

  // the sub-tab's own level: Spell Speed's base at level 80 (the shared setup's level is 50 on Stat Allocation and does not
  // matter); an empty box goes back to the job's level cap
  await setNumber(pg, '#t-level', '80');
  await expect(pg.locator('#t-table [data-n="sps"]')).toHaveValue('380');
  await setNumber(pg, '#t-level', '');
  await expect(pg.locator('#t-level')).toHaveValue('100');

  // Stat Allocation's sync settings do not matter here: IL Sync on with no item level there says nothing on Tiers
  await pg.click('[data-sub=piece]');
  await setNumber(pg, '#level', '100'); // at the level cap no level sync applies, so Stat Allocation needs the item level
  await setCap(pg, '123');
  await setNumber(pg, '#cap', '');
  await expect(pg.locator('#m-off')).toBeVisible(); // Stat Allocation asks for the item level
  await pg.click('[data-sub=tiers]');
  await expect(pg.locator('#t-table')).toBeVisible();
  check(!(await pg.isVisible('#m-off')), 'the "enter an item level" message shows on Tiers');

  await checkNoBadText(pg, 'math:tiers');
  check(!(await hasHScroll(pg)), `Tiers: horizontal page scroll at ${NARROW.width} px`);
  await pg.screenshot({ path: shot('tiers.png'), fullPage: true });
  await setUpShared(pg); // the job, cap and level the next step starts from
}

/** How the math works, GCD, on the real page: its own level (Stat Allocation's synced level until one is typed), Piece stats' controls
 * stay off the tab, the base speed 341 at level 50 is the first step, and a typed speed 753 is the 2.10 s GCD in the middle row.
 * The boxes' rules (held to the range, settled after typing, a row or a bar clicked, a haste's marks) are `views/gcd`,
 * `gcd-view.spec.ts` and `gcd-controls.spec.ts`'s. */
export async function checkGcdTab(pg: Page) {
  await showMath(pg, 'gcd');
  await expect(pg.locator('#p-slot')).toBeHidden();
  await expect(pg.locator('#p-range')).toBeHidden();
  await expect(pg.locator('#g-level')).toHaveValue('50');
  // the base: 341 at level 50, its step first in the table, no empty rows
  await expect(pg.locator('#g-speed')).toHaveValue('341');
  await expect(pg.locator('#g-table tbody tr')).toHaveCount(13);
  check((await pg.locator('#g-table tbody tr').first().getAttribute('class'))?.includes('cur'), 'at the base the base step is not first');
  await setNumber(pg, '#g-speed', '753');
  await expect(pg.locator('#g-facts')).toContainText('2.10s');
  await expect(pg.locator('#g-facts')).toContainText('2.09s');
  await expect(pg.locator('#g-table tbody tr.cur')).toHaveText(/753\s*2\.10s\s*−15\.7%/);
  check(
    (await pg.locator('#g-table tbody tr').nth(6).getAttribute('class'))?.includes('cur'),
    'the step of the speed is not in the middle row',
  );
  await checkNoBadText(pg, 'math:gcd');
  await pg.click('#g-reset');
  await expect(pg.locator('#g-speed')).toHaveValue('341');
}
