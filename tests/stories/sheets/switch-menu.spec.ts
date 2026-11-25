/* Stories of <gsa-switch-menu>: a caret that opens a plain list of links (no role=menu), the open set's row takes the focus,
   Escape and Tab close it with the focus where the keyboard model puts it, a plain click on a row is a pick, and axe. */
import { test, expect } from '../fixtures.ts';
import { BUTTON_NAME, MENU_NAME, type Default } from './switch-menu.story.js';

const STORY = 'sheets/switch-menu/Default';

test.describe('<gsa-switch-menu>', () => {
  test('opens on the caret with the open row focused, Escape returns the focus to the caret, and a plain click on a row is a pick', async ({
    mount,
    page,
  }) => {
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

    // Tab out of the open list closes it and goes on to the next control
    await caret.click();
    await expect(list.getByRole('link', { name: 'Dungeons' })).toBeFocused(); // Zag moves the focus in a frame after it opens
    await page.keyboard.press('Tab');
    await expect(list).toBeHidden();
    await expect(component.getByRole('button', { name: 'After' })).toBeFocused();
  });

  test('has no axe violations, closed and open', async ({ mount, page, axe }) => {
    const component = await mount<typeof Default>(STORY);
    expect(await axe()).toEqual([]);
    await component.getByRole('button', { name: BUTTON_NAME }).click();
    await expect(page.locator('#sh-set-menu')).toBeVisible();
    expect(await axe()).toEqual([]);
  });
});
