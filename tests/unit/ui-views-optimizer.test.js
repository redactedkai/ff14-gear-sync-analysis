/* Gear optimizer tab (src/ui/views/optimizer.js): the result card, rows, totals in character panel numbers, Food row
   and its menu, Target GCD, Rank by tier, the gear searched and its filters, and the key that marks a result out of
   date; computed from store-shaped state without Alpine, against the core and the brute force. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACTIVITIES, JOBS } from '../../src/core/constants.js';
import { allMeals, bestFood, foodChoices, statBase } from '../../src/core/food.js';
import { allocatedRelic, browseItems, itemRoutes, mkItem, poolItemFromRow, poolKey, withActivities } from '../../src/core/items.js';
import { makeJobContext } from '../../src/core/job-context.js';
import { optimize } from '../../src/core/optimizer/index.js';
import { sameMeals } from '../../src/core/same-result.js';
import { gcdFor, hasteFor } from '../../src/core/speed.js';
import { optimizeGcd } from '../../src/core/target-gcd.js';
import { rankByTier } from '../../src/core/tier-rank.js';
import { statTier } from '../../src/core/tiers.js';
import { fmtInt } from '../../src/ui/helpers.js';
import { defaultState } from '../../src/ui/state.js';
import { DEFAULT_EXCLUDE, optimizerKey, syncSettings } from '../../src/ui/settings.js';
import {
  mealEmptyReason,
  mealLine,
  mealList,
  mealPillOff,
  mealsPassing,
  sameEmptyText,
  samePassing,
  sortMeals,
  tierText,
} from '../../src/ui/views/optimizer.js';
import { exhaustive, gamePool } from './helpers/exhaustive.js';
import {
  countOf,
  explainerViewOf,
  gearOf,
  gearViewOf,
  makeApp,
  pieceViewOf,
  poolOf,
  relicsOf,
  uniqueRingPool,
  viewOf,
  windowPool,
} from './helpers/views.js';

/* 2,238 (2.28 s) and 2,324 (2.27 s) are tier starts in AkhMorning's level 100 2.5s tier table, which lists full speed
   (base 420 + gear 1,818 and 1,904; https://www.akhmorning.com/allagan-studies/stats/speed/, core-speed.test.js). Roadmap A3. */
test('tier text above 1,200 gear speed: where the tier starts and the next one, in panel numbers (level 100, 1,839 gear speed)', () => {
  assert.equal(tierText(1839, 100), 'tier starts at 2238, next at 2324 (+65)');
});

/* The owner's screenshot (2026-10-18): Astrologian at level 50, cap 123, A Realm Reborn only, Relic left out, Mind >
   Vitality > Direct Hit, materia, best meal, rank by tier. The page said the search stopped at its step limit; it had
   found no set because Vitality was held with the meal's Vitality but asked of the gear alone. */
test("optimizer view: Vitality as a tiebreak with the best meal finds a set (owner's screenshot)", () => {
  const app = makeApp('AST', { level: 50 });
  Object.assign(app.opt, { target: 'main', tb: 'vit', tb2: 'dh', melds: true, food: true, byTier: true });
  app.opt.expOff = ['HW', 'SB', 'ShB', 'EW', 'DT'];
  app.opt.exclude = ['relic', 'savage', 'ultimate', 'pvp'];
  const view = viewOf(app);
  assert.equal(view.kind, 'ok');
});

/* The Food row's menu (owner's design, 2026-10-18), on the owner's Astrologian case: level 50, cap 123, A Realm Reborn
   gear, Mind > Vitality > Direct Hit, best meal, rank by tier. Under sync meals from three expansions give the same
   bonus; the row shows the highest item level one, and the menu lists every meal the job can use. */
test('optimizer view: the Food menu shows the highest item level meal with the best result, every meal by expansion, and a pick', () => {
  const app = makeApp('AST', { level: 50 });
  Object.assign(app.opt, { target: 'main', tb: 'vit', tb2: 'dh', melds: true, food: true, byTier: true });
  app.opt.expOff = ['HW', 'SB', 'ShB', 'EW', 'DT'];
  const v = viewOf(app);
  assert.equal(v.kind, 'ok');
  const { menu } = v.food;
  const items = [...menu.pinned, ...menu.groups.flatMap(g => g.items)];
  assert.equal(items.length, 182);
  assert.deepEqual(
    menu.groups.map(g => g.label),
    ['Dawntrail', 'Endwalker', 'Shadowbringers', 'Stormblood', 'Heavensward', 'A Realm Reborn'],
  );
  assert.deepEqual(
    menu.pills.map(p => p.short),
    ['CRT', 'DET', 'DHT', 'SpS', 'PIE'],
  );
  // the meals with the best's result: pinned on top, newest first, and only there; the row shows the highest item
  // level one, tagged and counted
  const best = menu.pinned;
  assert.ok(best.every(x => x.best));
  assert.ok(menu.groups.every(g => g.items.every(x => !x.best)));
  assert.deepEqual(
    best.map(x => x.ilvl),
    best.map(x => x.ilvl).sort((a, b) => b - a),
  );
  assert.equal(menu.count, best.length);
  assert.ok(best.length > 1, `${best.length} meals with the best result`);
  const newest = best.reduce((a, b) => (b.ilvl > a.ilvl ? b : a));
  assert.equal(v.food.name, newest.name);
  assert.deepEqual([v.food.best, v.food.picked], [true, false]);
  assert.equal(items.find(x => x.on).name, newest.name);
  assert.equal(
    menu.pinned[0],
    items.find(x => x.on),
  );
  // Vitality is a tiebreak (every point counts): every tagged meal adds the same Vitality
  const vitOf = x => x.adds.find(a => a.stat === 'vit').value;
  assert.equal(new Set(best.map(vitOf)).size, 1);
  // what a meal adds, on this gear: its stats in its own order (its main stat first), then Vitality
  assert.deepEqual(
    newest.adds.map(a => a.stat),
    [...newest.stats, 'vit'],
  );
  for (const a of newest.adds) assert.equal(a.text, `${app.jobCtx.short[a.stat]} +${a.value}`);
  // a meal picked from the menu: shown, marked picked, its bonus in the Food row; the menu still tags the best
  const other = menu.groups.flatMap(g => g.items).find(x => x.stats.includes('crit'));
  const p = viewOf(app, undefined, {}, other.key);
  assert.equal(p.food.name, other.name);
  assert.deepEqual([p.food.best, p.food.picked], [false, true]);
  assert.ok(p.food.cells[p.headers.indexOf('CRT')].value > 0);
  assert.equal(p.food.menu.pinned.length, menu.count);
  assert.equal(p.food.menu.groups.flatMap(g => g.items).find(x => x.on).name, other.name, 'the picked meal is lit in the list below');
  // an unknown key or Food off: no pick
  assert.equal(viewOf(app, undefined, {}, 'No Such Meal').food.picked, false);
});

