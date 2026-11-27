// How the math works: the bar. Each of Stat Allocation and Substat tiers has its own Job box (GCD Scaling none), the Sync settings chip
// and its popover, and one height for the boxes of Substat tiers and the Gear browser strip. The controls row's three layouts with their
// dividers, Stat Allocation's box heights and the sub-tabs that stay put are `tests/stories/math-page/math-bar.spec.ts`'s.

import { LEVEL_TEXT, rangeOnly } from '../../../../src/ui/level-cap.ts';
import { SYNC_CHIP_TEXT } from '../../../../src/ui/views/sync-explainer.ts';
import { check, expect, poll } from '../../lib/expect.ts';
import { afterFrames, setJob, setNumber, showMath, showTab, waitReady, waitSaved } from '../../lib/nav.ts';
import { setUpShared } from '../../lib/setup.ts';
import { pickOption } from '../../lib/select.ts';
import type { Page } from 'playwright';

/** The window the later steps expect after a step that resized it. */
const DEFAULT_WINDOW = { width: 1000, height: 900 };

/** The words the Sync chip says for IL Sync on or off at `level` and item level `cap`. */
const chipWords = (level: number | string, cap: number | string) =>
  `${SYNC_CHIP_TEXT.level(level)}${SYNC_CHIP_TEXT.separator}${SYNC_CHIP_TEXT.itemLevel(cap)}`;

/** Stat Allocation and Substat tiers each have their own job in the bar's Job box; GCD Scaling has no Job box; neither job touches
 * the Gear browser's, and a reload keeps both. (Substat tiers' level being its job's level cap is `checkTiers`' and `state.tiers-job`'s.) */
export async function checkMathJobs(pg: Page) {
  await pg.setViewportSize(DEFAULT_WINDOW);
  const jobName = () => pg.locator('#m-job-name').innerText();
  await showMath(pg, 'piece');
  await setJob(pg, 'BLM');
  await expect(pg.locator('#m-job-name')).toHaveText('Black Mage');
  await pg.click('[data-sub=tiers]');
  await expect(pg.locator('#tab-tiers')).toBeVisible();
  // Substat tiers starts on the job Stat Allocation had when the page opened (the default one), not on its later pick
  check((await jobName()) !== 'Black Mage', "Substat tiers took Stat Allocation's job");
  await setJob(pg, 'WAR');
  await expect(pg.locator('#m-job-name')).toHaveText('Warrior');
  await pg.click('[data-sub=piece]');
  await expect(pg.locator('#tab-piece')).toBeVisible();
  await expect(pg.locator('#m-job-name')).toHaveText('Black Mage');
  await expect(pg.locator('#p-level')).toHaveValue('50');
  await pg.click('[data-sub=gcd]');
  await expect(pg.locator('#tab-gcd')).toBeVisible();
  await expect(pg.locator('#m-job-wrap')).toBeHidden();
  // the Gear browser keeps its own job
  await showTab(pg, 'browse', true);
  await expect(pg.locator('[data-job]')).toHaveAttribute('data-job', 'SGE');
  // each job is saved on its own and survives a reload
  await waitSaved(pg, "s => s.browse.job === 'SGE' && s.piece.job === 'BLM' && s.tiers.job === 'WAR'");
  await pg.reload();
  await waitReady(pg);
  await pg.click('[data-tab=math]');
  await expect(pg.locator('#tab-math')).toBeVisible();
  await pg.click('[data-sub=piece]');
  await expect(pg.locator('#m-job-name')).toHaveText('Black Mage');
  await pg.click('[data-sub=tiers]');
  await expect(pg.locator('#m-job-name')).toHaveText('Warrior');
  // back to the shared setup
  await setJob(pg, 'SGE');
  await pg.click('[data-sub=piece]');
  await setJob(pg, 'SGE');
  await setUpShared(pg);
}

