// How the math works, Substat tiers: each substat's card scrolls on its own. Structure only; the rows and their
// ranges are checked in the unit tests (tests/unit/ui/views/tiers.test.js).

import { NARROW } from '../../lib/constants.mjs';
import { check, poll } from '../../lib/expect.mjs';
import { hasHScroll, setJob, setNumber, showMath } from '../../lib/nav.mjs';
import { setUpShared } from '../../lib/setup.mjs';

/** One card's scroll area measured in the page: {stat, scrollable (more rows than fit), top, height, cardTop,
 * headTop, footTop (viewport y), namesGap (the column names' distance from the area's top), curInside (the highlighted row
 * is inside the visible rows), curOffset (its centre's distance from the visible rows' centre, px), curText (its Points
 * cell), rowHeight, tableOverflow (a cell's text is cut, or the area scrolls sideways)}. */
const measureCards = pg =>
  pg.evaluate(() =>
    [...document.querySelectorAll('#t-table .tiercard')].map(card => {
      const area = card.querySelector('.tierscroll');
      const areaBox = area.getBoundingClientRect();
      const names = area.querySelector('.lhead');
      const namesHeight = names.offsetHeight;
      const row = area.querySelector('.lrow.cur');
      const rowBox = row?.getBoundingClientRect();
      const rowsTop = areaBox.top + namesHeight;
      return {
        stat: card.dataset.stat,
        scrollable: area.scrollHeight > area.clientHeight,
        top: area.scrollTop,
        height: area.clientHeight,
        cardTop: card.getBoundingClientRect().top,
        headTop: card.querySelector('.tierhead').getBoundingClientRect().top,
        footTop: card.querySelector('.lfoot').getBoundingClientRect().top,
        namesGap: Math.round(names.getBoundingClientRect().top - areaBox.top),
        curInside: !!rowBox && rowBox.top >= rowsTop - 1 && rowBox.bottom <= areaBox.bottom + 1,
        curOffset: rowBox ? rowBox.top + rowBox.height / 2 - (rowsTop + (areaBox.bottom - rowsTop) / 2) : null,
        curText: row?.firstElementChild.textContent,
        rowHeight: rowBox?.height,
        tableOverflow:
          area.scrollWidth > area.clientWidth ||
          [...area.querySelectorAll('.lhead span, .lrow span')].some(cell => cell.scrollWidth > cell.clientWidth),
      };
    }),
  );

/** Substat tiers (Sage, level 100): every card's rows scroll on their own, the header, column names and footer stay,
 * the areas are one height, a keyboard reaches them, the value's row is in view on load and after a value is typed, a
 * level change or a job change, a click on a row moves the highlight but not the list, and the page does not scroll
 * sideways at 960 px. */
