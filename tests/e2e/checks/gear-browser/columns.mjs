// Gear browser: pages, columns that stay, column hover.

import { columnsDiffer, measureColumns } from '../../lib/columns.mjs';
import { check, expect, same } from '../../lib/expect.mjs';
import { browserRows, chooseSlot, fillBrowser, setCap, setJob, showTab, waitReady } from '../../lib/nav.mjs';
import { SHARED_SETUP } from '../../lib/setup.mjs';

/** The browser's page line (owner's pick P1 a, 2026-10-20): Next and a page number show other rows and scroll the
 * table's box to its first row; a slot choice or a sort goes back to page 1; the line keeps its place (and the table its
 * top) whether the key at its right shows or not. Leaves the shared setup as it found it. */
export async function checkBrowserPages(pg) {
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
export async function checkBrowserColumnsStay(pg) {
  const state = () =>
    pg.evaluate(() => {
      const table = document.querySelector('#gear-table');
      const edges = [...table.querySelectorAll('thead th')].map(th => {
        const box = th.getBoundingClientRect();
        return [box.left, box.right];
      });
      const rowHeights = { plain: new Set(), cut: new Set() };
      for (const row of table.querySelectorAll('tbody tr[data-key]')) {
        rowHeights[row.querySelector('td.cut') ? 'cut' : 'plain'].add(row.getBoundingClientRect().height);
      }
      return {
        edges,
        headHeight: table.querySelector('thead').getBoundingClientRect().height,
        rowHeights: Object.fromEntries(Object.entries(rowHeights).map(([kind, set]) => [kind, [...set]])),
      };
    });
  const near = (a, b) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= 0.5);
  for (const job of ['PLD', SHARED_SETUP.job]) {
    await setJob(pg, job);
    for (const [width, height] of [
      [960, 800],
      [2560, 1440],
    ]) {
      await pg.setViewportSize({ width, height });
      await expect(browserRows(pg).first()).toBeVisible();
      const keys = await pg.locator('#gear-table thead [data-sort]').evaluateAll(buttons => buttons.map(b => b.dataset.sort));
      let first = null;
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
        for (const kind of ['plain', 'cut']) {
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
            return box.scrollWidth <= box.clientWidth;
          }),
          `${where}: the table scrolls sideways`,
        );
      }
    }
  }
  await pg.setViewportSize({ width: 1000, height: 900 });
  await setJob(pg, SHARED_SETUP.job);
}

/** The Gear browser's column under the pointer is tinted, heading and cells, for every column but Item and Slot: for
 * each heading and each column's first cell, hovered in turn, every cell of that column has the tint and the heading
 * the text colour, no other column does; the column the table is sorted by has its own tint (the table's data-sorted: the resting
 * colours are taken under a sort by another column), which it keeps under the pointer; hovering the Item or Slot heading
 * tints nothing. Both colour schemes, a job with a special substat (PLD) and one without (SGE). */
export async function checkBrowserColumnHover(pg) {
  const paint = () =>
    pg.evaluate(() => {
      const table = document.querySelector('#gear-table');
      const columns = {};
      const column = key => {
        columns[key] ??= { head: '', cells: [] };
        return columns[key];
      };
      for (const [i, th] of [...table.querySelectorAll('thead th')].entries()) {
        column(th.dataset.col ?? `#${i}`).head = getComputedStyle(th).color;
      }
      for (const tr of table.querySelectorAll('tbody tr[data-key]')) {
        for (const [i, td] of [...tr.children].entries()) {
          column(td.dataset.col ?? `#${i}`).cells.push(getComputedStyle(td).backgroundColor);
        }
      }
      return columns;
    });
  for (const scheme of ['dark', 'light']) {
    await pg.emulateMedia({ colorScheme: scheme });
    for (const job of ['PLD', SHARED_SETUP.job]) {
      await setJob(pg, job);
      await expect(browserRows(pg).first()).toBeVisible();
      const keys = await pg.locator('#gear-table thead th[data-col]').evaluateAll(heads => heads.map(th => th.dataset.col));
      check(keys.length >= 6, `${job}: only ${keys.length} columns have a data-col`);
      for (const key of keys) {
        const where = `${scheme} ${job} column ${key}`;
        // the table is sorted by another column, which is tinted (data-sorted); the resting colours are taken under that sort
        const sortKey = keys.find(k => k !== key);
        await pg.click(`#gear-table [data-sort="${sortKey}"]`);
        await pg.mouse.move(0, 0);
        const resting = await paint();
        check(
          resting[sortKey].cells.every(c => c !== resting[key].cells[0]),
          `${where}: the column sorted by (${sortKey}) is not tinted`,
        );
        for (const target of [`#gear-table th[data-col="${key}"]`, `#gear-table tbody tr[data-key] >> nth=1 >> td[data-col="${key}"]`]) {
          await pg.hover(target);
          await expect(pg.locator('#gear-table')).toHaveAttribute('data-hot', key);
          const now = await paint();
          const hovered = target.includes('tbody') ? 1 : -1; // a hovered row also tints itself, so it is left out below
          const tinted = now[key].cells.filter((_, i) => i !== hovered);
          check(tinted.length > 0 && tinted.every(c => c !== resting[key].cells[0]), `${where}: a cell of the column is not tinted`);
          check(now[key].head !== resting[key].head, `${where}: the heading is not in the text colour (${now[key].head})`);
          for (const other of Object.keys(now).filter(o => o !== key && !o.startsWith('#'))) {
            check(now[other].head === resting[other].head, `${where}: the heading of ${other} changed`);
            check(
              now[other].cells.every((c, i) => i === hovered || c === resting[other].cells[i]),
              `${where}: a cell of ${other} is tinted`,
            );
          }
        }
        // sorted by this column: it keeps the sort tint under the pointer (its heading is in the accent, with the arrow)
        await pg.click(`#gear-table [data-sort="${key}"]`);
        await pg.mouse.move(0, 0);
        const sortedResting = await paint();
        await pg.hover(`#gear-table th[data-col="${key}"]`);
        const sortedNow = await paint();
        check(same(sortedNow[key].cells, sortedResting[key].cells), `${where}: the sorted column changed colour under the pointer`);
      }
      // Item and Slot: nothing is tinted
      for (const head of ['name', 'slot']) {
        await pg.hover(head === 'name' ? '#gear-table th:nth-child(2)' : '#gear-table th:nth-child(1)');
        await expect(pg.locator('#gear-table')).toHaveAttribute('data-hot', '');
        const now = await paint();
        await pg.mouse.move(0, 0);
        const resting = await paint();
        check(same(now, resting), `${job} (${scheme}): hovering the ${head} heading changed a colour`);
      }
    }
  }
  await pg.emulateMedia({ colorScheme: null });
  await setJob(pg, SHARED_SETUP.job);
}

/** A four-digit number in every number cell of the Gear browser's table (Lv, item level and each stat) leaves the columns
 * where they are: the heading edges and the row heights are those of the real rows, no cell holds text wider than itself
 * and nothing scrolls sideways; a second line under each stat (a piece sync lowers: the piece's own number) moves the
 * edges no more. The five windows of docs/engineering/testing.md section 3.1 less the 1536 one, a job with a special
 * substat (PLD) and one without (SGE, the shared setup). The numbers are written into the page's cells, so the step
 * reloads the page to leave it as it found it. */
export async function checkBrowserFourDigits(pg) {
  const fill = withSecondLine =>
    pg.evaluate(second => {
      for (const cell of document.querySelectorAll('#gear-table tbody td.n')) {
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
