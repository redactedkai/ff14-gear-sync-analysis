// How the math works: Piece stats.

import { check, expect, poll } from '../../lib/expect.mjs';
import { openPieceMenus, setNumber, showMath, tableRows } from '../../lib/nav.mjs';
import { expectSelectValue, pickOption, selectOptions } from '../../lib/select.mjs';

/** Opens Piece stats' "Stat budget analysis, step by step" if it is closed. */
async function openSteps(pg) {
  if (!(await pg.locator('#p-steps').evaluate(d => d.open))) {
    await pg.click('#p-steps > summary');
  }
}

/** A closed details panel ("Stat budget analysis, step by step") is only its summary plus padding: the flex gap of the panel must
    not add space for the hidden content (it added 14 px, 2026-10-17). */

export async function checkClosedPanel(pg) {
  await showMath(pg, 'piece');
  if (await pg.locator('#p-steps').evaluate(d => d.open)) {
    await pg.click('#p-steps > summary');
  }
  const extra = await pg.locator('#p-steps').evaluate(d => {
    const cs = getComputedStyle(d);
    const frame = ['paddingTop', 'paddingBottom', 'borderTopWidth', 'borderBottomWidth'].reduce((n, k) => n + parseFloat(cs[k]), 0);
    return d.getBoundingClientRect().height - frame - d.querySelector('summary').getBoundingClientRect().height;
  });
  check(Math.abs(extra) < 1, `closed #p-steps has ${extra.toFixed(1)} px beyond its summary and padding`);
}

/** The Stat Allocation bar does not move when a Slot, 1st substat or 2nd substat is chosen: the Slot menu and the Substats & materia
 * chip each have one width (a hidden copy of their longest text), so every control keeps its place. Reads each control's box
 * (the popover closed) before and after every choice of the three menus. */
export async function checkPieceBarSteady(pg) {
  await showMath(pg, 'piece');
  const boxes = () =>
    pg.evaluate(() =>
      [...document.querySelectorAll('#m-bar .barrow > *, #m-bar .piecesec > *, #m-bar .ilrow > *')]
        .filter(el => el.offsetParent)
        .map(el => {
          const box = el.getBoundingClientRect();
          return `${el.id || el.className}:${box.left.toFixed(1)},${box.top.toFixed(1)},${box.width.toFixed(1)}`;
        })
        .join(' '),
    );
  const before = await boxes();
  for (const menu of ['#p-slot', '#p-s1', '#p-s2']) {
    const values = (await selectOptions(pg, menu)).map(option => option.value);
    for (const value of values) {
      if (menu !== '#p-slot') {
        await openPieceMenus(pg); // the substat menus are in the chip's popover
      }
      await pickOption(pg, menu, value);
      await expectSelectValue(pg, menu, value);
      await pg.keyboard.press('Escape'); // the popover closes; the chip says the new choice
      await expect(pg.locator('#p-piece-pop')).toBeHidden();
      const after = await boxes();
      check(after === before, `choosing ${value} in ${menu} moved the Stat Allocation bar: ${before} -> ${after}`);
    }
  }
  await pickOption(pg, '#p-slot', { index: 0 });
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

/** The sync help ? button, pressed with the Job menu open, closes the Job menu as any click outside it does: the menu
 * is not left open under the popover's backdrop. The popover opens. */
export async function checkHelpClosesJobMenu(pg) {
  await showMath(pg, 'piece');
  await pg.click('#m-job-btn');
  await expect(pg.locator('#m-job-menu')).toBeVisible();
  await pg.click('#m-help');
  await expect(pg.locator('#m-help-pop')).toBeVisible();
  await expect(pg.locator('#m-job-menu')).toBeHidden();
  await pg.keyboard.press('Escape');
  await expect(pg.locator('#m-help-pop')).toBeHidden();
}

/** SGE, ilvl 130 head, Spell Speed / Piety = the ranked stats of a real item level 130 healer head piece. */
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
  // columns: stat (name, then its share), this head (its value first), the ceiling at the cap, in the duty
  const rows = await tableRows(pg, '#p-out');
  const byStat = Object.fromEntries(
    rows.map(r => [r[0].split('\n')[0], { raw: parseInt(r[1], 10), ceiling: parseInt(r[2], 10), duty: parseInt(r[3], 10) }]),
  );
  const expected = { Mind: 33, Vitality: 32, 'Spell Speed': 31, Piety: 22 };
  for (const [stat, v] of Object.entries(expected)) {
    check(byStat[stat]?.raw === v, `Piece stats ilvl 130 head ${stat} raw ${byStat[stat]?.raw}, expected ${v}`);
  }
  // 130 is above the 123 cap: the head caps (29 substat, 30 main) are the ceiling, and the duty keeps the lower number
  check(
    byStat.Mind?.ceiling === 30 && byStat['Spell Speed']?.ceiling === 29 && byStat.Mind?.duty === 30 && byStat['Spell Speed']?.duty === 29,
    `Piece stats ceiling / duty Mind ${byStat.Mind?.ceiling}/${byStat.Mind?.duty}, Spell Speed ${byStat['Spell Speed']?.ceiling}/${byStat['Spell Speed']?.duty}, expected 30/30 and 29/29`,
  );
  // the slots that share the head's share are marked (expect() reads one element, so the marked slices are read together)
  const marked = [/Head\s*8\.5%/, /Hands\s*8\.5%/, /Feet\s*8\.5%/];
  await poll('the slices that share the head share', async () => {
    const got = await pg.locator('#p-slices span.on').allTextContents();
    return { ok: got.length === marked.length && marked.every((re, i) => re.test(got[i])), got };
  });
  // the explainer: the item level 130 head against the melded item level 123 head, and the curve
  await expect(pg.locator('#p-vs tr[data-kind="melded"]')).toHaveCount(1);
  await expect(pg.locator('#p-vs b')).toBeVisible(); // the verdict
  await expect(pg.locator('#p-curve-chart svg')).toBeVisible();
  await pg.click('#p-ilvl-reset');
}
