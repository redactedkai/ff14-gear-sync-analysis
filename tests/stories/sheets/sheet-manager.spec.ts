/* Stories of <gsa-sheet-manager>: a click anywhere on a row opens it but a click on the row's own button does not, the name link opens it
   with a plain click, Up and Down on a drag handle move the row and keep the focus on the handle, and axe. */
import { expect, test } from '../fixtures.ts';
import { NAMES, type Default } from './sheet-manager.story.js';

// The drag handles have no accessible name: a finding the page's own accessibility check lists as known (KNOWN_AXE in
// tests/e2e/checks/look/accessibility.mjs). Remove this filter with that entry when the handles get a name.
const withoutHandleName = (found: string[]) =>
  found.filter(line => !line.startsWith('aria-command-name: ') || !line.includes('.draghandle'));

const STORY = 'sheets/sheet-manager/Default';
const rowOf = (page: import('playwright/test').Page, name: string) => page.locator('#sh-list tbody tr', { hasText: name });

test.describe('<gsa-sheet-manager>', () => {
  test('a row opens from a click on its text but not from its own buttons; Up and Down on the handle move it with the focus staying on it', async ({
    mount,
    page,
  }) => {
    const component = await mount<typeof Default>(STORY);
    await expect(page.locator('#sh-list tbody tr')).toHaveCount(NAMES.length);
    const events = component.getByTestId('events');

    // a click on the row's text opens the sheet; the Edit button sends its own action only
    await rowOf(page, 'Dungeons').locator('td').nth(2).click();
    await expect(events).toHaveText('["open:sheet:s_dungeons"]');
    await rowOf(page, 'Dungeons').getByRole('button', { name: 'Edit details' }).click();
    await expect(events).toHaveText('["open:sheet:s_dungeons","edit:sheet:s_dungeons"]');

    // the name link is a real link: a plain click is one open, and the page's own address is not followed
    await rowOf(page, 'Crafting').getByRole('link', { name: 'Crafting' }).click();
    await expect(events).toHaveText('["open:sheet:s_dungeons","edit:sheet:s_dungeons","open:sheet:s_crafting"]');

    // Down on the first handle moves the row one place, and the focus follows it to the handle of its new place
    const handles = page.locator('#sh-list .draghandle');
    await handles.first().focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('#sh-list tbody tr').first()).toContainText('Dungeons');
    await expect(handles.nth(1)).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(page.locator('#sh-list tbody tr').first()).toContainText('Raid');
    await expect(handles.first()).toBeFocused();
  });

  test('has no axe violations, with sheets and on the not found screen', async ({ mount, axe }) => {
    await mount<typeof Default>(STORY);
    expect(withoutHandleName(await axe())).toEqual([]);
    await mount<typeof Default>('sheets/sheet-manager/NotFound');
    expect(withoutHandleName(await axe())).toEqual([]);
  });
});
