/* Stories of <gsa-bar-popover>: a chip's popover takes the focus to its field, hangs from the chip's right edge where it would
   run past the bar, and closes by Escape (the focus back on the chip), a press outside or Tab out; the modal help keeps Tab
   inside, closes on a press on its backdrop and by Escape; axe. */
import { test, expect } from '../fixtures.ts';
import type { Default } from './bar-popover.story.js';
import { expectForcedColoursLook, tapOutside } from '../look.ts';

const STORY = 'math-page/bar-popover/Default';

test.describe('<gsa-bar-popover>', () => {
  test('a chip popover opens on its field, stays inside the bar, and closes by Escape, a press outside or Tab out', async ({
    mount,
    page,
    axe,
  }) => {
    const component = await mount<typeof Default>(STORY);
    const chip = page.locator('#story-chip');
    const popover = page.locator('#story-chip-pop');
    await chip.focus();
    await page.keyboard.press('ArrowDown');
    await expect(popover).toBeVisible();
    await expect(page.locator('#story-level')).toBeFocused();
    expect(await axe()).toEqual([]);
    // its right edge is the chip's: it would run past the bar's right end from the chip's left edge
    const chipBox = await chip.boundingBox();
    const popoverBox = await popover.boundingBox();
    expect(Math.abs((popoverBox?.x ?? 0) + (popoverBox?.width ?? 0) - ((chipBox?.x ?? 0) + (chipBox?.width ?? 0)))).toBeLessThan(2);

    await page.keyboard.press('Escape');
    await expect(popover).toBeHidden();
    await expect(chip).toBeFocused();

    await chip.click();
    await expect(popover).toBeVisible();
    await component.getByRole('textbox', { name: 'After the bar' }).click();
    await expect(popover).toBeHidden();

    await chip.click();
    await expect(page.locator('#story-level')).toBeFocused();
    await page.locator('#story-cap').focus();
    await page.keyboard.press('Tab');
    await expect(popover).toBeHidden();
  });

  test('the modal help keeps Tab inside, and Escape or a press on the backdrop closes it', async ({ mount, page, axe }) => {
    await mount<typeof Default>(STORY);
    const help = page.locator('#story-help');
    const popover = page.locator('#story-help-pop');
    await help.click();
    await expect(popover).toBeVisible();
    await expect(popover).toBeFocused();
    expect(await axe()).toEqual([]);
    for (let press = 0; press < 6; press++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => Boolean(document.activeElement?.closest('#story-help-pop')))).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(popover).toBeHidden();
    await expect(help).toBeFocused();

    await help.click();
    await expect(popover).toBeVisible();
    await page.mouse.click(5, 400);
    await expect(popover).toBeHidden();
  });
});

test.describe('<gsa-bar-popover> with touch', () => {
  test.use({ hasTouch: true });

  // Playwright's Firefox cannot close a touch-enabled context cleanly while other workers run (see slot-menu.spec.ts); the tap
  // fix concerns WebKit, and Chromium covers the rest.
  test.skip(({ browserName }) => browserName === 'firefox', 'a touch context cannot be closed reliably in Firefox under parallel workers');

  test('a tap on the chip opens its popover and a tap outside closes it; a tap on the help opens the modal help and a tap outside closes it', async ({
    mount,
    page,
  }) => {
    await mount<typeof Default>(STORY);
    const popover = page.locator('#story-chip-pop');
    await page.locator('#story-chip').tap();
    await expect(popover).toBeVisible();
    await tapOutside(page);
    await expect(popover).toBeHidden();

    const help = page.locator('#story-help-pop');
    await page.locator('#story-help').tap();
    await expect(help).toBeVisible();
    await tapOutside(page);
    await expect(help).toBeHidden();
  });
});

test.describe('<gsa-bar-popover> in forced colours', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'WebKit does not force colours');
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
  });
  test.afterEach(async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'none' });
  });

  test('the open chip popover and the modal help have an edge, and a focused field has a ring', async ({ mount, page }) => {
    await mount<typeof Default>(STORY);
    await page.locator('#story-chip').click();
    const popover = page.locator('#story-chip-pop');
    await expect(popover).toBeVisible();
    await expectForcedColoursLook(page, { panel: popover, ring: page.locator('#story-cap') });
    await page.keyboard.press('Escape');
    await expect(popover).toBeHidden();

    await page.locator('#story-help').click();
    const help = page.locator('#story-help-pop');
    await expect(help).toBeVisible();
    await expectForcedColoursLook(page, { panel: help, ring: help.getByRole('button', { name: 'a button' }) });
  });
});