test('optimizer view: real Black Mage gear, synced and unsynced, equals brute force', () => {
  // a cap of 123 sits below the 125-135 window, so sync bites
  const app = makeApp('BLM', { cap: 123 });
  const pool = windowPool(app.jobCtx);
  const o = app.opt;
  Object.assign(o, { target: 'spd', tb: 'main', tb2: 'vit' });
  const want = sync => exhaustive(app.jobCtx, pool, { cap: app.cap, sync }, { target: 'spd', tiebreak: ['main', 'vit'] })[0];
  const v = viewOf(app, pool);
  assert.equal(v.kind, 'ok');
  const base = statBase(app.jobCtx, 'spd', app.level);
  assert.equal(base, 420);
  assert.equal(v.total, want(true) + base);
  assert.equal(v.targetLabel, 'Spell Speed');
  assert.equal(v.rows.filter(r => r.label.startsWith('Ring')).length, 2);
  assert.ok(v.rows.every(r => r.item));
  const unsynced = viewOf({ ...app, sync: false }, pool).total;
  assert.equal(unsynced, want(false) + base);
  assert.ok(v.total < unsynced);
  // tier row: one entry per stat column, none for the main stat and Vitality; speed by its GCD, as in the readout
  assert.equal(v.tiers.length, v.headers.length);
  // each column's stat key, for the cells' data-col
  assert.deepEqual(v.cols, [...app.jobCtx.stats]);
  assert.deepEqual([v.tiers[0], v.tiers[1]], [null, null]);
  const spd = v.tiers[app.jobCtx.stats.indexOf('spd')];
  assert.equal(spd.effect, `${v.gcd}s`);
  assert.ok(spd.spare >= 0 && spd.toNext > 0);
});

test('optimizer view: one Unique ring fills the first ring slot and leaves the second empty', () => {
  const app = makeApp('SGE');
  const pool = uniqueRingPool(app.jobCtx);
  assert.equal(pool.filter(i => i.type === 'ring').length, 1);
  const v = viewOf(app, pool);
  assert.equal(v.kind, 'ok');
  assert.deepEqual(
    v.rows.filter(r => r.label.startsWith('Ring')).map(r => !!r.item),
    [true, false],
  );
});

test('optimizer errors become an error view instead of throwing', () => {
  const app = makeApp('SGE');
  const pool = ['head', 'body', 'hands', 'legs', 'feet', 'ear', 'neck', 'wrist', 'ring'].map(t =>
    mkItem(t, t, 130, { spd: 9e5, main: 9e5, vit: 9e5 }),
  );
  Object.assign(app.opt, { target: 'spd', tb: 'main', tb2: 'vit' }); // tiebreaks make the scores large
  app.sync = false; // with sync on these stats would be clamped to normal values
  const v = viewOf(app, pool);
  assert.equal(v.kind, 'error');
  assert.match(v.message, /too large/);
});

/* With no gear passed in, the optimizer searches every database piece the job can wear that its own "Gear from" filter
   lets through (the default boxes, market board on), and finds the same loadout as optimize() on that pool. */
test('optimizer view: every job searches all the gear it can wear, minus what Gear from leaves out and allocated relics', () => {
  for (const { id } of JOBS) {
    const app = makeApp(id, { level: Math.min(50, makeJobContext(id).maxLevel) });
    const job = app.jobCtx;
    const all = browseItems(job, {});
    assert.equal(gearOf(job).length, all.length, id);
    assert.equal(gearOf(job), gearOf(job), `${id}: built once per job`);
    const searched = withActivities(gearOf(job), [...DEFAULT_EXCLUDE], true).filter(i => !allocatedRelic(job, i));
    assert.deepEqual(countOf(app), { searched: searched.length, left: all.length - searched.length }, id);
    assert.ok(searched.length > 100, id);
    const v = viewOf(app);
    assert.equal(v.kind, 'ok', id);
    const want = optimize(job, searched, syncSettings(app), { target: app.opt.target, melds: app.opt.melds });
    // the card shows the character panel's number: gear plus the character's base
    assert.equal(v.total, want.totals[app.opt.target] + statBase(job, app.opt.target, app.level), id);
  }
});

/* The optimizer and the browser each have their own "Gear from" filter. */
test('Gear from: the optimizer and the browser each go by their own boxes', () => {
  const app = makeApp('WAR', { cap: 123 });
  // the window's relics with player-allocated substats (Zodiac Zeta) are never searched (allocatedRelic)
  const pool = windowPool(app.jobCtx).filter(i => !allocatedRelic(app.jobCtx, i));
  // the window has Poetics gear (Tomestones (Legacy)) and other gear
  const nTome = pool.length - withActivities(pool, ['tomes_legacy'], true).length;
  assert.ok(nTome > 0 && nTome < pool.length);
  Object.assign(app.browse, { min: 125, max: 135, lvl: 50, exclude: [] });
  app.opt.exclude = [];
  const listed = gearViewOf(app).shown.length;
  const all = poolOf(app, pool).length;
  // leaving Poetics gear out of the browser changes nothing in the optimizer, and the other way round
  app.browse.exclude = ['tomes_legacy'];
  assert.ok(gearViewOf(app).shown.length < listed);
  assert.equal(poolOf(app, pool).length, all);
  app.browse.exclude = [];
  app.opt.exclude = ['tomes_legacy'];
  assert.equal(gearViewOf(app).shown.length, listed);
  assert.equal(poolOf(app, pool).length, all - nTome);
  assert.deepEqual(countOf(app, pool), { searched: all - nTome, left: pool.length - all + nTome });
  const o = viewOf(app, pool);
  assert.equal(o.kind, 'ok');
  const best = exhaustive(app.jobCtx, poolOf(app, pool), { cap: 123, sync: true }, { target: app.opt.target })[0];
  assert.equal(o.total, best + statBase(app.jobCtx, app.opt.target, app.level));
  // the market board switch is the browser's own too
  app.opt.exclude = [];
  app.browse.market = false;
  assert.equal(poolOf(app, pool).length, all);
  // every box off and no market board: nothing from the database is left
  app.opt.exclude = ACTIVITIES.map(a => a.key);
  app.opt.market = false;
  assert.equal(viewOf(app, pool).kind, 'excluded');
});

