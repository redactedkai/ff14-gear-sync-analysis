// Gear browser: rings, the expansion filter, the Paladin off-hand.

import { shot } from '../../lib/constants.ts';
import { coreRings } from '../../lib/core.ts';
import { check, expect } from '../../lib/expect.ts';
import { afterFrames, browserRows, fillBrowser, setJob, setNumber, showTab, waitSaved } from '../../lib/nav.ts';
import { setUpShared } from '../../lib/setup.ts';

// Gear browser rings window: [job, item level from, item level to, equip level up to].
const RINGS_WINDOW = ['SGE', 140, 150, 60];

/** The gear browser marks every non-Unique ring x2 (it can be worn on both hands) and no Unique one. */
export async function checkRingCopies(pg) {
  const [job, lo, hi, lvl] = RINGS_WINDOW;
  const want = await coreRings(job, lo, hi, lvl);
  if (!check(want.x2 > 0 && want.x2 < want.count, `${job} rings ${lo}-${hi}: no mix of Unique and non-Unique rings; pick another window`)) {
    return;
  }
  await setJob(pg, job);
  await fillBrowser(pg, lo, hi, lvl, 'ring');
  await expect(pg.locator('#b-count')).toHaveText(`${want.count} matches`);
  // the Slot menu counts them (and the closed button names the slot); Reset filters shows while filters are set
  await expect(pg.locator('#b-slots [data-slot="ring"] .n')).toHaveText(want.count.toLocaleString('en-US'));
  await expect(pg.locator('#b-slot')).toHaveText('Ring');
  await expect(pg.locator('#b-slots [data-slot="ring"]')).toHaveAttribute('aria-checked', 'true');
  await expect(pg.locator('#b-reset')).toBeVisible();
  await expect(browserRows(pg)).toHaveCount(want.count);
  await expect(pg.locator('#gear-table .x2:visible')).toHaveCount(want.x2);
  // a heading sorts by its column, and again the other way
  // the sort goes by the piece's own item level, which the column shows (owner, 2026-10-19)
  const ilvls = () =>
    pg.locator('#gear-table tbody tr[data-key] td[data-col="ilvl"]').evaluateAll(cells => cells.map(c => Number(c.textContent)));
  const ilvlHead = pg.locator('#gear-table th:has([data-sort="ilvl"])');
  await pg.click('#gear-table [data-sort="ilvl"]');
  await expect(ilvlHead).toHaveAttribute('aria-sort', 'ascending');
  const up = await ilvls();
  check(
    up.every((v, i) => !i || up[i - 1] <= v),
    `ilvl ascending is not sorted: ${up}`,
  );
  await pg.click('#gear-table [data-sort="ilvl"]');
  await expect(ilvlHead).toHaveAttribute('aria-sort', 'descending');
  // "/" jumps to the search, and the word is marked in the names; Reset filters clears every filter and hides
  await pg.locator('#b-count').click();
  await pg.keyboard.press('/');
  await pg.waitForFunction(() => document.activeElement?.id === 'b-q');
  await pg.keyboard.type('ring');
  await expect(pg.locator('#gear-table tbody tr[data-key] .mark').first()).toHaveText(/ring/i);
  // a value below a filter's range moves to its lowest value on leaving the box, shown there (not "no limit")
  await setNumber(pg, '#b-min', '-5');
  await expect(pg.locator('#b-min')).toHaveValue('1');
  // and one above the highest real item level moves to it, as Equip level is held to the level cap
  await setNumber(pg, '#b-max', '999');
  await expect(pg.locator('#b-max')).toHaveValue('795');
  await setNumber(pg, '#b-min', '999');
  await expect(pg.locator('#b-min')).toHaveValue('795');
  await pg.click('#b-reset');
  await expect(pg.locator('#b-slots [data-slot="any"]')).toHaveAttribute('aria-checked', 'true');
  await expect(pg.locator('#b-q')).toHaveValue('');
  await expect(pg.locator('#b-min')).toHaveValue('');
  await expect(pg.locator('#b-reset')).toBeHidden();
  await expect(pg.locator('#gear-table th:has([data-sort="ilvl"])')).toHaveAttribute('aria-sort', 'descending'); // the sort stays
}

/** The Expansion dropdown's checkboxes, with the dropdown opened. */
async function expBoxes(pg) {
  if ((await pg.locator('#b-exp').getAttribute('aria-expanded')) !== 'true') {
    await pg.click('#b-exp');
  }
  return pg.locator('#b-exp-menu input');
}

