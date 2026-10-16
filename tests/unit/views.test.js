/* The page's view builders (src/ui/views/): what each tab shows, computed from store-shaped state without Alpine. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeJobContext } from '../../src/core/job-context.js';
import { MAX_REAL } from '../../src/core/tables.js';
import { browseItems, mkItem, poolItemFromRow } from '../../src/core/items.js';
import { exhaustive, gamePool } from './helpers/exhaustive.js';
import { gcdFor, gcdTierAt, speedParams } from '../../src/core/speed.js';
import { statTier } from '../../src/core/tiers.js';
import { restoreState } from '../../src/ui/state.js';
import { jobGear, optimizerView, panelBase, searchCount, searchPool, tierText } from '../../src/ui/views/optimizer.js';
import { syncView } from '../../src/ui/views/sync-caps.js';
import { pieceView } from '../../src/ui/views/piece.js';
import { gearView } from '../../src/ui/views/gear.js';
import { JOBS, SOURCES } from '../../src/core/constants.js';
import { poolKey, sourceMask, withoutSources } from '../../src/core/items.js';
import { optimize } from '../../src/core/optimizer/index.js';
import { DEFAULT_EXCLUDE, syncSettings } from '../../src/ui/state.js';

/* A store-shaped state object, as the Alpine store holds it; sync on at cap 123 unless `patch` says otherwise. */
function makeApp(job = 'SGE', patch = {}) {
  const s = restoreState({ job, sync: true, cap: 123 });
  return Object.assign(s, { jobCtx: makeJobContext(s.job), maxReal: MAX_REAL }, patch);
}

/* Real gear, chosen by properties, passed to the optimizer view in place of every piece the job can wear. A small item
   level window (with weapons) whose best loadouts exhaustive() can check; and item level 130 Sage gear (no weapon: Sage gear starts at level 70) keeping only Unique rings, which
   leaves exactly one ring, so the second ring slot stays empty. */
const WINDOW = { ilvlMin: 125, ilvlMax: 135, lvlMax: 50 };
const windowPool = job => gamePool(job, WINDOW);
const uniqueRingPool = job => gamePool(job, { ilvlMin: 130, ilvlMax: 130, lvlMax: 50 }, r => r.type !== 'ring' || r.unique);

/* 2,238 (2.28 s) and 2,324 (2.27 s) are tier starts in AkhMorning's level 100 2.5s tier table, which lists full speed
   (base 420 + gear 1,818 and 1,904; https://www.akhmorning.com/allagan-studies/stats/speed/, speed.test.js). */
test('A3: tier text is right above 1,200 gear speed (level 100, 1,839 gear speed), in panel numbers', () => {
  assert.equal(tierText(1839, 100), 'tier starts at 2238, next at 2324 (+65)');
});

test('gcdTierAt agrees with a step-by-step scan at every level', () => {
  let seed = 7;
  const rand = n => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return Math.floor((seed / 2147483648) * n);
  };
  for (let level = 1; level <= 100; level++) {
    for (let k = 0; k < 5; k++) {
      const spd = rand(3000);
      const t = gcdTierAt(spd, level);
      let start = spd;
      while (start > 0 && gcdFor(start - 1, level) === t.gcd) start--;
      let next = spd + 1;
      while (gcdFor(next, level) === t.gcd) next++;
      assert.deepEqual([t.start, t.next, t.nextGcd], [start, next, gcdFor(next, level)], `level ${level}, speed ${spd}`);
    }
  }
});

