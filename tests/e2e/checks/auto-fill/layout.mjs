// The Auto-fill settings popover's layout: the Goal part's controls sit on the columns of the Gear to search part's.

import { check, expect, poll } from '../../lib/expect.mjs';
import { SET_SHEET } from '../../lib/fixtures.mjs';
import { openSageSet, openSet, seedSheet, seedSheets } from '../../lib/sheets.mjs';

const ALIGN_TOLERANCE_PX = 1;
// the field and popover heights must not move at all (a pixel is a visible jump)
const HEIGHT_TOLERANCE_PX = 0.5;
const WIDTHS_PX = [960, 1280];

/** The Target GCD box and the Spare points to tiebreaks switch line up with the controls of Gear to search below them (docs/engineering/ui.md,
 * Auto-fill settings): the box ends where the item level pair ends, the exactly / or faster buttons start where Gear categories
 * starts, and the switch starts where the item level pair starts. At 960 and 1280 px, with no sideways scroll. */
export async function checkSettingsAlignment(pg) {
  await seedSheet(pg, SET_SHEET);
  await openSageSet(pg);
  for (const width of WIDTHS_PX) {
    await pg.setViewportSize({ width, height: 900 });
    await pg.click('#sh-settings');
    await expect(pg.locator('#sh-settings-dialog')).toBeVisible();
    const edges = await pg.evaluate(() => {
      const box = selector => document.querySelector(`#sh-settings-dialog ${selector}`).getBoundingClientRect();
      return {
        gcdRight: box('#s-gcd').right,
        segLeft: box('.gcd-field .seg').left,
        segRight: box('.gcd-field .seg').right,
        switchLeft: document.querySelector('#s-by-tier').closest('label').getBoundingClientRect().left,
        pairLeft: box('#s-min').left,
        pairRight: box('#s-max').right,
        fromLeft: box('#s-from').left,
        fromRight: box('#s-from').right,
        pageScrolls: document.documentElement.scrollWidth > innerWidth,
      };
    });
    const near = (name, got, want) =>
      check(
        Math.abs(got - want) <= ALIGN_TOLERANCE_PX,
        `at ${width} px the ${name} is at ${got.toFixed(1)}, the control below it at ${want.toFixed(1)}`,
      );
    near('Target GCD box right edge', edges.gcdRight, edges.pairRight);
    near('exactly / or faster left edge', edges.segLeft, edges.fromLeft);
    near('exactly / or faster right edge', edges.segRight, edges.fromRight);
    near('Spare points to tiebreaks switch left edge', edges.switchLeft, edges.pairLeft);
    check(!edges.pageScrolls, `at ${width} px the page scrolls sideways`);
    await pg.keyboard.press('Escape');
    await expect(pg.locator('#sh-settings-dialog')).toHaveCount(0);
  }
  await pg.setViewportSize({ width: 1000, height: 900 });
  await pg.click('[data-tab=browse]');
}

// Target GCD label cases: a job, the haste its label line names, and the `parts` its sentence (the input's accessible name)
// must hold besides the GCD range's two numbers (docs/engineering/ui.md, Target GCD)
const LABEL_CASES = [
  { job: 'PLD', haste: null, parts: [] },
  { job: 'SAM', haste: /^Fuka \d+%$/, parts: ['Fuka', '%'] },
  { job: 'NIN', haste: 'Increase Attack Speed 15%', parts: ['Increase Attack Speed', 15] },
];
const OFF_CASE = {
  job: 'PLD',
  sheet: 'Speed goal PLD',
  off: true,
  haste: 'Off: goal is speed',
  parts: ['off: the target is speed'], // the sentence of the settled label: until the count lands, the label reads "Target GCD" alone
};

/** How many GCD figures (like 2.50) a label sentence holds: the range of the Target GCD, two when it is on. */
const gcdFigures = text => (text.match(/\d\.\d\d/g) ?? []).length;

/** A saved sheet for `job` with one empty set named "Empty" (every slot empty), for the label cases. */
function emptySheetFor(job, id = `s_${job}`, name = `Label ${job}`) {
  const empty = SET_SHEET.sets[0];
  const pieces = empty.pieces.map(piece => ({ slot: piece.slot }));
  return {
    ...SET_SHEET,
    id,
    name,
    job,
    sets: [{ ...empty, name: 'Empty', pieces, pinned: { pieces: [], meal: false } }],
  };
}