export async function checkTiersScroll(pg) {
  await pg.setViewportSize(NARROW);
  await showMath(pg, 'tiers');
  await setJob(pg, 'SGE'); // Substat tiers' own job, at its level cap 100
  await poll('the five Sage cards', async () => {
    const cards = await measureCards(pg);
    return { ok: cards.length === 5, got: cards.length };
  });

  // 1. every card scrolls on its own, and all the areas are one height
  const cards = await measureCards(pg);
  check(
    cards.every(card => card.scrollable),
    `a card shows all its rows without scrolling: ${JSON.stringify(cards.filter(card => !card.scrollable).map(card => card.stat))}`,
  );
  check(new Set(cards.map(card => card.height)).size === 1, `the card heights differ: ${cards.map(card => card.height)}`);
  check(
    cards.every(card => card.curInside),
    'a card at its base has no highlighted row in view',
  );
  check(
    cards.every(card => !card.tableOverflow),
    'a table is wider than its card',
  );

  // 2. a card scrolled to its end keeps its header, column names and footer where they were
  const crit = await pg.locator('#t-table [data-stat="crit"] .tierscroll');
  await crit.evaluate(area => {
    area.scrollTop = area.scrollHeight;
  });
  const end = (await measureCards(pg)).find(card => card.stat === 'crit');
  const start = cards.find(card => card.stat === 'crit');
  check(end.top > 0, 'the Critical Hit card did not scroll');
  check(
    end.headTop === start.headTop && end.footTop === start.footTop && end.namesGap === 0,
    `header, footer or column names moved: ${JSON.stringify([start.headTop, end.headTop, start.footTop, end.footTop, end.namesGap])}`,
  );
  // the rows there are drawn as the list scrolls (a window of them): the last one is in the end's rows
  await poll('the last Critical Hit row, drawn when scrolled to', async () => {
    const lastRow = await crit.evaluate(area => area.querySelector('.lrow:last-child span').textContent);
    return { ok: lastRow.trim().endsWith('+'), got: lastRow };
  });

  // 3. a value typed in a box brings its row to the middle of the card, even when the list was scrolled elsewhere
  await setNumber(pg, '#t-table [data-n="crit"]', '2500');
  await poll('the typed Critical Hit value in the middle of its list', async () => {
    const card = (await measureCards(pg)).find(item => item.stat === 'crit');
    return { ok: card.curInside && Math.abs(card.curOffset) <= card.rowHeight, got: [card.curText, card.curOffset] };
  });
  check(
    (await measureCards(pg)).every(card => !card.tableOverflow),
    'a typed value made a card cut a cell or scroll sideways',
  );
  // typed again with the list scrolled away: back to the middle
  await crit.evaluate(area => {
    area.scrollTop = 0;
  });
  await setNumber(pg, '#t-table [data-n="crit"]', '2503');
  await poll('the same tier typed again, in the middle', async () => {
    const card = (await measureCards(pg)).find(item => item.stat === 'crit');
    return { ok: card.curInside && Math.abs(card.curOffset) <= card.rowHeight, got: [card.top, card.curOffset] };
  });

  // 4. a click on another row: it becomes the highlighted one and the value its start, and the list does not move
  const before = (await measureCards(pg)).find(card => card.stat === 'crit');
  const clicked = await crit.evaluate(area => {
    const rows = [...area.querySelectorAll('.lrow')];
    const row = rows[rows.indexOf(area.querySelector('.lrow.cur')) + 3];
    row.click();
    return row.dataset.to;
  });
  await poll('the clicked tier highlighted', async () => {
    const value = await pg.inputValue('#t-table [data-n="crit"]');
    const card = (await measureCards(pg)).find(item => item.stat === 'crit');
    return { ok: clicked === `crit:${value}` && card.curText !== before.curText, got: [clicked, value, card.curText] };
  });
  const after = (await measureCards(pg)).find(card => card.stat === 'crit');
  check(after.top === before.top, `the list moved on a click: ${before.top} to ${after.top}`);

  // 5. the level and the job bring the value's row (the base again) into view, and the list is not left where it was
  await crit.evaluate(area => {
    area.scrollTop = area.scrollHeight;
  });
  await setNumber(pg, '#t-level', '90');
  await poll('the level change to show the base tier in view', async () => {
    const card = (await measureCards(pg)).find(item => item.stat === 'crit');
    return { ok: card.curInside && card.top === 0, got: [card.top, card.curInside] };
  });
  await setNumber(pg, '#t-table [data-n="crit"]', '2500');
  await setJob(pg, 'PLD');
  await poll('the job change to show every card with its tier in view', async () => {
    const all = await measureCards(pg);
    return { ok: all.length === 5 && all.every(card => card.curInside && card.top === 0), got: all.map(card => [card.stat, card.top]) };
  });
  await setNumber(pg, '#t-level', '');
  // Tenacity's three columns with the longest ranges (four-digit values) fit their card
  await setNumber(pg, '#t-table [data-n="ten"]', '3500');
  await poll('the Tenacity value in the middle of its list', async () => {
    const card = (await measureCards(pg)).find(item => item.stat === 'ten');
    return { ok: card.curInside && card.curText.includes(','), got: card.curText };
  });
  check(
    (await measureCards(pg)).every(card => !card.tableOverflow),
    'a Paladin card cuts a cell or scrolls sideways',
  );

  // 6. a keyboard reaches the list and scrolls it; its label names the substat
  const label = await pg.locator('#t-table [data-stat="crit"] .tierscroll').getAttribute('aria-label');
  const name = (await pg.locator('#t-table [data-stat="crit"] .lname span').first().textContent()).trim();
  check(label?.includes(name), `the list's label does not name the substat: ${label}`);
  await pg.locator('#t-table [data-stat="crit"] .tierscroll').focus();
  await pg.keyboard.press('PageDown');
  await poll('PageDown to scroll the focused list', async () => {
    const card = (await measureCards(pg)).find(item => item.stat === 'crit');
    return { ok: card.top > 0, got: card.top };
  });

  // 7. no sideways scroll at the floor
  check(!(await hasHScroll(pg)), `Tiers: horizontal page scroll at ${NARROW.width} px`);
  await setJob(pg, 'SGE'); // Substat tiers' own job, which no carry-over from another tab resets
  await setUpShared(pg); // the job, cap and level the next step starts from
}
