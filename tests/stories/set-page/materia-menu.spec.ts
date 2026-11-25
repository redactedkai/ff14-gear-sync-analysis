/* Stories of <gsa-materia-menu>: the menu opens under the pressed chip with the worn stone focused, a pick is told to the page
   and closes it with the focus back on the chip, Escape and a press outside close it; axe. */
import { test, expect } from '../fixtures.ts';
import type { Default } from './materia-menu.story.js';

const STORY = 'set-page/materia-menu/Default';

test.describe('<gsa-materia-menu>', () => {
  test('opens under the chip with the worn stone focused; a pick closes it with the focus on the chip; Escape and a press outside close it', async ({
    mount,
    page,
    axe,
  }) => {
    const component = await mount<typeof Default>(STORY);
    const menu = page.locator('.matpop');
    const chip = component.getByRole('button', { name: 'crit +36' });
    await expect(menu).toBeHidden();

    await chip.click();
    await expect(menu).toBeVisible();
    await expect(menu.locator('button[data-stone="crit:11"]')).toBeFocused();
    expect(await axe()).toEqual([]);
    const chipBox = await chip.boundingBox();
    const menuBox = await menu.boundingBox();
    expect(menuBox?.y).toBeGreaterThan((chipBox?.y ?? 0) + (chipBox?.height ?? 0));

    await menu.locator('button[data-stone="det:12"]').click();
    await expect(menu).toBeHidden();
    await expect(chip).toBeFocused();
    await expect(component.getByTestId('events')).toHaveText('["det:12"]');

    await chip.click();
    await expect(menu).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(chip).toBeFocused();

    // the chip again opens it, and a press outside closes it
    await chip.click();
    await expect(menu).toBeVisible();
    await component.getByRole('textbox', { name: 'After the chips' }).click();
    await expect(menu).toBeHidden();
  });
});
