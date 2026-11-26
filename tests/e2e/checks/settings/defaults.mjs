// Settings panel: defaults, the cap field, job switch, level caps.

import { DEFAULT_ROUTE, titleOf } from '../../../../src/ui/router/routes.ts';
import { DEFAULT_CAP, DEFAULT_JOB, DEFAULT_LEVEL } from '../../lib/constants.mjs';
import { check, expect } from '../../lib/expect.mjs';
import { browserRows, fieldValue, pickJob, setJob, setNumber, showTab, waitSaved } from '../../lib/nav.mjs';
import { setUpShared } from '../../lib/setup.mjs';

/** Switching job takes effect at once (nothing is lost but the job-specific choices, so the page does not ask): the
 * gear browser sorted by Critical Hit stays so on a job with the same stat, and goes back to item level when the stat
 * it is sorted by is the old job's own (Tenacity is not Piety). */
export async function checkJobSwitch(pg) {
  await showTab(pg, 'browse');
  await setJob(pg, 'WAR');
  await expect(browserRows(pg).first()).toBeVisible();
  await pg.click('#gear-table [data-sort="crit"]');
  await pickJob(pg, 'GNB'); // same role as WAR
  await expect(pg.locator('[data-job]')).toHaveAttribute('data-job', 'GNB');
  // Gunbreaker has Critical Hit under the same name: the sort stays (audit 11 #2)
  await expect(pg.locator('#gear-table th[data-col="crit"]')).toHaveAttribute('aria-sort', 'descending');
  await pg.click('#gear-table [data-sort="ten"]');
  await setJob(pg, 'SGE');
  await expect(pg.locator('#gear-table th[data-col="ilvl"]')).toHaveAttribute('aria-sort', 'descending');
  await setUpShared(pg); // back to Sage for the next step
}

/** The strip's cap field on the real page: with sync on, the cap follows the level, lowered by the page's own store with the note
 * (at level 40 a cap of 123 is lowered to 43, the best gear made for level 40; back at 50 it stays 43), and a cap typed above what
 * the level allows is lowered once it commits (500 at level 50 becomes 135). The field's own rules (the errors, the ranges, the up
 * arrow, the label line keeping its shape) are `tests/stories/app/cap-field.spec.ts`'s. */
async function checkCapLowering(pg) {
  await pg.locator('#sync').check();
  await pg.fill('#cap', '123');
  await expect(pg.locator('#cap-error')).toBeHidden();
  await setNumber(pg, '#level', '40');
  await expect(pg.locator('#cap')).toHaveValue('43');
  await expect(pg.locator('#cap-lowered')).toHaveTextParts([43, 40]);
  await setNumber(pg, '#level', '50');
  await expect(pg.locator('#cap')).toHaveValue('43');
  await pg.fill('#cap', '500');
  await expect(pg.locator('#cap')).toHaveValue('135');
  await expect(pg.locator('#cap-lowered')).toHaveTextParts([135, 50]);
  await pg.fill('#cap', '123');
  await setNumber(pg, '#level', '100');
  await pg.locator('#sync').uncheck();
}

/** Limited jobs: picking Blue Mage (level cap 80) or Beastmaster (50) clamps the synced level and the equip level
 * filter to the cap and both inputs' maximum follows it (a typed level above the cap is `level-cap.level-text`'s and `level-field.spec`'s). */
export async function checkJobLevelCap(pg) {
  await setJob(pg, 'SGE');
  await showTab(pg, 'browse');
  await setNumber(pg, '#level', '100');
  await setNumber(pg, '#b-lvl', '100');
  for (const [job, cap] of [
    ['BLU', '80'],
    ['BST', '50'],
  ]) {
    await setJob(pg, job);
    for (const sel of ['#level', '#b-lvl']) {
      await expect(pg.locator(sel)).toHaveValue(cap);
      const max = await pg.getAttribute(sel, 'max');
      check(max === cap, `${job}: ${sel} max is '${max}', expected ${cap}`);
    }
  }
  await waitSaved(pg, "s => s.job === 'BST' && s.level === 50");
  await setNumber(pg, '#level', '40');
  await waitSaved(pg, 's => s.level === 40');
  await setNumber(pg, '#level', '50'); // the shared setup
  await setJob(pg, 'SGE');
}

/** The checks that need a fresh page with nothing set: the title, the defaults and the cap field's wiring. */
export async function checkDefaults(pg) {
  // the page opens on the Sheets list: its title names the screen (ui/router/routes.ts titleOf)
  const title = await pg.title();
  check(title === titleOf(DEFAULT_ROUTE), `title is '${title}'`);
  for (const [sel, v] of Object.entries({ '#job': DEFAULT_JOB, '#cap': DEFAULT_CAP, '#level': DEFAULT_LEVEL })) {
    const got = await fieldValue(pg, sel);
    check(got === v, `default ${sel} is '${got}', expected '${v}'`);
  }
  check(!(await pg.locator('#sync').isChecked()), 'sync is on by default');
  check(await pg.locator('#cap').isDisabled(), 'the cap field is enabled while sync is off');
  // the page opens on the Sheets tab; the Gear browser starts as Paladin with the strip showing
  await expect(pg.locator('#tab-sheets')).toBeVisible();
  await pg.click('[data-tab=browse]');
  await expect(pg.locator('#job-menu-btn')).toBeVisible();
  check((await pg.locator('#job-name').innerText()) === 'Paladin', 'the default job is Paladin');
  await checkCapLowering(pg);
}
