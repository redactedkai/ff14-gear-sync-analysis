// How the math works: Piece stats.

import { check, expect } from '../../lib/expect.mjs';
import { openPieceMenus, setNumber, showMath, tableRows } from '../../lib/nav.mjs';
import { pickOption } from '../../lib/select.mjs';

/** Opens Piece stats' "Stat budget analysis, step by step" if it is closed. */
async function openSteps(pg) {
  if (!(await pg.locator('#p-steps').evaluate(d => d.open))) {
    await pg.click('#p-steps > summary');
  }
}

/** The sync help popover dims the whole page with a backdrop. The tab bar and the bar's own Job box are dimmed like the rest
 * (the backdrop is what is under their pixels), and their own border and background do not change. */
export async function checkHelpDimsPage(pg) {
  await showMath(pg, 'piece');
  const read = () =>
    pg.evaluate(() => {
      const parts = { 'tab bar': 'nav.tabs', 'Job box': '#m-job-btn' };
      return Object.fromEntries(
        Object.entries(parts).map(([name, selector]) => {
          const element = document.querySelector(selector);
          const box = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          const topmost = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
          return [name, { border: style.borderColor, background: style.backgroundColor, topmost: topmost.className }];
        }),
      );
    });
  const closed = await read();
  await pg.click('#m-help');
  await expect(pg.locator('#m-help-pop')).toBeVisible();
  const open = await read();
  for (const name of Object.keys(closed)) {
    check(
      open[name].border === closed[name].border && open[name].background === closed[name].background,
      `the ? popover changes the ${name} (${closed[name].border} ${closed[name].background} -> ${open[name].border} ${open[name].background})`,
    );
    check(
      open[name].topmost === 'backdrop',
      `with the ? popover open the ${name} is not under the backdrop (topmost: ${open[name].topmost})`,
    );
  }
  await pg.keyboard.press('Escape');
  await expect(pg.locator('#m-help-pop')).toBeHidden();
}

/** SGE, ilvl 130 head, Spell Speed / Piety = the ranked stats of a real item level 130 healer head piece, on the real page: the
 * four rows, the head's Mind at the cap, the explainer and the chart. */
export async function checkPieceLab(pg) {
  await showMath(pg, 'piece');
  await pickOption(pg, '#p-slot', 'head');
  await openPieceMenus(pg);
  await pickOption(pg, '#p-s1', 'sps');
  await pickOption(pg, '#p-s2', 'piety');
  await pg.keyboard.press('Escape');
  await expect(pg.locator('#p-piece-pop')).toBeHidden();
  await setNumber(pg, '#p-ilvl', '130');
  await openSteps(pg);
  await expect(pg.locator('#p-out thead')).toHaveTextParts(['head', 130]);
  await expect(pg.locator('#p-out tbody tr')).toHaveCount(4);
  await expect(pg.locator('#p-s3')).toHaveCount(0); // no third rank: a third line exists only as healer Direct Hit
  // columns: stat (name, then its share), this head (its value first), the ceiling at the cap, in the duty: the head's Mind, 33 raw
  // and 30 at the cap of 123 (the other numbers and the marked slices are `views/piece`'s and `views/piece-stats`')
  const rows = await tableRows(pg, '#p-out');
  const mind = rows.find(r => r[0].split('\n')[0] === 'Mind');
  check(
    mind && parseInt(mind[1], 10) === 33 && parseInt(mind[2], 10) === 30 && parseInt(mind[3], 10) === 30,
    `Piece stats ilvl 130 head Mind (raw, ceiling, duty) is ${mind?.slice(1, 4)}, expected 33, 30, 30`,
  );
  // the explainer: the item level 130 head against the melded item level 123 head, and the curve
  await expect(pg.locator('#p-vs tr[data-kind="melded"]')).toHaveCount(1);
  await expect(pg.locator('#p-vs b')).toBeVisible(); // the verdict
  await expect(pg.locator('#p-curve-chart svg')).toBeVisible();
  await pg.click('#p-ilvl-reset');
}
