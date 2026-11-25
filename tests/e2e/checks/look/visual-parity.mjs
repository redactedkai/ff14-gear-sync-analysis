// Visual parity: the look of the Sheets screens.

import { check, expect } from '../../lib/expect.mjs';
import { SET_SHEET } from '../../lib/fixtures.mjs';
import { seedSheet } from '../../lib/sheets.mjs';

/** Read looks off the page. `spec` maps a name to one of: ['css', selector, ...properties] (their computed values,
 * joined by spaces), ['below', selector] (the element's top edge in px under the tab bar), ['gap', upper, lower] (px
 * from the upper element's bottom edge to the lower one's top edge), ['token', '--name'] (a design token's colour, read
 * through a probe element, so it holds in either theme). A missing element reads "not found". */
const lookAt = (pg, spec) =>
  pg.evaluate(lookSpec => {
    const find = selector => document.querySelector(selector);
    const read = ([kind, ...args]) => {
      if (kind === 'token') {
        const probe = document.createElement('i');
        probe.style.color = `var(${args[0]})`;
        document.body.append(probe);
        const colour = getComputedStyle(probe).color;
        probe.remove();
        return colour;
      }
      const els = args.slice(0, kind === 'gap' ? 2 : 1).map(find);
      if (els.some(el => !el)) {
        return 'not found';
      }
      const tenth = px => Math.round(px * 10) / 10;
      if (kind === 'below') {
        return tenth(els[0].getBoundingClientRect().top - find('nav.tabs').getBoundingClientRect().bottom);
      }
      if (kind === 'gap') {
        return tenth(els[1].getBoundingClientRect().top - els[0].getBoundingClientRect().bottom);
      }
      const cs = getComputedStyle(els[0]);
      return args
        .slice(1)
        .map(prop => cs.getPropertyValue(prop))
        .join(' ');
    };
    return Object.fromEntries(Object.entries(lookSpec).map(([name, item]) => [name, read(item)]));
  }, spec);

const MONO = '"IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace';

/** The look of the Sheets screens, as set by the approved prototype (B17): computed borders, padding, weights and the
 * space under the tab bar. A colour is compared with its design token, never with one typed here. Each check fails
 * when its CSS is taken out (verified on a broken copy of the page). */
