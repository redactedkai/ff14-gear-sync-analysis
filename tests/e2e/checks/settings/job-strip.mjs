// Settings panel: the job strip under the tabs.

import { DEBOUNCE_SETTLE_MS, NARROW } from '../../lib/constants.mjs';
import { check, expect } from '../../lib/expect.mjs';
import { afterFrames, hasHScroll, pickJob, setCap, setJob, setNumber, showTab } from '../../lib/nav.mjs';
import { SHARED_SETUP } from '../../lib/setup.mjs';

/** The strip's gap under the tab bar, in px (on the Gear browser). */
const STRIP_GAP_UNDER_TABS = 18;

/** Window height, in px, for the scroll check on How the math works: shorter than that page at any job and sync. */
const SHORT_WINDOW_HEIGHT = 400;

/** On How the math works the math bar sits this far under the tab bar's rule (its sub-tabs have 6 px of their own padding
 * above their text), and pinned it sits flush at the top of the window: the page has no strip there. */
const MATH_BAR_GAP_UNDER_TABS = 12;

/** The y of the tab bar and how far the strip's top is under the tab bar, read from the page. */
const measureTabBar = pg =>
  pg.evaluate(() => {
    const tabs = document.querySelector('nav.tabs').getBoundingClientRect();
    const strip = document.querySelector('.jobstrip').getBoundingClientRect();
    return { tabs: tabs.top, stripUnderTabs: strip.top - tabs.bottom, stripHeight: strip.height, stripShown: strip.height > 0 };
  });

/** The Gear browser shows one narrow Job and sync strip under the tab bar (How the math works has none: its Job box is in the math
 * bar): the job box (icon, name, code) opens a menu of job icons by role, Reset sits at the right, the tab bar stays put on every
 * tab, the strip is one row at 960 px, and a job switch asks nothing. */
