/* Stories of <gsa-math-bar> and <gsa-piece-stats>: the item level box and slider edit the example piece and Stat Allocation follows
   (a number typed is held to the slider's range, Reset goes back to the cap), the sub-tab links are links (a plain click shows the
   sub-tab, a Ctrl click is the browser's), the controls follow the open sub-tab, no choice of a Slot or a substat moves the bar, the controls row has its three layouts with their rules and gaps, every box has one height at 100% and 125% text; the keyboard model is the slider's and the links'
   own; axe. */
import { test, expect } from '../fixtures.ts';
import type { Default } from './math-bar.story.ts';

const STORY = 'math-page/math-bar/Default';
// the one finding axe has on the bar, known on the page too (KNOWN_AXE in tests/e2e/checks/look/accessibility.ts): the chips' names leave out
// their visible text. The page's check sees the Sync settings chip unsynced ("Unsynced" is in its name); here it says "Lv 85 · IL 123", which is not.
// TODO: both go when the chips' names include their visible text.
const KNOWN_CHIPS = ['label-content-name-mismatch: #p-piece-chip', 'label-content-name-mismatch: #p-piece-chip | #p-sync-chip'];

test.describe('<gsa-math-bar>', () => {
  test('the item level box and Reset edit the piece, Stat Allocation follows and the chart is drawn at its box; axe finds nothing', async ({
    mount,
    page,
    axe,
  }) => {
    await mount<typeof Default>(STORY);
    await expect(page.locator('#p-ilvl')).toHaveValue('123');
    await expect(page.locator('#p-piece h2')).toHaveText('An example IL 123 piece, before and after sync');
    await expect(page.locator('#p-curve-chart svg')).toBeVisible();
    expect((await axe()).filter(finding => !KNOWN_CHIPS.includes(finding))).toEqual([]);

    // an item level above the cap: the panel says so; a number past the end of the slider is held to its end
    await page.locator('#p-ilvl').fill('130');
    await page.locator('#p-ilvl').press('Enter');
    await expect(page.locator('#p-piece h2')).toHaveText('An example IL 130 piece, before and after sync');
    await page.locator('#p-ilvl').fill('9999');
    await page.locator('#p-ilvl').press('Enter');
    await expect(page.locator('#p-ilvl')).toHaveValue((await page.locator('#p-range').getAttribute('max')) as string);

    // the slider from the keyboard moves one item level, Reset goes back to the cap
    await page.locator('#p-range').focus();
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('#p-ilvl')).not.toHaveValue('9999');
    await page.click('#p-ilvl-reset');
    await expect(page.locator('#p-ilvl')).toHaveValue('123');
    await expect(page.locator('#p-piece h2')).toHaveText('An example IL 123 piece, before and after sync');
  });

  test('choosing any Slot, 1st substat or 2nd substat moves nothing in the Stat Allocation bar: the menus and the chip keep one width', async ({
    mount,
    page,
  }) => {
    await mount<typeof Default>(STORY);
    // every control of the bar (the popover closed), as its place and width
    const boxes = () =>
      page.evaluate(() =>
        [...document.querySelectorAll('gsa-math-bar .barrow > *, gsa-math-bar .piecesec > *, gsa-math-bar .ilrow > *')]
          .filter(element => (element as HTMLElement).offsetParent)
          .map(element => {
            const box = element.getBoundingClientRect();
            return `${element.id || element.className}:${box.left.toFixed(1)},${box.top.toFixed(1)},${box.width.toFixed(1)}`;
          })
          .join(' '),
      );
    const before = await boxes();
    for (const menu of ['#p-slot', '#p-s1', '#p-s2']) {
      const values = await page
        .locator(`${menu}-list [role="option"]`)
        .evaluateAll(options => options.map(option => (option as HTMLElement).dataset.value as string));
      expect(values.length, `${menu} has options`).toBeGreaterThan(1);
      for (const value of values) {
        if (menu !== '#p-slot') {
          // the substat menus are in the Substats & materia chip's popover
          if (!(await page.locator('#p-piece-pop').isVisible())) {
            await page.locator('#p-piece-chip').click();
            await expect(page.locator('#p-piece-pop')).toBeVisible();
          }
        }
        await page.locator(menu).click();
        await page.locator(`${menu}-list [role="option"][data-value="${value}"]`).click();
        await expect(page.locator(menu)).toHaveAttribute('data-value', value);
        await page.keyboard.press('Escape'); // the popover closes; the chip says the new choice
        await expect(page.locator('#p-piece-pop')).toBeHidden();
        expect(await boxes(), `choosing ${value} in ${menu} moved the Stat Allocation bar`).toBe(before);
      }
    }
  });

  test('the controls row has three layouts made by its own width and the text size: wide, middle and narrow; the rules and the gaps fit each', async ({
    mount,
    page,
  }) => {
    await mount<typeof Default>(STORY);
    const measure = () =>
      page.evaluate(() => {
        const box = (selector: string) => (document.querySelector(selector) as Element).getBoundingClientRect();
        const row = box('.barrow');
        const parts = { job: '#m-job-wrap', piece: '.piecesec', sync: '#p-sync-wrap', item: '#p-ilgroup' };
        const boxes = Object.fromEntries(Object.entries(parts).map(([name, selector]) => [name, box(selector)]));
        // a rule is drawn at its section's left edge less half the gap: it shows when that is inside the row
        const rules = [...document.querySelectorAll('.barrow .divided')].filter(
          element =>
            (element as HTMLElement).offsetParent &&
            element.getBoundingClientRect().left > row.left + 1 &&
            getComputedStyle(element, '::before').content !== 'none',
        );
        return {
          tops: Object.fromEntries(Object.entries(boxes).map(([name, found]) => [name, Math.round(found.top)])),
          gapAfterJob: boxes.piece.left - boxes.job.right,
          gapAfterSync: boxes.item.left - boxes.sync.right,
          rules: rules.length,
          sideways: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        };
      });
    const level = (...tops: number[]) => tops.every(top => Math.abs(top - tops[0]) <= 2);
    // the row's width (the bar's own, as the page gives it at 1280, 1100 and 960 px) and the text size of each layout
    const cases = [
      { layout: 'wide', barWidth: 1300, text: '100%' },
      { layout: 'middle', barWidth: 1100, text: '100%' },
      { layout: 'middle', barWidth: 920, text: '100%' },
      { layout: 'narrow', barWidth: 1200, text: '150%' },
    ];
    try {
      for (const { layout, barWidth, text } of cases) {
        await page.setViewportSize({ width: barWidth + 40, height: 900 });
        await page.evaluate(
          ([width, fontSize]) => {
            (document.querySelector('.mathbar') as HTMLElement).style.width = `${width}px`;
            document.documentElement.style.fontSize = fontSize;
          },
          [String(barWidth), text],
        );
        const found = await measure();
        const { job, piece, sync, item } = found.tops;
        let got = 'other';
        if (level(job, piece, sync, item)) {
          got = 'wide';
        } else if (level(job, piece, sync) && item > job) {
          got = 'middle';
        } else if (level(job, piece) && level(sync, item) && sync > job) {
          got = 'narrow';
        }
        const where = `at a bar ${barWidth} px wide, text ${text}`;
        expect(got, `the controls row ${where} is the ${got} layout (${JSON.stringify(found.tops)})`).toBe(layout);
        expect(found.gapAfterJob, `the gap after the Job box ${where}`).toBeCloseTo(24, 0);
        if (layout !== 'middle') {
          expect(found.gapAfterSync, `the gap after Sync settings ${where}`).toBeCloseTo(24, 0);
        }
        // the rules: before Piece (after the Job box) and before the Item level group, when neither starts a line
        expect(found.rules, `the rules that show ${where} (${layout})`).toBe({ wide: 2, middle: 1, narrow: 2 }[layout]);
        expect(found.sideways, `sideways scroll ${where}`).toBe(false);
      }
    } finally {
      await page.evaluate(() => {
        document.documentElement.style.fontSize = '';
        (document.querySelector('.mathbar') as HTMLElement).style.width = '';
      });
      await page.setViewportSize({ width: 1280, height: 720 });
    }
  });

  test('every box of the bar is as high as the Job box (16 px and 1.5 rem) at normal and larger text, and the sub-tabs keep their places', async ({
    mount,
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    try {
      await mount<typeof Default>(STORY);
      const heights = (selectors: string[]) =>
        page.evaluate(
          list =>
            list.map(
              selector =>
                [selector, Math.round((document.querySelector(selector) as Element).getBoundingClientRect().height * 10) / 10] as const,
            ),
          selectors,
        );
      for (const zoom of ['100%', '125%']) {
        await page.evaluate(fontSize => {
          document.documentElement.style.fontSize = fontSize;
        }, zoom);
        const rem = await page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).fontSize));
        const expected = 16 + 1.5 * rem;
        for (const [selector, height] of await heights(['#m-job-btn', '#p-slot', '#p-piece-chip', '#p-sync-chip', '#p-ilvl'])) {
          expect(Math.abs(height - expected), `${selector} is ${height} px tall at text ${zoom}, expected ${expected}`).toBeLessThanOrEqual(
            0.6,
          );
        }
      }
      await page.evaluate(() => {
        document.documentElement.style.fontSize = '';
      });
      // the sub-tabs do not move when another sub-tab is chosen
      const lefts = () =>
        page.evaluate(() =>
          [...document.querySelectorAll('.subtabs a')].map(link => Math.round(link.getBoundingClientRect().left * 10) / 10),
        );
      const before = await lefts();
      for (const sub of ['gcd', 'tiers', 'piece']) {
        await page.locator(`[data-sub=${sub}]`).click();
        await expect(page.locator(`[data-sub=${sub}]`)).toHaveAttribute('aria-current', 'page');
        expect(await lefts(), `the sub-tabs moved when ${sub} opened`).toEqual(before);
      }
    } finally {
      await page.setViewportSize({ width: 1280, height: 720 });
    }
  });

  test('a plain click on a sub-tab link shows that sub-tab, a Ctrl click is left to the browser; the Stat Allocation controls hide with it', async ({
    mount,
    page,
  }) => {
    await mount<typeof Default>(STORY);
    const gcd = page.locator('[data-sub=gcd]');
    await expect(page.locator('[data-sub=piece]')).toHaveAttribute('aria-current', 'page');
    await expect(gcd).toHaveAttribute('href', /gcd/);
    // a Ctrl click is no plain click: the element leaves it alone (the page's own listener then cancels the navigation the browser
    // would make, so the story stays)
    const prevented = await gcd.evaluate(link => {
      let result = true;
      link.closest('.mathbar')?.addEventListener(
        'click',
        event => {
          result = event.defaultPrevented;
          event.preventDefault();
        },
        { once: true },
      );
      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }));
      return result;
    });
    expect(prevented).toBe(false);
    await expect(page.locator('[data-sub=piece]')).toHaveAttribute('aria-current', 'page');
    await gcd.click();
    await expect(gcd).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('#p-ilgroup')).toBeHidden();
    await expect(page.locator('#m-job-wrap')).toBeHidden();
    await expect(page.locator('#g-level')).toBeVisible();
  });
});