/* Gear to search has the browser's filters with its own values: the optimizer searches exactly the pieces the browser
   would list with the same filters (no name or slot), and neither tab's filters change the other's. */
test("Gear to search: the browser's filters, on the optimizer's own values", () => {
  for (const id of ['SGE', 'PLD', 'BST']) {
    const app = makeApp(id, { sync: false, cap: null });
    const job = app.jobCtx;
    const keys = list => list.map(poolKey).sort();
    const cases = [
      { expOff: ['ARR', 'HW', 'SB'], min: '', max: '', lvl: 90 },
      { expOff: [], min: 400, max: 560, lvl: '' },
      { expOff: ['DT'], min: '', max: 600, lvl: 100 },
    ];
    for (const f of cases) {
      Object.assign(app.opt, f, { exclude: [...DEFAULT_EXCLUDE] });
      const rows = browseItems(job, { expOff: f.expOff, ilvlMin: +f.min || 0, ilvlMax: +f.max || 0, lvlMax: +f.lvl || 0 });
      const want = withActivities(
        rows.map(r => poolItemFromRow(job, r)),
        DEFAULT_EXCLUDE,
        true,
      ).filter(i => !allocatedRelic(job, i));
      assert.deepEqual(keys(poolOf(app)), keys(want), `${id} ${JSON.stringify(f)}`);
      assert.deepEqual(countOf(app), { searched: want.length, left: gearOf(job).length - want.length });
      assert.equal(relicsOf(app), rows.filter(r => allocatedRelic(job, poolItemFromRow(job, r))).length, `${id} relics`);
    }
    // the browser's filters leave the optimizer alone, and the other way round
    Object.assign(app.opt, { expOff: [], min: '', max: '', lvl: 100 });
    const searched = poolOf(app).length;
    Object.assign(app.browse, { expOff: ['ARR'], min: 600, max: 700, lvl: 1, exclude: [] });
    assert.equal(poolOf(app).length, searched, id);
    const listed = gearViewOf(app).shown.length;
    Object.assign(app.opt, { min: 9999, max: 1 });
    assert.equal(gearViewOf(app).shown.length, listed, id);
    assert.equal(viewOf(app).kind, 'excluded', `${id}: nothing passes the filters`);
  }
});

test('level cap: the optimizer searches no piece above the job cap, and level sync at the cap is off', () => {
  const app = makeApp('BLU', { sync: false, cap: null, level: 80 });
  app.opt.exclude = []; // every "Gear from" box: only the level cap leaves pieces out
  // two pieces per slot (small enough for the exhaustive reference), all at equip level 80 or below and obtainable
  const all = gamePool(app.jobCtx, { ilvlMin: 520, ilvlMax: 560 }).filter(i => itemRoutes(i).length);
  const wearableRows = all.filter(i => all.filter(j => j.type === i.type).indexOf(i) < 2);
  // pieces this job's mask allows but its level cap does not (jobGear never has them; gear passed in might)
  const above = browseItems(makeJobContext('BLM'), { ilvlMin: 520, ilvlMax: 560 })
    .filter(r => r.lvl > 80 && r.mask & (1 << app.jobCtx.jobIndex))
    .map(r => poolItemFromRow(app.jobCtx, r));
  assert.ok(wearableRows.length > 0 && above.length > 0);
  const pool = [...wearableRows, ...above];
  assert.equal(poolOf(app, pool).length, wearableRows.length);
  const o = viewOf(app, pool);
  assert.equal(o.kind, 'ok');
  const best = exhaustive(app.jobCtx, wearableRows, { cap: null, sync: false, level: 80 }, { target: app.opt.target })[0];
  assert.equal(o.total, best + statBase(app.jobCtx, app.opt.target, 80));
  // at the job's own cap no gear it can wear is level-synced: How the math works shows no sync
  assert.equal(pieceViewOf(app).status, 'off');
  assert.equal(explainerViewOf(app), null);
  const bst = makeApp('BST', { sync: false, cap: null, level: 50 });
  assert.equal(explainerViewOf(bst), null);
  // below the cap, level sync applies as for any job
  assert.equal(explainerViewOf({ ...bst, level: 40 }).cap, 40); // ParamGrow: levels 1 to 49 sync to their own number
});

/* "At cap" marks: a target or tiebreak number at the most its piece can have. Sage, Critical Hit. Level 100, no sync:
   every piece is melded up to its own cap, and a piece already at it takes no stone (Phantom Pendulums Eclipticum, 443:
   its 2 slots stay empty instead of going to another substat). Level 90, cap 535: the synced Augmented Bygone Brass
   Pendulums (item level 790) sit at the sync cap, Critical Hit and Determination 210. */
test('optimizer view: target and tiebreak cells at their cap are marked, other stats never', () => {
  const app = makeApp('SGE', { cap: null, sync: false, level: 100 });
  app.opt.target = 'crit';
  const stats = app.jobCtx.stats,
    k = stats.indexOf('crit'),
    det = stats.indexOf('det');
  const v = viewOf(app);
  assert.equal(v.kind, 'ok');
  const row = (view, name) => view.rows.find(r => r.item?.name === name);
  const wpn = row(v, 'Phantom Pendulums Eclipticum');
  assert.deepEqual([wpn.cells[k].value, wpn.cells[k].atCap, wpn.meld], [443, true, '']); // its two slots stay empty, and are not named (audit 11 #8)
  assert.equal(row(v, 'Augmented Bygone Brass Gloves of Healing').meld, 'CRT XII ×2');
  for (const r of v.rows.filter(r => r.item)) {
    assert.ok(r.cells[k].atCap, `${r.item.name}: Critical Hit below its cap`);
    assert.ok(
      r.cells.every((c, j) => j === k || !c.atCap),
      `${r.item.name}: a stat that is not scored is marked`,
    );
    assert.ok(!/DET|DHT|SPS|PIE/i.test(r.meld), `${r.item.name}: a stone outside the objective (${r.meld})`);
  }
  Object.assign(app, { cap: 535, sync: true, level: 90 });
  app.opt.tb = 'det';
  // the weapon row: whichever piece with the same result it shows (the easiest), its synced Critical Hit and
  // Determination are at the item level 535 cap
  const synced = viewOf(app).rows.find(r => r.label === 'Weapon');
  assert.deepEqual(
    [synced.cells[k].value, synced.cells[k].atCap, synced.cells[det].value, synced.cells[det].atCap],
    [210, true, 210, true],
  );
  // its menu's texts come from the view: the badge, the hover text and each piece's levels
  if (synced.same) {
    const n = synced.same.count;
    assert.equal(synced.same.countText, `1 of ${n}`);
    assert.equal(synced.same.title, `${n} pieces give the same result here`);
    for (const x of synced.same.groups.flatMap(g => g.items)) assert.equal(x.levels, `${x.ilvl}, lvl ${x.lvl}`);
  }
});