export async function checkJobStrip(pg) {
  await pg.setViewportSize(NARROW);
  await showTab(pg, 'browse');
  await setJob(pg, 'SGE');
  await setNumber(pg, '#level', '100');
  await pg.locator('#sync').uncheck();
  await expect(pg.locator('#job-menu')).toBeHidden(); // picking a job closes the menu
  check((await pg.locator('#job-name').innerText()) === 'Sage', 'the job box names the job');
  check((await pg.locator('#job-code').innerText()) === '(SGE)', 'the job box shows the short code');

  // the tab bar does not move between tabs; the strip sits the same distance under it; one row, no sideways scroll
  await pg.click('[data-tab=sheets]');
  await expect(pg.locator('.jobstrip')).toBeHidden(); // Alpine hides the strip a tick after the click
  const onSheets = await measureTabBar(pg);
  check(!onSheets.stripShown, 'the Sheets tab has no strip');
  await pg.click('[data-tab=browse]');
  await expect(pg.locator('.jobstrip')).toBeVisible();
  const onBrowser = await measureTabBar(pg);
  check(
    Math.abs(onBrowser.tabs - onSheets.tabs) <= 1,
    `the tab bar sits ${onBrowser.tabs - onSheets.tabs} px lower on the Gear browser than on Sheets`,
  );
  check(
    Math.abs(onBrowser.stripUnderTabs - STRIP_GAP_UNDER_TABS) <= 1,
    `the strip is ${onBrowser.stripUnderTabs} px under the tab bar on the Gear browser, expected ${STRIP_GAP_UNDER_TABS}`,
  );
  check(onBrowser.stripHeight < 100, `the strip is ${onBrowser.stripHeight} px tall on the Gear browser at 960 px: it wrapped`);
  // How the math works has no strip: the tab bar stays put and the math bar sits under it
  await pg.click('[data-tab=math]');
  await expect(pg.locator('#m-bar')).toBeVisible();
  await expect(pg.locator('.jobstrip')).toBeHidden();
  const onMath = await measureTabBar(pg);
  check(
    Math.abs(onMath.tabs - onSheets.tabs) <= 1,
    `the tab bar sits ${onMath.tabs - onSheets.tabs} px lower on How the math works than on Sheets`,
  );
  const barUnderTabs = await pg.evaluate(
    () => document.querySelector('#m-bar').getBoundingClientRect().top - document.querySelector('nav.tabs').getBoundingClientRect().bottom,
  );
  check(
    Math.abs(barUnderTabs - MATH_BAR_GAP_UNDER_TABS) <= 1,
    `the math bar is ${barUnderTabs} px under the tab bar, expected ${MATH_BAR_GAP_UNDER_TABS}`,
  );
  check(!(await hasHScroll(pg)), 'sideways scroll at 960 with the strip');

  // the menu: opens on click, lists every job, marks the current one, closes on Escape and on a click outside
  await pg.click('[data-tab=browse]');
  await pg.click('#job-menu-btn');
  await expect(pg.locator('#job-menu')).toBeVisible();
  await expect(pg.locator('#job-menu-btn')).toHaveAttribute('aria-expanded', 'true');
  check((await pg.locator('#job-menu [data-job-id]').count()) === 23, 'the job menu lists all 23 combat jobs');
  await expect(pg.locator('#job-menu [data-job-id="SGE"]')).toHaveAttribute('aria-checked', 'true');
  // a job tile does not move under the pointer: hover lifts only its icon, so a pointer on the tile's bottom edge keeps hovering
  const tileBefore = await pg.locator('.jobbtn').first().boundingBox();
  await pg.mouse.move(tileBefore.x + tileBefore.width / 2, tileBefore.y + tileBefore.height / 2);
  await pg.evaluate(() => Promise.all(document.getAnimations().map(animation => animation.finished))); // the hover lift's transition has ended
  const tileHovered = await pg.locator('.jobbtn').first().boundingBox();
  check(
    Math.abs(tileHovered.y - tileBefore.y) < 0.01,
    `a job tile moves ${tileHovered.y - tileBefore.y} px when hovered, it should stay put (hover flicker on its bottom edge)`,
  );
  check(!(await hasHScroll(pg)), 'sideways scroll at 960 with the job menu open');
  await pg.keyboard.press('Escape');
  await expect(pg.locator('#job-menu')).toBeHidden();
  await pg
    .waitForFunction(() => document.activeElement?.id === 'job-menu-btn', null, { timeout: 3000 })
    .catch(() => check(false, 'Escape leaves the focus on the job box'));
  await pg.click('#job-menu-btn');
  await expect(pg.locator('#job-menu')).toBeVisible();
  // a click outside the menu closes it
  await pg.mouse.click(5, 5);
  await expect(pg.locator('#job-menu')).toBeHidden();

  // How the math works: the math bar sticks flush at the top of the window while the page scrolls
  await pg.click('[data-tab=math]');
  await expect(pg.locator('#m-bar')).toBeVisible();
  await afterFrames(pg); // the new screen has been put at the top, which scrolling now would not be pulled back from
  await pg.setViewportSize({ width: NARROW.width, height: SHORT_WINDOW_HEIGHT }); // shorter than the page, so it scrolls whatever the layout
  await pg.evaluate(() => window.scrollTo(0, 400));
  await pg.waitForFunction(() => window.scrollY > 100);
  const pinnedBarTop = await pg.evaluate(() => document.querySelector('#m-bar').getBoundingClientRect().top);
  check(Math.abs(pinnedBarTop) <= 1, `scrolled, the math bar is ${pinnedBarTop} px from the top, expected 0`);
  await pg.evaluate(() => window.scrollTo(0, 0));
  await pg.setViewportSize(NARROW);
  await pg.click('[data-tab=browse]');

  // picking a job switches at once with no prompt; level and sync follow the fields
  let asked = false;
  pg.once('dialog', d => {
    asked = true;
    d.dismiss();
  });
  await pickJob(pg, 'WAR');
  await expect(pg.locator('[data-job]')).toHaveAttribute('data-job', 'WAR');
  check(!asked, 'switching job asked a question');
  check((await pg.locator('#job-name').innerText()) === 'Warrior', 'the job box follows the switch');
  await setNumber(pg, '#level', '90');
  await setCap(pg, '275');

  // each tab keeps its own settings: the math tab is not Warrior at 90
  await pg.click('[data-tab=math]');
  await expect(pg.locator('[data-job]')).not.toHaveAttribute('data-job', 'WAR');
  await pg.click('[data-tab=browse]');
  await setJob(pg, 'SGE');
  await setNumber(pg, '#level', SHARED_SETUP.level);
  await setCap(pg, SHARED_SETUP.cap); // back to the shared setup

  // a lowered-cap note stays on one line and the sync toggle stays where it was
  await setNumber(pg, '#level', '60');
  // the page checks the cap against the new level TYPING_DEBOUNCE_MS (300 ms) later and replaces the lowered-cap note with
  // what that check lowered (nothing here); nothing on the page shows when it has run, so let it run before the cap is typed
  await pg.waitForTimeout(DEBOUNCE_SETTLE_MS);
  const toggleBefore = await pg.locator('#sync').boundingBox();
  await setCap(pg, '400');
  await expect(pg.locator('#cap-lowered')).toBeVisible();
  const noteBox = await pg.locator('#cap-lowered').boundingBox();
  check(noteBox.height < 25, `the lowered-cap note is ${noteBox.height} px tall: it wraps to two lines`);
  const toggleAfter = await pg.locator('#sync').boundingBox();
  check(
    Math.abs(toggleAfter.x - toggleBefore.x) < 0.5,
    `the sync toggle moved ${toggleAfter.x - toggleBefore.x} px sideways when the lowered-cap note showed`,
  );
  // the cap first: the level change starts the page's 300 ms timer that lowers a cap above the level's limit (135 at level
  // 50), which overwrote the 123 typed between the fill and the change under load; 123 is under the limit, so it stays
  await setCap(pg, SHARED_SETUP.cap);
  await setNumber(pg, '#level', SHARED_SETUP.level);
  await pg.setViewportSize({ width: 1280, height: 900 });
}
