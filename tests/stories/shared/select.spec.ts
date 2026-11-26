/* Story of <gsa-select>, in three engines: the keys of a select (open, typeahead, pick, Escape keeps the value, Tab closes and the
   focus moves on, a press outside closes), the groups, and axe. */
import { expect, test } from '../fixtures.ts';
import { BUTTON_ID, NONE_LABEL, SELECT_LABEL, type Default } from './select.story.js';
import { expectForcedColoursLook, tapOutside } from '../look.ts';

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

  test('the option that means none is announced like the others (aria-activedescendant) and is picked as the empty value', async ({
    mount,
    page,
  }) => {
    const component = await mount<typeof Default>(STORY, { value: 'Midlander' });
    const button = page.locator(`#${BUTTON_ID}`);
    const list = page.locator(`#${BUTTON_ID}-list`);
    const none = list.getByRole('option', { name: NONE_LABEL });
    await button.focus(); // WebKit does not focus a button on click
    await page.keyboard.press('ArrowDown');
    await expect(list.getByRole('option', { name: 'Midlander' })).toHaveAttribute('data-highlighted', '');
    await page.keyboard.press('Home');
    await expect(none).toHaveAttribute('data-highlighted', '');
    const noneId = (await none.getAttribute('id')) ?? '';
    expect(noneId).not.toBe('');
    await expect(list).toHaveAttribute('aria-activedescendant', noneId);

    // Enter picks it: the page gets '' (not Zag's internal key)
    await page.keyboard.press('Enter');
    await expect(list).toBeHidden();
    await expect(component.getByTestId('events')).toHaveText('[""]');
  });

  test('a mouse press outside, after a key press, leaves no focus ring on the button when the page focuses it', async ({ mount, page }) => {
    await mount<typeof Default>(STORY);
    const button = page.locator(`#${BUTTON_ID}`);
    // the page has seen a key; the next input is a press on another control (a chip that opens a popover with this select in it),
    // and the popover then gives the focus to the select's button by script
    await page.keyboard.press('Shift');
    await page.getByRole('button', { name: 'Before' }).click();
    await button.evaluate(element => element.focus());
    await expect(button).toBeFocused();
    await expect(button).toHaveCSS('outline-style', 'none');
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

test.describe('<gsa-select> with touch', () => {
  test.use({ hasTouch: true });

  // Playwright's Firefox cannot close a touch-enabled context cleanly while other workers run (see slot-menu.spec.ts); the tap
  // fix concerns WebKit, and Chromium covers the rest.
  test.skip(({ browserName }) => browserName === 'firefox', 'a touch context cannot be closed reliably in Firefox under parallel workers');

  test('a tap on the button opens the list, a tap on an option picks it, a tap outside closes it', async ({ mount, page }) => {
    const component = await mount<typeof Default>(STORY);
    const list = page.locator(`#${BUTTON_ID}-list`);
    await page.locator(`#${BUTTON_ID}`).tap();
    await expect(list).toBeVisible();
    await list.getByRole('option', { name: 'Wildwood' }).tap();
    await expect(list).toBeHidden();
    await expect(component.getByTestId('events')).toHaveText('["Wildwood"]');

    await page.locator(`#${BUTTON_ID}`).tap();
    await expect(list).toBeVisible();
    await tapOutside(page);
    await expect(list).toBeHidden();
    await expect(component.getByTestId('events')).toHaveText('["Wildwood"]');
  });
});

test.describe('<gsa-select> in forced colours', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'WebKit does not force colours');
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
  });
  test.afterEach(async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'none' });
  });

  test('the open list has an edge, the chosen option is marked apart from the others, and the lit option has a ring', async ({
    mount,
    page,
  }) => {
    await mount<typeof Default>(STORY);
    const list = page.locator(`#${BUTTON_ID}-list`);
    await page.locator(`#${BUTTON_ID}`).click();
    await expect(list).toBeVisible();
    await page.keyboard.press('ArrowDown'); // the light moves off the chosen option
    const options = list.getByRole('option');
    await expect(options.and(page.locator('[data-highlighted]'))).not.toHaveAttribute('aria-selected', 'true');
    await expectForcedColoursLook(page, {
      panel: list,
      chosen: options.and(page.locator('[aria-selected="true"]')),
      plain: options.and(page.locator(':not([aria-selected="true"])')).first(),
      ring: options.and(page.locator('[data-highlighted]')),
      lit: true,
    });
  });
});