test('optimizer view: real Black Mage gear, synced and unsynced, equals brute force', () => {
  // a cap of 123 sits below the 125-135 window, so sync bites
  const app = makeApp('BLM', { cap: 123 });
  const pool = windowPool(app.jobCtx);
  const o = app.opt;
  Object.assign(o, { target: 'spd', tb: 'main', tb2: 'vit' });
  const want = sync => exhaustive(app.jobCtx, pool, { cap: app.cap, sync }, { target: 'spd', tiebreak: ['main', 'vit'] })[0];
  const v = optimizerView(app, pool);
  assert.equal(v.kind, 'ok');
  const base = panelBase(app.jobCtx, 'spd', app.level);
  assert.equal(base, 420);
  assert.equal(v.total, want(true) + base);
  assert.equal(v.targetLabel, 'Spell Speed');
  assert.equal(v.rows.filter(r => r.label.startsWith('Ring')).length, 2);
  assert.ok(v.rows.every(r => r.item));
  const unsynced = optimizerView({ ...app, sync: false }, pool).total;
  assert.equal(unsynced, want(false) + base);
  assert.ok(v.total < unsynced);
  // tier row: one entry per stat column, none for the main stat and Vitality; speed by its GCD, as in the readout
  assert.equal(v.tiers.length, v.headers.length);
  assert.deepEqual([v.tiers[0], v.tiers[1]], [null, null]);
  const spd = v.tiers[app.jobCtx.stats.indexOf('spd')];
  assert.equal(spd.effect, `${v.gcd}s`);
  assert.ok(spd.spare >= 0 && spd.toNext > 0);
});

test('optimizer view: one Unique ring fills the first ring slot and leaves the second empty', () => {
  const app = makeApp('SGE');
  const pool = uniqueRingPool(app.jobCtx);
  assert.equal(pool.filter(i => i.type === 'ring').length, 1);
  const v = optimizerView(app, pool);
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
  const v = optimizerView(app, pool);
  assert.equal(v.kind, 'error');
  assert.match(v.message, /too large/);
});

test('sync caps view at 123: substat ceiling 296 over ten slots, 2.22 s GCD at level 50', () => {
  const v = syncView(makeApp('SGE', { cap: 123, level: 50 }));
  assert.equal(v.tot.c, 296);
  assert.equal(v.gcd, '2.22');
  assert.deepEqual(
    v.rows.filter(r => ['head', 'body', 'ear', 'weapon'].includes(r.type)).map(r => [r.type, r.sub, r.main]),
    [
      ['weapon', 48, 50],
      ['head', 29, 30],
      ['body', 47, 48],
      ['ear', 23, 24],
    ],
  );
});

test('piece lab view: every real item level 130 Sage head piece with three substats, its two ranked ones from the formula, synced to 123', () => {
  const app = makeApp('SGE', { cap: 123, sync: true });
  const job = app.jobCtx;
  const heads = gamePool(job, { type: 'head', ilvlMin: 130, ilvlMax: 130, lvlMax: 50 }).filter(
    i => job.substats.filter(s => i.stats[s] > 0).length === 3,
  );
  assert.ok(heads.length >= 2);
  const CAP = { main: 30, vit: 29, sub: 29 }; // head caps at item level 123: main stat 30, everything else 29
  for (const head of heads) {
    // the third line is the fixed Direct Hit of Mind-only gear, which Piece stats does not model
    const subs = job.substats
      .filter(s => head.stats[s] > 0)
      .sort((a, b) => head.stats[b] - head.stats[a])
      .slice(0, 2);
    assert.ok(!subs.includes('dh'), head.name);
    app.piece = { ilvl: 130, slot: 'head', subs };
    const v = pieceView(app);
    const want = ['main', 'vit', ...subs].map(s => [s, head.stats[s], Math.min(head.stats[s], CAP[s] ?? CAP.sub)]);
    assert.deepEqual(
      v.rows.map(r => [r.stat, r.raw, r.syn]),
      want,
      head.name,
    );
    assert.equal(v.status, 'above');
    assert.equal(
      v.lost,
      want.reduce((a, [, raw, syn]) => a + raw - syn, 0),
    );
  }
  // the numbers themselves, for the reader: 33 main / 32 Vitality / 31, 22, 6 substats
  assert.deepEqual(
    heads.map(h => [
      h.stats.main,
      h.stats.vit,
      ...job.substats
        .map(s => h.stats[s])
        .filter(Boolean)
        .sort((a, b) => b - a),
    ]),
    heads.map(() => [33, 32, 31, 22, 6]),
  );
});