/* The page's Total and With food rows equal gear (and food) plus the character's base; at level 50 Sage that is base 341
   for Critical Hit, Direct Hit and Spell Speed, 202 for Determination, Piety and Vitality, and 232 for Mind (202 x 115%)
   (AkhMorning; ClassJob). */
test('optimizer totals are character panel numbers', () => {
  const app = makeApp('SGE', { level: 50 });
  Object.assign(app.opt, { target: 'spd', food: true });
  const v = viewOf(app, windowPool(app.jobCtx));
  assert.equal(v.kind, 'ok');
  const job = app.jobCtx;
  const gear = job.stats.map((_stat, k) => v.rows.reduce((a, r) => a + (r.cells?.[k].value ?? 0), 0));
  const want = { main: 232, vit: 202, crit: 341, det: 202, dh: 341, spd: 341, spec: 202 };
  job.stats.forEach((s, k) => {
    assert.equal(v.totals[k], gear[k] + want[s], s);
    assert.equal(v.food.totals[k], gear[k] + want[s] + (v.food.cells[k]?.value ?? 0), `${s} with food`);
  });
  const spd = job.stats.indexOf('spd');
  assert.equal(v.total, v.food.totals[spd]);
});

/* Target GCD on the page: the view equals the core's optimizeGcd on the same gear, counts the job's haste in its GCD
   and label, gives the speed band as the character panel shows it (base + gear + food), and says why no set fits. */
test('optimizer view with a Target GCD equals the core, with haste, food and the band on the character panel', () => {
  const window = { type: 'any', ilvlMin: 700, ilvlMax: 730, lvlMax: 100 };
  for (const [jobId, food] of [
    ['SGE', false],
    ['SAM', true],
  ]) {
    const job = makeJobContext(jobId);
    const pool = gamePool(job, window);
    const app = makeApp(jobId, { sync: false, cap: null, level: 100 });
    Object.assign(app.opt, { target: 'crit', tb: 'det', food, melds: true, exclude: [], expOff: [], min: '', max: '', lvl: 100 });
    const pct = hasteFor(jobId, 100)?.pct ?? 0;
    const free = viewOf(app, pool);
    assert.equal(free.gcdLine, null, 'an empty box: no line');
    // the label carries the range, slowest to fastest, and the job's haste after it
    const range = `${free.gcdUi.top.toFixed(2)} to ${free.gcdUi.fastest.toFixed(2)}`;
    assert.equal(free.gcdUi.label, pct ? `Target GCD (${range} with Fuka 13%)` : `Target GCD (${range})`);
    assert.equal(free.gcd, gcdFor(free.spd, 100, 2500, pct).toFixed(2));
    if (pct) assert.equal(free.hasteText, ` (Fuka 13%; ${gcdFor(free.spd, 100).toFixed(2)} without)`);
    else assert.equal(free.hasteText, '');
    // the Effect row's speed cell is the same GCD as the card, haste included
    assert.equal(free.tiers[job.stats.indexOf('spd')].effect, `${free.gcd}s`);
    // one tier slower than the free result (the drift case, which "exactly" must meet with less speed), or faster when
    // the free result is already the slowest GCD
    const top = gcdFor(0, 100, 2500, pct);
    const asked = Math.round((Number(free.gcd) + (Number(free.gcd) < top ? 0.01 : -0.01)) * 100) / 100;
    let met = 0;
    for (const mode of ['exact', 'min']) {
      Object.assign(app.opt, { gcd: asked, gcdMode: mode });
      const v = viewOf(app, pool);
      const r = optimizeGcd(
        job,
        pool,
        { cap: null, sync: false, level: 100 },
        {
          target: 'crit',
          tiebreak: ['det', ''],
          melds: true,
          gcd: asked,
          mode,
          food: food ? 'best' : null,
          level: 100,
        },
      );
      assert.equal(v.kind, r.ok ? 'ok' : 'nogcd', `${jobId} ${mode}`);
      if (!r.ok) continue;
      met++;
      assert.deepEqual(
        v.totals,
        job.stats.map(s => r.totals[s] + statBase(job, s, 100)),
        `${jobId} ${mode}: the core's gear, in panel numbers`,
      );
      assert.equal(v.gcd, r.gcd.toFixed(2));
      if (mode === 'exact') assert.equal(v.gcd, asked.toFixed(2));
      if (r.faster) assert.equal(v.gcdLine.text, `${r.gcd.toFixed(2)}, faster than asked`);
      else assert.equal(v.gcdLine, null, `${jobId} ${mode}: a set that meets the GCD has no line`);
      if (food) assert.equal(v.food?.name, r.food?.name, 'the meal chosen with the gear');
    }
    assert.equal(met, 2, `${jobId}: both modes find a set`);
    app.opt.gcd = '';
    assert.ok(foodChoices(job).length);
  }
  // impossible for the job: a Ninja's GCD is 2.12 at most at level 100 (15% haste)
  const nin = makeApp('NIN', { sync: false, cap: null, level: 100 });
  Object.assign(nin.opt, { target: 'crit', gcd: 2.4, gcdMode: 'exact', exclude: [], lvl: 100 });
  const no = viewOf(nin, gamePool(makeJobContext('NIN'), window));
  assert.equal(no.kind, 'nogcd');
  assert.ok(no.gcdLine.bad);
  assert.equal(no.gcdLine.text, "Ninja's GCD is 2.12 at most (Increase Attack Speed 15%)");
  // below the game's 1.50 s floor nothing can be had, whatever the gear
  nin.opt.gcd = 1.4;
  const floor = viewOf(nin, gamePool(makeJobContext('NIN'), window));
  assert.equal(floor.kind, 'nogcd');
  assert.equal(floor.gcdLine.text, "The GCD can't go below 1.50");
  // the goal is speed: the box is off, the GCD typed is ignored
  Object.assign(nin.opt, { target: 'spd' });
  const spd = viewOf(nin, gamePool(makeJobContext('NIN'), window));
  assert.equal(spd.kind, 'ok');
  assert.equal(spd.gcdLine, null);
  assert.equal(spd.gcdUi.off, true);
  assert.equal(spd.gcdUi.label, 'Target GCD (off: the goal is speed)');
});

