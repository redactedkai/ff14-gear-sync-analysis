/* Gear browser tab (src/ui/views/gear.js): the rows matching the filters with their synced stats, the Slot menu,
   sorting, the name search and Reset filters; computed from store-shaped state without Alpine. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACTIVITIES } from '../../../../src/core/constants.js';
import { browseItems } from '../../../../src/core/items.js';
import { ANY_SLOT_LABEL } from '../../../../src/ui/elements/gear-browser/slot-menu-names.ts';
import { PAGE_SIZE, PAGE_SLOTS, browseFiltered, browseCell, markWords, pageList, slotCellText } from '../../../../src/ui/views/gear.js';
import { gearViewOf, makeApp } from '../../helpers/views.js';

/* The browser's list: database rows matching its filters that its own "Gear categories" filter lets through; no pool. With
   every box ticked, only pieces that can no longer be obtained (no route) are left out. */
test('gear view: every match of the filters, with its synced stats', () => {
  const app = makeApp('SGE');
  app.browse = { ...app.browse, q: '', min: 130, max: 130, lvl: 50, exclude: [] };
  const rows = browseItems(app.jobCtx, { ilvlMin: 130, ilvlMax: 130, lvlMax: 50 }).filter(r => r.routes.length);
  assert.ok(rows.length >= 9);
  const v = gearViewOf(app);
  assert.equal(v.shown.length, rows.length);
  assert.equal(v.countText, `${rows.length} matches`);
  // item level 130 is above the cap of 123: the rows are synced and show the synced stats, the own ones under them; the
  // item level column keeps the piece's own 130
  assert.ok(v.shown.every(x => x.synced && x.ilvl === 130));
  const cut = v.shown.flatMap(x => x.cells).filter(c => c.was !== null);
  assert.ok(cut.length > 0 && cut.every(c => Number(c.text) < Number(c.was) && c.cls === 'n cut'));
});

/* One match reads "1 match", not "1 matches" (audit 11 #12). */
test('gear view: the count says "match" for one piece', () => {
  const app = makeApp('SGE');
  app.browse = { ...app.browse, q: 'Augmented Bozjan Coat of Healing', exclude: [] };
  const v = gearViewOf(app);
  assert.equal(v.shown.length, 1);
  assert.equal(v.countText, '1 match');
});

/* The gear browser's layout: the Slot menu with counts, sorting from the headings, Reset filters. */
test('gear view: the Slot menu counts the matches of each slot under the other filters; the list keeps the chosen one', () => {
  const app = makeApp('SGE');
  Object.assign(app.browse, { min: 130, max: 130, lvl: 50, exclude: [] });
  const all = gearViewOf(app);
  const [any, ...slots] = all.slots;
  assert.deepEqual([any.key, any.count], ['any', all.shown.length]);
  assert.equal(
    slots.reduce((n, p) => n + p.count, 0),
    any.count,
  );
  // Sage has no off-hand; the groups run weapon, armor, accessories
  assert.ok(!slots.some(p => p.key === 'offhand'));
  assert.deepEqual([...new Set(slots.map(p => p.group))], [1, 2, 3]);
  app.browse.type = 'ring';
  const rings = gearViewOf(app);
  assert.equal(rings.shown.length, slots.find(p => p.key === 'ring').count);
  assert.ok(rings.shown.every(x => x.type === 'ring'));
  // the counts stay those of every slot, so another pill can be picked
  assert.deepEqual(
    rings.slots.map(p => p.count),
    all.slots.map(p => p.count),
  );
});

/* The pieces each "Gear categories" box holds for the browser's job, sync and filters (the boxes ticked do not matter): Sage's
   gear of item level 790 to 795 is the Savage set (nine armor pieces and the weapon) and the augmented tomestone set (nine
   armor pieces and a weapon: each of the nine a Savage upgrade and a hunt seal upgrade, the weapon a Savage upgrade only), the
   Ultimate weapon and the two Phantom relic weapons (the browser lists the one whose substats the player allocates; Auto-fill's pool does not). */
