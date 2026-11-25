/* Stories of <gsa-tiers-view> and <gsa-tiers-controls>: a value typed into a card's box brings its tier to the middle of the card's
   scroll area, a click on a row sets the value to the tier's start and leaves the list where it is, the Level box changes the
   tiers (each valid level counts as it is typed), the list scrolls from the keyboard, the "?" opens the note; axe. The rows are
   drawn a window at a time, so the tests read the row marked as the value's. */
import { test, expect } from '../fixtures.ts';
import type { Default } from './tiers-view.story.js';

const STORY = 'math-page/tiers-view/Default';

test.describe('<gsa-tiers-view>', () => {
  test('a typed value centers its tier, a click on a row sets the value without scrolling, the Level box changes the tiers; axe finds nothing', async ({
    mount,
    page,
    axe,
  }) => {
    await mount<typeof Default>(STORY);
    const crit = page.locator('#t-table [data-stat="crit"]');
    const area = crit.locator('.tierscroll');
    const value = crit.locator('input[data-n]');
    await expect(page.locator('#t-table .tiercard')).toHaveCount(5);
    await expect(value).toHaveValue('420');
    await expect(area.locator('.lrow.cur')).toHaveCount(1);
    expect(await axe()).toEqual([]);

    // a value typed: its row is the marked one, and the list scrolled so it is in the middle of what shows
    await value.fill('2500');
    await value.press('Enter');
    await expect(value).toHaveValue('2500');
    const marked = area.locator('.lrow.cur');
    const middleOffset = async () =>
      area.evaluate(scroller => {
        const row = scroller.querySelector('.lrow.cur');
        const names = scroller.querySelector('.lhead');
        if (!row || !names) {
          return Number.POSITIVE_INFINITY;
        }
        const rowsTop = scroller.getBoundingClientRect().top + names.getBoundingClientRect().height;
        const middle = rowsTop + (scroller.getBoundingClientRect().bottom - rowsTop) / 2;
        return Math.abs(row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2 - middle);
      });
    await expect.poll(middleOffset).toBeLessThan(32);
    const scrolledTo = await area.evaluate(scroller => scroller.scrollTop);
    expect(scrolledTo).toBeGreaterThan(0);

    // a click on the row three below: it becomes the marked one and the value its start, and the list stays
    const clicked = await area.evaluate(scroller => {
      const rows = [...scroller.querySelectorAll('.lrow')];
      const row = rows[rows.indexOf(scroller.querySelector('.lrow.cur') as Element) + 3] as HTMLElement;
      row.click();
      return row.dataset.to ?? '';
    });
    await expect(value).toHaveValue(clicked.split(':')[1]);
    await expect(marked).toHaveAttribute('data-to', clicked);
    expect(await area.evaluate(scroller => scroller.scrollTop)).toBe(scrolledTo);

    // the Level box: a level typed counts at once and the bases follow it (Critical Hit's base at level 80 is 380)
    const level = page.locator('#t-level');
    await level.fill('80');
    await expect(value).toHaveValue('380');
    await expect(page.locator('#t-level-range')).toHaveText('1–100');
    // an emptied box left goes back to the level cap
    await level.fill('');
    await level.blur();
    await expect(level).toHaveValue('100');
    await expect(value).toHaveValue('420');
  });

  test('the list scrolls from the keyboard, and the "?" opens the substat note', async ({ mount, page }) => {
    await mount<typeof Default>(STORY);
    const area = page.locator('#t-table [data-stat="crit"] .tierscroll');
    await area.focus();
    await page.keyboard.press('PageDown');
    await expect.poll(() => area.evaluate(scroller => scroller.scrollTop)).toBeGreaterThan(0);

    const help = page.locator('#t-table [data-help="crit"]');
    await help.click();
    await expect(help).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('dialog', { name: 'Critical Hit' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#t-pop')).toBeHidden();
    await expect(help).toHaveAttribute('aria-expanded', 'false');
  });
});
