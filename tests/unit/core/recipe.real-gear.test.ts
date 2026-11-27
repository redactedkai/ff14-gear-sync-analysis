/* A set page's Auto-fill on real gear (src/core/recipe.ts runRecipe, evaluated by src/core/set.ts evaluateSet): the gear it
   searches and its filters, the totals in character panel numbers, Target GCD, food and rank by tier, against the
   core's own searches and the brute force. The recipe is a set's (its Auto-fill settings, sheets/fill-settings.ts fillRecipe), on
   store-shaped state (helpers/fixtures/views.ts). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PoolItem, SlotType } from '../../../src/core/types.ts';
import { ACTIVITIES, JOBS } from '../../../src/core/constants.ts';
import { statBase } from '../../../src/core/base-stats.ts';
import { allMeals, bestFood, foodChoices } from '../../../src/core/food.ts';
import { allocatedRelic, browseItems, itemRoutes, mkItem, poolItemFromRow, poolKey, withActivities } from '../../../src/core/items.ts';
import { makeJobContext } from '../../../src/core/job-context.ts';
import { optimize } from '../../../src/core/optimizer/index.ts';
import { sameMeals } from '../../../src/core/same-result.ts';
import { gcdFor, hasteFor } from '../../../src/core/speed.ts';
import { optimizeGcd } from '../../../src/core/target-gcd.ts';
import { rankByTier } from '../../../src/core/tier-rank.ts';
import { statTier } from '../../../src/core/tiers.ts';
import { DEFAULT_EXCLUDE, syncSettings } from '../../../src/ui/job-sync-panel.ts';
import { exhaustive, gamePool } from '../helpers/fixtures/exhaustive.ts';
import {
  countOf,
  explainerViewOf,
  gearOf,
  gearViewOf,
  makeApp,
  pieceViewOf,
  poolOf,
  solveOf,
  uniqueRingPool,
  windowPool,
} from '../helpers/fixtures/views.ts';

/* solveOf for a solve that finds a set: its run, evaluated set and panel numbers, none of them failing or null. */
function okSolve(...args: Parameters<typeof solveOf>) {
  const solved = solveOf(...args);
  assert.ok(solved.run.status === 'ok', `the solve found a set (${solved.run.status})`);
  assert.ok(solved.set);
  return { ...solved, run: solved.run, set: solved.set };
}

/* The first ranked total of the brute force's best loadout; the pool has a legal loadout. */
function bestTotal(...args: Parameters<typeof exhaustive>): number {
  const best = exhaustive(...args);
  assert.ok(best, 'a legal loadout');
  const [first] = best;
  assert.ok(first !== undefined);
  return first;
}

/* The owner's screenshot: Astrologian at level 50, cap 123, A Realm Reborn only, Relic left out, Mind > Vitality >
   Direct Hit, materia, best meal, rank by tier. The page said the search stopped at its step limit; it had found no set
   because Vitality was held with the meal's Vitality but asked of the gear alone. */
test("Vitality as a tiebreak with the best meal finds a set (owner's screenshot)", () => {
  const app = makeApp('AST', { level: 50 });
  Object.assign(app.recipe, { target: 'mind', tb: 'vit', tb2: 'dh', melds: true, food: true, byTier: true });
  app.recipe.expOff = ['HW', 'SB', 'ShB', 'EW', 'DT'];
  app.recipe.exclude = ['relic', 'savage', 'ultimate', 'pvp'];
  assert.equal(okSolve(app).run.status, 'ok');
});