/* With no gear passed in, the optimizer searches every database piece the job can wear, minus its own left-out groups
   (Current Savage, Ultimate and PvP by default), and finds the same loadout as optimize() on that pool. */
test('optimizer view: every job searches all the gear it can wear, minus its left-out groups', () => {
  for (const [id] of JOBS) {
    const app = makeApp(id, { level: Math.min(50, makeJobContext(id).maxLevel) });
    const job = app.jobCtx;
    const all = browseItems(job, {});
    assert.equal(jobGear(job).length, all.length, id);
    assert.equal(jobGear(job), jobGear(job), `${id}: built once per job`);
    const searched = withoutSources(jobGear(job), [...DEFAULT_EXCLUDE]);
    assert.deepEqual(searchCount(app), { searched: searched.length, left: all.length - searched.length }, id);
    assert.ok(searched.length > 100, id);
    const v = optimizerView(app);
    assert.equal(v.kind, 'ok', id);
    const want = optimize(job, searched, syncSettings(app), { target: app.opt.target, melds: app.opt.melds });
    assert.equal(v.total, want.totals[app.opt.target], id);
  }
});

/* The browser's list: database rows matching its filters, minus its own left-out groups; no pool. */
test('gear view: every match of the filters, with its synced stats', () => {
  const app = makeApp('SGE');
  app.browse = { ...app.browse, q: '', min: 130, max: 130, lvl: 50, exclude: [] };
  const rows = browseItems(app.jobCtx, { ilvlMin: 130, ilvlMax: 130, lvlMax: 50 });
  assert.ok(rows.length >= 9);
  const v = gearView(app);
  assert.equal(v.shown.length, rows.length);
  assert.equal(v.countText, `${rows.length} matches`);
  // item level 130 is above the cap of 123: every stat is shown raw → synced where the cap bites
  assert.ok(v.shown.some(x => x.cells.some(c => c.text.includes('→'))));
});

/* The optimizer and the browser each have their own list of left-out gear groups. */
test('left-out groups: the optimizer and the browser each go by their own list', () => {
  const tome = SOURCES.find(s => s.key === 'tomestone').bit; // the window has tomestone gear, no crafted
  const app = makeApp('WAR', { cap: 123 });
  const pool = windowPool(app.jobCtx);
  const nTome = pool.filter(i => sourceMask(i) & tome).length;
  assert.ok(nTome > 0 && nTome < pool.length);
  Object.assign(app.browse, { min: 125, max: 135, lvl: 50, exclude: [] });
  app.opt.exclude = [];
  const listed = gearView(app).shown.length;
  assert.equal(searchPool(app, pool).length, pool.length);
  // leaving tomestone gear out of the browser changes nothing in the optimizer, and the other way round
  app.browse.exclude = ['tomestone'];
  assert.ok(gearView(app).shown.length < listed);
  assert.equal(searchPool(app, pool).length, pool.length);
  app.browse.exclude = [];
  app.opt.exclude = ['tomestone'];
  assert.equal(gearView(app).shown.length, listed);
  assert.equal(searchPool(app, pool).length, pool.length - nTome);
  assert.deepEqual(searchCount(app, pool), { searched: pool.length - nTome, left: nTome });
  const o = optimizerView(app, pool);
  assert.equal(o.kind, 'ok');
  assert.equal(o.total, exhaustive(app.jobCtx, searchPool(app, pool), { cap: 123, sync: true }, { target: app.opt.target })[0]);
  app.opt.exclude = SOURCES.map(s => s.key);
  assert.equal(
    optimizerView(
      app,
      pool.filter(i => sourceMask(i) & tome),
    ).kind,
    'excluded',
  );
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
      const want = withoutSources(
        rows.map(r => poolItemFromRow(job, r)),
        DEFAULT_EXCLUDE,
      );
      assert.deepEqual(keys(searchPool(app)), keys(want), `${id} ${JSON.stringify(f)}`);
      assert.deepEqual(searchCount(app), { searched: want.length, left: jobGear(job).length - want.length });
    }
    // the browser's filters leave the optimizer alone, and the other way round
    Object.assign(app.opt, { expOff: [], min: '', max: '', lvl: 100 });
    const searched = searchPool(app).length;
    Object.assign(app.browse, { expOff: ['ARR'], min: 600, max: 700, lvl: 1, exclude: [] });
    assert.equal(searchPool(app).length, searched, id);
    const listed = gearView(app).shown.length;
    Object.assign(app.opt, { min: 9999, max: 1 });
    assert.equal(gearView(app).shown.length, listed, id);
    assert.equal(optimizerView(app).kind, 'excluded', `${id}: nothing passes the filters`);
  }
});