/** The Sync settings chip says the synced level and item level in a few words, opens a popover with Level, Synced IL and the IL Sync
 * switch, and closes it on Escape with the focus on the chip. IL Sync off puts level sync's item level in the greyed cap box, and a
 * level change moves it; the weapon's inferred level sync target carries a gold star over the chip. The chip's other states (none at
 * the level cap, "Enter IL" in red, the cap lowered) are `sync-explainer.chips`'s, the cap's rule `cap-follow` and
 * `job-sync-panel.level-sync-cap`'s. */
export async function checkSyncChip(pg: Page) {
  await pg.setViewportSize(DEFAULT_WINDOW);
  await showMath(pg, 'piece');
  // the shared setup carried over: level 50, IL Sync on, item level 123
  await expect(pg.locator('#p-sync-text')).toHaveText(chipWords(50, 123));
  await pg.click('#p-sync-chip');
  await expect(pg.locator('#p-sync-pop')).toBeVisible();
  await expect(pg.locator('#p-level')).toHaveValue('50');
  await expect(pg.locator('#p-cap')).toHaveValue('123');
  await expect(pg.locator('#p-cap')).toBeEnabled();
  check(await pg.locator('#p-sync').isChecked(), 'IL Sync is off after the shared setup');
  await pg.keyboard.press('Escape');
  await expect(pg.locator('#p-sync-pop')).toBeHidden();
  // the popover gives the focus back a frame after it closes
  await poll('Escape leaves the focus on the Sync settings chip', async () => {
    const got = await pg.evaluate(() => document.activeElement?.id);
    return { ok: got === 'p-sync-chip', got: `the focus is on '${got}'` };
  });

  // IL Sync off at level 50: the cap is level sync's item level, 130 (ParamGrow.ItemLevelSync); the box is greyed
  await pg.click('#p-sync-chip');
  await pg.locator('#p-sync').uncheck();
  await expect(pg.locator('#p-cap')).toHaveValue('130');
  await expect(pg.locator('#p-cap')).toBeDisabled();
  await expect(pg.locator('#p-sync-text')).toHaveText(chipWords(50, 130));
  await expect(pg.locator('#p-sync-text .il.quiet')).toHaveCount(1);
  // a level change with IL Sync off moves the cap with it
  await setNumber(pg, '#level', '85');
  await expect(pg.locator('#p-cap')).toHaveValue('536');
  await expect(pg.locator('#p-sync-text')).toHaveText(chipWords(85, 536));
  // the weapon's level sync target is inferred: a gold star over the chip, for the weapon and the off-hand only
  await pg.keyboard.press('Escape');
  await pickOption(pg, '#p-slot', 'weapon');
  await expect(pg.locator('#p-sync-guess-mark')).toBeVisible();
  check(
    await pg.locator('#p-sync-guess-mark').evaluate(el => el.textContent === '*'),
    'the Sync settings label has no star for the weapon',
  );
  await pickOption(pg, '#p-slot', 'head');
  await expect(pg.locator('#p-sync-guess-mark')).toBeHidden();
  // the Gear browser's panel was not touched by any of this (the shared setup)
  await showTab(pg, 'browse', true);
  check((await pg.inputValue('#cap')) === '123' && (await pg.inputValue('#level')) === '50', "the Gear browser's level or cap changed");
  await setUpShared(pg);
}

/** Stat Allocation's Level box (in the Sync settings popover) on the real page: a level above the job's cap is flagged (a red flag
 * in the label line with the range and "only", the sentence as the box's name for a screen reader, the chip red), an empty box too,
 * and the stored level stays as it was; a good level clears it (and is stored as typed); leaving the popover drops the text. The
 * other bad texts and the box's rules are `level-cap.level-text`'s and `tests/stories/app/level-field.spec.ts`'s. */