test('real Black Mage gear, synced and unsynced, equals brute force', () => {
  // a cap of 123 sits below the 125-135 window, so sync bites
  const app = makeApp('BLM', { cap: 123 });
  const pool = windowPool(app.jobCtx);
  Object.assign(app.recipe, { target: 'sps', tb: 'int', tb2: 'vit', food: false });
  const want = (sync: boolean) => bestTotal(app.jobCtx, pool, { cap: app.cap, sync }, { target: 'sps', tiebreak: ['int', 'vit'] });
  const synced = okSolve(app, pool);
  assert.equal(synced.run.status, 'ok');
  const base = statBase(app.jobCtx, 'sps', app.level);
  assert.equal(base, 420);
  assert.equal(synced.panel('sps'), want(true) + base);
  assert.equal(synced.set.rows.filter(r => r.label.startsWith('Ring')).length, 2);
  assert.ok(synced.set.rows.every(r => r.item));
  const unsynced = okSolve({ ...app, sync: false }, pool).panel('sps');
  assert.equal(unsynced, want(false) + base);
  assert.ok(synced.panel('sps') < unsynced);
  // tiers: one entry per stat, none for the main stat and Vitality; speed by its GCD
  assert.equal(synced.set.tiers.length, app.jobCtx.stats.length);
  assert.deepEqual([synced.set.tiers[0], synced.set.tiers[1]], [null, null]);
  const spd = synced.set.tiers[app.jobCtx.stats.indexOf('sps')];
  assert.ok(spd);
  assert.equal(spd.effect, `${synced.set.gcd.gcd.toFixed(2)}s`);
  assert.ok(spd.spare >= 0 && (spd.toNext ?? 0) > 0);
});

test('one Unique ring fills the first ring slot and leaves the second empty', () => {
  const app = makeApp('SGE');
  const pool = uniqueRingPool(app.jobCtx);
  assert.equal(pool.filter(i => i.type === 'ring').length, 1);
  const { run, set } = okSolve(app, pool);
  assert.equal(run.status, 'ok');
  assert.deepEqual(
    set.rows.filter(r => r.label.startsWith('Ring')).map(r => Boolean(r.item)),
    [true, false],
  );
});

/* With no gear passed in, an Auto-fill searches every database piece the job can wear that its own "Gear categories" filter lets
   through (the default boxes, market board on), and finds the same loadout as optimize() on that pool. */
test('every job searches all the gear it can wear, minus what Gear categories leaves out and allocated relics', () => {
  for (const { id } of JOBS) {
    const app = makeApp(id, { level: Math.min(50, makeJobContext(id).maxLevel) });
    const job = app.jobCtx;
    const all = browseItems(job, {});
    assert.equal(gearOf(job).length, all.length, id);
    assert.equal(gearOf(job), gearOf(job), `${id}: built once per job`);
    const searched = withActivities(gearOf(job), [...DEFAULT_EXCLUDE], true).filter(i => !allocatedRelic(job, i));
    assert.deepEqual(countOf(app), { searched: searched.length, left: all.length - searched.length }, id);
    assert.ok(searched.length > 100, id);
    const solved = okSolve(app);
    assert.equal(solved.run.status, 'ok', id);
    const want = optimize(job, searched, syncSettings(app), { target: app.recipe.target, melds: app.recipe.melds });
    assert.ok(want.ok, id);
    // the character panel's number: gear plus the character's base
    assert.equal(solved.panel(app.recipe.target), want.totals[app.recipe.target] + statBase(job, app.recipe.target, app.level), id);
  }
});