test('optimizer view: Food adds a meal row and the totals with it, counts tiers and the GCD with food, keeps the gear', () => {
  const app = makeApp('SGE', { level: 50 });
  const job = app.jobCtx;
  Object.assign(app.opt, { target: 'spd', tb: 'crit' });
  const pool = windowPool(job);
  const off = viewOf(app, pool);
  assert.equal(off.food, null);
  // character panel numbers: level 50 base speed 341 (AkhMorning) plus gear
  const i = job.stats.indexOf('spd');
  const gearSpd = off.totals[i] - 341;
  assert.equal(off.spd, gearSpd);
  assert.match(off.totalLabel, /^Spell Speed \(base \+ gear, synced\)$/);
  assert.equal(off.spdText, `${off.totals[i]} Spell Speed (341 base, ${gearSpd} gear)`);

  app.opt.food = true; // best for the goal
  const on = viewOf(app, pool);
  assert.deepEqual(
    on.rows.map(r => r.item?.name),
    off.rows.map(r => r.item?.name),
    'the same gear with food',
  );
  assert.deepEqual(on.totals, off.totals, 'the gear totals row is unchanged');
  const gearTotals = Object.fromEntries(job.stats.map((s, k) => [s, off.totals[k] - statBase(job, s, 50)]));
  // the row shows the highest item level meal with the best meal's result (sameMeals), so its points may differ within
  // the tiers
  const best = bestFood(job, foodChoices(job), gearTotals, 50, ['spd', 'crit', '']);
  const meal = sameMeals(job, gearTotals, best, allMeals(job), { level: 50, haste: 0, goal: 'spd' }, ['spd', 'crit']).at(-1);
  assert.equal(on.food.name, meal.name);
  assert.equal(on.food.best, true);
  const want = gearSpd + Math.min(meal.stats.find(s => s.stat === 'spd').max, Math.floor((341 + gearSpd) / 10));
  assert.equal(on.food.totals[i], 341 + want);
  assert.equal(on.total, 341 + want);
  assert.match(on.totalLabel, /base \+ gear \+ food, synced/);
  assert.equal(on.gcd, gcdFor(want, 50).toFixed(2));
  assert.equal(on.spdText, `${341 + want} Spell Speed (341 base, ${gearSpd} gear, ${want - gearSpd} food)`);
  assert.equal(on.tiers[i].effect, statTier(job, 'spd', want, 50).effect);
  // no food cell for the main stat; Vitality's is the meal's percent of base 202 (level 50, Sage's modifier 100) plus
  // gear, up to its maximum
  assert.equal(on.food.cells[0], null);
  const vitWant = Math.min(meal.vit.max, Math.floor((meal.vit.pct * (202 + gearTotals.vit)) / 100));
  assert.deepEqual(on.food.cells[1], { value: vitWant, capped: vitWant === meal.vit.max });

  // a meal picked from the Food menu: the newest Determination + Critical Hit meal
  const pickedMeal = foodChoices(job).find(c => c.key === 'det+crit');
  const det = viewOf(app, pool, {}, pickedMeal.name);
  assert.equal(det.food.name, pickedMeal.name);
  assert.equal(det.food.picked, true);
  assert.equal(det.food.best, false);
  assert.equal(det.food.totals[i], 341 + gearSpd, 'no speed on this meal');
  assert.ok(det.food.cells[job.stats.indexOf('det')].value > 0);
});

test('Rank by tier: the view shows the core result, each key held at its tier and marked, food chosen with the gear', () => {
  // Sage, unsynced level 100 gear from the item level 125-135 window, Critical Hit then Determination then Direct Hit
  const app = makeApp('SGE', { sync: false });
  Object.assign(app.opt, { target: 'crit', tb: 'det', tb2: 'dh', food: true, byTier: true });
  const pool = windowPool(app.jobCtx);
  const r = rankByTier(app.jobCtx, pool, syncSettings(app), {
    target: 'crit',
    tiebreak: ['det', 'dh'],
    melds: app.opt.melds,
    food: 'best',
    level: app.level,
  });
  assert.ok(r.ok);
  const v = viewOf(app, pool);
  assert.equal(v.kind, 'ok');
  assert.equal(v.byTier, true);
  // the meal: the highest item level one with the result of the one tier ranking chose with the gear; the Food menu tags them all
  const tagged = v.food.menu.pinned;
  assert.ok(
    tagged.some(x => x.name === r.food.name),
    r.food.name,
  );
  assert.equal(v.food.name, tagged.reduce((a, b) => (b.ilvl > a.ilvl ? b : a)).name);
  assert.equal(v.food.best, true);
  // every key keeps the tier the core held it at (the rows may show other pieces with the same tiers, same-result.js)
  const stats = app.jobCtx.stats;
  // weapon damage is held first (no tiers) and has no column
  assert.equal(r.held[0].stat, 'wd');
  for (const h of r.held.filter(x => x.stat !== 'wd')) {
    const shown = v.tiers[stats.indexOf(h.stat)];
    assert.equal(shown.held, true, h.stat);
    assert.equal(shown.effect, statTier(app.jobCtx, h.stat, r.withFood[h.stat], app.level).effect, h.stat);
  }
  // only the keys are marked
  assert.deepEqual(
    stats.filter((_stat, k) => v.tiers[k]?.held),
    stats.filter(s => ['crit', 'det', 'dh'].includes(s)),
  );

  // switched off: the plain ranking (the same view as before tier ranking existed)
  app.opt.byTier = false;
  const plain = viewOf(app, pool);
  assert.equal(plain.byTier, false);
  assert.ok(plain.tiers.every(c => !c?.held));
});

test('Rank by tier with a Target GCD: the GCD and the GCD line come from the tier search', () => {
  const app = makeApp('SGE', { sync: false });
  const pool = windowPool(app.jobCtx);
  const fastest = viewOf({ ...app, opt: { ...app.opt, target: 'spd', byTier: false } }, pool);
  // halfway between the GCD with no speed and the fastest the window reaches: reachable, and not trivially
  const gcd = Math.round(((2.5 + Number(fastest.gcd)) / 2) * 100) / 100;
  Object.assign(app.opt, { target: 'crit', tb: 'det', tb2: '', byTier: true, gcd, gcdMode: 'exact' });
  const v = viewOf(app, pool);
  assert.equal(v.kind, 'ok');
  assert.equal(v.gcd, gcd.toFixed(2));
  assert.equal(v.gcdLine, null);
  // a GCD faster than any set reaches: no set, said on the GCD line
  app.opt.gcd = 1.6;
  const none = viewOf(app, pool);
  assert.equal(none.kind, 'nogcd');
  assert.equal(none.gcdLine.bad, true);
});

