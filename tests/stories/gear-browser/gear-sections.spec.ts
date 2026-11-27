/* Story of <gsa-gear-sections>: the keys of its tabs (the WAI-ARIA tabs pattern: the arrows, Home and End move and select, wrapping;
   only the selected tab is in the Tab order, and Tab goes on into its boxes), a box unticked is sent as left out, and axe. The menu
   around it (open, Escape, the 960 px fit) is gear-categories.spec.ts. */
import { expect, test } from '../fixtures.ts';
import type { Default } from './gear-sections.story.ts';

const STORY = 'gear-browser/gear-sections/Default';
const TAB_IDS = ['b-from-tab-everyday', 'b-from-tab-side-content', 'b-from-tab-hard-content'];

test.describe('<gsa-gear-sections>', () => {
  test('the arrows, Home and End move between the tabs and select them, wrapping; Tab goes from the selected tab into its boxes', async ({
    mount,
    page,
  }) => {
    await mount<typeof Default>(STORY);
    await expect(page.getByRole('tab', { selected: true })).toHaveCount(1);
    await page.locator(`#${TAB_IDS[0]}`).focus();
    for (const [key, expected] of [
      ['ArrowRight', 1],
      ['ArrowRight', 2],
      ['ArrowRight', 0],
      ['ArrowLeft', 2],
      ['Home', 0],
      ['End', 2],
    ] as const) {
      await page.keyboard.press(key);
      await expect(page.locator(`#${TAB_IDS[expected]}`), `after ${key}`).toBeFocused();
      await expect(page.locator(`#${TAB_IDS[expected]}`), `after ${key}`).toHaveAttribute('aria-selected', 'true');
    }
    // the other tabs leave the Tab order; the next stop is a box of the selected tab's panel
    await expect(page.locator(`#${TAB_IDS[0]}`)).toHaveAttribute('tabindex', '-1');
    await page.keyboard.press('Tab');
    await expect(page.locator('input[type="checkbox"]:focus')).toHaveCount(1);
  });

  test('unticking a box sends it as left out', async ({ mount, page }) => {
    const component = await mount<typeof Default>(STORY);
    await page.locator('[data-activity="crafted"]').uncheck();
    await expect(component.getByTestId('events')).toHaveText('[{"exclude":["crafted"]}]');
  });

  test('has no axe violations', async ({ mount, axe }) => {
    await mount<typeof Default>(STORY);
    expect(await axe()).toEqual([]);
  });
});