/* A set's Auto-fill settings and the Gear browser each have their own "Gear categories" filter. */
test('Gear categories: an Auto-fill and the browser each go by their own boxes', () => {
  const app = makeApp('WAR', { cap: 123 });
  // the window's relics with player-allocated substats (Zodiac Zeta) are never searched (allocatedRelic)
  const pool = windowPool(app.jobCtx).filter(i => !allocatedRelic(app.jobCtx, i));
  // the window has Poetics gear (Tomestones (Legacy)) and other gear
  const nTome = pool.length - withActivities(pool, ['tomes_legacy'], true).length;
  assert.ok(nTome > 0 && nTome < pool.length);
  Object.assign(app.browse, { min: 125, max: 135, lvl: 50, exclude: [] });
  app.recipe.exclude = [];
  const listed = gearViewOf(app).shown.length;
  const all = poolOf(app, pool).length;
  // leaving Poetics gear out of the browser changes nothing in the Auto-fill, and the other way round
  app.browse.exclude = ['tomes_legacy'];
  assert.ok(gearViewOf(app).shown.length < listed);
  assert.equal(poolOf(app, pool).length, all);
  app.browse.exclude = [];
  app.recipe.exclude = ['tomes_legacy'];
  assert.equal(gearViewOf(app).shown.length, listed);
  assert.equal(poolOf(app, pool).length, all - nTome);
  assert.deepEqual(countOf(app, pool), { searched: all - nTome, left: pool.length - all + nTome });
  const solved = okSolve(app, pool);
  assert.equal(solved.run.status, 'ok');
  const best = bestTotal(app.jobCtx, poolOf(app, pool), { cap: 123, sync: true }, { target: app.recipe.target });
  assert.equal(solved.panel(app.recipe.target), best + statBase(app.jobCtx, app.recipe.target, app.level));
  // the market board switch is the browser's own too
  app.recipe.exclude = [];
  app.browse.market = false;
  assert.equal(poolOf(app, pool).length, all);
  // every box off and no market board: nothing from the database is left
  app.recipe.exclude = ACTIVITIES.map(a => a.key);
  app.recipe.market = false;
  assert.equal(solveOf(app, pool).run.status, 'excluded');
});

/* Gear to search has the browser's filters with its own values: an Auto-fill searches exactly the pieces the browser would
   list with the same filters (no name or slot), and neither's filters change the other's. */
test("Gear to search: the browser's filters, on the Auto-fill settings' own values", () => {
  for (const id of ['SGE', 'PLD', 'BST']) {
    const app = makeApp(id, { sync: false, cap: null });
    const job = app.jobCtx;
    const keys = (list: readonly PoolItem[]) => list.map(poolKey).sort();
    const cases = [
      { expOff: ['ARR', 'HW', 'SB'], min: '', max: '', lvl: 90 },
      { expOff: [], min: 400, max: 560, lvl: '' },
      { expOff: ['DT'], min: '', max: 600, lvl: 100 },
    ];
    for (const f of cases) {
      Object.assign(app.recipe, f, { exclude: [...DEFAULT_EXCLUDE] });
      const rows = browseItems(job, {
        expOff: f.expOff,
        ilvlMin: Number(f.min) || 0,
        ilvlMax: Number(f.max) || 0,
        lvlMax: Number(f.lvl) || 0,
      });
      const want = withActivities(
        rows.map(r => poolItemFromRow(job, r)),
        DEFAULT_EXCLUDE,
        true,
      ).filter(i => !allocatedRelic(job, i));
      assert.deepEqual(keys(poolOf(app)), keys(want), `${id} ${JSON.stringify(f)}`);
      assert.deepEqual(countOf(app), { searched: want.length, left: gearOf(job).length - want.length });
    }
    // the browser's filters leave the Auto-fill alone, and the other way round
    Object.assign(app.recipe, { expOff: [], min: '', max: '', lvl: 100 });
    const searched = poolOf(app).length;
    Object.assign(app.browse, { expOff: ['ARR'], min: 600, max: 700, lvl: 1, exclude: [] });
    assert.equal(poolOf(app).length, searched, id);
    const listed = gearViewOf(app).shown.length;
    Object.assign(app.recipe, { min: 9999, max: 1 });
    assert.equal(gearViewOf(app).shown.length, listed, id);
    assert.equal(solveOf(app).run.status, 'excluded', `${id}: nothing passes the filters`);
  }
});

