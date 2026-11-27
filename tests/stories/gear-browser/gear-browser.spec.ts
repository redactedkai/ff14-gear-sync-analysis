/* Stories of <gsa-gear-browser>: a click on a heading sorts and flips the order, a page button shows its page, a number typed in
   the item level box is committed after the typing wait and kept in the box. The table's rows are plain table cells and the
   headings and page buttons plain buttons (Tab order, Enter and Space as for any button), so there is no keyboard model beyond
   those; the Slot menu and the filter menus inside have their own specs. axe. */
import { test, expect } from '../fixtures.ts';
import type { Default } from './gear-browser.story.ts';

const STORY = 'gear-browser/gear-browser/Default';

test.describe('<gsa-gear-browser>', () => {
  test('draws a page of rows and axe finds nothing', async ({ mount, page, axe }) => {
    await mount<typeof Default>(STORY);
    await expect(page.locator('#gear-table tbody tr[data-key]')).toHaveCount(50);
    await expect(page.locator('#b-count')).toHaveText(/matches$/);
    expect(await axe()).toEqual([]);
  });

  /* A column of the table under the pointer is tinted, heading and cells, for every column but Item and Slot: each heading and each
     column's first cell, hovered in turn, tints every cell of that column and gives its heading the text colour, and no other column;
     the column the table is sorted by has its own tint (the resting colours are taken under a sort by another column), which it keeps
     under the pointer; hovering the Item or Slot heading tints nothing. Both colour schemes, a job with a special substat (Paladin)
     and one without (Sage). */
  test('the column under the pointer is tinted, heading and cells, but not Item or Slot, and the sorted column keeps its own tint; both colour schemes, Paladin and Sage', async ({
    mount,
    page,
  }) => {
    test.setTimeout(120_000);
    type Painted = Record<string, { head: string; cells: string[] }>;
    const paint = (): Promise<Painted> =>
      page.evaluate(() => {
        const table = document.querySelector('#gear-table') as HTMLElement;
        const columns: Record<string, { head: string; cells: string[] }> = {};
        const column = (key: string) => {
          columns[key] ??= { head: '', cells: [] };
          return columns[key];
        };
        for (const [at, head] of [...table.querySelectorAll('thead th')].entries()) {
          column((head as HTMLElement).dataset.col ?? `#${at}`).head = getComputedStyle(head).color;
        }
        for (const row of table.querySelectorAll('tbody tr[data-key]')) {
          for (const [at, cell] of [...row.children].entries()) {
            column((cell as HTMLElement).dataset.col ?? `#${at}`).cells.push(getComputedStyle(cell).backgroundColor);
          }
        }
        return columns;
      });
    try {
      for (const scheme of ['dark', 'light'] as const) {
        await page.emulateMedia({ colorScheme: scheme });
        for (const job of ['PLD', 'SGE']) {
          await mount<typeof Default>(STORY, { job });
          await expect(page.locator('#gear-table tbody tr[data-key]').first()).toBeVisible();
          const keys = await page
            .locator('#gear-table thead th[data-col]')
            .evaluateAll(heads => heads.map(head => (head as HTMLElement).dataset.col as string));
          expect(keys.length, `${job}: columns that have a data-col`).toBeGreaterThanOrEqual(6);
          for (const key of keys) {
            const where = `${scheme} ${job} column ${key}`;
            // the table is sorted by another column, which is tinted (data-sorted); the resting colours are taken under that sort
            const sortKey = keys.find(other => other !== key) as string;
            await page.locator(`#gear-table [data-sort="${sortKey}"]`).click();
            await page.mouse.move(0, 0);
            const resting = await paint();
            expect(
              resting[sortKey].cells.every(color => color !== resting[key].cells[0]),
              `${where}: the column sorted by (${sortKey}) is tinted`,
            ).toBe(true);
            for (const target of [
              `#gear-table th[data-col="${key}"]`,
              `#gear-table tbody tr[data-key] >> nth=1 >> td[data-col="${key}"]`,
            ]) {
              await page.locator(target).hover();
              await expect(page.locator('#gear-table')).toHaveAttribute('data-hot', key);
              const now = await paint();
              const hovered = target.includes('tbody') ? 1 : -1; // a hovered row also tints itself, so it is left out below
              const tinted = now[key].cells.filter((_, at) => at !== hovered);
              expect(
                tinted.length > 0 && tinted.every(color => color !== resting[key].cells[0]),
                `${where}: every cell of the column is tinted`,
              ).toBe(true);
              expect(now[key].head, `${where}: the heading is in the text colour`).not.toBe(resting[key].head);
              for (const other of Object.keys(now).filter(name => name !== key && !name.startsWith('#'))) {
                expect(now[other].head, `${where}: the heading of ${other} changed`).toBe(resting[other].head);
                expect(
                  now[other].cells.every((color, at) => at === hovered || color === resting[other].cells[at]),
                  `${where}: a cell of ${other} is tinted`,
                ).toBe(true);
              }
            }
            // sorted by this column: it keeps the sort tint under the pointer (its heading is in the accent, with the arrow)
            await page.locator(`#gear-table [data-sort="${key}"]`).click();
            await page.mouse.move(0, 0);
            const sortedResting = await paint();
            await page.locator(`#gear-table th[data-col="${key}"]`).hover();
            const sortedNow = await paint();
            expect(sortedNow[key].cells, `${where}: the sorted column changed colour under the pointer`).toEqual(sortedResting[key].cells);
          }
          // Item and Slot: nothing is tinted
          for (const head of ['name', 'slot']) {
            await page.locator(head === 'name' ? '#gear-table th:nth-child(2)' : '#gear-table th:nth-child(1)').hover();
            await expect(page.locator('#gear-table')).toHaveAttribute('data-hot', '');
            const now = await paint();
            await page.mouse.move(0, 0);
            expect(now, `${job} (${scheme}): hovering the ${head} heading changed a colour`).toEqual(await paint());
          }
        }
      }
    } finally {
      await page.emulateMedia({ colorScheme: null });
    }
  });

  test('the row under the pointer is tinted as well as its column, and a cell in neither is not', async ({ mount, page }) => {
    await mount<typeof Default>(STORY);
    await page.locator('#gear-table tbody tr[data-key] td[data-col="crit"] >> nth=0').hover();
    await expect(page.locator('#gear-table')).toHaveAttribute('data-hot', 'crit');
    const background = (row: number, column: string) =>
      page
        .locator('#gear-table tbody tr[data-key]')
        .nth(row)
        .locator(`td[data-col="${column}"]`)
        .evaluate(cell => getComputedStyle(cell).backgroundColor);
    const inColumn = await background(1, 'crit');
    const inRow = await background(0, 'det');
    const plain = await background(1, 'det');
    expect(inColumn, 'the hovered column is tinted').not.toBe(plain);
    expect(inRow, 'the hovered row is tinted').not.toBe(plain);
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
