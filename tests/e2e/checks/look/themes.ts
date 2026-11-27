// Dark mode and light mode.

import { openViewSet, viewSheets } from './screens.ts';
import { shot } from '../../lib/constants.ts';
import { check, expect, same, stepRecord } from '../../lib/expect.ts';
import { runFill, setNumber } from '../../lib/nav.ts';
import { seedSheets } from '../../lib/sheets.ts';
import { judge, parseComputed, probeText, probeTheme, readStyles, tokenColor, tokensFor } from '../../lib/visual.ts';

/** Probes of the theme checks: `named` are `{ name, selector }` elements whose text must reach WCAG AA (an `optional` one may be
 * missing); `surfaces` are `{ name, selector, token }` elements whose background is the token's color. */
const THEME_SCREENS = {
  manager: {
    named: [
      { name: 'column names', selector: '#sh-list thead th' },
      { name: 'sheet name', selector: '#sh-list a.sname' },
      { name: 'row note (muted)', selector: '#sh-list .sorigin' },
      { name: 'row action', selector: '#sh-list .rowacts .linkbtn' },
      { name: 'settings cell', selector: '#sh-list tbody td:nth-child(3)' },
      { name: 'New sheet button', selector: '#sh-new' },
      { name: 'heading', selector: '#sh-manager h2' },
    ],
    surfaces: [],
    min: 20,
  },
  sheet: {
    named: [
      { name: 'column names', selector: '#sh-sets thead th' },
      { name: 'set name', selector: '#sh-sets a.sname' },
      { name: 'set note', selector: '#sh-sets .setnotes' },
      { name: 'figure cell', selector: '#sh-sets tbody td.n' },
      { name: 'range (muted) .f-range', selector: '#sh-level-range' },
      { name: 'cap field note', selector: '#sh-cap-lowered' },
      { name: 'level field', selector: '#sh-level' },
      { name: 'Edit button', selector: '#sh-edit' },
      { name: 'Delete sheet button', selector: '#sh-delete' },
      { name: 'New set button', selector: '#sh-new-set' },
      { name: 'description', selector: '#sh-description' },
      { name: 'job name (muted, on the banner)', selector: '#sh-job' },
      { name: 'breadcrumb link', selector: '#sh-sheet .setcrumb a' },
    ],
    surfaces: [{ name: 'settings panel', selector: '#sh-sheet .panel', token: '--surface' }],
    min: 25,
  },
  suggestion: {
    named: [
      { name: 'column names', selector: '#sh-gear thead th' },
      { name: 'stat cell', selector: '#sh-gear tbody td.n' },
      { name: 'muted cell', selector: '#sh-gear td .dim' },
      { name: 'total row', selector: '#sh-total td.n' },
      { name: 'tier row (muted)', selector: '#sh-tier td.small' },
      { name: 'Take box label', selector: '#sh-gear .takebox span' },
      { name: 'better delta', selector: '#sh-figures em.dl.good', optional: true },
      { name: 'worse delta', selector: '#sh-figures em.dl.bad', optional: true },
      { name: 'Apply button', selector: '#sh-apply' },
      { name: 'Discard button', selector: '#sh-discard' },
      { name: 'Delete button', selector: '#sh-set-delete' },
      { name: 'goal line', selector: '#sh-goal' },
      { name: 'sheet settings line', selector: '#sh-set-settings' },
      { name: 'set name', selector: '#sh-set-name' },
      { name: 'stat block label', selector: '#sh-figures .cl' },
    ],
    surfaces: [{ name: 'set box (heading and bar)', selector: '#sh-set .setbox', token: '--surface' }],
    min: 40,
  },
  stoneMenu: {
    named: [
      { name: 'menu title', selector: '.matpop h5' },
      { name: 'odds label', selector: '.matpop .matgrid .s' },
      { name: 'odds figure', selector: '.matpop .matgrid .pc' },
      { name: 'grade heading', selector: '.matpop .matgrid .h' },
      { name: 'stone button', selector: '.matpop .matgrid button:not(.na)' },
      { name: 'menu footer button', selector: '.matpop .matfoot button' },
      { name: 'menu note', selector: '.matpop .rmnote', optional: true },
      { name: 'materia chip', selector: '#sh-gear .mchip' },
      { name: 'piece button', selector: '#sh-gear td.item .same-btn' },
    ],
    surfaces: [{ name: 'materia menu', selector: '.matpop', token: '--surface' }],
    min: 20,
  },
  newSheetDialog: {
    named: [
      { name: 'dialog title', selector: '#sh-dialog h3' },
      { name: 'field label', selector: '#sh-dialog label.f' },
      { name: 'range (muted) .f-range', selector: '#sh-dialog .f-range' },
      { name: 'name box', selector: '#sh-dlg-name' },
      { name: 'cap field note', selector: '#sh-dlg-cap-lowered' },
      { name: 'error line', selector: '#sh-dialog .dlgmsg' },
      { name: 'job row label', selector: '#sh-dialog .jobrow-label' },
      { name: 'Create button', selector: '#sh-dlg-ok' },
      { name: 'Cancel button', selector: '#sh-dialog .dlgbtns button:not(.primary)' },
    ],
    surfaces: [{ name: 'dialog', selector: '#sh-dialog', token: '--surface' }],
    min: 25,
  },
};