test('level cap: an Auto-fill searches no piece above the job cap, and level sync at the cap is off', () => {
  const app = makeApp('BLU', { sync: false, cap: null, level: 80 });
  app.recipe.exclude = []; // every "Gear categories" box: only the level cap leaves pieces out
  // two pieces per slot (small enough for the exhaustive reference), all at equip level 80 or below and obtainable
  const all = gamePool(app.jobCtx, { ilvlMin: 520, ilvlMax: 560 }).filter(i => itemRoutes(i)?.length);
  const wearableRows = all.filter(i => all.filter(j => j.type === i.type).indexOf(i) < 2);
  // pieces this job's mask allows but its level cap does not (jobGear never has them; gear passed in might)
  const above = browseItems(makeJobContext('BLM'), { ilvlMin: 520, ilvlMax: 560 })
    .filter(r => r.lvl > 80 && r.mask & (1 << app.jobCtx.jobIndex))
    .map(r => poolItemFromRow(app.jobCtx, r));
  assert.ok(wearableRows.length > 0 && above.length > 0);
  const pool = [...wearableRows, ...above];
  assert.equal(poolOf(app, pool).length, wearableRows.length);
  const solved = okSolve(app, pool);
  assert.equal(solved.run.status, 'ok');
  const best = bestTotal(app.jobCtx, wearableRows, { cap: null, sync: false, level: 80 }, { target: app.recipe.target });
  assert.equal(solved.panel(app.recipe.target), best + statBase(app.jobCtx, app.recipe.target, 80));
  // at the job's own cap no gear it can wear is level-synced: How the math works shows no sync
  assert.equal(pieceViewOf(app).status, 'off');
  assert.equal(explainerViewOf(app), null);
  const bst = makeApp('BST', { sync: false, cap: null, level: 50 });
  assert.equal(explainerViewOf(bst), null);
  // below the cap, level sync applies as for any job
  assert.equal(explainerViewOf({ ...bst, level: 40 })?.cap, 40); // ParamGrow: levels 1 to 49 sync to their own number
});

/* Target GCD: the solve equals the core's optimizeGcd on the same gear, counts the job's haste in its GCD, and has no
   set where none fits. */
test('a Target GCD equals the core, with haste and food, in character panel numbers', () => {
  const window: Parameters<typeof gamePool>[1] = { type: 'any', ilvlMin: 700, ilvlMax: 730, lvlMax: 100 };
  const targetJobs: [jobId: string, food: boolean][] = [
    ['SGE', false],
    ['SAM', true],
  ];
  for (const [jobId, food] of targetJobs) {
    const job = makeJobContext(jobId);
    const pool = gamePool(job, window);
    const app = makeApp(jobId, { sync: false, cap: null, level: 100 });
    Object.assign(app.recipe, { target: 'crit', tb: 'det', food, melds: true, exclude: [], expOff: [], min: '', max: '', lvl: 100 });
    const pct = hasteFor(jobId, 100)?.pct ?? 0;
    const free = okSolve(app, pool);
    assert.equal(free.run.found.gcd, null, 'an empty box: no Target GCD facts');
    const freeGcd = free.set.gcd.gcd;
    assert.equal(freeGcd, gcdFor(free.set.gcd.spd, 100, 2500, pct));
    if (pct) {
      assert.equal(free.set.gcd.unhasted, gcdFor(free.set.gcd.spd, 100));
    }
    // the Tier row's speed cell is the same GCD, haste included
    assert.equal(free.set.tiers[job.stats.indexOf(job.speedKey)]?.effect, `${freeGcd.toFixed(2)}s`);
    // one tier slower than the free result (the drift case, which "exactly" must meet with less speed), or faster when
    // the free result is already the slowest GCD
    const top = gcdFor(0, 100, 2500, pct);
    const asked = Math.round((freeGcd + (freeGcd < top ? 0.01 : -0.01)) * 100) / 100;
    let met = 0;
    for (const mode of ['exact', 'min'] as const) {
      Object.assign(app.recipe, { gcd: asked, gcdMode: mode });
      const solved = solveOf(app, pool);
      const r = optimizeGcd(
        job,
        pool,
        { cap: null, sync: false, level: 100 },
        { target: 'crit', tiebreak: ['det', ''], melds: true, gcd: asked, mode, food: food ? 'best' : null, level: 100 },
      );
      assert.equal(solved.run.status, r.ok ? 'ok' : 'nogcd', `${jobId} ${mode}`);
      if (!r.ok) {
        continue;
      }
      assert.ok(solved.run.status === 'ok' && solved.set);
      met++;
      assert.deepEqual(
        job.stats.map(s => solved.gearPanel(s)),
        job.stats.map(s => (r.totals[s] ?? 0) + statBase(job, s, 100)),
        `${jobId} ${mode}: the core's gear, in panel numbers`,
      );
      assert.equal(solved.set.gcd.gcd.toFixed(2), r.gcd.toFixed(2));
      if (mode === 'exact') {
        assert.equal(solved.set.gcd.gcd.toFixed(2), asked.toFixed(2));
      }
      assert.equal(solved.run.found.gcd?.faster, r.faster);
      if (food) {
        assert.equal(solved.run.found.food?.shown?.name ?? null, r.food?.name ?? null, 'the meal chosen with the gear');
      }
    }
    assert.equal(met, 2, `${jobId}: both modes find a set`);
    app.recipe.gcd = '';
    assert.ok(foodChoices(job).length);
  }
  // impossible for the job: a Ninja's GCD is 2.12 at most at level 100 (15% haste)
  const nin = makeApp('NIN', { sync: false, cap: null, level: 100 });
  Object.assign(nin.recipe, { target: 'crit', gcd: 2.4, gcdMode: 'exact', exclude: [], lvl: 100 });
  const pool = gamePool(makeJobContext('NIN'), window);
  const no = solveOf(nin, pool);
  assert.equal(no.run.status, 'nogcd');
  assert.ok(no.run.status === 'nogcd');
  assert.equal(no.run.found.gcd?.reason, 'unreachable');
  // the target is speed: the GCD typed is ignored
  Object.assign(nin.recipe, { target: 'sks' });
  const spd = okSolve(nin, pool);
  assert.equal(spd.run.status, 'ok');
  assert.equal(spd.run.found.gcd, null);
});

