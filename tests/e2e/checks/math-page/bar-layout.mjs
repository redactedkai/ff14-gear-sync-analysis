// How the math works: the bar. Each of Stat Allocation and Substat tiers has its own Job box (GCD Scaling none), the Sync settings chip
// and its popover, the three layouts of the controls row with their dividers, one height for every box, and sub-tab buttons that stay put.

import { LEVEL_TEXT, rangeOnly } from '../../../../src/ui/level-cap.js';
import { SYNC_CHIP_TEXT } from '../../../../src/ui/views/sync-explainer.js';
import { check, expect } from '../../lib/expect.mjs';
import { afterFrames, hasHScroll, setJob, setNumber, showMath, showTab, waitReady, waitSaved } from '../../lib/nav.mjs';
import { setUpShared } from '../../lib/setup.mjs';

/** The window the later steps expect after a step that resized it. */
const DEFAULT_WINDOW = { width: 1000, height: 900 };

/** The words the Sync chip says for IL Sync on or off at `level` and item level `cap`. */
const chipWords = (level, cap) => `${SYNC_CHIP_TEXT.level(level)}${SYNC_CHIP_TEXT.separator}${SYNC_CHIP_TEXT.itemLevel(cap)}`;

/** Stat Allocation and Substat tiers each have their own job in the bar's Job box; GCD Scaling has no Job box; neither job touches
 * the Gear browser's, and a reload keeps both. Substat tiers' level is its job's level cap, whatever level Stat Allocation is at. */
export async function checkMathJobs(pg) {
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
  await expect(pg.locator('#t-level')).toHaveValue('100'); // the job's level cap, not Stat Allocation's level (the shared setup's 50)
  await expect(pg.locator('#t-level-range')).toHaveText('1–100');
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
 * switch, and closes it on Escape with the focus on the chip. IL Sync off keeps level sync's item level as the cap (the greyed box shows
 * it; none at the level cap, where the chip says "Unsynced"); IL Sync on keeps it; an empty cap with IL Sync on is "Enter IL" in red;
 * the weapon's inferred level sync target carries a gold star over the chip. */
export async function checkSyncChip(pg) {
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
  check((await pg.evaluate(() => document.activeElement?.id)) === 'p-sync-chip', 'Escape leaves the focus on the Sync settings chip');

  // IL Sync off at level 50: the cap is level sync's item level, 130 (ParamGrow.ItemLevelSync); the box is greyed
  await pg.click('#p-sync-chip');
  await pg.locator('#p-sync').uncheck();
  await expect(pg.locator('#p-cap')).toHaveValue('130');
  await expect(pg.locator('#p-cap')).toBeDisabled();
  await expect(pg.locator('#p-sync-text')).toHaveText(chipWords(50, 130));
  await expect(pg.locator('#p-sync-text .il.quiet')).toHaveCount(1);
  // at the level cap there is no level sync: no cap, and the chip says so
  await setNumber(pg, '#level', '100');
  await expect(pg.locator('#p-cap')).toHaveValue('');
  await expect(pg.locator('#p-sync-text')).toHaveText(SYNC_CHIP_TEXT.notSynced);
  // IL Sync on with no item level
  await pg.locator('#p-sync').check();
  await expect(pg.locator('#p-sync-text')).toHaveText(`${SYNC_CHIP_TEXT.level(100)}${SYNC_CHIP_TEXT.separator}${SYNC_CHIP_TEXT.needCap}`);
  await expect(pg.locator('#p-sync-text .il.error')).toHaveCount(1);
  await setNumber(pg, '#cap', '690');
  await expect(pg.locator('#p-sync-text')).toHaveText(chipWords(100, 690));
  // switching off and on again keeps what is stored: off gives no cap at level 100, on starts empty
  await pg.locator('#p-sync').uncheck();
  await expect(pg.locator('#p-cap')).toHaveValue('');
  await pg.locator('#p-sync').check();
  await expect(pg.locator('#p-cap')).toHaveValue('');
  // a level change with IL Sync off moves the cap with it
  await pg.locator('#p-sync').uncheck();
  await setNumber(pg, '#level', '85');
  await expect(pg.locator('#p-cap')).toHaveValue('536');
  await expect(pg.locator('#p-sync-text')).toHaveText(chipWords(85, 536));
  // the weapon's level sync target is inferred: a gold star over the chip, for the weapon and the off-hand only
  await pg.keyboard.press('Escape');
  await pg.selectOption('#p-slot', 'weapon');
  await expect(pg.locator('#p-sync-guess-mark')).toBeVisible();
  check(
    await pg.locator('#p-sync-guess-mark').evaluate(el => el.textContent === '*'),
    'the Sync settings label has no star for the weapon',
  );
  await pg.selectOption('#p-slot', 'head');
  await expect(pg.locator('#p-sync-guess-mark')).toBeHidden();
  // the Gear browser's panel was not touched by any of this (the shared setup)
  await showTab(pg, 'browse', true);
  check((await pg.inputValue('#cap')) === '123' && (await pg.inputValue('#level')) === '50', "the Gear browser's level or cap changed");
  await setUpShared(pg);
}