/** Contrast findings the page has today (reported to the owner, not yet changed): printed as "KNOWN FAILURE" lines, they do not
 * fail the run, and a finding that stops happening fails it until it is removed here (checkThemes). `test` is matched against the
 * probed element's name, `scheme` limits it to one scheme; `note` says what is under WCAG AA 4.5. None today. */
const KNOWN_LOW_CONTRAST = [];

/** The six ways the page can be told its scheme: the system setting alone (dark, light), and `data-theme` forced to each value
 * under each system setting. The scheme shown is the forced one, else the system's (CLAUDE.md, "Page rules"). */
const THEME_COMBINATIONS = [
  ['dark', null],
  ['light', null],
  ['dark', 'dark'],
  ['light', 'dark'],
  ['dark', 'light'],
  ['light', 'light'],
];

/** The open Sheets screen `screenName` (a THEME_SCREENS key) under each THEME_COMBINATION: the page's tokens are the
 * stylesheet's for the scheme shown (read from src/styles/tokens.css, not from the page), the body and the listed surfaces are painted
 * in them, and every probed text reaches WCAG AA against the background it sits on (4.5, large text 3). Screenshots of the two
 * system settings go to the output folder. */
async function inEveryTheme(pg, screenName, seen) {
  const screen = THEME_SCREENS[screenName];
  const css = readStyles();
  const tokens = { light: tokensFor(css, 'light'), dark: tokensFor(css, 'dark') };
  const names = Object.keys(tokens.light).filter(name => !['--serif', '--sans', '--mono'].includes(name));
  for (const [system, forced] of THEME_COMBINATIONS) {
    const scheme = forced ?? system;
    const where = `${screenName}, system ${system}${forced ? `, data-theme ${forced}` : ''}`;
    await pg.emulateMedia({ colorScheme: system });
    await pg.evaluate(theme => {
      if (theme) {
        document.documentElement.setAttribute('data-theme', theme);
      } else {
        document.documentElement.removeAttribute('data-theme');
      }
    }, forced);

    // the tokens, and the body and surfaces painted with them
    const shown = await pg.evaluate(probeTheme, { names, surfaces: screen.surfaces });
    // a computed custom property is written the way the browser prints numbers (.18 for 0.18)
    const printed = text => text.replace(/0\./g, '.');
    const wrongTokens = names.filter(name => printed(shown.tokens[name]) !== printed(tokens[scheme][name]));
    check(
      !wrongTokens.length,
      `theme (${where}): ${wrongTokens.length} tokens are not the ${scheme} ones: ${wrongTokens
        .slice(0, 3)
        .map(n => `${n} ${JSON.stringify(printed(shown.tokens[n]))} (want ${JSON.stringify(printed(tokens[scheme][n]))})`)
        .join('; ')}`,
    );
    const rgbOf = token => tokenColor(tokens[scheme][token]).slice(0, 3);
    const isColor = (text, token) => same(parseComputed(text)?.slice(0, 3), rgbOf(token));
    check(
      isColor(shown.body, '--bg'),
      `theme (${where}): the page background is ${shown.body}, not ${scheme} --bg ${tokens[scheme]['--bg']}`,
    );
    for (const { name, token } of screen.surfaces) {
      check(
        isColor(shown.surfaces[name], token),
        `theme (${where}): the ${name} background is ${shown.surfaces[name]}, not ${scheme} ${token}`,
      );
    }

    // contrast
    const samples = await pg.evaluate(probeText, { named: screen.named, root: '#tab-sheets' });
    const wanted = new Map(screen.named.map(n => [n.name, n]));
    const missing = samples.filter(s => s.missing && !wanted.get(s.name).optional).map(s => s.name);
    check(!missing.length, `theme (${where}): nothing to read for ${missing.join(', ')}`);
    const judged = samples.filter(s => !s.missing).map(s => ({ name: s.name, ...judge(s) }));
    check(judged.length >= screen.min, `theme (${where}): only ${judged.length} texts probed, expected at least ${screen.min}`);
    const knownFor = j => KNOWN_LOW_CONTRAST.find(k => k.test.test(j.name) && (!k.scheme || k.scheme === scheme));
    const low = judged.filter(j => !j.ok && !knownFor(j));
    for (const j of judged.filter(entry => !entry.ok && knownFor(entry))) {
      const known = knownFor(j);
      seen.add(`${known.id}|${scheme}`);
      stepRecord
        .getStore()
        .known.set(
          `contrast ${known.id} ${scheme}`,
          `KNOWN FAILURE (contrast, ${scheme}): ${known.note} (${j.ratio.toFixed(2)}, ${j.name.slice(0, 40)})`,
        );
    }
    const lowNames = [...new Map(low.map(j => [j.name, j])).values()];
    check(
      !low.length,
      `contrast (${where}): ${lowNames.length} texts under WCAG AA: ${lowNames
        .slice(0, 5)
        .map(j => `${j.name} ${j.ratio.toFixed(2)} (need ${j.need})`)
        .join('; ')}`,
    );

    if (!forced) {
      await pg.screenshot({ path: shot(`theme-${screenName}-${system}.png`), fullPage: screenName !== 'newSheetDialog' });
    }
  }
  await pg.emulateMedia({ colorScheme: null });
  await pg.evaluate(() => document.documentElement.removeAttribute('data-theme'));
}