test('Food adds the meal to the totals, counts tiers and the GCD with it, and keeps the gear', () => {
  const app = makeApp('SGE', { level: 50 });
  const job = app.jobCtx;
  Object.assign(app.recipe, { target: 'sps', tb: 'crit', food: false });
  const pool = windowPool(job);
  const off = okSolve(app, pool);
  assert.equal(off.set.meal, null);
  assert.equal(off.run.found.synced, true);
  // character panel numbers: level 50 base speed 341 (AkhMorning) plus gear
  const gearSpd = off.set.gear.sps;
  assert.equal(off.gearPanel('sps'), 341 + gearSpd);

  app.recipe.food = true; // best for the goal
  const on = okSolve(app, pool);
  assert.deepEqual(
    on.set.rows.map(r => r.item?.name),
    off.set.rows.map(r => r.item?.name),
    'the same gear with food',
  );
  assert.deepEqual(on.set.gear, off.set.gear, 'the gear totals are unchanged');
  // the set holds the highest item level meal with the best meal's result (sameMeals), so its points may differ
  // within the tiers
  const best = bestFood(job, foodChoices(job), off.set.gear, 50, ['sps', 'crit', '']);
  assert.ok(best);
  const meal = sameMeals(job, off.set.gear, best, allMeals(job), { level: 50, haste: 0, goal: 'sps' }, ['sps', 'crit']).at(-1);
  assert.ok(meal?.vit);
  assert.equal(on.set.meal?.name, meal.name);
  const spdLine = meal.stats.find(s => s.stat === 'sps');
  assert.ok(spdLine);
  const want = gearSpd + Math.min(spdLine.max, Math.floor((341 + gearSpd) / 10));
  assert.equal(on.panel('sps'), 341 + want);
  assert.equal(on.set.gcd.gcd.toFixed(2), gcdFor(want, 50).toFixed(2));
  assert.equal(on.set.tiers[job.stats.indexOf('sps')]?.effect, statTier(job, 'sps', want, 50)?.effect);
  // no food bonus on the main stat; Vitality's is the meal's percent of base 202 (level 50, Sage's modifier 100) plus
  // gear, up to its maximum
  assert.equal(on.set.bonus.mind, undefined);
  const vitWant = Math.min(meal.vit.max, Math.floor((meal.vit.pct * (202 + off.set.gear.vit)) / 100));
  assert.deepEqual([on.set.bonus.vit?.bonus, on.set.bonus.vit?.capped], [vitWant, vitWant === meal.vit.max]);

  // a meal chosen (a set's own, kept by Auto-fill: the pinned meal): the newest Determination + Critical Hit meal
  const chosen = foodChoices(job).find(c => c.key === 'det+crit');
  assert.ok(chosen);
  const det = okSolve(app, pool, {}, { pieces: [], meal: chosen.name });
  assert.equal(det.set.meal?.name, chosen.name);
  assert.equal(det.panel('sps'), 341 + gearSpd, 'no speed on this meal');
  assert.ok((det.set.bonus.det?.bonus ?? 0) > 0);
});

