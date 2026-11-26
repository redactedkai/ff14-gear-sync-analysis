/* Stories of <gsa-switch-menu>: a caret that opens a plain list of links (no role=menu), the open set's row takes the focus,
   Escape closes it with the focus on the caret, Tab walks its rows and closes it past either end, a plain click on a row is a pick, and axe. */
import { test, expect } from '../fixtures.ts';
import { BUTTON_NAME, MENU_NAME, type Default } from './switch-menu.story.js';
import { tapOutside } from '../look.ts';

const STORY = 'sheets/switch-menu/Default';

test.describe('<gsa-switch-menu>', () => {
  test('opens on the caret with the open row focused, Escape returns the focus to the caret, and a plain click on a row is a pick', async ({
    mount,
    page,
    browserName,
  }) => {
    // WebKit's Tab skips links (Safari's "Press Tab to highlight each item" is off by default): there it walks the buttons only
    const tabsToLinks = browserName !== 'webkit';
    const component = await mount<typeof Default>(STORY);
    const caret = component.getByRole('button', { name: BUTTON_NAME });
    const list = page.locator('#sh-set-menu');
    await expect(list).toBeHidden();
    await expect(caret).toHaveAttribute('aria-expanded', 'false');

    await caret.click();
    await expect(list).toBeVisible();
    await expect(list).toHaveAttribute('aria-label', MENU_NAME);
    await expect(list.getByRole('menu')).toHaveCount(0);
    await expect(list.getByRole('link', { name: 'Dungeons' })).toBeFocused();
    await expect(list.getByRole('link', { name: 'Dungeons' })).toHaveAttribute('aria-current', 'true');
    await expect(list.getByRole('link', { name: 'Raid' })).toHaveAttribute('href', '#/sheets/a/s1');

    await page.keyboard.press('Escape');
    await expect(list).toBeHidden();
    await expect(caret).toBeFocused();

    await caret.click();
    await list.getByRole('link', { name: 'Crafting' }).click();
    await expect(list).toBeHidden();
    await expect(component.getByTestId('events')).toHaveText('["item:s3"]');

    // Tab walks every row of the open list and, past the last one, closes it and goes on to the next control
    await caret.click();
    await expect(list.getByRole('link', { name: 'Dungeons' })).toBeFocused(); // Zag moves the focus in a frame after it opens
    await page.keyboard.press('Tab');
    if (tabsToLinks) {
      await expect(list.getByRole('link', { name: 'Crafting' })).toBeFocused();
      await page.keyboard.press('Tab');
    }
    await expect(list.getByRole('button', { name: '+ New set' })).toBeFocused();
    await expect(list).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(component.getByRole('button', { name: 'After' })).toBeFocused();
    await expect(list).toBeHidden();

    // Shift+Tab walks back up to the first row, then the caret, then out of the list (closing it)
    await caret.click();
    await expect(list.getByRole('link', { name: 'Dungeons' })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    if (tabsToLinks) {
      await expect(list.getByRole('link', { name: 'Raid' })).toBeFocused();
      await page.keyboard.press('Shift+Tab');
      await expect(list.getByRole('link', { name: 'All gear sets (3)' })).toBeFocused();
      await page.keyboard.press('Shift+Tab');
    }
    await expect(caret).toBeFocused();
    if (tabsToLinks) {
      await page.keyboard.press('Shift+Tab');
      await expect(component.getByRole('link', { name: 'Sheets' })).toBeFocused();
      await expect(list).toBeHidden();
    }
  });

  test('has no axe violations, closed and open', async ({ mount, page, axe }) => {
    const component = await mount<typeof Default>(STORY);
    expect(await axe()).toEqual([]);
    await component.getByRole('button', { name: BUTTON_NAME }).click();
    await expect(page.locator('#sh-set-menu')).toBeVisible();
    expect(await axe()).toEqual([]);
  });
});

test.describe('<gsa-switch-menu> with touch', () => {
  test.use({ hasTouch: true });

  // Playwright's Firefox cannot close a touch-enabled context cleanly while other workers run (see slot-menu.spec.ts); the tap
  // fix concerns WebKit, and Chromium covers the rest.
  test.skip(({ browserName }) => browserName === 'firefox', 'a touch context cannot be closed reliably in Firefox under parallel workers');

  test('a tap on the caret opens the list, a tap on a row picks it, a tap outside closes it', async ({ mount, page }) => {
    const component = await mount<typeof Default>(STORY);
    const caret = component.getByRole('button', { name: BUTTON_NAME });
    const list = page.locator('#sh-set-menu');
    await caret.tap();
    await expect(list).toBeVisible();
    await list.getByRole('link', { name: 'Crafting' }).tap();
    await expect(list).toBeHidden();
    await expect(component.getByTestId('events')).toHaveText('["item:s3"]');

    await caret.tap();
    await expect(list).toBeVisible();
    await tapOutside(page);
    await expect(list).toBeHidden();
    await expect(component.getByTestId('events')).toHaveText('["item:s3"]');
  });
});
