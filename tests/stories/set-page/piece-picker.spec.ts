/* Stories of <gsa-piece-picker>: with 700 pieces the menu opens under the pressed button with the search box focused, the search
   narrows the list and Clear search brings it back, a piece row is a pick and Empty this slot another (both close it with the focus
   on the button), a Unique piece worn elsewhere cannot be picked, Escape and a press outside close it; axe. */
import { test, expect } from '../fixtures.ts';
import { PIECE_COUNT, TAKEN_PIECE, type Default } from './piece-picker.story.js';

const STORY = 'set-page/piece-picker/Default';

test.describe('<gsa-piece-picker>', () => {
  test('opens under the pressed button with the search box focused; the search narrows 700 pieces; a pick closes it with the focus on the button; Escape and a press outside close it', async ({
    mount,
    page,
    axe,
  }) => {
    const component = await mount<typeof Default>(STORY);
    const menu = page.locator('.pick-menu');
    const rows = menu.locator('.same-item[data-game-id]');
    const search = menu.getByRole('textbox', { name: 'Search pieces' });
    const button = component.getByRole('button', { name: 'Head piece' });
    await expect(menu).toBeHidden();

    await button.click();
    await expect(menu).toBeVisible();
    await expect(search).toBeFocused();
    await expect(rows).toHaveCount(PIECE_COUNT);
    expect(await axe()).toEqual([]);
    const buttonBox = await button.boundingBox();
    const menuBox = await menu.boundingBox();
    expect(menuBox?.y).toBeGreaterThan((buttonBox?.y ?? 0) + (buttonBox?.height ?? 0));

    // the search narrows the list; no match says so, and Clear search brings every piece back
    await search.fill('Piece 700');
    await expect(rows).toHaveCount(1);
    await search.fill('zzzz');
    await expect(rows).toHaveCount(0);
    await expect(menu.locator('.menu-empty')).toContainText('zzzz');
    await menu.getByRole('button', { name: 'Clear search' }).click();
    await expect(rows).toHaveCount(PIECE_COUNT);

    // a Unique piece worn in the other ring row is shown and cannot be picked
    const taken = rows.filter({ hasText: TAKEN_PIECE });
    await taken.scrollIntoViewIfNeeded();
    await expect(taken).toBeDisabled();
    await taken.click({ force: true });
    await expect(menu).toBeVisible();

    // a piece row is a pick: the menu closes with the focus on the button
    await rows.filter({ hasText: 'Piece 5' }).first().click();
    await expect(menu).toBeHidden();
    await expect(button).toBeFocused();
    await expect(component.getByTestId('events')).toHaveText('[1005]');

    // Empty this slot is a pick of nothing
    await button.click();
    await menu.getByRole('button', { name: 'Empty this slot' }).click();
    await expect(menu).toBeHidden();
    await expect(component.getByTestId('events')).toHaveText('[1005,null]');

    // a menu opened again under another button is placed there before the page is told it is shown (not where it last was)
    await component.getByRole('button', { name: 'Body piece' }).click();
    await expect(menu).toBeVisible();
    await expect(component.getByTestId('shown')).toHaveText('[true,true,true]');
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();

    // Escape closes it with the focus on the button; a press outside closes it and the focus stays where the press went
    await button.click();
    await expect(menu).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(button).toBeFocused();
    await button.click();
    await expect(menu).toBeVisible();
    await component.getByRole('textbox', { name: 'After the buttons' }).click();
    await expect(menu).toBeHidden();
  });
});
