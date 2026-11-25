/* Story of <gsa-select>, in three engines: the keys of a select (open, typeahead, pick, Escape keeps the value, Tab closes and the
   focus moves on, a press outside closes), the groups, and axe. */
import { expect, test } from '../fixtures.ts';
import { BUTTON_ID, NONE_LABEL, SELECT_LABEL, type Default } from './select.story.js';

const STORY = 'shared/select/Default';

test.describe('<gsa-select>', () => {
  test('the keys: typeahead lights an option, Escape keeps the value, Tab closes it and the focus moves on, Enter picks', async ({
    mount,
    page,
  }) => {
    const component = await mount<typeof Default>(STORY);
    const button = page.locator(`#${BUTTON_ID}`);
    const list = page.locator(`#${BUTTON_ID}-list`);
    const events = component.getByTestId('events');
    await expect(button).toHaveText('Highlander');
    await expect(list).toBeHidden();

    // the closed button is a combobox with the page's name; ArrowDown opens the list on the chosen option
    await expect(page.getByRole('combobox', { name: SELECT_LABEL })).toBeVisible();
    await button.focus(); // WebKit does not focus a button on click
    await page.keyboard.press('ArrowDown');
    await expect(list).toBeVisible();
    await expect(list.getByRole('option', { name: 'Highlander' })).toHaveAttribute('data-highlighted', '');
    // options sit under their heading, and the empty value is an option like the others
    await expect(list.getByRole('group', { name: 'Elezen' }).getByRole('option')).toHaveCount(2);
    await expect(list.getByRole('option', { name: NONE_LABEL })).toHaveAttribute('data-value', '');

    // typing letters lights the next option that starts with them; Escape closes with the value kept and the focus on the button
    await expect(list).toBeFocused();
    await page.keyboard.type('du');
    await expect(list.getByRole('option', { name: 'Duskwight' })).toHaveAttribute('data-highlighted', '');
    await page.keyboard.press('Escape');
    await expect(list).toBeHidden();
    await expect(button).toBeFocused();
    await expect(button).toHaveText('Highlander');
    await expect(events).toHaveText('');

    // Tab closes the open list and the focus moves on to the next control
    await page.keyboard.press('ArrowDown');
    await expect(list).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(list).toBeHidden();
    await expect(page.getByRole('button', { name: 'After' })).toBeFocused();

    // Enter on a lit option picks it: the element tells the page (which would set `value`) and the focus is back on the button
    await button.focus();
    await page.keyboard.press('ArrowDown');
    await expect(list).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(list).toBeHidden();
    await expect(button).toBeFocused();
    await expect(events).toHaveText('["Wildwood"]');
  });

  test('a press on an option picks it, a press outside closes the list, and axe finds nothing', async ({ mount, page, axe }) => {
    const component = await mount<typeof Default>(STORY);
    const button = page.locator(`#${BUTTON_ID}`);
    const list = page.locator(`#${BUTTON_ID}-list`);
    await button.click();
    await expect(list).toBeVisible();
    expect(await axe()).toEqual([]);
    await list.getByRole('option', { name: 'Midlander' }).click();
    await expect(list).toBeHidden();
    await expect(component.getByTestId('events')).toHaveText('["Midlander"]');

    await button.click();
    await expect(list).toBeVisible();
    await page.getByRole('button', { name: 'Before' }).click();
    await expect(list).toBeHidden();
    await expect(component.getByTestId('events')).toHaveText('["Midlander"]');
  });
});