/** Stat Allocation's Level box (in the Sync settings popover) flags text that is no level as the Synced IL box flags a bad item
 * level: a red flag in the label line with the range and "only", the sentence as the box's name for a screen reader, the chip red; the
 * stored level stays as it was; a good level clears it (and is stored as typed); leaving the popover drops the text. */
export async function checkLevelBox(pg) {
  await pg.setViewportSize(DEFAULT_WINDOW);
  await showMath(pg, 'piece');
  const storedLevel = () => pg.evaluate(() => document.querySelector('#tab-math')._x_dataStack[0].$store.app.level);
  const flag = pg.locator('.sync-level .f-flag');
  await pg.click('#p-sync-chip');
  await expect(pg.locator('#p-level')).toHaveValue('50');
  const max = Number(((await pg.locator('#p-level-range').innerText()).match(/\d+$/) ?? [])[0]);
  check(max > 0, 'the Level range does not end in the job level cap');
  await expect(pg.locator('#p-level-range')).toHaveText(LEVEL_TEXT.range(max));
  await expect(flag).toBeHidden();
  for (const text of ['0', String(max + 1), '-5', '12.5']) {
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
  await pg.fill('#p-cap', '0');
  await expect(pg.locator('.sync-cap .f-flag')).toContainText('only');
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

/** The controls row's three layouts, each made on purpose by the bar's own width (rem, so text size counts): wide, one row (Job,
 * Piece, Sync, Item level group); middle, the Item level group on a second row; narrow, Job and Piece on the first row and Sync with the
 * Item level group on the second. A rule is drawn before a divided section only where it does not start a line, with the wider gap (24
 * px) after the Job box and after Sync settings; nothing scrolls sideways. */
export async function checkMathBarLayouts(pg) {
  await showMath(pg, 'piece');
  const measure = () =>
    pg.evaluate(() => {
      const box = selector => document.querySelector(selector).getBoundingClientRect();
      const row = box('.barrow');
      const parts = { job: '#m-job-wrap', piece: '.piecesec', sync: '#p-sync-wrap', item: '#p-ilgroup' };
      const boxes = Object.fromEntries(Object.entries(parts).map(([name, selector]) => [name, box(selector)]));
      // a rule is drawn at its section's left edge less half the gap: it shows when that is inside the row
      const rules = [...document.querySelectorAll('.barrow .divided')].filter(
        el => el.offsetParent && el.getBoundingClientRect().left > row.left + 1,
      );
      return {
        tops: Object.fromEntries(Object.entries(boxes).map(([name, b]) => [name, Math.round(b.top)])),
        gapAfterJob: boxes.piece.left - boxes.job.right,
        gapAfterSync: boxes.item.left - boxes.sync.right,
        rules: rules.length,
        rowWidth: row.width,
        rem: parseFloat(getComputedStyle(document.documentElement).fontSize),
      };
    });
  const setText = zoom => pg.evaluate(zoom => (document.documentElement.style.fontSize = zoom), zoom);
  const same = (...tops) => tops.every(top => Math.abs(top - tops[0]) <= 2);
  const wide = { width: 1280, height: 900 };
  for (const [name, size, zoom] of [
    ['wide', wide, '100%'],
    ['middle', { width: 1100, height: 900 }, '100%'],
    ['middle at the floor', { width: 960, height: 900 }, '100%'],
    ['narrow', { width: 960, height: 900 }, '150%'],
  ]) {
    await pg.setViewportSize(size);
    await setText(zoom);
    await afterFrames(pg);
    await afterFrames(pg);
    const m = await measure();
    const t = m.tops;
    const layout = same(t.job, t.piece, t.sync, t.item)
      ? 'wide'
      : same(t.job, t.piece, t.sync) && t.item > t.job
        ? 'middle'
        : same(t.job, t.piece) && same(t.sync, t.item) && t.sync > t.job
          ? 'narrow'
          : 'other';
    check(
      layout === name.split(' ')[0],
      `the controls row at ${size.width} px, text ${zoom}, is the ${layout} layout (${JSON.stringify(t)}), expected ${name.split(' ')[0]}`,
    );
    check(
      m.gapAfterJob >= 23.5 && m.gapAfterJob <= 24.5,
      `the gap after the Job box is ${m.gapAfterJob} px at ${size.width} px, text ${zoom}, expected 24`,
    );
    if (layout !== 'middle') {
      check(
        m.gapAfterSync >= 23.5 && m.gapAfterSync <= 24.5,
        `the gap after Sync settings is ${m.gapAfterSync} px at ${size.width} px, text ${zoom}, expected 24`,
      );
    }
    // the rules: before Piece (after the Job box) and before the Item level group, when neither starts a line
    const want = { wide: 2, middle: 1, narrow: 2 }[layout];
    check(m.rules === want, `${m.rules} rules show at ${size.width} px, text ${zoom} (${layout}), expected ${want}`);
    check(!(await hasHScroll(pg)), `sideways scroll at ${size.width} px, text ${zoom}`);
  }
  await setText('');
  await pg.setViewportSize(DEFAULT_WINDOW);
}

/** Every box of the bar is as high as the Job box, at normal and larger text, and so are the Gear browser strip's boxes (a box is
 * 16 px and 1.5 rem tall); the sub-tab buttons keep their places whichever sub-tab is open. */
export async function checkMathBarBoxes(pg) {
  await pg.setViewportSize({ width: 1280, height: 900 });
  await showMath(pg, 'piece');
  const heights = selectors =>
    pg.evaluate(
      selectors =>
        selectors.map(selector => [selector, Math.round(document.querySelector(selector).getBoundingClientRect().height * 10) / 10]),
      selectors,
    );
  const bar = ['#m-job-btn', '#p-slot', '#p-piece-chip', '#p-sync-chip', '#p-ilvl'];
  for (const zoom of ['100%', '125%']) {
    await pg.evaluate(zoom => (document.documentElement.style.fontSize = zoom), zoom);
    await afterFrames(pg);
    const rem = await pg.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
    const expected = 16 + 1.5 * rem;
    for (const [selector, height] of await heights(bar)) {
      check(Math.abs(height - expected) <= 0.6, `${selector} is ${height} px tall at text ${zoom}, expected ${expected}`);
    }
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
  // the sub-tab buttons do not move when another sub-tab is chosen
  const lefts = () =>
    pg.evaluate(() =>
      [...document.querySelectorAll('.subtabs button')].map(button => Math.round(button.getBoundingClientRect().left * 10) / 10),
    );
  const before = await lefts();
  for (const sub of ['gcd', 'tiers', 'piece']) {
    await pg.click(`[data-sub=${sub}]`);
    await expect(pg.locator(`#tab-${sub}`)).toBeVisible();
    const after = await lefts();
    check(JSON.stringify(after) === JSON.stringify(before), `the sub-tab buttons moved when ${sub} opened: ${before} -> ${after}`);
  }
  await pg.setViewportSize(DEFAULT_WINDOW);
  await setUpShared(pg);
}
