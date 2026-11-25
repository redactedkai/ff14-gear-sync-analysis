/* Stories of <gsa-food-menu>: the menu opens with the search box focused, the search and the pills narrow the list, a meal row is a
   pick, Escape and Tab out close it with the focus where the keyboard model puts it, a quick close leaves no error, and axe. */
import { test, expect } from '../fixtures.ts';
import { BUTTON_ID, MENU_ID, type Default } from './food-menu.story.js';

const STORY = 'set-page/food-menu/Default';

test.describe('<gsa-food-menu>', () => {
  test('opens with the search box focused; the search and a pill narrow the list; a meal row is a pick; Escape and Tab out close it', async ({
    mount,
    page,
  }) => {
    const component = await mount<typeof Default>(STORY);
    const button = page.locator(`#${BUTTON_ID}`);
    const menu = page.locator(`#${MENU_ID}`);
    const rows = menu.locator('.same-item[data-meal]:not([data-meal=""])');
    await expect(menu).toBeHidden();

    await button.click();
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('textbox', { name: 'Search meals' })).toBeFocused();
    // the meal the set holds leads the list alone under "Your pick"
    await expect(menu.locator('[data-group="pick"] .meal-item')).toHaveCount(1);
    await expect(rows).toHaveCount(4);

    await menu.getByRole('textbox', { name: 'Search meals' }).fill('popcorn');
    await expect(rows).toHaveCount(1);
    await menu.getByRole('textbox', { name: 'Search meals' }).fill('');
    await menu.getByTitle('dh').click(); // the Direct Hit pill
    await expect(rows).toHaveCount(1);
    await expect(menu.getByTitle('sps')).toBeDisabled(); // no meal has both

    await menu.getByTitle('dh').click();
    await rows.filter({ hasText: 'Caramel Popcorn' }).click();
    await expect(menu).toBeHidden();
    await expect(button).toBeFocused();
    await expect(component.getByTestId('events')).toHaveText('["popcorn"]');

    // Escape closes it with the focus on the button
    await button.click();
    await expect(menu).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(button).toBeFocused();

    // Tab out of the last control of the open menu closes it, and the focus goes on to the next control
    await button.click();
    await expect(menu).toBeVisible();
    await rows.last().focus();
    await page.keyboard.press('Tab');
    await expect(menu).toBeHidden();
    await expect(page.getByRole('button', { name: 'After' })).toBeFocused();
  });

  test('a menu closed before its first frame leaves no error behind', async ({ mount, page }) => {
    await mount<typeof Default>(STORY);
    await page.locator(`#${BUTTON_ID}`).click();
    await page.keyboard.press('Escape');
    // two frames: where the focus and the scroll of an opened menu would run (a page error fails the test)
    await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
    await expect(page.locator(`#${MENU_ID}`)).toBeHidden();
  });

  test('has no axe violations, closed and open', async ({ mount, page, axe }) => {
    await mount<typeof Default>(STORY);
    expect(await axe(), 'closed').toEqual([]);
    await page.locator(`#${BUTTON_ID}`).click();
    await expect(page.locator(`#${MENU_ID}`)).toBeVisible();
    expect(await axe(), 'open').toEqual([]);
  });
});
