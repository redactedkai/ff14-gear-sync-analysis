// Gear browser: the table's rows always show the page's own rows (the rows are kept between a sort, a page, a slot, a
// filter or a job change, and only their bindings change).

import { check, expect } from '../../lib/expect.mjs';
import { browserRows, chooseSlot, fillBrowser, setJob, showTab } from '../../lib/nav.mjs';
import { SHARED_SETUP } from '../../lib/setup.mjs';

/* Installed in the page: window.__rowsMismatch() describes the first way the table's rows differ from the component's
   `view.shown` (the rows the table should show), or '' when they match. Every row is read the way the template binds it:
   the row's key and class, the slot cell (label, title, the x2 mark), the name cell (title, the name's spans and their
   classes, the HQ mark), the two level cells, and each stat cell (column, text, class, data-was).
   window.__rowsWatch(true) starts a requestAnimationFrame loop that runs it before every frame is drawn; window.__rowsWatch(false)
   stops it and returns {frames, bad: the first mismatch seen in any frame, or ''}. */
function installRowsCheck() {
  const component = () => document.querySelector('#tab-browse [x-data="gear"]')._x_dataStack[0];
  window.__rowsMismatch = () => {
    const shown = component().view?.shown ?? [];
    const rows = [...document.querySelectorAll('#gear-table tbody tr[data-key]')];
    if (rows.length !== shown.length) return `${rows.length} rows in the table, ${shown.length} in the view`;
    for (const [place, row] of rows.entries()) {
      const item = shown[place];
      const where = `row ${place} (${item.name})`;
      const [slotCell, nameCell, lvlCell, ilvlCell, ...statCells] = [...row.children].filter(cell => cell.tagName === 'TD');
      const nameSpans = [...nameCell.querySelectorAll(':scope > span:not(.hqg)')];
      const stats = [
        [row.dataset.key, item.key, 'key'],
        [row.className, item.rowCls, 'row class'],
        [slotCell.title, item.slot, 'slot title'],
        [slotCell.querySelector('.slotname').textContent, item.slotText, 'slot text'],
        [slotCell.querySelector('.x2').hidden, !item.twice, 'x2 mark hidden'],
        [nameCell.title, item.name, 'name title'],
        [nameSpans.map(span => span.textContent).join('|'), item.nameParts.map(part => part.text).join('|'), 'name parts'],
        [nameSpans.map(span => span.className).join('|'), item.nameParts.map(part => part.cls).join('|'), 'name part classes'],
        [nameCell.querySelector('.hqg').hidden, !item.hq, 'HQ mark hidden'],
        [lvlCell.textContent, String(item.lvl), 'equip level'],
        [ilvlCell.textContent, String(item.ilvl), 'item level'],
        [statCells.length, item.cells.length, 'stat cell count'],
      ];
      for (const [index, cell] of item.cells.entries()) {
        const td = statCells[index];
        if (!td) break;
        stats.push(
          [td.dataset.col, cell.col, `column ${index}`],
          [td.textContent, cell.text, `${cell.col} text`],
          [td.className, cell.cls, `${cell.col} class`],
          [td.getAttribute('data-was'), cell.was ?? null, `${cell.col} data-was`],
        );
      }
      for (const [got, want, what] of stats)
        if (got !== want) return `${where}: ${what} is ${JSON.stringify(got)}, the view has ${JSON.stringify(want)}`;
    }
    return '';
  };
  let watching = null;
  window.__rowsWatch = on => {
    if (on) {
      watching = { frames: 0, bad: '' };
      const frame = () => {
        if (!watching) return;
        watching.frames++;
        watching.bad ||= window.__rowsMismatch();
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
      return null;
    }
    const result = watching;
    watching = null;
    return result;
  };
}

/** Each Gear browser action below leaves the table showing exactly the page's rows: after it settles, and in every frame
 * drawn while it ran (a kept row must not show the item it had before: its name, HQ mark, x2 mark, classes or cells). The
 * actions are sorts (both ways, name, item level, a stat), page buttons (the last, shorter page too), the Slot menu
 * (rings carry the x2 mark), a search typed and cleared, and a job change. Leaves the job, sort and filters as it found them. */
export async function checkBrowserRowsMatchView(pg) {
  await showTab(pg, 'browse');
  await fillBrowser(pg, '', '', '');
  await pg.evaluate(installRowsCheck);
  const rowCount = () => browserRows(pg).count();
  // one action, watched from the click to the settled page
  const watched = async (label, action) => {
    await pg.evaluate(() => window.__rowsWatch(true));
    await action();
    await pg.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 0)))));
    const seen = await pg.evaluate(() => window.__rowsWatch(false));
    const now = await pg.evaluate(() => window.__rowsMismatch());
    check(!seen.bad, `${label}: a drawn frame showed a row that differs from the view: ${seen.bad}`);
    check(!now, `${label}: the settled table differs from the view: ${now}`);
    check((await rowCount()) > 0 || label.includes('no match'), `${label}: no rows`);
  };
  const pages = pg.locator('#b-pages');
  const sort = key => () => pg.click(`#gear-table [data-sort="${key}"]`);
  await watched('sort by Item', sort('name'));
  await watched('sort by Item, the other way', sort('name'));
  await watched('sort by ilvl', sort('ilvl'));
  await watched('sort by ilvl, the other way', sort('ilvl'));
  await watched('sort by Crit', sort('crit'));
  await watched('sort by Crit, the other way', sort('crit'));
  await watched('Next page', () => pages.locator('[aria-label="Next page"]').click());
  await watched('page 3', () => pages.locator('[aria-label="Page 3"]').click());
  await watched('the last page (fewer rows)', () => pages.locator('button[aria-label^="Page "]').last().click());
  check((await rowCount()) < 50, 'the last page has as many rows as a full one; the check wants a shorter page');
  await watched('Previous page (full page again)', () => pages.locator('[aria-label="Previous page"]').click());
  await watched('slot Ring (x2 marks)', () => chooseSlot(pg, 'ring'));
  await expect(pg.locator('#gear-table .x2:visible').first()).toBeVisible();
  await watched('slot Weapon (no x2 marks)', () => chooseSlot(pg, 'weapon'));
  await watched('slot Any', () => chooseSlot(pg, 'any'));
  await watched('search typed', async () => {
    await pg.click('#b-q');
    await pg.keyboard.type('ring', { delay: 30 });
  });
  await watched('search with no match', () => pg.keyboard.type('zzzz', { delay: 30 }));
  await watched('search cleared', () => pg.fill('#b-q', ''));
  await watched('job change to PLD', () => setJob(pg, 'PLD'));
  await watched('job change back', () => setJob(pg, SHARED_SETUP.job));
  // the sort back to the default (item level, high first)
  const ilvlHead = pg.locator('#gear-table th:has([data-sort="ilvl"])');
  if ((await ilvlHead.getAttribute('aria-sort')) !== 'descending') await pg.click('#gear-table [data-sort="ilvl"]');
  await expect(ilvlHead).toHaveAttribute('aria-sort', 'descending');
}