test('gear view: the pieces per Gear categories box, whatever boxes are ticked; the chosen slot narrows them', () => {
  const app = makeApp('SGE');
  Object.assign(app.browse, { min: 790, max: 795, lvl: '', exclude: [] });
  const nonzero = v => Object.fromEntries(Object.entries(v.fromCounts).filter(([, n]) => n));
  const all = gearViewOf(app);
  assert.deepEqual(
    Object.keys(all.fromCounts),
    ACTIVITIES.map(a => a.key),
  );
  assert.deepEqual(nonzero(all), { savage_current: 20, tomes_current: 10, hunts: 9, ultimate: 1, relics: 2 });
  assert.ok(Object.isFrozen(all.fromCounts));
  assert.equal('emptyBoxes' in all, false);
  // the boxes ticked and the market board change the list but not the numbers
  app.browse.exclude = ['savage_current', 'hunts', 'relics'];
  app.browse.market = false;
  const narrowed = gearViewOf(app);
  assert.ok(narrowed.shown.length < all.shown.length);
  assert.deepEqual(narrowed.fromCounts, all.fromCounts);
  // the head slot: Grand Champion's Headgear and Augmented Bygone Brass Calot (Savage), the Calot again (tomestones, hunts)
  Object.assign(app.browse, { exclude: [], market: true, type: 'head' });
  assert.deepEqual(nonzero(gearViewOf(app)), { savage_current: 2, tomes_current: 1, hunts: 1 });
  // the filters change them: an item level range nothing is in leaves every box at 0
  Object.assign(app.browse, { type: 'any', min: 9999, max: '' });
  assert.ok(Object.values(gearViewOf(app).fromCounts).every(n => n === 0));
});

test('gear view: a heading sorts high first, again low first; names A to Z', () => {
  const app = makeApp('SGE');
  Object.assign(app.browse, { min: 100, max: 140, lvl: 50, exclude: [] });
  const order = (sort, dir) => {
    app.browse.sort = sort;
    app.browse.dir = dir;
    return gearViewOf(app).shown;
  };
  const crit = order('crit', 'desc').map(x => x.eff.crit || 0);
  assert.deepEqual(
    crit,
    [...crit].sort((a, b) => b - a),
  );
  const lvl = order('lvl', 'asc').map(x => x.lvl);
  assert.deepEqual(
    lvl,
    [...lvl].sort((a, b) => a - b),
  );
  const names = order('name', 'asc').map(x => x.name);
  assert.deepEqual(
    names,
    [...names].sort((a, b) => a.localeCompare(b)),
  );
});

test('gear browser search: every word, in any order; the words found are marked in the name', () => {
  const app = makeApp('SGE');
  Object.assign(app.browse, { exclude: [], q: 'ring healing' });
  const v = gearViewOf(app);
  assert.ok(v.shown.length > 0);
  assert.ok(v.shown.every(x => /ring/i.test(x.name) && /healing/i.test(x.name)));
  assert.deepEqual(markWords('Genta Ring of Healing', 'heal ring'), [
    { text: 'Genta ', hit: false },
    { text: 'Ring', hit: true },
    { text: ' of ', hit: false },
    { text: 'Heal', hit: true },
    { text: 'ing', hit: false },
  ]);
  assert.deepEqual(markWords('Ring', ''), [{ text: 'Ring', hit: false }]);
});

test('gear browser Reset filters: shown once any filter is off its default, not for the sort', () => {
  const app = makeApp('BLU');
  const b = app.browse;
  assert.equal(browseFiltered(app.jobCtx, b), false);
  // Blue Mage's level cap is 80: the default 100 is held there, and 80 or empty is no filter
  assert.equal(browseFiltered(app.jobCtx, { ...b, lvl: 80 }), false);
  assert.equal(browseFiltered(app.jobCtx, { ...b, lvl: '' }), false);
  assert.equal(browseFiltered(app.jobCtx, { ...b, sort: 'crit', dir: 'asc' }), false);
  for (const change of [
    { q: ' ring ' },
    { type: 'ring' },
    { min: 300 },
    { max: 400 },
    { lvl: 70 },
    { expOff: ['ARR'] },
    { market: false },
    { exclude: [] },
  ])
    assert.equal(browseFiltered(app.jobCtx, { ...b, ...change }), true, JSON.stringify(change));
  // the default boxes in another order are still the default
  assert.equal(browseFiltered(app.jobCtx, { ...b, exclude: [...b.exclude].reverse() }), false);
});

test('gear browser view: the Slot menu names its first choice "Any slot", prints counts with separators and names the chosen slot', () => {
  const app = makeApp('PLD');
  const v = gearViewOf(app);
  assert.deepEqual(
    v.slots.map(p => p.group),
    [0, ...v.slots.slice(1).map(p => p.group)],
  );
  assert.equal(v.slots[0].label, ANY_SLOT_LABEL);
  for (const p of v.slots) assert.equal(p.countText, p.count.toLocaleString('en-US'), p.key);
  assert.ok(v.slots[0].count >= 1000 && v.slots[0].countText.includes(','), 'the whole list has four digits, so its count has a separator');
  // the closed button: the chosen slot's label, and "Any slot" for a slot the job does not have
  assert.equal(v.slotLabel, ANY_SLOT_LABEL);
  app.browse.type = 'ring';
  assert.equal(gearViewOf(app).slotLabel, 'Ring');
  app.browse.type = 'offhand';
  assert.equal(gearViewOf(app).slotLabel, 'Off-hand');
  const sage = makeApp('SGE');
  sage.browse.type = 'offhand';
  assert.equal(gearViewOf(sage).slotLabel, ANY_SLOT_LABEL);
});