/* Relics whose substats the player allocates in game (Zodiac Zeta, Anima, Eureka, Resistance, Manderville, Phantom
   Occultum) are listed in the game files with main stat only: the optimizer leaves them out and says so (owner's
   decision 2026-10-18). Other weapons with no substat (Gold Saucer gear) and relics with substats stay. */
test('allocated relics: left out of the search and counted in the note; other relics and stat-less gear stay', () => {
  const sge = makeJobContext('SGE');
  const pieces = name => gearOf(sge).filter(i => i.name === name);
  const [occultum] = pieces('Phantom Pendulums Occultum');
  const [eclipticum] = pieces('Phantom Pendulums Eclipticum');
  const [mandervillous] = pieces('Mandervillous Wings');
  assert.ok(occultum && eclipticum && mandervillous);
  assert.equal(allocatedRelic(sge, occultum), true);
  assert.equal(allocatedRelic(sge, mandervillous), true);
  assert.equal(allocatedRelic(sge, eclipticum), false, 'a relic with substats');
  const ai = gearOf(makeJobContext('WAR')).find(i => i.name.startsWith('Ai Apaec'));
  if (ai) assert.equal(allocatedRelic(makeJobContext('WAR'), ai), false, 'Gold Saucer gear with no substat');
  const app = makeApp('SGE', { sync: false, cap: null, level: 100 });
  app.opt.target = 'crit';
  // by name: jobGear keeps one job's gear at a time, so the Warrior lookup above rebuilt Sage's
  const searched = new Set(poolOf(app).map(i => i.name));
  assert.ok(!searched.has(occultum.name));
  assert.ok(searched.has(eclipticum.name));
  const v = viewOf(app);
  assert.ok(v.relicsLeftOut > 0);
  // the weapon is the Eclipticum (weapon damage 157), not the Occultum (158, no substat)
  assert.equal(v.rows[0].item.name, 'Phantom Pendulums Eclipticum');
});

/* The owner's case for the Food menu picks (2026-10-20): Sage, synced level 70, item level 375, Critical Hit >
   Determination > Mind, materia and food. Popoto Potage and Mollete (Critical Hit + Spell Speed) both add the most
   Critical Hit the totals allow, +133 (under their 151 cap: their percent of these totals), and are pinned; Caramel
   Popcorn (Determination + Critical Hit) adds +91 Critical Hit and +125 or +126 Determination. */
test("Food menu on the owner's Sage case: two meals pinned, the list below, chips and the Critical Hit sort", () => {
  const app = makeApp('SGE', { level: 70, cap: 375 });
  Object.assign(app.opt, { target: 'crit', tb: 'det', tb2: 'main', melds: true, food: true, byTier: true });
  const v = viewOf(app);
  assert.equal(v.kind, 'ok');
  const { menu } = v.food;
  assert.deepEqual(
    menu.pinned.map(x => x.name),
    ['Popoto Potage', 'Mollete'],
  );
  assert.equal(menu.count, 2);
  for (const x of menu.pinned) assert.equal(x.adds[0].text, 'CRT +133');
  const popcorn = menu.groups.flatMap(g => g.items).find(x => x.name === 'Caramel Popcorn');
  assert.deepEqual(
    popcorn.adds.map(a => a.stat),
    ['det', 'crit', 'vit'],
    'its main stat first',
  );
  assert.equal(popcorn.adds[1].value, 91);
  assert.ok([125, 126].includes(popcorn.adds[0].value), popcorn.adds[0].text);

  // no pill: every meal below, by expansion, no chip, no Sort row
  const none = mealList(menu, { stats: [], query: '', sortBy: 'ilvl' });
  assert.deepEqual(none.sorts, []);
  assert.deepEqual(
    none.groups.map(g => g.key),
    ['best', 'Dawntrail', 'Endwalker', 'Shadowbringers', 'Stormblood', 'Heavensward', 'A Realm Reborn'],
  );
  assert.equal(none.groups[0].label, 'Best for goal · 2');
  assert.ok(none.groups.every(g => g.items.every(x => x.line.every(a => !a.hit))));

  // CRT and DET, sorted by CRT: the pinned group unchanged and chipped, one list below, most Critical Hit first
  const both = mealList(menu, { stats: ['crit', 'det'], query: '', sortBy: 'crit' });
  assert.deepEqual(
    both.sorts.map(o => o.label),
    ['ILVL', 'CRT', 'DET'],
  );
  assert.deepEqual(
    both.groups.map(g => g.key),
    ['best', 'sorted'],
  );
  assert.deepEqual(
    both.groups[0].items.map(x => x.line.map(a => a.hit)),
    [
      [true, false, false],
      [true, false, false],
    ],
  );
  const below = both.groups[1].items;
  assert.equal(below[0].name, 'Caramel Popcorn');
  assert.ok(below.every(x => x.stats.includes('crit') && x.stats.includes('det')));
  const crit = below.map(x => x.adds.find(a => a.stat === 'crit').value);
  assert.deepEqual(
    crit,
    [...crit].sort((a, b) => b - a),
  );
  assert.deepEqual(
    below[0].line.map(a => a.hit),
    [true, true, false],
  );
});

/* The Food menu's filters on a hand-made list below the pinned meals: Critical Hit + Determination, Critical Hit +
   Direct Hit, Spell Speed + Determination; each adds Vitality last. */
const meal = (name, ilvl, adds) => ({
  key: name,
  name,
  ilvl,
  stats: Object.keys(adds).filter(s => s !== 'vit'),
  adds: Object.entries(adds).map(([stat, value]) => ({ stat, text: `${stat} +${value}`, value })),
  best: false,
  on: false,
});
const MEALS = [
  meal('Caramel Popcorn', 770, { det: 125, crit: 91, vit: 121 }),
  meal('Rroneek au Gratin', 770, { crit: 91, dh: 36, vit: 121 }),
  meal('Mate Cookie', 740, { spd: 36, det: 125, vit: 121 }),
];
const filters = (stats, query = '') => ({ stats, query });

