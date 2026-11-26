/* Stories of <gsa-sheet-page>: an item level typed above what the level allows is answered with a lowered cap that the box shows with its
   note, text that is no item level is an error and sorting the gear sets goes by heading (back to the saved order on the third click), a
   set opens from its row and the Effects / Stat points switch tells the page, and axe. */
import { expect, test } from '../fixtures.ts';
import { LOWERED_TO, type Default } from './sheet-page.story.js';

// The drag handles have no accessible name: a finding the page's own accessibility check lists as known (KNOWN_AXE in
// tests/e2e/checks/look/accessibility.mjs). Remove this filter with that entry when the handles get a name.
const withoutHandleName = (found: string[]) =>
  found.filter(line => !line.startsWith('aria-command-name: ') || !line.includes('.draghandle'));

const STORY = 'sheets/sheet-page/Default';

test.describe('<gsa-sheet-page>', () => {
  test('a lowered item level shows with its note, text that is no item level is an error, and a heading sorts the gear sets', async ({
    mount,
    page,
  }) => {
    const component = await mount<typeof Default>(STORY);
    const events = component.getByTestId('events');
    const cap = page.locator('#sh-cap');
    await expect(cap).toHaveValue('300');

    // a cap above what the level allows: the page answers with the lowered cap, and the box and its note show it
    await cap.fill('999');
    await expect(cap).toHaveValue(String(LOWERED_TO));
    await expect(page.locator('#sh-cap-lowered')).toContainText(String(LOWERED_TO));
    await expect(events).toContainText('cap:999');

    // text that is no whole item level: the error shows at once and the page is not asked
    await cap.fill('0');
    await expect(page.locator('#sh-cap-error')).toBeVisible();
    await expect(cap).toHaveAttribute('aria-invalid', 'true');

    // a heading sorts: the highest main stat first, then the lowest, then the saved order again
    const names = () => page.locator('#sh-sets tbody tr .sname').allTextContents();
    expect(await names()).toEqual(['Set 1', 'Set 2']);
    await page.locator('#sh-sets [data-sort="main"]').click();
    expect(await names()).toEqual(['Set 2', 'Set 1']);
    await expect(page.locator('#sh-sets th[data-fig="main"]')).toHaveAttribute('aria-sort', 'descending');
    await page.locator('#sh-sets [data-sort="main"]').click();
    expect(await names()).toEqual(['Set 1', 'Set 2']);
    await page.locator('#sh-sets [data-sort="main"]').click();
    await expect(page.locator('#sh-sets th[data-fig="main"]')).toHaveAttribute('aria-sort', 'none');

    // a click on a set's row opens it; the stat points choice is the page's to apply
    await page.locator('#sh-sets tbody tr', { hasText: 'Set 2' }).locator('td').nth(1).click();
    await page.getByLabel('Stat points').check({ force: true });
    await expect(events).toContainText('open:set:g_2');
    await expect(events).toContainText('figures:points');
  });

  test('at 960 px the settings row is one line with the Level and Item level boxes 160 px wide, in every state of the cap: valid, lowered and no cap', async ({
    mount,
    page,
  }) => {
    await page.setViewportSize({ width: 960, height: 700 });
    try {
      await mount<typeof Default>(STORY);
      const cap = page.locator('#sh-cap');
      const row = page.locator('.sheetfields');
      const rowShape = () =>
        row.evaluate(element => ({
          height: Math.round(element.getBoundingClientRect().height),
          lines: new Set([...element.children].map(child => Math.round(child.getBoundingClientRect().top))).size,
          widths: ['#sh-level', '#sh-cap'].map(selector =>
            Math.round((document.querySelector(selector) as Element).getBoundingClientRect().width),
          ),
          sideways: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        }));
      const plain = await rowShape();
      expect(plain.lines, 'the settings row is one line').toBe(1);
      expect(plain.widths, 'the Level and Item level boxes are 160 px wide').toEqual([160, 160]);
      expect(plain.sideways).toBe(false);

      // a cap above what the level allows: the lowered flag takes the range's place
      await cap.fill('999');
      await expect(page.locator('.sheetfields .f-flag')).toHaveClass(/lowered/);
      expect(await rowShape(), 'a lowered cap moved the row').toEqual(plain);

      // text that is no cap: the error flag replaces the lowered one
      await cap.fill('0');
      await expect(page.locator('.sheetfields .f-flag')).toHaveClass(/error/);
      expect(await rowShape(), 'text that is no cap moved the row').toEqual(plain);

      // a valid cap brings the range back
      await cap.fill('200');
      await cap.blur();
      await expect(page.locator('#sh-cap-range')).toBeVisible();
      await expect(page.locator('.sheetfields .f-flag')).toBeHidden();
    } finally {
      await page.setViewportSize({ width: 1280, height: 720 });
    }
  });

  test('Enter on the name link of a gear set opens that set once, from the keyboard', async ({ mount, page }) => {
    const component = await mount<typeof Default>(STORY);
    const events = component.getByTestId('events');
    const start = page.url();
    const link = page.locator('#sh-sets tbody tr', { hasText: 'Set 2' }).locator('a.sname');
    await link.focus();
    await page.keyboard.press('Enter');
    await expect(events).toHaveText('["open:set:g_2"]');
    expect(page.url(), 'the row opens through the page, the link does not navigate').toBe(start);
  });

  test('has no axe violations', async ({ mount, axe }) => {
    await mount<typeof Default>(STORY);
    expect(withoutHandleName(await axe())).toEqual([]);
  });
});
