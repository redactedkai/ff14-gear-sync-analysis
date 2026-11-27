/* Stories of <gsa-sheet-manager>: a click anywhere on a row opens it but a click on the row's own button does not, the name link opens it
   with a plain click, Up and Down on a drag handle move the row and keep the focus on the handle, and axe. */
import { expect, test } from '../fixtures.ts';
import { clickAtRightEnd, dragAcross } from '../row-clicks.ts';
import { NAMES, type Default } from './sheet-manager.story.ts';

// The drag handles have no accessible name: a finding the page's own accessibility check lists as known (KNOWN_AXE in
// tests/e2e/checks/look/accessibility.ts). Remove this filter with that entry when the handles get a name.
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

  test('a click on any plain part of a sheet row opens that sheet once; its Edit button, its drag handle and a drag that selects text open nothing', async ({
    mount,
    page,
  }) => {
    await page.setViewportSize({ width: 960, height: 700 });
    try {
      const component = await mount<typeof Default>(STORY);
      const events = component.getByTestId('events');
      const row = rowOf(page, 'Crafting');
      const seen = async () => JSON.parse((await events.textContent()) || '[]') as string[];
      const opens = async () => (await seen()).filter(event => event.startsWith('open:'));

      const parts: [string, () => Promise<void>][] = [
        ['the job cell', () => row.locator('td').nth(1).click()],
        ['a figure cell', () => row.locator('td').nth(3).click()],
        ['the last cell', () => row.locator('td').last().click()],
        ['the description line', () => row.locator('.sorigin').click()],
        ['the empty end of the Open / Edit / Copy / Delete line', () => clickAtRightEnd(page, row.locator('.rowacts'))],
        ['the Open button', () => row.locator('.rowacts [data-action="open"]').click()],
      ];
      let expected = 0;
      for (const [where, click] of parts) {
        await click();
        expected++;
        await expect.poll(async () => (await opens()).length, { message: where }).toBe(expected);
        expect((await opens()).at(-1), where).toBe('open:sheet:s_crafting');
      }

      // the Edit button sends its own action and opens nothing; neither does the handle or a drag that selects text
      await row.locator('.rowacts [data-action="edit"]').click();
      await expect.poll(async () => (await seen()).includes('edit:sheet:s_crafting')).toBe(true);
      await row.locator('.draghandle').click();
      expect((await dragAcross(page, row.locator('.sorigin'))).length, 'the drag over the description selected some text').toBeGreaterThan(
        0,
      );
      await page.waitForTimeout(150); // a sheet that opens late would show by now (nothing signals a click that opens nothing)
      expect(await opens(), 'the Edit button, the handle or the drag opened a sheet').toHaveLength(expected);
    } finally {
      await page.setViewportSize({ width: 1280, height: 720 });
    }
  });

  test('Enter on the name link of a row opens that sheet once, from the keyboard, and the link does not navigate', async ({
    mount,
    page,
  }) => {
    const component = await mount<typeof Default>(STORY);
    const events = component.getByTestId('events');
    const start = page.url();
    const link = rowOf(page, 'Crafting').getByRole('link', { name: 'Crafting' });
    await link.focus();
    await page.keyboard.press('Enter');
    await expect(events).toHaveText('["open:sheet:s_crafting"]');
    expect(page.url(), 'the row opens through the page, the link does not navigate').toBe(start);
  });

  test('has no axe violations, with sheets and on the not found screen', async ({ mount, axe }) => {
    await mount<typeof Default>(STORY);
    expect(withoutHandleName(await axe())).toEqual([]);
    await mount<typeof Default>('sheets/sheet-manager/NotFound');
    expect(withoutHandleName(await axe())).toEqual([]);
  });
});
