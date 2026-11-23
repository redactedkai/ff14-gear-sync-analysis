// Settings panel: defaults, the cap field, job switch, level caps.

import { DEFAULT_ROUTE, titleOf } from '../../../../src/ui/router/routes.js';
import { DEBOUNCE_SETTLE_MS, DEFAULT_CAP, DEFAULT_JOB, DEFAULT_LEVEL, STORE_KEY } from '../../lib/constants.mjs';
import { check, expect } from '../../lib/expect.mjs';
import { afterFrames, browserRows, fieldValue, pickJob, setJob, setNumber, showTab, waitSaved } from '../../lib/nav.mjs';
import { setUpShared } from '../../lib/setup.mjs';
import { capLineShape, checkCapLineStable } from '../../lib/shared-checks.mjs';

// the strip's cap field: its label line, the two inputs, and the boxes beside it
const STRIP_CAP = { line: 'label[for=cap]', cap: '#cap', level: '#level', others: ['#level', '#sync', '#reset'] };

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

/** With sync on, the cap field asks for a cap while empty and for a whole item level in range. The flag sits in the label
 * line, so the label stays on one line and the cap input lines up with the synced level input; no state (empty, not a cap,
 * lowered) moves the input, the Synced level box, the IL Sync switch or Reset. */
async function checkCapValidation(pg) {
  await pg.locator('#sync').check();
  await expect(pg.locator('#cap-error')).toBeVisible();
  check((await pg.getAttribute('#cap', 'aria-invalid')) === 'true', 'an empty cap with sync on is not marked invalid');
  const asking = await capLineShape(pg, STRIP_CAP); // compared with the shape of a valid cap below
  // the ranges next to the labels
  await expect(pg.locator('#level-range')).toHaveText('1–100');
  await expect(pg.locator('#cap-range')).toHaveText('1–795');
  // not a whole item level: an error, and the page keeps its last cap
  await pg.fill('#cap', '0');
  await expect(pg.locator('#cap-error')).toHaveNumber(795); // the range it asks for
  const notCap = await capLineShape(pg, STRIP_CAP);
  // a decimal is no whole item level either: its error stays once typing settles, and the box is not rounded (owner, 2026-11-20:
  // typing 1.5 showed the error for a moment, then it went while the box still read 1.5)
  await pg.fill('#cap', '1.5');
  await pg.waitForTimeout(DEBOUNCE_SETTLE_MS);
  await expect(pg.locator('#cap-error')).toHaveNumber(795);
  await expect(pg.locator('#cap')).toHaveValue('1.5');
  await pg.fill('#cap', '123');
  await expect(pg.locator('#cap-error')).toBeHidden();
  const plain = await capLineShape(pg, STRIP_CAP);
  await checkCapLineStable(pg, 'the strip asking for a cap', plain, asking);
  await checkCapLineStable(pg, 'the strip with text that is no cap', plain, notCap);
  // the cap follows the level: at level 40 cap 123 is lowered to 43, the best gear made for level 40 (capCeiling),
  // once the level settles; back at level 50 it stays 43 (never raised), with no error either way
  await setNumber(pg, '#level', '40');
  await expect(pg.locator('#cap')).toHaveValue('43');
  await expect(pg.locator('#cap-error')).toBeHidden();
  await expect(pg.locator('#cap-lowered')).toHaveTextParts([43, 40]);
  check(await pg.locator('#cap').evaluate(e => e.classList.contains('lowered')), 'the lowered cap field does not flash');
  await setNumber(pg, '#level', '50');
  await expect(pg.locator('#cap')).toHaveValue('43');
  await expect(pg.locator('#cap-lowered')).toBeHidden(); // the note goes with the next change
  // a cap entered above what the level allows is lowered once it commits
  await pg.fill('#cap', '500');
  await expect(pg.locator('#cap')).toHaveValue('135');
  await expect(pg.locator('#cap-lowered')).toHaveTextParts([135, 50]);
  await checkCapLineStable(pg, 'the strip with a lowered cap', plain, await capLineShape(pg, STRIP_CAP));
  // above the highest real item level too: lowered the same way, not an error
  await pg.fill('#cap', '999');
  await expect(pg.locator('#cap')).toHaveValue('135');
  await expect(pg.locator('#cap-lowered')).toHaveTextParts([135, 50]);
  await expect(pg.locator('#cap-error')).toBeHidden();
  // the up arrow at the limit (owner's report, 2026-10-18): each press is lowered again, and the note stays put rather
  // than hiding and showing (the panel jumped); the field flashes again instead
  await pg.evaluate(() => {
    window.__noteHidden = 0;
    const note = document.querySelector('#cap-lowered');
    new MutationObserver(() => {
      if (note.style.display === 'none') window.__noteHidden++;
    }).observe(note, { attributes: true, attributeFilter: ['style'] });
  });
  await pg.locator('#cap').focus();
  for (let i = 0; i < 5; i++) {
    await pg.keyboard.press('ArrowUp');
    await afterFrames(pg);
  }
  await expect(pg.locator('#cap')).toHaveValue('135');
  await expect(pg.locator('#cap-lowered')).toHaveTextParts([135, 50]);
  check((await pg.evaluate(() => window.__noteHidden)) === 0, 'the lowered note hides and shows again on the up arrow');
  await pg.fill('#cap', '123');
  await setNumber(pg, '#level', '100');
  await pg.locator('#sync').uncheck();
}

/** Limited jobs: picking Blue Mage (level cap 80) or Beastmaster (50) clamps the synced level and the equip level
 * filter to the cap, both inputs' maximum follows it, and a typed level above the cap is not taken. */
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
  await setNumber(pg, '#level', '70');
  await pg.waitForTimeout(DEBOUNCE_SETTLE_MS); // a typed level above the cap is not saved: nothing signals a save that does not happen
  const level = await pg.evaluate(
    `(s => s[{ sheets: 'browse', browse: 'browse', math: 'piece' }[document.querySelector('[data-tab][aria-current="page"]').dataset.tab]].level)(JSON.parse(localStorage.getItem("${STORE_KEY}")))`,
  );
  check(level === 50, `BST: a typed level 70 was taken (saved level ${JSON.stringify(level)})`);
  await setNumber(pg, '#level', '40');
  await waitSaved(pg, 's => s.level === 40');
  await setNumber(pg, '#level', '50'); // the shared setup
  await setJob(pg, 'SGE');
}

/** The checks that need a fresh page with nothing set: the title, the defaults and the cap field's validation. */
export async function checkDefaults(pg) {
  // the page opens on the Sheets list: its title names the screen (ui/router/routes.js titleOf)
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
  await checkCapValidation(pg);
}