/** The Sheets tab's key screens in dark and light (checks in inEveryTheme): the manager with three sheets, a sheet's page with
 * a lowered cap's note, a set page with an Auto-fill suggestion, its materia menu (an overmeld slot, with the odds row) and the New
 * sheet dialog with a field note and an error line. The stylesheet itself is checked for literal colors in
 * tests/unit/styles/theme-tokens.test.ts. */
export async function checkThemes(pg) {
  const seen = new Set(); // the known contrast findings that happened (KNOWN_LOW_CONTRAST), as "id|scheme"
  await seedSheets(pg, viewSheets());
  await pg.click('[data-tab=sheets]');
  await expect(pg.locator('#sh-list')).toBeVisible();
  await inEveryTheme(pg, 'manager', seen);

  // the New sheet dialog: a cap lowered (its note) and a blank name (its error line, in the Name label row)
  await pg.click('#sh-new');
  await pg.click('#sh-dialog [data-job-id=SGE]');
  await pg.locator('#sh-dlg-sync').check();
  await setNumber(pg, '#sh-dlg-cap', '999');
  await expect(pg.locator('#sh-dlg-cap-lowered')).toBeVisible();
  await pg.fill('#sh-dlg-name', '');
  await pg.click('#sh-dlg-ok');
  await expect(pg.locator('#sh-dialog .dlgmsg:visible')).toBeVisible();
  await inEveryTheme(pg, 'newSheetDialog', seen);
  await pg.keyboard.press('Escape');
  await expect(pg.locator('#sh-dialog')).toHaveCount(0);

  // a sheet's page, with its cap note
  await pg.locator('#sh-list a.sname', { hasText: 'Five sets' }).click();
  await setNumber(pg, '#sh-cap', '999');
  await expect(pg.locator('#sh-cap-lowered')).toBeVisible();
  await inEveryTheme(pg, 'sheet', seen);

  // a set page with an Auto-fill suggestion, then the materia menu of the earring's overmeld slot
  await pg.click('#sh-sheet .setcrumb a');
  await openViewSet(pg, 'Sage with an earring', 'Mine');
  await runFill(pg);
  await inEveryTheme(pg, 'suggestion', seen);
  await pg.click('#sh-discard');
  await pg.click('[data-chip="7:2"]');
  await expect(pg.locator('.matpop')).toBeVisible();
  await inEveryTheme(pg, 'stoneMenu', seen);
  await pg.keyboard.press('Escape');
  for (const known of KNOWN_LOW_CONTRAST) {
    const wanted = known.id;
    check(
      [...seen].some(found => found.startsWith(`${wanted}|`)),
      `theme: the known contrast finding "${wanted}" no longer happens: remove it from KNOWN_LOW_CONTRAST`,
    );
  }
  await pg.click('[data-tab=browse]');
}