test('Food menu filters: every picked stat, every search word', () => {
  assert.equal(mealsPassing(MEALS, filters([])).length, 3);
  assert.deepEqual(
    mealsPassing(MEALS, filters(['crit'])).map(x => x.name),
    ['Caramel Popcorn', 'Rroneek au Gratin'],
  );
  assert.deepEqual(
    mealsPassing(MEALS, filters(['crit', 'dh'])).map(x => x.name),
    ['Rroneek au Gratin'],
  );
  assert.deepEqual(
    mealsPassing(MEALS, filters([], 'mate coo')).map(x => x.name),
    ['Mate Cookie'],
  );
});

test("Food menu stat line: a meal's stats in its own order, a picked pill's stat marked, none with no pill", () => {
  const { adds } = MEALS[0];
  assert.deepEqual(
    mealLine(adds, []).map(a => [a.stat, a.hit]),
    [
      ['det', false],
      ['crit', false],
      ['vit', false],
    ],
  );
  assert.deepEqual(
    mealLine(adds, ['crit']).map(a => a.hit),
    [false, true, false],
  );
  assert.deepEqual(
    mealLine(adds, ['crit', 'det']).map(a => a.hit),
    [true, true, false],
  );
  assert.equal(mealLine(adds, ['crit'])[1].text, 'crit +91');
});

test('Food menu sort: by the points a meal adds, then the other picked stat, ties newest first; ILVL keeps the order', () => {
  const items = [
    meal('A', 770, { det: 100, crit: 50, vit: 1 }),
    meal('B', 740, { det: 90, crit: 60, vit: 1 }),
    meal('C', 710, { det: 110, crit: 60, vit: 1 }),
    meal('D', 680, { det: 110, crit: 60, vit: 1 }),
  ];
  const names = list => list.map(x => x.name);
  assert.deepEqual(names(sortMeals(items, 'ilvl', ['crit'])), ['A', 'B', 'C', 'D']);
  // one pill: Critical Hit, ties newest first
  assert.deepEqual(names(sortMeals(items, 'crit', ['crit'])), ['B', 'C', 'D', 'A']);
  // two pills: Critical Hit, then Determination, then newest first
  assert.deepEqual(names(sortMeals(items, 'crit', ['crit', 'det'])), ['C', 'D', 'B', 'A']);
  assert.deepEqual(names(sortMeals(items, 'det', ['crit', 'det'])), ['C', 'D', 'A', 'B']);
  // a stat whose pill is off sorts as ILVL
  assert.deepEqual(names(sortMeals(items, 'det', ['crit'])), ['A', 'B', 'C', 'D']);
  assert.notEqual(sortMeals(items, 'ilvl', []), items, 'a new array');
});

test('Food menu list: the pinned group always shows, the pills and search narrow only the list below', () => {
  const pinned = meal('Popoto Potage', 770, { crit: 133, spd: 36, vit: 121 });
  const menu = {
    count: 1,
    pinned: [{ ...pinned, best: true, on: true }],
    groups: [
      { label: 'Dawntrail', items: MEALS.slice(0, 2) },
      { label: 'Endwalker', items: MEALS.slice(2) },
    ],
    pills: ['crit', 'det', 'dh', 'spd'].map(stat => ({ stat, short: stat.toUpperCase(), label: stat })),
  };
  const view = (stats, query = '', sortBy = 'ilvl') => mealList(menu, { stats, query, sortBy });
  const shown = v => v.groups.map(g => [g.key, g.items.map(x => x.name)]);
  assert.deepEqual(shown(view(['dh'])), [
    ['best', ['Popoto Potage']],
    ['Dawntrail', ['Rroneek au Gratin']],
  ]);
  // a search that matches only the pinned meal: the pinned group stays, the list below says so
  const searched = view([], 'popoto');
  assert.deepEqual(shown(searched), [['best', ['Popoto Potage']]]);
  assert.deepEqual(searched.empty, { text: 'No other meal matches "popoto".', action: 'query' });
  assert.equal(view([]).empty, null);
  // the Sort row: ILVL, then the picked stats in the pills' order, whatever order they were picked in
  assert.deepEqual(
    view(['det', 'crit']).sorts.map(o => o.key),
    ['ilvl', 'crit', 'det'],
  );
  // sorted by a stat whose pill is off: ILVL, by expansion
  assert.deepEqual(
    view(['crit'], '', 'det').groups.map(g => g.key),
    ['best', 'Dawntrail'],
  );
  assert.deepEqual(
    view(['det'], '', 'det').groups.map(g => [g.key, g.label]),
    [
      ['best', 'Best for goal · 1'],
      ['sorted', null],
    ],
  );
});

test('Same-result menu search: every word in the name or the gear category, empty groups dropped', () => {
  const groups = [
    { label: 'Heavensward', items: [{ name: "Plague Doctor's Ring", category: { key: 'dungeon', label: 'Dungeon' } }] },
    {
      label: 'Stormblood',
      items: [
        { name: 'Genta Ring of Healing', category: { key: 'raid', label: 'Raid' } },
        { name: 'Omicron Ring of Healing', category: null },
      ],
    },
  ];
  const names = query => samePassing(groups, query).flatMap(g => g.items.map(x => x.name));
  assert.equal(names('').length, 3);
  assert.deepEqual(names('RING heal'), ['Genta Ring of Healing', 'Omicron Ring of Healing']);
  assert.deepEqual(names('raid'), ['Genta Ring of Healing']);
  assert.deepEqual(
    samePassing(groups, 'plague').map(g => g.label),
    ['Heavensward'],
  );
  assert.deepEqual(names('zzzz'), []);
  assert.equal(sameEmptyText('  zzzz '), 'No piece matches "zzzz".');
});

test('Food menu pills: greyed out only as a third, or when the list below would be empty; a picked one never is', () => {
  // the owner's case (2026-10-18): with the pinned meals out of the list, nothing greys a pill but the list below
  assert.equal(mealPillOff(MEALS, 'dh', filters([])), false);
  assert.equal(mealPillOff(MEALS, 'crit', filters(['crit'])), false);
  // Spell Speed with Critical Hit: no meal below has both
  assert.equal(mealPillOff(MEALS, 'spd', filters(['crit'])), true);
  assert.equal(mealPillOff(MEALS, 'det', filters(['crit'])), false);
  // a third pill, always
  assert.equal(mealPillOff(MEALS, 'spd', filters(['crit', 'det'])), true);
  // under a search: a pill that would leave nothing it matches
  assert.equal(mealPillOff(MEALS, 'dh', filters([], 'caramel')), true);
});

