/* Stories of <gsa-math-bar> and <gsa-piece-stats>: the item level box and slider edit the example piece and Stat Allocation follows
   (a number typed is held to the slider's range, Reset goes back to the cap), the sub-tab links are links (a plain click shows the
   sub-tab, a Ctrl click is the browser's), the controls follow the open sub-tab; the keyboard model is the slider's and the links'
   own; axe. */
import { test, expect } from '../fixtures.ts';
import type { Default } from './math-bar.story.js';

const STORY = 'math-page/math-bar/Default';
// the one finding axe has on the bar, known on the page too (KNOWN_AXE in tests/e2e/checks/look/accessibility.mjs): the chip's name leaves out its visible text
const KNOWN_PIECE_CHIP = 'label-content-name-mismatch: #p-piece-chip';

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
    expect((await axe()).filter(finding => finding !== KNOWN_PIECE_CHIP)).toEqual([]);

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
