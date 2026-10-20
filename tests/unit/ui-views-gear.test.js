/* Gear browser tab (src/ui/views/gear.js): the rows matching the filters with their synced stats, the slot pills,
   sorting, the name search and Reset filters; computed from store-shaped state without Alpine. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { browseItems } from '../../src/core/items.js';
import { browseFiltered, markWords } from '../../src/ui/views/gear.js';
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
  // item level 130 is above the cap of 123: the row shows the synced item level and stats, the own ones under them
  assert.ok(v.shown.every(x => x.synced && x.syncedIlvl === 123));
  const cut = v.shown.flatMap(x => x.cells).filter(c => c.was != null);
  assert.ok(cut.length > 0 && cut.every(c => Number(c.text) < Number(c.was) && c.cls === 'n cut'));
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

test('gear browser view: a gap before each new group of slot pills, and the line for rows not shown', () => {
  const v = gearViewOf(makeApp('PLD'));
  assert.deepEqual(
    v.slots.filter(p => p.sep).map(p => p.key),
    ['weapon', 'head', 'ear'],
  );
  assert.equal(v.slots[0].sep, false);
  assert.match(v.hiddenText, /^[\d,]+ more matches not shown\. Narrow the filters to view them\.$/);
  assert.equal(v.hiddenText.split(' ')[0], v.hidden);
});
