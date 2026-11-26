/* Stories of <gsa-tiers-view> and <gsa-tiers-controls>: a value typed into a card's box brings its tier to the middle of the card's
   scroll area, a click on a row sets the value to the tier's start and leaves the list where it is, the Level box changes the
   tiers (each valid level counts as it is typed), the list scrolls from the keyboard, the "?" opens the note; every card scrolls on its own at 960 px (one height, its header, column names
   and footer stay, the value's row in view after a value, a level or a job change, no cell cut); axe. The rows are
   drawn a window at a time, so the tests read the row marked as the value's. */
import type { Page } from 'playwright/test';
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

  /* One card's scroll area measured in the page. */
  type CardMeasure = {
    stat: string;
    scrollable: boolean;
    top: number;
    height: number;
    headTop: number;
    footTop: number;
    namesGap: number;
    curInside: boolean;
    tableOverflow: boolean;
  };
  const measureCards = (page: Page): Promise<CardMeasure[]> =>
    page.evaluate(() =>
      [...document.querySelectorAll('#t-table .tiercard')].map(card => {
        const area = card.querySelector('.tierscroll') as HTMLElement;
        const areaBox = area.getBoundingClientRect();
        const names = area.querySelector('.lhead') as HTMLElement;
        const rowBox = area.querySelector('.lrow.cur')?.getBoundingClientRect();
        const rowsTop = areaBox.top + names.offsetHeight;
        return {
          stat: (card as HTMLElement).dataset.stat as string,
          scrollable: area.scrollHeight > area.clientHeight,
          top: area.scrollTop,
          height: area.clientHeight,
          headTop: (card.querySelector('.tierhead') as Element).getBoundingClientRect().top,
          footTop: (card.querySelector('.lfoot') as Element).getBoundingClientRect().top,
          namesGap: Math.round(names.getBoundingClientRect().top - areaBox.top),
          curInside: Boolean(rowBox) && (rowBox as DOMRect).top >= rowsTop - 1 && (rowBox as DOMRect).bottom <= areaBox.bottom + 1,
          tableOverflow:
            area.scrollWidth > area.clientWidth ||
            [...area.querySelectorAll('.lhead span, .lrow span')].some(cell => cell.scrollWidth > cell.clientWidth),
        };
      }),
    );

  test('every card scrolls on its own at 960 px: one height, the header, column names and footer stay, the value row is in view after a value, a level or a job change, no cell is cut', async ({
    mount,
    page,
  }) => {
    await page.setViewportSize({ width: 960, height: 800 });
    try {
      await mount<typeof Default>(STORY);
      await expect(page.locator('#t-table .tiercard')).toHaveCount(5);
      const crit = page.locator('#t-table [data-stat="crit"]');
      const area = crit.locator('.tierscroll');
      const critCard = async () => (await measureCards(page)).find(card => card.stat === 'crit') as CardMeasure;

      // every card has more rows than fit, the areas are one height, the value's row is in view, no cell is cut
      const cards = await measureCards(page);
      expect(
        cards.filter(card => !card.scrollable).map(card => card.stat),
        'a card shows all its rows without scrolling',
      ).toEqual([]);
      expect(new Set(cards.map(card => card.height)).size, `the card heights differ: ${cards.map(card => card.height)}`).toBe(1);
      expect(
        cards.every(card => card.curInside),
        'a card at its base has no highlighted row in view',
      ).toBe(true);
      expect(
        cards.every(card => !card.tableOverflow),
        'a table is wider than its card',
      ).toBe(true);

      // a card scrolled to its end keeps its header, column names and footer where they were, and draws its last row
      const start = await critCard();
      await area.evaluate(scroller => {
        scroller.scrollTop = scroller.scrollHeight;
      });
      await expect.poll(async () => (await critCard()).top).toBeGreaterThan(0);
      const end = await critCard();
      expect([end.headTop, end.footTop, end.namesGap], 'header, footer or column names moved').toEqual([start.headTop, start.footTop, 0]);
      await expect(area.locator('.lrow:last-child span').first()).toHaveText(/\+\s*$/);

      // the level brings the value's row (the base again) into view with the list back at the top
      await page.locator('#t-level').fill('90');
      await expect.poll(async () => (await critCard()).top).toBe(0);
      expect((await critCard()).curInside, 'the base tier is not in view after the level change').toBe(true);

      // a job change (Paladin): every card with its tier in view at the top, the Tenacity card's three columns with the longest ranges fit
      await area.evaluate(scroller => {
        scroller.scrollTop = scroller.scrollHeight;
      });
      await page.evaluate(() => {
        for (const element of document.querySelectorAll('gsa-tiers-view, gsa-tiers-controls')) {
          (element as HTMLElement & { job: string }).job = 'PLD';
        }
      });
      await expect(page.locator('#t-table [data-stat="ten"]')).toBeVisible();
      await expect
        .poll(async () => {
          const all = await measureCards(page);
          return all.length === 5 && all.every(card => card.curInside && card.top === 0);
        })
        .toBe(true);
      const tenacity = page.locator('#t-table [data-n="ten"]');
      await tenacity.fill('3500');
      await tenacity.press('Enter');
      await expect(page.locator('#t-table [data-stat="ten"] .lrow.cur')).toContainText(',');
      expect(
        (await measureCards(page)).every(card => !card.tableOverflow),
        'a Paladin card cuts a cell or scrolls sideways',
      ).toBe(true);

      // the list's label names its substat (the page's sideways scroll at 960 px is `checkTiers`')
      const label = await page.locator('#t-table [data-stat="crit"] .tierscroll').getAttribute('aria-label');
      const name = ((await page.locator('#t-table [data-stat="crit"] .lname span').first().textContent()) ?? '').trim();
      expect(label, "the list's label names the substat").toContain(name);
    } finally {
      await page.setViewportSize({ width: 1280, height: 720 });
    }
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
