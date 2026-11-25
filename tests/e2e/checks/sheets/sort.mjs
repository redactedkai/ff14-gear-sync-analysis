// The Sheets tab: a sheet's set list sorted by a column heading.

import { NARROW } from '../../lib/constants.mjs';
import { check, same } from '../../lib/expect.mjs';
import { SET_SHEET } from '../../lib/fixtures.mjs';
import { figuresRadio, seedSheet, sheetNames } from '../../lib/sheets.mjs';

/* A saved Sage sheet of three sets with different totals, saved in this order: "Mid" (3 pieces), "Low" (1 piece) and "High"
   (all 12 rows of SET_SHEET's set). Best first is High, Mid, Low; worst first Low, Mid, High: neither is the saved order. */
const SORT_SHEET = (() => {
  const [full] = SET_SHEET.sets;
  const keep = slots => full.pieces.map(piece => (slots.includes(piece.gameId) ? piece : { slot: piece.slot }));
  const setOf = (id, name, gameIds) => ({ ...full, id, name, description: '', pieces: keep(gameIds), pinned: { pieces: [], meal: false } });
  return {
    ...SET_SHEET,
    id: 's_sort',
    name: 'Sort list',
    sets: [
      setOf('g_mid', 'Mid', [10880, 10887, 10908]),
      setOf('g_low', 'Low', [11048]),
      setOf('g_high', 'High', full.pieces.map(piece => piece.gameId).filter(Boolean)),
    ],
  };
})();

/* A column's figures in row order: the cells under the heading `key`, as numbers with their sign, unit and minus sign dropped
   ("+40.9%" 40.9, "2.50s" 2.5, "−3" -3); the names, as text, for the Set heading. */
async function columnValues(pg, key) {
  const texts = await pg.evaluate(sortKey => {
    const head = document.querySelector(`#sh-sets thead th:has([data-sort="${sortKey}"])`);
    const rows = [...document.querySelectorAll('#sh-sets tbody tr')];
    if (!head.classList.contains('n')) {
      return rows.map(row => row.querySelector('a.sname').textContent);
    }
    const at = [...document.querySelectorAll('#sh-sets thead th.n')].indexOf(head);
    return rows.map(row => row.querySelectorAll('td.n')[at].textContent);
  }, key);
  if (key === 'name') {
    return texts;
  }
  return texts.map(text => Number(text.replace('−', '-').replace(/[^0-9.-]/g, '')));
}

const rising = values => values.every((value, i) => i === 0 || value >= values[i - 1]);
const falling = values => values.every((value, i) => i === 0 || value <= values[i - 1]);

/** The set list's headings sort the rows. Main stat total, with three sets of different totals saved as Mid, Low, High: the
 * first click puts the best set first (High, Mid, Low), the second the worst (Low, Mid, High), the third brings back the
 * saved order; a sorted list has no dragging, and the heading's aria-sort follows. Then every heading of both figure views
 * (Effects, Stat points): after a click its column is in order one way, after the next click in order the other way (which
 * way is best differs by column: a lower GCD is better), and the third click restores the saved order. The checks read the
 * rows, not only aria-sort, so a sort that never moved a row fails. At 960 px. */
export async function checkSetListSort(pg) {
  await pg.setViewportSize(NARROW);
  await seedSheet(pg, SORT_SHEET);
  await pg.click('[data-tab=sheets]');
  await pg.locator('#sh-list a.sname', { hasText: SORT_SHEET.name }).click();
  const namesNow = () => sheetNames(pg, '#sh-sets');
  const saved = ['Mid', 'Low', 'High'];
  check(same(await namesNow(), saved), `the list in its saved order: ${await namesNow()}`);
  const sortOf = key => pg.locator(`#sh-sets thead th:has([data-sort="${key}"])`).getAttribute('aria-sort');
  const expectOrder = async (what, want) => check(same(await namesNow(), want), `${what}: ${await namesNow()}, expected ${want}`);

  // 1. main stat: the exact order, aria-sort and the drag handles
  await pg.click('#sh-sets [data-sort="main"]');
  await expectOrder('best first after the first click', ['High', 'Mid', 'Low']);
  check((await sortOf('main')) === 'descending', `aria-sort after the first click: ${await sortOf('main')}`);
  check((await pg.locator('#sh-sets .draghandle.off').count()) === saved.length, 'a sorted list still has handles that drag');
  await pg.click('#sh-sets [data-sort="main"]');
  await expectOrder('worst first after the second click', ['Low', 'Mid', 'High']);
  check((await sortOf('main')) === 'ascending', `aria-sort after the second click: ${await sortOf('main')}`);
  await pg.click('#sh-sets [data-sort="main"]');
  await expectOrder('the saved order after the third click', saved);
  check((await sortOf('main')) === 'none', `aria-sort after the third click: ${await sortOf('main')}`);

  // 2. every heading of both figure views
  for (const view of ['effects', 'points']) {
    await pg.click(figuresRadio(view));
    const keys = await pg.locator('#sh-sets thead [data-sort]').evaluateAll(buttons => buttons.map(button => button.dataset.sort));
    let moving = 0; // headings whose figures differ between the three sets: only these can show a sort
    for (const key of keys) {
      const click = () => pg.click(`#sh-sets [data-sort="${key}"]`);
      await click();
      const first = await columnValues(pg, key);
      await click();
      const second = await columnValues(pg, key);
      await click();
      const where = `${view}, heading ${key}`;
      check(same(await namesNow(), saved), `${where}: the saved order after the third click: ${await namesNow()}`);
      if (new Set(first).size < 2) {
        continue;
      }
      moving++;
      const oneWay = (rising(first) && falling(second)) || (falling(first) && rising(second));
      check(oneWay, `${where}: after one click ${first}, after two ${second}: expected the column in order, then in the other order`);
    }
    check(moving >= 3, `${view}: only ${moving} headings have figures that differ between the three sets, so most sorts were not shown`);
  }
}