test('Food menu empty list: only a search empties the list below, and Clear search brings meals back', () => {
  assert.equal(mealEmptyReason(MEALS, filters(['crit'])), null);
  assert.deepEqual(mealEmptyReason(MEALS, filters(['crit'], 'xyz ')), { text: 'No other meal matches "xyz".', action: 'query' });
  // nothing to bring back (a state the menu cannot reach, or every meal pinned): no line
  assert.equal(mealEmptyReason(MEALS, filters(['crit', 'spd'])), null);
  assert.equal(mealEmptyReason([], filters([], 'xyz')), null);
});

/* Every state the Food menu can reach, for every job's real meals (owner, 2026-10-18: prove the empty list's advice).
   From each start (a shown meal pinned as best for goal, alone or with every meal of the same stats; the meals below
   are the rest), the pills start empty and the walk applies every move the menu allows: a pill on or off (on only
   while mealPillOff allows it) and a search (none, one matching no meal, one word of a meal's name). In every state the
   pills leave a meal below with no search, so an empty list always comes from the search, and Clear search brings
   meals back. */
test('Food menu: in every reachable state only a search empties the list below, and Clear search brings meals back', () => {
  let states = 0;
  const walked = new Set();
  for (const { id: jobId } of JOBS) {
    const job = makeJobContext(jobId);
    walked.add(job.jobId);
    const items = allMeals(job).map(m => ({ key: m.key, name: m.name, stats: m.stats.map(x => x.stat) }));
    if (!items.length) continue;
    const pills = job.substats.filter(s => items.some(x => x.stats.includes(s)));
    const words = [items[0], items[items.length >> 1], items.at(-1)].map(x => x.name.split(' ')[0].toLowerCase());
    const queries = ['', 'zzzz', ...words];
    // pinned meals spread over the list: one alone, or with every meal of the same stats
    const shownAt = [0, 1, items.length >> 2, items.length >> 1, (3 * items.length) >> 2, items.length - 1];
    for (const at of [...new Set(shownAt)]) {
      const shown = items[at];
      for (const pinSame of [false, true]) {
        const below = items.filter(x => x !== shown && !(pinSame && x.stats.join() === shown.stats.join()));
        const key = f => `${[...f.stats].sort().join()}|${f.query}`;
        const seen = new Set();
        const queue = [{ stats: [], query: '' }];
        while (queue.length) {
          const f = queue.pop();
          const k = key(f);
          if (seen.has(k)) continue;
          seen.add(k);
          states++;
          const where = `${jobId} pinned ${shown.name} at ${k}`;
          assert.ok(mealsPassing(below, { ...f, query: '' }).length > 0, `the pills leave no meal: ${where}`);
          const passing = mealsPassing(below, f).length;
          const reason = mealEmptyReason(below, f);
          assert.equal(!!reason, passing === 0, `an empty list with no line, or a line over meals: ${where}`);
          if (reason) assert.equal(reason.action, 'query', where);
          // every move the menu allows
          for (const p of pills) {
            if (f.stats.includes(p)) queue.push({ ...f, stats: f.stats.filter(s => s !== p) });
            else if (!mealPillOff(below, p, f)) queue.push({ ...f, stats: [...f.stats, p] });
          }
          for (const q of queries) queue.push({ ...f, query: q });
        }
      }
    }
  }
  assert.equal(walked.size, JOBS.length, 'every job walked');
  assert.ok(states > 5000, `${states} states walked`);
});

/* Audit 02, finding 6: a new optimizer setting had to be added to optimizerKey by hand, or a result never showed as
   out of date after it changed. Every field of opt, and the job and sync settings, must change the key. */
test('optimizerKey: every optimizer, job and sync setting changes it', () => {
  const other = v => (typeof v === 'boolean' ? !v : Array.isArray(v) ? [...v, 'x'] : v === 'x' ? 'y' : 'x');
  const app = makeApp('WAR');
  const key = optimizerKey(app);
  for (const field of Object.keys(defaultState().opt)) {
    const changed = { ...app, opt: { ...app.opt, [field]: other(app.opt[field]) } };
    assert.notEqual(optimizerKey(changed), key, `opt.${field}`);
  }
  for (const field of ['job', 'cap', 'sync', 'level']) assert.notEqual(optimizerKey({ ...app, [field]: other(app[field]) }), key, field);
  // the menu-only and display state is not part of it
  assert.equal(optimizerKey({ ...app, tab: 'browse', browse: { ...app.browse, q: 'ring' } }), key);
});

/* Audit 02, finding 12: text the template used to build from several fields is now built here, where a test can read
   it. Each line is checked against the fields it is made of. */
test('optimizer view: the readout, rows, Defense and notes carry their own text', () => {
  const app = makeApp('SGE');
  Object.assign(app.opt, { target: 'main', tb: 'crit', food: true, byTier: true });
  const v = viewOf(app, uniqueRingPool(app.jobCtx));
  assert.equal(v.kind, 'ok');
  assert.equal(v.gcdText, `${v.gcd}s`);
  assert.equal(v.dotText, `+${v.dot}%`);
  assert.equal(v.gcdNote, `GCD${v.hasteText} with ${v.spdText} · ${v.tierText}`);
  assert.equal(v.clanNote, 'Clan bonuses can affect MND and VIT.');
  assert.equal(v.effectNote, 'gear and food');
  assert.equal(v.food.note, v.food.best ? 'HQ, best for goal' : 'HQ, picked');
  // the second ring slot is empty: no copy of the one Unique ring is left
  assert.equal(v.rows.find(r => r.label === 'Ring 2').emptyText, 'empty (no copy left)');
  // the Defense row in en-US numbers (fmtInt), as the other counts
  assert.equal(v.defense.physText, fmtInt(v.defense.phys));
  assert.equal(v.defense.magText, fmtInt(v.defense.mag));
  assert.equal(v.defense.takenText, `−${v.defense.physPct}% / −${v.defense.magPct}% damage taken`);
  for (const c of v.tiers.filter(Boolean)) {
    assert.equal(c.text, `${c.spare} · ${c.toNext == null ? '–' : `+${c.toNext}`}`);
    assert.equal(c.title, c.held ? 'Held at this tier by Spare points to tiebreaks' : null);
  }
  assert.ok(v.tiers.some(c => c?.held));
  // Food off: no Food row, and the Effect row says so
  app.opt.food = false;
  assert.equal(viewOf(app, uniqueRingPool(app.jobCtx)).effectNote, 'gear only, no food');
  // a tank's main stat
  assert.equal(viewOf(makeApp('WAR'), windowPool(makeJobContext('WAR'))).clanNote, 'Clan bonuses can affect STR and VIT.');
});
