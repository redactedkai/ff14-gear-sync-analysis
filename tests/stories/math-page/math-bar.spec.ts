/* Stories of <gsa-math-bar> and <gsa-piece-stats>: the item level box and slider edit the example piece and Stat Allocation follows
   (a number typed is held to the slider's range, Reset goes back to the cap), the sub-tab links are links (a plain click shows the
   sub-tab, a Ctrl click is the browser's), the controls follow the open sub-tab, no choice of a Slot or a substat moves the bar; the keyboard model is the slider's and the links'
   own; axe. */
import { test, expect } from '../fixtures.ts';
import type { Default } from './math-bar.story.js';

const STORY = 'math-page/math-bar/Default';
// the one finding axe has on the bar, known on the page too (KNOWN_AXE in tests/e2e/checks/look/accessibility.mjs): the chips' names leave out
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