export async function checkLevelBox(pg: Page) {
  await pg.setViewportSize(DEFAULT_WINDOW);
  await showMath(pg, 'piece');
  const storedLevel = () => pg.evaluate(() => window.gsaDebug.app.level);
  const flag = pg.locator('.sync-level .f-flag');
  await pg.click('#p-sync-chip');
  await expect(pg.locator('#p-level')).toHaveValue('50');
  const max = Number(((await pg.locator('#p-level-range').innerText()).match(/\d+$/) ?? [])[0]);
  check(max > 0, 'the Level range does not end in the job level cap');
  await expect(pg.locator('#p-level-range')).toHaveText(LEVEL_TEXT.range(max));
  await expect(flag).toBeHidden();
  for (const text of [String(max + 1)]) {
    await pg.fill('#p-level', text);
    await expect(flag).toBeVisible();
    await expect(flag).toContainText(rangeOnly(LEVEL_TEXT.range(max)));
    await expect(pg.locator('#p-level-error')).toHaveText(LEVEL_TEXT.typedBad(max));
    await expect(pg.locator('#p-level')).toHaveAttribute('aria-invalid', 'true');
    await expect(pg.locator('#p-sync-chip.error')).toHaveCount(1);
    check((await storedLevel()) === 50, `the level '${text}' changed the stored level to ${await storedLevel()}`);
  }
  // an empty box is no level either
  await pg.fill('#p-level', '');
  await expect(flag).toBeVisible();
  check((await storedLevel()) === 50, 'an empty Level box changed the stored level');
  // a good level clears the flag and is stored as typed; the cap box beside it is flagged the same way
  await pg.fill('#p-level', '60');
  await expect(flag).toBeHidden();
  await expect(pg.locator('#p-level')).toHaveAttribute('aria-invalid', 'false');
  await expect(pg.locator('#p-sync-chip.error')).toHaveCount(0);
  check((await storedLevel()) === 60, `a level of 60 is stored as ${await storedLevel()}`);
  // leaving the popover with bad text in the box drops it: the box shows the stored level again
  await pg.fill('#p-level', '0');
  await expect(flag).toBeVisible();
  await pg.keyboard.press('Escape');
  await pg.click('#p-sync-chip');
  await expect(pg.locator('#p-level')).toHaveValue('60');
  await expect(flag).toBeHidden();
  await pg.keyboard.press('Escape');
  await setUpShared(pg);
}

/** On the real page, the Job box of Substat tiers and its Level box, and the Gear browser strip's Job, Level and Item level boxes, are as
 * high as the Job box of Stat Allocation: 16 px and 1.5 rem, at normal and larger text. (Stat Allocation's own boxes, the three layouts
 * of the controls row with their rules and gaps, and the sub-tabs keeping their places are `math-bar.spec.ts`'s.) */
export async function checkMathBarBoxes(pg: Page) {
  await pg.setViewportSize({ width: 1280, height: 900 });
  await showMath(pg, 'piece');
  const heights = (selectors: string[]) =>
    pg.evaluate(
      selectorList =>
        selectorList.map((selector): [string, number] => {
          const element = document.querySelector(selector);
          if (!element) {
            throw new Error(`no ${selector}`);
          }
          return [selector, Math.round(element.getBoundingClientRect().height * 10) / 10];
        }),
      selectors,
    );
  for (const zoom of ['100%', '125%']) {
    await pg.evaluate(fontSize => (document.documentElement.style.fontSize = fontSize), zoom);
    await afterFrames(pg);
    const rem = await pg.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
    const expected = 16 + 1.5 * rem;
    await pg.click('[data-sub=tiers]');
    await expect(pg.locator('#t-level')).toBeVisible();
    for (const [selector, height] of await heights(['#m-job-btn', '#t-level'])) {
      check(Math.abs(height - expected) <= 0.6, `${selector} is ${height} px tall at text ${zoom} on Substat tiers, expected ${expected}`);
    }
    await pg.click('[data-sub=piece]');
    await expect(pg.locator('#tab-piece')).toBeVisible();
    await showTab(pg, 'browse', true);
    for (const [selector, height] of await heights(['#job-menu-btn', '#level', '#cap'])) {
      check(
        Math.abs(height - expected) <= 0.6,
        `${selector} of the Gear browser strip is ${height} px tall at text ${zoom}, expected ${expected}`,
      );
    }
    await showMath(pg, 'piece');
  }
  await pg.evaluate(() => (document.documentElement.style.fontSize = ''));
  await pg.setViewportSize(DEFAULT_WINDOW);
  await setUpShared(pg);
}