/* The page line (owner's pick P1 a, 2026-10-20): every page while 7 fit, else 7 entries, null for a gap. */
test('gear browser pages: every page up to 7; above, the first, the last and one each side of the current', () => {
  assert.deepEqual(pageList(1, 1), [1]);
  assert.deepEqual(pageList(2, 2), [1, 2]);
  assert.deepEqual(pageList(4, 7), [1, 2, 3, 4, 5, 6, 7]);
  // 22 pages, at both ends and in the middle; a gap never stands for one page alone
  assert.deepEqual(pageList(1, 22), [1, 2, 3, 4, 5, null, 22]);
  assert.deepEqual(pageList(4, 22), [1, 2, 3, 4, 5, null, 22]);
  assert.deepEqual(pageList(5, 22), [1, null, 4, 5, 6, null, 22]);
  assert.deepEqual(pageList(9, 22), [1, null, 8, 9, 10, null, 22]);
  assert.deepEqual(pageList(18, 22), [1, null, 17, 18, 19, null, 22]);
  assert.deepEqual(pageList(19, 22), [1, null, 18, 19, 20, 21, 22]);
  assert.deepEqual(pageList(22, 22), [1, null, 18, 19, 20, 21, 22]);
  // always 7 entries, the current page among them, in order
  for (let count = 8; count <= 30; count++)
    for (let current = 1; current <= count; current++) {
      const list = pageList(current, count);
      assert.equal(list.length, PAGE_SLOTS, `${current} of ${count}`);
      assert.ok(list.includes(current));
      const pages = list.filter(p => p !== null);
      assert.deepEqual(
        pages,
        [...pages].sort((a, b) => a - b),
      );
    }
});

/* Sage at level 100 with sync off and the default filters: 2,193 matches, so 44
   pages of 50. */
test('gear browser pages: 50 rows a page, the last page the rest; the count names every match', () => {
  const app = makeApp('SGE', { sync: false, cap: null, level: 100 });
  const first = gearViewOf(app);
  const n = first.pageCount;
  assert.equal(first.countText, '2,193 matches');
  assert.equal(PAGE_SIZE, 50);
  assert.equal(n, 44);
  assert.equal(first.shown.length, PAGE_SIZE);
  assert.deepEqual([first.page, first.prevPage, first.nextPage], [1, null, 2]);
  assert.deepEqual(
    first.pageButtons.map(b => b.page),
    [1, 2, 3, 4, 5, null, 44],
  );
  assert.deepEqual(
    first.pageButtons.filter(b => b.current).map(b => b.page),
    [1],
  );
  const last = gearViewOf(app, 44);
  assert.equal(last.shown.length, 43);
  assert.deepEqual([last.page, last.prevPage, last.nextPage], [44, 43, null]);
  assert.equal(last.countText, first.countText);
  // the pages split the list in its order, with no row twice
  const keys = Array.from({ length: n }, (_, i) => gearViewOf(app, i + 1).shown.map(x => x.key)).flat();
  assert.equal(keys.length, 2193);
  assert.equal(new Set(keys).size, keys.length);
  // a page past the end shows the last, one below 1 the first
  assert.equal(gearViewOf(app, 99).page, 44);
  assert.equal(gearViewOf(app, 0).page, 1);
});

test('gear browser pages: one page has no buttons; no matches reads "No matches"', () => {
  const app = makeApp('SGE');
  Object.assign(app.browse, { min: 130, max: 130, lvl: 50, exclude: [] });
  const one = gearViewOf(app, 3);
  assert.ok(one.shown.length > 0 && one.shown.length <= PAGE_SIZE);
  assert.deepEqual([one.page, one.pageCount, one.prevPage, one.nextPage, one.pageButtons.length], [1, 1, null, null, 1]);
  app.browse.q = 'no such piece';
  const none = gearViewOf(app);
  assert.deepEqual([none.countText, none.shown.length, none.pageCount, none.pageButtons.length], ['No matches', 0, 1, 1]);
});

