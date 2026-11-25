/* Stories of <gsa-gcd-view>: a click on a bar of the chart sets the level, a click on a row of the table sets the speed; the rows and the bars are plain pointer targets, so there is no keyboard
   model beyond the table's own (no focusable part); axe. */
import { test, expect } from '../fixtures.ts';
import type { Default } from './gcd-view.story.js';

const STORY = 'math-page/gcd-view/Default';

test.describe('<gsa-gcd-view>', () => {
  test('a bar of the chart sets the level, a row of the table sets the speed; axe finds nothing', async ({ mount, page, axe }) => {
    await mount<typeof Default>(STORY);
    const rows = page.locator('#g-table tbody tr');
    await expect(rows).toHaveCount(13);
    await expect(page.locator('#g-table tbody tr.cur')).toHaveCount(1);
    expect(await axe()).toEqual([]);

    // level 50: the base speed 341 is the current step; a row's click makes its speed the current one
    const row = rows.nth(3);
    const rowSpeed = (await row.locator('td').first().innerText()).trim();
    await row.click();
    await expect(page.locator('#g-table tbody tr.cur td').first()).toHaveText(rowSpeed);

    // a bar of the chart sets the level: the chart marks it and the facts follow
    const before = await page.locator('#g-facts').innerText();
    await page.locator('#g-chart [data-level="78"]').click();
    await expect(page.locator('#g-chart [data-level="78"]')).toHaveClass(/on/);
    expect(await page.locator('#g-facts').innerText()).not.toBe(before);
  });
});