test('level cap: the optimizer searches no piece above the job cap, and level sync at the cap is off', () => {
  const app = makeApp('BLU', { sync: false, cap: null, level: 80 });
  // two pieces per slot (small enough for the exhaustive reference), all at equip level 80 or below
  const all = gamePool(app.jobCtx, { ilvlMin: 520, ilvlMax: 560 });
  const wearableRows = all.filter(i => all.filter(j => j.type === i.type).indexOf(i) < 2);
  // pieces this job's mask allows but its level cap does not (jobGear never has them; gear passed in might)
  const above = browseItems(makeJobContext('BLM'), { ilvlMin: 520, ilvlMax: 560 })
    .filter(r => r.lvl > 80 && r.mask & (1 << app.jobCtx.jobIndex))
    .map(r => poolItemFromRow(app.jobCtx, r));
  assert.ok(wearableRows.length > 0 && above.length > 0);
  const pool = [...wearableRows, ...above];
  assert.equal(searchPool(app, pool).length, wearableRows.length);
  const o = optimizerView(app, pool);
  assert.equal(o.kind, 'ok');
  assert.equal(o.total, exhaustive(app.jobCtx, wearableRows, { cap: null, sync: false, level: 80 }, { target: app.opt.target })[0]);
  // at the job's own cap no gear it can wear is level-synced: Piece stats and Sync limits show no sync
  assert.equal(pieceView(app).status, 'off');
  assert.equal(syncView(app), null);
  const bst = makeApp('BST', { sync: false, cap: null, level: 50 });
  assert.equal(syncView(bst), null);
  // below the cap, level sync applies as for any job
  assert.equal(syncView({ ...bst, level: 40 }).cap, 40); // ParamGrow: levels 1 to 49 sync to their own number
});

test('sync off: piece lab leaves stats as they are and draws no cap line', () => {
  const app = makeApp('SGE', { cap: 123, sync: false });
  app.piece = { ilvl: 130, slot: 'head', subs: ['spd', 'spec'] };
  const v = pieceView(app);
  assert.equal(v.status, 'off');
  assert.ok(v.rows.every(r => r.syn === r.raw));
  assert.doesNotMatch(v.chartSvg, /cap 123/);
  assert.match(pieceView({ ...app, sync: true }).chartSvg, /cap 123/);
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
  const v = optimizerView(app);
  assert.equal(v.kind, 'ok');
  assert.ok(v.anyAtCap);
  const row = (view, name) => view.rows.find(r => r.item?.name === name);
  const wpn = row(v, 'Phantom Pendulums Eclipticum');
  assert.deepEqual([wpn.cells[k].value, wpn.cells[k].atCap, wpn.meld], [443, true, '2 slots empty']);
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
  const synced = row(optimizerView(app), 'Augmented Bygone Brass Pendulums');
  assert.deepEqual(
    [synced.cells[k].value, synced.cells[k].atCap, synced.cells[det].value, synced.cells[det].atCap],
    [210, true, 210, true],
  );
});

/* Character panel numbers against AkhMorning (Allagan Studies). Their Level Modifiers table, read from the page's
   script (https://www.akhmorning.com/allagan-studies/modifiers/levelmods/), 2026-10-16: [MAIN, SUB, DIV] by level.
   All 100 rows equal ours (checked once; these are a sample). */
