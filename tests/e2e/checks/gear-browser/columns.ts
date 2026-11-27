// Gear browser: pages, columns that stay, column hover.

import { columnsDiffer, measureColumns } from '../../lib/columns.ts';
import { check, expect, same } from '../../lib/expect.ts';
import { browserRows, chooseSlot, fillBrowser, setCap, setJob, showTab, waitReady } from '../../lib/nav.ts';
import { SHARED_SETUP } from '../../lib/setup.ts';
import type { Page } from 'playwright';

/** The browser's page line (owner's pick P1 a, 2026-10-20): Next and a page number show other rows and scroll the
 * table's box to its first row; a slot choice or a sort goes back to page 1; the line keeps its place (and the table its
 * top) whether the key at its right shows or not. Leaves the shared setup as it found it. */
export async function checkBrowserPages(pg: Page) {
  // every Sage piece: many pages
  await fillBrowser(pg, '', '', '');
  const pages = pg.locator('#b-pages');
  const current = pages.locator('[aria-current="page"]');
  const firstKey = () => browserRows(pg).first().getAttribute('data-key');
  const tableBox = pg.locator('#tab-browse .tablewrap');
  const scrollTop = () => tableBox.evaluate(box => box.scrollTop);
  await expect(current).toHaveText('1');
  await expect(pages.locator('[aria-label="Previous page"]')).toBeDisabled();
  await expect(browserRows(pg)).toHaveCount(50);

  // Next: other rows, the table back at its top
  await tableBox.evaluate(box => (box.scrollTop = 900));
  const page1 = await firstKey();
  await pages.locator('[aria-label="Next page"]').click();
  await expect(current).toHaveText('2');
  check((await firstKey()) !== page1, 'Next did not change the rows');
  check((await scrollTop()) === 0, 'Next did not scroll the table to its top');
  // a page number, the same
  await tableBox.evaluate(box => (box.scrollTop = 900));
  const page2 = await firstKey();
  await pages.locator('[aria-label="Page 3"]').click();
  await expect(current).toHaveText('3');
  check((await firstKey()) !== page2, 'a page number did not change the rows');
  check((await scrollTop()) === 0, 'a page number did not scroll the table to its top');

  // a slot choice and a sort go back to page 1
  await chooseSlot(pg, 'body');
  await expect(current).toHaveText('1');
  await pages.locator('[aria-label="Next page"]').click();
  await expect(current).toHaveText('2');
  await pg.click('#gear-table [data-sort="name"]');
  await expect(current).toHaveText('1');

  // the key shows with sync on (item level 130 is above the cap of 123) and not with it off (no piece above level
  // 50): the line and the table stay where they are
  await fillBrowser(pg, 100, 140, 50);
  await expect(pg.locator('#b-key')).toBeVisible();
  const lineTop = () => pg.locator('#tab-browse .pageline').evaluate(line => line.getBoundingClientRect().top);
  const tableTop = () => tableBox.evaluate(box => box.getBoundingClientRect().top);
  const withKey = [await lineTop(), await tableTop()];
  await pg.locator('#sync').uncheck();
  await expect(pg.locator('#b-key')).toBeHidden();
  const withoutKey = [await lineTop(), await tableTop()];
  check(same(withKey, withoutKey), `the page line or the table moved when the key went: ${withKey} vs ${withoutKey}`);
  await setCap(pg, SHARED_SETUP.cap);
}

/** The Gear browser's table keeps its columns where they are whatever the sort: every column heading's left and right
 * edge and every row's height are those of the first sort, at the narrowest and the widest window, for a job with a
 * special substat (PLD) and one without (SGE, the shared setup). Sync is on, so some rows have a second line. Leaves the
 * window and the job as it found them. */