/** Tick every expansion in the gear browser again, then close the dropdown. */
export async function allExpansions(pg) {
  for (const box of await (await expBoxes(pg)).all()) {
    if (!(await box.isChecked())) {
      await box.check();
    }
  }
  await pg.keyboard.press('Escape');
}

/** Every expansion is ticked by default; with only Endwalker ticked, the browser keeps gear of its equip level band
 * (81 to 90) and the button names it; the choice is saved. */
export async function checkExpansionFilter(pg) {
  await setJob(pg, 'WHM');
  await showTab(pg, 'browse');
  const allText = (await pg.locator('#b-exp').innerText()).trim(); // the default, before any filter is filled in
  await fillBrowser(pg, '', '', 100);
  await expect(pg.locator('#b-exp')).toHaveText(allText);
  const boxes = await expBoxes(pg);
  const all = await boxes.all();
  let allTicked = true;
  for (const b of all) {
    allTicked = allTicked && (await b.isChecked());
  }
  check(all.length === 6 && allTicked, 'every expansion is ticked by default');
  for (const b of all) {
    if ((await b.getAttribute('data-exp')) !== 'EW') {
      await b.uncheck();
    }
  }
  await pg.keyboard.press('Escape');
  await expect(pg.locator('#b-exp-menu')).toBeHidden();
  await expect(pg.locator('#b-exp')).toHaveText('Endwalker');
  await waitSaved(pg, "s => s.browse.expOff.join() === 'ARR,HW,SB,ShB,DT'");
  const lv = await pg.locator('#gear-table tbody tr td:nth-child(3)').allInnerTexts();
  check(
    lv.length > 0 && lv.every(x => Number.parseInt(x, 10) >= 81 && Number.parseInt(x, 10) <= 90),
    `Endwalker rows outside equip level 81-90: ${[...new Set(lv)].sort()}`,
  );
  await allExpansions(pg);
  await setUpShared(pg); // back to Sage for the next step
}

/** A number typed with more digits than the box keeps ("60.7" in Equip level, stored as 61) stays as typed after the box is left
 * and another Gear browser filter changes: only a change of the box's own setting rewrites the box. The strip's Synced level, which
 * counts each valid keystroke, keeps the text typed key by key while it has focus: "60.7" (counted as 61) and "1e1" ("1e" is no number
 * to the browser on the way). */
export async function checkTypedNumberStaysAfterOtherFilter(pg) {
  await showTab(pg, 'browse');
  const level = pg.locator('#level');
  for (const typed of ['60.7', '1e1']) {
    await level.focus();
    await pg.keyboard.press('Control+A');
    await level.pressSequentially(typed);
    await afterFrames(pg);
    await expect(level).toHaveValue(typed);
  }
  await setNumber(pg, '#level', '50'); // the shared setup
  const box = pg.locator('#b-lvl');
  await box.fill('60.7');
  await pg.waitForFunction(() => window.gsaDebug.app.browse.lvl === 61); // the typed value is committed, rounded
  await pg.keyboard.press('Tab');
  await pg.waitForFunction(() => document.activeElement?.id !== 'b-lvl');
  await afterFrames(pg);
  await (await expBoxes(pg)).first().uncheck(); // a change of another filter of the same group
  await waitSaved(pg, 's => s.browse.expOff.length === 1');
  await afterFrames(pg);
  await expect(box).toHaveValue('60.7');
  check((await pg.evaluate(() => window.gsaDebug.app.browse.lvl)) === 61, 'the setting in use is the rounded 61');
  await allExpansions(pg);
  await box.fill('');
  await pg.keyboard.press('Tab');
  await pg.waitForFunction(() => window.gsaDebug.app.browse.lvl === '');
}

/** PLD (1H weapon + shield) offers an Off-hand slot in the browser; two-handed jobs do not. */
export async function checkPldOffhand(pg) {
  await setJob(pg, 'PLD');
  await showTab(pg, 'browse');
  // the Slot menu's choices (data-slot keys); waited for, since the list is worked out after the job switch
  await expect(pg.locator('#b-slots [data-slot="offhand"]')).toHaveCount(1);
  await pg.screenshot({ path: shot('browser.png'), fullPage: true });
  await setJob(pg, 'WAR');
  await expect(pg.locator('#b-slots [data-slot="offhand"]')).toHaveCount(0);
}
