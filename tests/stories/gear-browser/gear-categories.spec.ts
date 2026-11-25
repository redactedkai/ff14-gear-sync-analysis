/* Stories of <gsa-gear-categories>: the keyboard model of its tabs (the WAI-ARIA tabs pattern: the arrows, Home and End move and
   select, wrapping; only the selected tab is in the Tab order), the way out of the menu (Escape gives the focus back to the button
   and keeps the tab; Tab closes it) and the menu's place in a 960 px row, in three engines. The page's smoke test covers the rest
   of the menu (texts, counts, All / None / Default) in Chromium. */
import { test, expect } from '../fixtures.ts';
import type { Default } from './gear-categories.story.js';

const STORY = 'gear-browser/gear-categories/Default';
const MENU = '#b-from-menu';
const TAB_IDS = ['b-from-tab-everyday', 'b-from-tab-side-content', 'b-from-tab-hard-content'];

test.describe('<gsa-gear-categories>', () => {
  test('the arrows, Home and End move between the tabs and select them; Tab goes from the selected tab into its boxes', async ({
    mount,
    page,
  }) => {
    await mount<typeof Default>(STORY);
    await page.locator('#b-from').click();
    await expect(page.locator(MENU)).toBeVisible();
    await page.locator(`#${TAB_IDS[0]}`).focus();
    const focusedId = () => page.evaluate(() => document.activeElement?.id);
    for (const [key, expected] of [
      ['ArrowRight', 1],
      ['ArrowRight', 2],
      ['ArrowRight', 0],
      ['ArrowLeft', 2],
      ['Home', 0],
      ['End', 2],
    ] as const) {
      await page.keyboard.press(key);
      await expect(page.locator(`#${TAB_IDS[expected]}`)).toHaveAttribute('aria-selected', 'true');
      expect(await focusedId(), `the focus after ${key}`).toBe(TAB_IDS[expected]);
    }
    await page.keyboard.press('Home');
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => (document.activeElement as HTMLElement).dataset.activity)).toBeTruthy();
  });

  test('Escape closes the menu with the focus on the button and keeps the tab; Tab out of the menu closes it', async ({ mount, page }) => {
    await mount<typeof Default>(STORY);
    const button = page.locator('#b-from');
    await button.click();
    await page.locator(`#${TAB_IDS[2]}`).click();
    await page.keyboard.press('Escape');
    await expect(page.locator(MENU)).toBeHidden();
    await expect(button).toBeFocused();
    await button.press('ArrowDown');
    await expect(page.locator(MENU)).toBeVisible();
    await expect(page.locator(`#${TAB_IDS[2]}`)).toHaveAttribute('aria-selected', 'true');

    // from the last control of the menu (Default) a Tab leaves it: the menu closes and the focus is on the next control
    await page.locator('[data-action="default"]').focus();
    await page.keyboard.press('Tab');
    await expect(page.locator(MENU)).toBeHidden();
    await expect(page.getByRole('button', { name: 'After' })).toBeFocused();
  });

  test('the open menu stays inside a 960 px window with nothing scrolling, and has no axe violations', async ({ mount, page, axe }) => {
    await page.setViewportSize({ width: 960, height: 700 });
    await mount<typeof Default>(STORY, { counts: { crafted: 1380, pvp: 0, quests: 1 } });
    expect(await axe(), 'closed').toEqual([]);
    await page.locator('#b-from').click();
    await expect(page.locator(MENU)).toBeVisible();
    const fit = await page.locator(MENU).evaluate(menu => {
      const box = menu.getBoundingClientRect();
      return {
        inside: box.left >= 0 && box.right <= document.documentElement.clientWidth && box.top >= 0 && box.bottom <= innerHeight,
        sideways: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        menuScrolls: menu.scrollHeight > menu.clientHeight + 1 || menu.scrollWidth > menu.clientWidth + 1,
      };
    });
    expect(fit).toEqual({ inside: true, sideways: false, menuScrolls: false });
    expect(await axe(), 'open').toEqual([]);
  });
});