/** What the Target GCD field shows now, measured: the label line's parts and the field's and popover's boxes. */
async function measureGcdField(pg) {
  return pg.evaluate(() => {
    const dialog = document.querySelector('#sh-settings-dialog');
    const rect = element => element.getBoundingClientRect();
    const label = dialog.querySelector('label[for="s-gcd"]');
    const left = label.querySelector('.gcd-left');
    const side = label.querySelector('.gcd-side');
    const lineHeight = rect(left).height;
    return {
      leftText: left.textContent.replace(/\s+/g, ' ').trim(),
      sideText: side ? side.textContent : null,
      sideTitle: side ? side.getAttribute('title') : null,
      sideCut: side ? side.scrollWidth > side.clientWidth : false,
      oneLine: rect(label).height <= lineHeight + 1,
      leftInside: rect(left).right <= rect(label).right && (!side || rect(left).right <= rect(side).left),
      sideInside: !side || rect(side).right <= rect(label).right + 0.5,
      fieldHeight: rect(dialog.querySelector('.gcd-field')).height,
      dialogHeight: rect(dialog).height,
      boxLeft: rect(dialog.querySelector('#s-gcd')).left,
      boxRight: rect(dialog.querySelector('#s-gcd')).right,
      segLeft: rect(dialog.querySelector('.gcd-field .seg')).left,
      segRight: rect(dialog.querySelector('.gcd-field .seg')).right,
      pageScrolls: document.documentElement.scrollWidth > innerWidth,
    };
  });
}

/** The Target GCD label line, for Paladin (no haste), Samurai, Ninja (the longest haste) and the off state (the goal is the
 * speed stat), at 960 and 1280 px: the name and range at the left, whole and on one line; the always-on haste or "Off: goal
 * is speed" at the right (only when there is one); the input's accessible name is the whole sentence; and the field's height
 * and the box and button edges are the same in every case. */
export async function checkGcdLabel(pg) {
  await seedSheets(pg, [...LABEL_CASES.map(({ job }) => emptySheetFor(job)), emptySheetFor('PLD', 's_PLD_off', OFF_CASE.sheet)]);
  let base = null;
  for (const width of WIDTHS_PX) {
    await pg.setViewportSize({ width, height: 900 });
    for (const labelCase of [...LABEL_CASES, OFF_CASE]) {
      const where = `${labelCase.job}${labelCase.off ? ' (goal is speed)' : ''} at ${width} px`;
      if (await pg.locator('#sh-set').isVisible()) {
        await pg.click('#sh-set .setcrumb a'); // back to the sheet list
      }
      await openSet(pg, labelCase.sheet ?? `Label ${labelCase.job}`, 'Empty');
      await pg.click('#sh-settings');
      await expect(pg.locator('#sh-settings-dialog')).toBeVisible();
      if (labelCase.off) {
        await pg.selectOption('#s-target', 'sks');
      }
      const sentence = pg.locator('label[for="s-gcd"] .sr-only');
      const figures = labelCase.off ? 0 : 2; // the range's two GCD figures, none while the goal is speed
      await poll(`${where}: the label's range and haste`, async () => {
        const got = ((await sentence.textContent()) ?? '').trim();
        return { ok: gcdFigures(got) === figures && labelCase.parts.every(part => got.includes(String(part))), got };
      });
      const spoken = (await sentence.textContent()).trim();
      const name = /^- '?spinbutton "(.*?)"/m.exec(await pg.locator('#s-gcd').ariaSnapshot())?.[1] ?? '';
      check(name === spoken, `${where}: the Target GCD box's accessible name is "${name}", not its label "${spoken}"`);
      const got = await measureGcdField(pg);
      if (labelCase.off) {
        check(got.leftText === 'Target GCD', `${where}: the left part reads "${got.leftText}"`);
      } else {
        check(/^Target GCD · \d\.\d\d–\d\.\d\d$/.test(got.leftText), `${where}: the left part reads "${got.leftText}"`);
      }
      const wantHaste = labelCase.haste;
      let hasteOk = got.sideText === wantHaste;
      if (wantHaste === null) {
        hasteOk = got.sideText === null;
      } else if (wantHaste instanceof RegExp) {
        hasteOk = wantHaste.test(got.sideText ?? '');
      }
      check(hasteOk, `${where}: the right part reads ${JSON.stringify(got.sideText)}`);
      if (got.sideText && !labelCase.off) {
        check(got.sideTitle === got.sideText, `${where}: the haste's title is ${JSON.stringify(got.sideTitle)}`);
      }
      check(!got.sideCut, `${where}: the right part is cut`);
      check(got.oneLine, `${where}: the label line wraps`);
      check(got.leftInside && got.sideInside, `${where}: the label's parts overlap or leave the line`);
      check(!got.pageScrolls, `${where}: the page scrolls sideways`);
      base ??= got;
      for (const key of ['fieldHeight', 'dialogHeight', 'boxLeft', 'boxRight', 'segLeft', 'segRight']) {
        check(
          Math.abs(got[key] - base[key]) <= (key.endsWith('Height') ? HEIGHT_TOLERANCE_PX : ALIGN_TOLERANCE_PX),
          `${where}: ${key} is ${got[key].toFixed(1)}, the first case's ${base[key].toFixed(1)}`,
        );
      }
      await pg.keyboard.press('Escape');
      await expect(pg.locator('#sh-settings-dialog')).toHaveCount(0);
    }
    base = null;
  }
  await pg.setViewportSize({ width: 1000, height: 900 });
  await pg.click('[data-tab=browse]');
}