const AKH_LEVEL = {
  1: [20, 56, 56],
  15: [46, 96, 96],
  30: [97, 173, 173],
  50: [202, 341, 341],
  60: [218, 354, 600],
  70: [292, 364, 900],
  80: [340, 380, 1300],
  90: [390, 400, 1900],
  100: [440, 420, 2780],
};

test('panel base: AkhMorning level table (Determination and Piety from MAIN, the other substats from SUB)', () => {
  for (const [id, stats] of [
    ['SGE', ['crit', 'det', 'dh', 'spd', 'spec']],
    ['WAR', ['crit', 'det', 'dh', 'spd', 'spec']],
    ['BLM', ['crit', 'det', 'dh', 'spd']],
  ]) {
    const job = makeJobContext(id);
    for (const [lv, [main, sub, div]] of Object.entries(AKH_LEVEL)) {
      assert.equal(speedParams(+lv).div, div, `level ${lv} DIV`);
      for (const s of stats) {
        const fromMain = s === 'det' || (s === 'spec' && job.profile.spec === 'piety');
        assert.equal(panelBase(job, s, +lv), fromMain ? main : sub, `${id} ${s} level ${lv}`);
      }
      assert.equal(panelBase(job, 'main', +lv), 0, 'main stat stays gear points');
      assert.equal(panelBase(job, 'vit', +lv), 0, 'Vitality stays gear points');
    }
  }
});

/* AkhMorning's formulas on full (panel) stats: Critical Hit rate floor(200 (CRT - SUB) / DIV + 50) / 10 %, Direct Hit
   floor(550 (DH - SUB) / DIV) / 10 %, Determination floor(140 (DET - MAIN) / DIV) / 10 %, Tenacity floor(112 (TEN - SUB)
   / DIV) / 10 %, Piety floor(150 (PIE - MAIN) / DIV) MP; the GCD as their speed table computes it. The page's effect
   from gear points (panel - base) must agree at every level in the table. */
test('panel numbers give AkhMorning effects at every level in their table', () => {
  const pctOf = n => `${(n / 10).toFixed(1)}%`;
  const akh = {
    crit: (v, [, sub, div]) => pctOf(Math.floor((200 * (v - sub)) / div) + 50),
    dh: (v, [, sub, div]) => pctOf(Math.floor((550 * (v - sub)) / div)),
    det: (v, [main, , div]) => `+${pctOf(Math.floor((140 * (v - main)) / div))}`,
    ten: (v, [, sub, div]) => `+${pctOf(Math.floor((112 * (v - sub)) / div))}`,
    piety: (v, [main, , div]) => `+${Math.floor((150 * (v - main)) / div)} MP`,
    spd: (v, [, sub, div]) => `${(Math.trunc((2500 * (Math.trunc((130 * (sub - v)) / div) + 1000)) / 10000) / 100).toFixed(2)}s`,
  };
  for (const id of ['SGE', 'WAR']) {
    const job = makeJobContext(id);
    for (const [lv, row] of Object.entries(AKH_LEVEL)) {
      for (const s of job.substats) {
        const key = s === 'spec' ? job.profile.spec : s;
        const base = panelBase(job, s, +lv);
        for (const gear of [0, 1, 17, 123, 480, 1111, 2400]) {
          // at low levels this much speed would take the GCD below zero, where only the rounding of negatives differs
          if (key === 'spd' && gcdFor(gear, +lv) <= 0) continue;
          assert.equal(statTier(job, s, gear, +lv).effect, akh[key](base + gear, row), `${id} ${s} level ${lv}, gear ${gear}`);
        }
      }
    }
  }
});

/* The page's Total and With food rows equal gear (and food) plus the level's base for substats, gear only for the main
   stat and Vitality; at level 50 Sage that is base 341 for Critical Hit, Direct Hit and Spell Speed, 202 for
   Determination and Piety (AkhMorning). */