export async function checkBrowserColumnsStay(pg: Page) {
  const state = () =>
    pg.evaluate(() => {
      const table = document.querySelector('#gear-table');
      const head = table?.querySelector('thead');
      if (!table || !head) {
        throw new Error('no table or heading in the Gear browser');
      }
      const edges = [...table.querySelectorAll('thead th')].map((th): [number, number] => {
        const box = th.getBoundingClientRect();
        return [box.left, box.right];
      });
      const rowHeights: Record<'plain' | 'cut', Set<number>> = { plain: new Set(), cut: new Set() };
      for (const row of table.querySelectorAll('tbody tr[data-key]')) {
        rowHeights[row.querySelector('td.cut') ? 'cut' : 'plain'].add(row.getBoundingClientRect().height);
      }
      return {
        edges,
        headHeight: head.getBoundingClientRect().height,
        rowHeights: Object.fromEntries(Object.entries(rowHeights).map(([kind, set]) => [kind, [...set]])),
      };
    });
  const near = (a: number[], b: number[]) => a.length === b.length && a.every((v, i) => Math.abs(v - (b[i] ?? Number.NaN)) <= 0.5);
  for (const job of ['PLD', SHARED_SETUP.job]) {
    await setJob(pg, job);
    for (const [width, height] of [
      [960, 800],
      [2560, 1440],
    ]) {
      await pg.setViewportSize({ width, height });
      await expect(browserRows(pg).first()).toBeVisible();
      const keys = await pg
        .locator('#gear-table thead [data-sort]')
        .evaluateAll(buttons => buttons.flatMap(b => (b instanceof HTMLElement && b.dataset.sort ? [b.dataset.sort] : [])));
      let first: Awaited<ReturnType<typeof state>> | null = null;
      for (const key of keys) {
        await pg.click(`#gear-table [data-sort="${key}"]`);
        await expect(pg.locator(`#gear-table th:not([aria-sort="none"]) [data-sort="${key}"]`)).toHaveCount(1);
        const now = await state();
        first ??= now;
        const where = `${job} at ${width} px sorted by ${key}`;
        check(
          near(now.edges.flat(), first.edges.flat()),
          `${where}: the column edges moved (${JSON.stringify(now.edges.map(e => e.map(Math.round)))} vs ${JSON.stringify(first.edges.map(e => e.map(Math.round)))})`,
        );
        check(
          Math.abs(now.headHeight - first.headHeight) <= 0.5,
          `${where}: the heading row's height changed (${now.headHeight} vs ${first.headHeight})`,
        );
        for (const kind of ['plain', 'cut'] as const) {
          for (const h of now.rowHeights[kind]) {
            check(
              first.rowHeights[kind].length === 0 || first.rowHeights[kind].some(f => Math.abs(f - h) <= 0.5),
              `${where}: a ${kind} row is ${h} px high, not ${first.rowHeights[kind]}`,
            );
          }
        }
        check(
          await pg.evaluate(() => {
            const box = document.querySelector('#tab-browse .tablewrap');
            return box !== null && box.scrollWidth <= box.clientWidth;
          }),
          `${where}: the table scrolls sideways`,
        );
      }
    }
  }
  await pg.setViewportSize({ width: 1000, height: 900 });
  await setJob(pg, SHARED_SETUP.job);
}

/** A four-digit number in every number cell of the Gear browser's table (Lv, item level and each stat) leaves the columns
 * where they are: the heading edges and the row heights are those of the real rows, no cell holds text wider than itself
 * and nothing scrolls sideways; a second line under each stat (a piece sync lowers: the piece's own number) moves the
 * edges no more. The five windows of docs/engineering/testing.md section 3.1 less the 1536 one, a job with a special
 * substat (PLD) and one without (SGE, the shared setup). The numbers are written into the page's cells, so the step
 * reloads the page to leave it as it found it. */
export async function checkBrowserFourDigits(pg: Page) {
  const fill = (withSecondLine: boolean) =>
    pg.evaluate(second => {
      for (const cell of document.querySelectorAll<HTMLElement>('#gear-table tbody td.n')) {
        (cell.querySelector('span') ?? cell).textContent = '9999';
        if (second && cell.dataset.col !== 'lvl' && cell.dataset.col !== 'ilvl') {
          cell.dataset.was = '9999';
          cell.classList.add('cut');
        }
      }
    }, withSecondLine);
  for (const job of ['PLD', SHARED_SETUP.job]) {
    for (const [width, height] of [
      [960, 700],
      [1280, 720],
      [1920, 1080],
      [2560, 1440],
    ]) {
      await pg.reload();
      await waitReady(pg);
      await showTab(pg, 'browse');
      await setJob(pg, job);
      await pg.setViewportSize({ width, height });
      await expect(browserRows(pg).first()).toBeVisible();
      const where = `${job} at ${width} px`;
      const real = await measureColumns(pg, '#gear-table');
      await fill(false);
      const oneLine = await measureColumns(pg, '#gear-table');
      check(!columnsDiffer(real, oneLine), `${where}, four digits: ${columnsDiffer(real, oneLine)}`);
      await fill(true);
      const twoLines = await measureColumns(pg, '#gear-table');
      const why = columnsDiffer({ ...real, rowHeights: twoLines.rowHeights }, twoLines);
      check(!why, `${where}, four digits with a second line: ${why}`);
    }
  }
  await pg.setViewportSize({ width: 1000, height: 900 });
  await pg.reload();
  await waitReady(pg);
  await showTab(pg, 'browse');
}
