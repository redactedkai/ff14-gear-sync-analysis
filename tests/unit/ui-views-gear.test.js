/* Gear browser tab (src/ui/views/gear.js): the rows matching the filters with their synced stats, the slot pills,
   sorting, the name search and Reset filters; computed from store-shaped state without Alpine. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { browseItems } from '../../src/core/items.js';
import { PAGE_SIZE, PAGE_SLOTS, browseFiltered, markWords, pageList } from '../../src/ui/views/gear.js';
import { gearViewOf, makeApp } from './helpers/views.js';

/* The browser's list: database rows matching its filters that its own "Gear from" filter lets through; no pool. With
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
  const cut = v.shown.flatMap(x => x.cells).filter(c => c.was != null);
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

/* The gear browser's layout (owner, 2026-10-18): slot pills with counts, sorting from the headings, Reset filters. */
test('gear view: slot pills count the matches of each slot under the other filters; the list keeps the chosen one', () => {
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

test('gear browser view: a gap before each new group of slot pills', () => {
  const v = gearViewOf(makeApp('PLD'));
  assert.deepEqual(
    v.slots.filter(p => p.sep).map(p => p.key),
    ['weapon', 'head', 'ear'],
  );
  assert.equal(v.slots[0].sep, false);
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

/* Sage at level 100 with sync off and the default filters: 2,156 matches in the data of 2026-10-20, so 22
   pages of 100. */
test('gear browser pages: 100 rows a page, the last page the rest; the count names every match', () => {
  const app = makeApp('SGE', { sync: false, cap: null, level: 100 });
  const first = gearViewOf(app);
  const n = first.pageCount;
  assert.equal(first.countText, '2,156 matches');
  assert.equal(n, 22);
  assert.equal(first.shown.length, PAGE_SIZE);
  assert.deepEqual([first.page, first.prevPage, first.nextPage], [1, null, 2]);
  assert.deepEqual(
    first.pageButtons.map(b => b.page),
    [1, 2, 3, 4, 5, null, 22],
  );
  assert.deepEqual(
    first.pageButtons.filter(b => b.current).map(b => b.page),
    [1],
  );
  const last = gearViewOf(app, 22);
  assert.equal(last.shown.length, 56);
  assert.deepEqual([last.page, last.prevPage, last.nextPage], [22, 21, null]);
  assert.equal(last.countText, first.countText);
  // the pages split the list in its order, with no row twice
  const keys = Array.from({ length: n }, (_, i) => gearViewOf(app, i + 1).shown.map(x => x.key)).flat();
  assert.equal(keys.length, 2156);
  assert.equal(new Set(keys).size, keys.length);
  // a page past the end shows the last, one below 1 the first
  assert.equal(gearViewOf(app, 99).page, 22);
  assert.equal(gearViewOf(app, 0).page, 1);
});

test('gear browser pages: one page has no buttons; no matches reads "No matches"', () => {
  const app = makeApp('SGE');
  Object.assign(app.browse, { min: 130, max: 130, lvl: 50, exclude: [] });
  const one = gearViewOf(app, 3);
  assert.ok(one.shown.length > 0 && one.shown.length <= PAGE_SIZE);
  assert.deepEqual([one.page, one.pageCount, one.prevPage, one.nextPage, one.pageButtons.length], [1, 1, null, null, 0]);
  app.browse.q = 'no such piece';
  const none = gearViewOf(app);
  assert.deepEqual([none.countText, none.shown.length, none.pageCount, none.pageButtons.length], ['No matches', 0, 1, 0]);
});