/* A row's plain fields (what the template shows, each read once by x-text or a binding): the cells in the table's column
   order, the search's marks, the HQ mark and the ring's "x2". The row's data is checked against the real pieces of the
   job (the item level 130 rows of a Sage, synced to 123, as in the first test). */
test('gear view: a row has one cell per stat in column order, with plain fields for the template', () => {
  const app = makeApp('SGE');
  Object.assign(app.browse, { min: 130, max: 130, lvl: 50, exclude: [], q: '' });
  const v = gearViewOf(app);
  assert.ok(v.shown.length >= 9);
  const raws = new Map(browseItems(app.jobCtx, { ilvlMin: 130, ilvlMax: 130, lvlMax: 50 }).map(r => [r.name, r]));
  for (const x of v.shown) {
    assert.deepEqual(
      x.cells.map(c => c.col),
      app.jobCtx.stats,
    );
    assert.equal(x.rowCls, 'synced');
    for (const c of x.cells) {
      // a stat sync lowers shows the cap bar on the value, and the piece's own number under it
      const cut = c.was !== null;
      assert.equal(c.cls.includes('cut'), cut);
      assert.equal(c.cls.includes('dim'), c.text === '0' && !cut);
      if (cut) assert.ok(Number(c.text) < Number(c.was));
      else assert.equal(c.text.includes('.'), false);
    }
    assert.ok(raws.has(x.name));
  }
  // synced to 123 from 130: at least one stat per row is lowered
  assert.ok(v.shown.every(x => x.cells.some(c => c.was !== null)));
});

test('browse cell: a stat sync lowers shows both numbers; a stat it does not shows one, dimmed at zero', () => {
  assert.deepEqual(browseCell(85, 79, 'crit'), {
    text: '79',
    cls: 'n cut',
    col: 'crit',
    was: '85',
  });
  assert.deepEqual(browseCell(85, 85, 'det'), { text: '85', cls: 'n', col: 'det', was: null });
  assert.equal(browseCell(0, 0, 'dh').cls, 'n dim');
  assert.equal(browseCell(undefined, undefined, 'dh').text, '0');
});

test("gear view: a row's fields mark the search words, the HQ mark and the second ring", () => {
  const app = makeApp('SGE');
  Object.assign(app.browse, { min: 130, max: 130, lvl: 50, exclude: [], q: 'ring', type: 'ring' });
  const v = gearViewOf(app);
  assert.ok(v.shown.length > 0);
  for (const x of v.shown) {
    // the name's parts join to the item's name, the matched parts have the mark class
    assert.equal(x.nameParts.map(p => p.text).join(''), x.name);
    assert.ok(x.nameParts.every(p => p.cls === (p.hit ? 'mark' : '')));
    assert.equal(x.twice, x.copies === 2);
    assert.equal(x.slot, 'Ring');
  }
  // both kinds exist among the Sage's rings, so the checks above are not empty
  assert.ok(v.shown.some(x => x.twice) && v.shown.some(x => !x.twice));
  // crafted pieces have the HQ mark
  Object.assign(app.browse, { q: '', type: 'any', min: 1, max: 795, lvl: 100 });
  assert.ok(gearViewOf(app).shown.some(x => x.hq));
});

/* The template shows the name and slot with x-text, which sets text, never markup: the fields keep a name as it is. */
test('gear view: markup in a name stays text in the name parts', () => {
  const name = '<img src=x onerror=alert(1)> & "Ring"';
  const parts = markWords(name, 'ring');
  assert.equal(parts.map(p => p.text).join(''), name);
  assert.equal(parts.filter(p => p.hit).length, 1);
});

/* A piece of three or more slots goes on two lines in the Slot cell, so one rare piece does not set the column's width. */
test('gear view: a slot label of three or more slots is split in two lines', () => {
  assert.equal(slotCellText('Body'), 'Body');
  assert.equal(slotCellText('Body + Head'), 'Body + Head');
  assert.equal(slotCellText('Body + Hands + Legs + Feet'), 'Body + Hands\nLegs + Feet');
  assert.equal(slotCellText('Body + Hands + Legs'), 'Body + Hands\nLegs');
  // Herklaedi (item level 50, Paladin, Warrior, Dark Knight, Gunbreaker) covers body, hands, legs and feet
  const app = makeApp('PLD');
  app.browse = { ...app.browse, q: 'Herklaedi', lvl: 50, exclude: [] };
  const rows = gearViewOf(app).shown.filter(x => x.name === 'Herklaedi');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].slot, 'Body + Hands + Legs + Feet');
  assert.equal(rows[0].slotText, 'Body + Hands\nLegs + Feet');
});
