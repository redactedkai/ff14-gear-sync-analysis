/* Stories of <gsa-bar-popover>: a chip's popover takes the focus to its field, hangs from the chip's right edge where it would
   run past the bar, and closes by Escape (the focus back on the chip), a press outside or Tab out; the modal help keeps Tab
   inside, closes on a press on its backdrop and by Escape; axe. */
import { test, expect } from '../fixtures.ts';
import type { Default } from './bar-popover.story.js';

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