test('optimizer totals are character panel numbers for substats', () => {
  const app = makeApp('SGE', { level: 50 });
  Object.assign(app.opt, { target: 'spd', food: true });
  const v = optimizerView(app, windowPool(app.jobCtx));
  assert.equal(v.kind, 'ok');
  const job = app.jobCtx;
  const gear = job.stats.map((s, k) => v.rows.reduce((a, r) => a + (r.cells?.[k].value ?? 0), 0));
  const want = { main: 0, vit: 0, crit: 341, det: 202, dh: 341, spd: 341, spec: 202 };
  job.stats.forEach((s, k) => {
    assert.equal(v.totals[k], gear[k] + want[s], s);
    assert.equal(v.food.totals[k], gear[k] + want[s] + (v.food.cells[k]?.value ?? 0), `${s} with food`);
  });
  const spd = job.stats.indexOf('spd');
  assert.equal(v.total, v.food.totals[spd]);
  assert.match(v.totalLabel, /^Spell Speed \(base \+ gear \+ food, synced\)$/);
  assert.equal(v.spdText, `${v.food.totals[spd]} Spell Speed (341 base, ${gear[spd]} gear, ${v.food.cells[spd]?.value ?? 0} food)`);
});

/* Target GCD on the page: the view equals the core's optimizeGcd on the same gear, counts the job's haste in its GCD
   and label, gives the speed band as the character panel shows it (base + gear + food), and says why no set fits. */
test('optimizer view with a Target GCD equals the core, with haste, food and the band on the character panel', async () => {
  const { optimizeGcd } = await import('../../src/core/target-gcd.js');
  const { foodChoices, statBase } = await import('../../src/core/food.js');
  const { hasteFor } = await import('../../src/core/speed.js');
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
    const free = optimizerView(app, pool);
    assert.equal(free.gcdLine, null, 'an empty box: no line');
    assert.equal(free.gcdUi.label, pct ? 'Target GCD (Fuka 13%)' : 'Target GCD');
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
      const v = optimizerView(app, pool);
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
        job.stats.map(s => r.totals[s] + panelBase(job, s, 100)),
        `${jobId} ${mode}: the core's gear, in panel numbers`,
      );
      assert.equal(v.gcd, r.gcd.toFixed(2));
      if (mode === 'exact') assert.equal(v.gcd, asked.toFixed(2));
      const base = statBase(job, 'spd', 100);
      if (r.faster) assert.equal(v.gcdLine.text, `${r.gcd.toFixed(2)}, faster than asked`);
      else {
        const need = mode === 'exact' ? `${base + r.band.min} to ${base + r.band.max}` : `${base + r.band.min} or more`;
        assert.equal(v.gcdLine.text, `${job.label.spd} ${need} (character panel)`);
      }
      if (food) assert.equal(v.food?.name, r.food?.name, 'the meal chosen with the gear');
    }
    assert.equal(met, 2, `${jobId}: both modes find a set`);
    app.opt.gcd = '';
    assert.ok(foodChoices(job).length);
  }
  // impossible for the job: a Ninja's GCD is 2.12 at most at level 100 (15% haste)
  const nin = makeApp('NIN', { sync: false, cap: null, level: 100 });
  Object.assign(nin.opt, { target: 'crit', gcd: 2.4, gcdMode: 'exact', exclude: [], lvl: 100 });
  const no = optimizerView(nin, gamePool(makeJobContext('NIN'), window));
  assert.equal(no.kind, 'nogcd');
  assert.ok(no.gcdLine.bad);
  assert.equal(no.gcdLine.text, "Ninja's GCD is 2.12 at most (Increase Attack Speed 15%)");
  // the goal is speed: the box is off, the GCD typed is ignored
  Object.assign(nin.opt, { target: 'spd' });
  const spd = optimizerView(nin, gamePool(makeJobContext('NIN'), window));
  assert.equal(spd.kind, 'ok');
  assert.equal(spd.gcdLine, null);
  assert.equal(spd.gcdUi.off, true);
});
