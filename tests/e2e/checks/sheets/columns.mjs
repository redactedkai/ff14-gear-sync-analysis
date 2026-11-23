// The Sheets tab's tables: the columns of a sheet's list of gear sets keep their width.

import { COLUMN_WINDOWS, columnsDiffer, measureColumns } from '../../lib/columns.mjs';
import { check, expect } from '../../lib/expect.mjs';
import { waitReady } from '../../lib/nav.mjs';
import { figuresRadio, seedSheets, reloadAtSheets } from '../../lib/sheets.mjs';
import { edgeSheet } from './edges.mjs';

/* A sheet of `job` with two empty gear sets. */
const twoSetSheet = (id, name, job) => {
  const sheet = edgeSheet(id, name, job, 100, { on: false, cap: 795 });
  return { ...sheet, sets: [sheet.sets[0], { ...sheet.sets[0], id: `g_${id}_2`, name: 'Other' }] };
};

/** The sheet page's list of gear sets keeps its columns where they are. For a job with a special substat (Sage, with
 * a main stat Mind) and one without (Monk), at 960, 1280 and 2560 px, in the Effects and the Stat points view:
 *  - a four-digit number, and the longest effect texts, in every figure cell move no heading edge and no row, overflow no
 *    cell and scroll nothing sideways;
 *  - sorting by each heading leaves the heading edges where they were;
 *  - the Effects / Stat points switch has the same size and place whichever is chosen.
 * The numbers are written into the page's cells, so each round reloads the page. */
export async function checkSetListColumns(pg) {
  await seedSheets(pg, [twoSetSheet('s_mnk', 'Monk list', 'MNK'), twoSetSheet('s_sge', 'Sage list', 'SGE')]);
  const open = async (name, width, height, figures) => {
    await pg.setViewportSize({ width, height });
    await reloadAtSheets(pg);
    await waitReady(pg);
    await pg.click('[data-tab=sheets]');
    await pg.locator('#sh-list a.sname', { hasText: name }).click();
    await pg.click(figuresRadio(figures));
    await expect(pg.locator('#sh-sets tbody tr')).toHaveCount(2);
  };
  const switchBox = () =>
    pg.locator('#sh-figures').evaluate(box => {
      const { left, width, height } = box.getBoundingClientRect();
      return [left, width, height];
    });
  for (const name of ['Monk list', 'Sage list']) {
    for (const [width, height] of COLUMN_WINDOWS) {
      for (const figures of ['effects', 'points']) {
        await open(name, width, height, figures);
        const where = `${name} at ${width} px, ${figures}`;
        const real = await measureColumns(pg, '#sh-sets');

        // the widest figures: four digits for a stat, 9999 for the main stat, an effect with its sign and unit
        await pg.locator('#sh-sets tbody td.n').evaluateAll(cells => {
          for (const cell of cells) cell.textContent = cell.cellIndex === 1 ? '9999' : '+99.9%';
        });
        const why = columnsDiffer(real, await measureColumns(pg, '#sh-sets'));
        check(!why, `${where}, wide figures: ${why}`);

        // each heading sorts, and the columns stay (the page is reloaded first: the cells above are not the page's)
        await open(name, width, height, figures);
        const keys = await pg.locator('#sh-sets thead [data-sort]').evaluateAll(buttons => buttons.map(b => b.dataset.sort));
        for (const key of keys) {
          await pg.click(`#sh-sets [data-sort="${key}"]`);
          const sorted = columnsDiffer(real, await measureColumns(pg, '#sh-sets'));
          check(!sorted, `${where}, sorted by ${key}: ${sorted}`);
        }
      }

      // the switch: its place and size do not change with the choice
      await open(name, width, height, 'effects');
      const effects = await switchBox();
      await pg.click(figuresRadio('points'));
      const points = await switchBox();
      // the chosen option is bold, which makes its label a little wider (under 1 px); the left edge and the height stay
      check(
        effects[0] === points[0] && effects[2] === points[2] && Math.abs(effects[1] - points[1]) < 1.5,
        `${name} at ${width} px: the Effects / Stat points switch moved or grew (left, width, height) ${effects} -> ${points}`,
      );
    }
  }
  await pg.click(figuresRadio('effects'));
  await pg.setViewportSize({ width: 1000, height: 900 });
  await reloadAtSheets(pg);
  await waitReady(pg);
  await pg.click('[data-tab=browse]');
}