test('Rank by tier: the core result, each key held at its tier, food chosen with the gear', () => {
  // Sage, unsynced level 100 gear from the item level 125-135 window, Critical Hit then Determination then Direct Hit
  const app = makeApp('SGE', { sync: false });
  Object.assign(app.recipe, { target: 'crit', tb: 'det', tb2: 'dh', food: true, byTier: true });
  const pool = windowPool(app.jobCtx);
  const r = rankByTier(app.jobCtx, pool, syncSettings(app), {
    target: 'crit',
    tiebreak: ['det', 'dh'],
    melds: app.recipe.melds,
    food: 'best',
    level: app.level,
  });
  assert.ok(r.ok);
  const solved = okSolve(app, pool);
  assert.equal(solved.run.status, 'ok');
  // the meal: the highest item level one with the result of the one tier ranking chose with the gear
  assert.ok(solved.run.found.food && r.food);
  const tagged = solved.run.found.food.tagged;
  assert.ok(
    tagged.some(x => x.name === r.food?.name),
    r.food.name,
  );
  assert.equal(solved.set.meal?.name, tagged.reduce((a, b) => (b.ilvl > a.ilvl ? b : a)).name);
  // every key keeps the tier the core held it at (the rows may show other pieces with the same tiers, same-result.ts);
  // weapon damage is held first (no tiers)
  assert.equal(r.held[0]?.stat, 'wd');
  const stats = app.jobCtx.stats;
  const withFood: Record<string, number | undefined> = r.withFood;
  for (const h of r.held.filter(x => x.stat !== 'wd')) {
    const stat = stats.find(key => key === h.stat);
    assert.ok(stat, h.stat);
    assert.equal(
      solved.set.tiers[stats.indexOf(stat)]?.effect,
      statTier(app.jobCtx, stat, withFood[h.stat] ?? 0, app.level)?.effect,
      h.stat,
    );
  }
  assert.deepEqual(
    solved.run.found.held.map(h => h.stat).filter(s => s !== 'wd'),
    ['crit', 'det', 'dh'],
  );
  // switched off: the plain ranking, nothing held
  app.recipe.byTier = false;
  assert.deepEqual(okSolve(app, pool).run.found.held, []);
});

test('Rank by tier with a Target GCD: the GCD comes from the tier search', () => {
  const app = makeApp('SGE', { sync: false });
  const pool = windowPool(app.jobCtx);
  const fastest = okSolve({ ...app, recipe: { ...app.recipe, target: 'sps', byTier: false } }, pool);
  // halfway between the GCD with no speed and the fastest the window reaches: reachable, and not trivially
  const gcd = Math.round(((2.5 + fastest.set.gcd.gcd) / 2) * 100) / 100;
  Object.assign(app.recipe, { target: 'crit', tb: 'det', tb2: '', byTier: true, gcd, gcdMode: 'exact' });
  const solved = okSolve(app, pool);
  assert.equal(solved.run.status, 'ok');
  assert.equal(solved.set.gcd.gcd.toFixed(2), gcd.toFixed(2));
  // a GCD faster than any set reaches: no set
  app.recipe.gcd = 1.6;
  assert.equal(solveOf(app, pool).run.status, 'nogcd');
});