export async function checkVisualParity(pg) {
  const is = (got, want, what) => check(got === want, `look: ${what} is "${got}", not "${want}"`);
  // the seeded Sage set with a Sage-only weapon (Phantom Pendulums Eclipticum), so that Copy to Scholar has a piece to clear
  const [mine] = SET_SHEET.sets;
  const withWeapon = {
    ...SET_SHEET,
    sets: [{ ...mine, pieces: [{ slot: 'weapon', gameId: 37291, stones: [] }, ...mine.pieces.slice(1)] }],
  };
  await seedSheet(pg, withWeapon);

  // the manager: heading 12 px under the tab bar; the head cell over the names (28 px handle + 6 px gap); 8 px cell sides
  await pg.click('[data-tab=sheets]');
  await expect(pg.locator('#sh-list')).toBeVisible();
  const manager = await lookAt(pg, {
    heading: ['below', '#sh-manager h2'],
    head: ['css', '#sh-list thead th', 'padding-left', 'padding-right'],
    cell: ['css', '#sh-list tbody td:nth-of-type(2)', 'padding-top', 'padding-left', 'padding-right', 'vertical-align'],
    handle: ['css', '#sh-list .dragcell', 'margin-left'],
    lastRule: ['css', '#sh-list tbody tr:last-of-type td', 'border-bottom-width'],
  });
  is(manager.heading, 12, 'the manager heading, px under the tab bar');
  is(manager.head, '34px 8px', 'the manager head cell padding (left, right)');
  is(manager.cell, '9px 8px 8px top', 'a manager figure cell (padding top, left, right; vertical-align)');
  is(manager.handle, '-8px', 'the drag cell margin-left');
  is(manager.lastRule, '0px', 'the last manager row border-bottom');

  // a sheet's page: the breadcrumb line 10 px under the tab bar; set figures centred beside the name
  await pg.locator('#sh-list a.sname', { hasText: SET_SHEET.name }).click();
  await expect(pg.locator('#sh-sets')).toBeVisible();
  const sheet = await lookAt(pg, {
    crumb: ['below', '#sh-sheet .setline'],
    head: ['css', '#sh-sets thead th', 'padding-left'],
    cell: ['css', '#sh-sets tbody td.n', 'padding-top', 'padding-bottom', 'vertical-align'],
  });
  is(sheet.crumb, 10, "the sheet page's breadcrumb line, px under the tab bar");
  is(sheet.head, '34px', 'the set list head cell padding-left');
  is(sheet.cell, '7px 7px middle', 'a set list figure cell (padding top, bottom; vertical-align)');

  // a set page: the sticky header 8 px under the tab bar; the stats block
  await pg.locator('#sh-sets a.sname', { hasText: 'Mine' }).click();
  await expect(pg.locator('#sh-figures')).toBeVisible();
  // an empty slot behind another empty one waits (slots fill in order): dimmed by colour as in B17, at full opacity
  const waiting = await pg.evaluate(() => {
    const chip = document.querySelector('#sh-gear .mchip.empty:disabled');
    if (!chip) {
      return null;
    }
    const style = getComputedStyle(chip);
    const muted = getComputedStyle(document.documentElement).getPropertyValue('--muted').trim();
    const probe = Object.assign(document.createElement('i'), { style: `color:${muted}` });
    document.body.append(probe);
    const mutedRgb = getComputedStyle(probe).color;
    probe.remove();
    return { opacity: style.opacity, cursor: style.cursor, dimmer: style.color !== mutedRgb };
  });
  check(waiting !== null, 'look: the seeded set has an empty stone slot behind another empty one');
  if (waiting) {
    is(waiting.opacity, '1', 'a waiting empty stone chip: opacity');
    is(waiting.cursor, 'default', 'a waiting empty stone chip: cursor');
    check(waiting.dimmer, 'look: a waiting empty stone chip is dimmed by colour (not the --muted of a clickable empty chip)');
  }
  const total = '#sh-figures .crow:not(.hrow)';
  const stats = await lookAt(pg, {
    line: ['token', '--line'],
    surface: ['token', '--surface'],
    muted: ['token', '--muted'],
    crumb: ['below', '#sh-set .setline'],
    box: ['css', '#sh-figures', 'border-top-width', 'border-top-style', 'border-top-color', 'background-color'],
    names: ['css', '#sh-figures .hrow', 'border-top-width', 'padding-left', 'padding-right', 'height'],
    total: ['css', total, 'border-top-width', 'border-top-style', 'border-top-color', 'padding-left', 'padding-right', 'height'],
    label: ['css', `${total} .cl`, 'font-weight', 'font-size'],
    name: ['css', '#sh-figures .cn', 'font-size', 'text-transform', 'text-align', 'color'],
    figure: ['css', `${total} .cc b`, 'font-weight', 'font-size', 'font-family'],
    underHeading: ['gap', '#sh-set .setheading', '#sh-set .tbar'], // the heading (name, buttons, notes) over the set bar
  });
  is(stats.crumb, 8, "the set page's header, px under the tab bar");
  is(stats.box, `1px solid ${stats.line} ${stats.surface}`, 'the stats block border and background');
  is(stats.names, '0px 12px 8px 24px', 'the figure-name row (border-top, padding left, right, height)');
  is(
    stats.total,
    `1px solid ${stats.line} 12px 8px 30px`,
    'the Total row: its top border is the rule under the figure names (width, style, colour), padding left, right, height',
  );
  is(stats.label, '600 13.12px', 'the Total label (weight, size)');
  is(stats.name, `12px uppercase right ${stats.muted}`, 'a figure name (size, case, alignment, colour)');
  is(stats.figure, `600 14.08px ${MONO}`, 'a Total figure (weight, size, font)');
  is(stats.underHeading, 0, 'the set bar sits directly under the set heading, in the same box (px between them)');

  // the Auto-fill settings popover: its frame, the part headings, the close button, the open menus
  await pg.click('#sh-settings');
  await expect(pg.locator('#sh-settings-dialog')).toBeVisible();
  await pg.click('#s-exp');
  const settings = await lookAt(pg, {
    popLine: ['token', '--pop-line'],
    border: ['css', '#sh-settings-dialog', 'border-top-color'],
    shadow: ['css', '#sh-settings-dialog', 'box-shadow'],
    part: ['css', '#s-gear-h', 'font-size'],
    close: ['css', '#sh-settings-dialog .dlgclose', 'width', 'height', 'top', 'right', 'color'],
    menu: ['css', '#sh-settings-dialog gsa-expansion-menu [data-part="positioner"]', 'position'], // Zag's positioner holds the menu
  });
  is(settings.border, settings.popLine, 'the popover border colour');
  check(
    / 0px (8|10)px (24|30)px 0px$/.test(settings.shadow),
    `the popover shadow (the popover shadow token's offset and blur) is ${settings.shadow}`,
  );
  is(settings.part, '16.8px', 'a part heading (Gear to search) size');
  is(settings.close.split(' ').slice(0, 4).join(' '), '28px 28px 10px 10px', 'the settings close button is the dialogs X (size and place)');
  is(settings.menu, 'fixed', 'an open settings menu, position (fixed to the window, so the popover does not cut it)');
  await pg.keyboard.press('Escape'); // the menu may take the key; a second press closes the popover
  if (await pg.locator('#sh-settings-dialog').isVisible()) {
    await pg.keyboard.press('Escape');
  }
  await expect(pg.locator('#sh-settings-dialog')).toHaveCount(0);

  // a piece menu: its footer is a surface-coloured strip at the normal line height
  await pg.click('[data-pick="2"]');
  await expect(pg.locator('.pick-menu .same-foot')).toBeVisible();
  const menu = await lookAt(pg, {
    surface: ['token', '--surface'],
    foot: ['css', '.pick-menu .same-foot', 'background-color', 'line-height'],
  });
  is(menu.foot, `${menu.surface} normal`, 'the piece menu footer (background, line-height)');
  await pg.keyboard.press('Escape');

  // pieces an Auto-fill suggests (a Take box, a locked table) and the goal's rank chips, built by hand: the rules need the
  // classes only. The Take line keeps the label's line height (the suggested piece at 1.25); a button of the locked
  // table keeps full contrast; a rank chip is the token's tint.
  await pg.evaluate(() => {
    const cell = document.querySelector('#sh-gear tbody td.item');
    cell.insertAdjacentHTML(
      'beforeend',
      '<label class="takebox" id="v-take"><input type="checkbox"><span>Take <span class="dim" id="v-take-dim">melds</span></span></label>',
    );
    document
      .querySelector('#sh-gear')
      .insertAdjacentHTML(
        'beforebegin',
        '<div class="ghostlock" id="v-lock"><button type="button" id="v-lock-btn" disabled>x</button></div><i class="rk" id="v-rk">1</i>',
      );
  });
  const lines = await pg.evaluate(() => {
    const px = id => getComputedStyle(document.querySelector(id)).lineHeight;
    return {
      label: px('#v-take'),
      word: px('#v-take > span'),
      piece: String(Math.round(Number.parseFloat(px('#v-take-dim')) * 10) / 10) + 'px',
      size: getComputedStyle(document.querySelector('#v-take-dim')).fontSize,
    };
  });
  is(lines.word, lines.label, 'the Take line height (the word "Take" follows the label)');
  is(lines.piece, `${Math.round(Number.parseFloat(lines.size) * 1.25 * 10) / 10}px`, 'the suggested piece after Take, line height');
  const locked = await lookAt(pg, {
    tint: ['token', '--tint'],
    button: ['css', '#v-lock-btn', 'opacity'],
    chip: ['css', '#v-rk', 'background-color'],
  });
  is(locked.button, '1', 'a disabled button of the locked table, opacity');
  is(locked.chip, locked.tint, 'a rank chip background is the --tint token');
  // B17's value: the text colour at 22 % (light) or 20 % (dark)
  check(
    ['rgba(27, 42, 44, 0.22)', 'rgba(229, 238, 237, 0.2)'].includes(locked.tint),
    `look: the --tint token is "${locked.tint}", not the text colour at 22 % (light) or 20 % (dark)`,
  );
  await pg.evaluate(() => {
    for (const id of ['#v-take', '#v-lock', '#v-rk']) {
      document.querySelector(id)?.remove();
    }
  });

  // a question (delete a set): 520 px wide; 16 px from the question to the buttons
  await pg.click('#sh-set-delete');
  await expect(pg.locator('#sh-dialog')).toBeVisible();
  const question = await lookAt(pg, {
    box: ['css', '#sh-dialog', 'width'],
    toButtons: ['gap', '#sh-dialog .question', '#sh-dialog .dlgbtns'],
  });
  is(question.box, '520px', 'a question dialog, width');
  is(question.toButtons, 16, 'a question dialog: px from the question to the buttons');
  await pg.click('#sh-dialog .dlgbtns button:not(.danger)');
  await expect(pg.locator('#sh-dialog')).toHaveCount(0);

  // the sheet page's Copy dialog with the clearing warning: its left rule is the cap-part colour
  await pg.click('#sh-set .setcrumb a >> nth=1');
  await expect(pg.locator('#sh-sheet')).toBeVisible();
  await pg.click('#sh-copy');
  await pg.click('#sh-dialog .jobchoice[data-job-id=SCH]');
  await expect(pg.locator('#sh-dlg-clear')).toBeVisible();
  const copy = await lookAt(pg, {
    part: ['token', '--cap-part'],
    warning: ['css', '#sh-dlg-clear', 'border-left-color', 'border-left-width'],
  });
  is(copy.warning, `${copy.part} 3px`, 'the Copy dialog warning left rule (colour, width)');
  await pg.keyboard.press('Escape');
}
