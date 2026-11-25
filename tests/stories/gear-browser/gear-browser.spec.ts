/* Stories of <gsa-gear-browser>: a click on a heading sorts and flips the order, a page button shows its page, a number typed in
   the item level box is committed after the typing wait and kept in the box. The table's rows are plain table cells and the
   headings and page buttons plain buttons (Tab order, Enter and Space as for any button), so there is no keyboard model beyond
   those; the Slot menu and the filter menus inside have their own specs. axe. */
import { test, expect } from '../fixtures.ts';
import type { Default } from './gear-browser.story.js';

const STORY = 'gear-browser/gear-browser/Default';

test.describe('<gsa-gear-browser>', () => {
  test('draws a page of rows and axe finds nothing', async ({ mount, page, axe }) => {
    await mount<typeof Default>(STORY);
    await expect(page.locator('#gear-table tbody tr[data-key]')).toHaveCount(50);
    await expect(page.locator('#b-count')).toHaveText(/matches$/);
    expect(await axe()).toEqual([]);
  });

  test('a click on a heading sorts by it, again flips the order', async ({ mount, page }) => {
    await mount<typeof Default>(STORY);
    const head = page.locator('#gear-table th:has([data-sort="crit"])');
    const firstKey = () => page.locator('#gear-table tbody tr[data-key]').first().getAttribute('data-key');
    await expect(page.locator('#gear-table th:has([data-sort="ilvl"])')).toHaveAttribute('aria-sort', 'descending');
    const byIlvl = await firstKey();
    await page.click('#gear-table [data-sort="crit"]');
    await expect(head).toHaveAttribute('aria-sort', 'descending');
    await expect(page.locator('#gear-table')).toHaveAttribute('data-sorted', 'crit');
    expect(await firstKey()).not.toBe(byIlvl);
    await page.click('#gear-table [data-sort="crit"]');
    await expect(head).toHaveAttribute('aria-sort', 'ascending');
  });

  test('a page button shows that page and the first page again after a filter changes', async ({ mount, page }) => {
    await mount<typeof Default>(STORY);
    const current = page.locator('#b-pages [aria-current="page"]');
    const firstKey = () => page.locator('#gear-table tbody tr[data-key]').first().getAttribute('data-key');
    await expect(current).toHaveText('1');
    const first = await firstKey();
    await page.click('#b-pages [aria-label="Next page"]');
    await expect(current).toHaveText('2');
    expect(await firstKey()).not.toBe(first);
    await page.click('#gear-table [data-sort="name"]');
    await expect(current).toHaveText('1');
  });

  test('a number typed in the item level box is committed after the typing wait; a value out of range is moved when the box is left', async ({
    mount,
    page,
  }) => {
    await mount<typeof Default>(STORY);
    const edits = page.getByTestId('edits');
    const box = page.locator('#b-min');
    const matches = () => page.locator('#b-count').innerText();
    const all = await matches();
    // typing "700" commits once, not 7 and 70 on the way
    await box.click();
    await page.keyboard.type('700', { delay: 30 });
    await expect(edits).toHaveText('[{"min":700}]');
    await expect(box).toHaveValue('700');
    expect(await matches()).not.toBe(all);
    // a number above the real range is moved to the highest item level when the box is left
    await box.fill('9999');
    await page.locator('#b-max').click();
    await expect(box).toHaveValue('795');
  });
});