/* Relics whose substats the player allocates in game (Zodiac Zeta, Anima, Eureka, Resistance, Manderville, Phantom
   Occultum) are listed in the game files with main stat only: an Auto-fill leaves them out and counts them. Other weapons with
   no substat (Gold Saucer gear) and relics with substats stay. */
test('allocated relics: left out of the search and counted; other relics and stat-less gear stay', () => {
  const sge = makeJobContext('SGE');
  const pieces = (name: string) => gearOf(sge).filter(i => i.name === name);
  const [occultum] = pieces('Phantom Pendulums Occultum');
  const [eclipticum] = pieces('Phantom Pendulums Eclipticum');
  const [mandervillous] = pieces('Mandervillous Wings');
  assert.ok(occultum && eclipticum && mandervillous);
  assert.equal(allocatedRelic(sge, occultum), true);
  assert.equal(allocatedRelic(sge, mandervillous), true);
  assert.equal(allocatedRelic(sge, eclipticum), false, 'a relic with substats');
  const ai = gearOf(makeJobContext('WAR')).find(i => i.name.startsWith('Ai Apaec'));
  if (ai) {
    assert.equal(allocatedRelic(makeJobContext('WAR'), ai), false, 'Gold Saucer gear with no substat');
  }
  const app = makeApp('SGE', { sync: false, cap: null, level: 100 });
  app.recipe.target = 'crit';
  // by name: jobGear keeps one job's gear at a time, so the Warrior lookup above rebuilt Sage's
  const searched = new Set(poolOf(app).map(i => i.name));
  assert.ok(!searched.has(occultum.name));
  assert.ok(searched.has(eclipticum.name));
  const solved = okSolve(app);
  // the weapon is the Eclipticum (weapon damage 157), not the Occultum (158, no substat)
  assert.equal(solved.set.rows[0]?.item?.name, 'Phantom Pendulums Eclipticum');
});

/* A slot another piece covers names the piece the row shows. Found while moving the result onto evaluateSet: White
   Mage at cap 123, Mind > Critical Hit > Determination with melds and tier ranking, the search picked Phantom Cane
   Eclipticum, the Weapon row showed Zelkova Cane (an easier weapon with the same result, core/same-result.ts), and the
   Off-hand row still said "covered by Phantom Cane Eclipticum". */
test('the Off-hand row is covered by the weapon the Weapon row shows', () => {
  const app = makeApp('WHM', { sync: true, cap: 123, level: 100 });
  Object.assign(app.recipe, { target: 'mind', tb: 'crit', tb2: 'det', melds: true, byTier: true, food: false });
  const { run, set } = okSolve(app);
  assert.equal(run.status, 'ok');
  const weapon = set.rows.find(r => r.label === 'Weapon');
  const offhand = set.rows.find(r => r.label === 'Off-hand');
  assert.ok(weapon?.item && offhand && offhand.item === null);
  assert.equal(offhand.blockedBy, weapon.item.name);
});

test('stat totals too large to rank exactly: the solve throws (solve.ts answers with the message)', () => {
  const app = makeApp('SGE');
  const types: SlotType[] = ['head', 'body', 'hands', 'legs', 'feet', 'ear', 'neck', 'wrist', 'ring'];
  const pool = types.map(t => mkItem(t, t, 130, { sps: 9e5, mind: 9e5, vit: 9e5 }));
  Object.assign(app.recipe, { target: 'sps', tb: 'mind', tb2: 'vit' }); // tiebreaks make the scores large
  app.sync = false; // with sync on these stats would be clamped to normal values
  assert.throws(() => okSolve(app, pool), /too large/);
});
