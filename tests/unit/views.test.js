/* The page's view builders (src/ui/views/): what each tab shows, computed from store-shaped state without Alpine. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeJobContext } from '../../src/core/job-context.js';
import { bestFood, foodChoices, statBase } from '../../src/core/food.js';
import { browseItems, mkItem, poolItemFromRow, poolKey, sourceMask, withoutSources } from '../../src/core/items.js';
import { exhaustive, gamePool } from './helpers/exhaustive.js';
import { AKH_LEVEL, appState } from './helpers/common.js';
import { gcdFor, hasteFor, speedParams } from '../../src/core/speed.js';
import { optimizeGcd } from '../../src/core/target-gcd.js';
import { rankByTier } from '../../src/core/tier-rank.js';
import { statTier } from '../../src/core/tiers.js';
import { jobGear, optimizerView, panelBase, searchCount, searchPool, tierText } from '../../src/ui/views/optimizer.js';
import { explainerView } from '../../src/ui/views/sync-explainer.js';
import { pieceView } from '../../src/ui/views/piece.js';
import { gearView } from '../../src/ui/views/gear.js';
import { JOBS, SOURCES } from '../../src/core/constants.js';
import { optimize } from '../../src/core/optimizer/index.js';
import { DEFAULT_EXCLUDE, syncSettings } from '../../src/ui/state.js';

/* A store-shaped state object, as the Alpine store holds it; sync on at cap 123 unless `patch` says otherwise. Rank by
   tier off: these tests check the plain ranking against brute force and the core; tier ranking has its own tests. */
const makeApp = (job = 'SGE', patch = {}) => {
  const app = appState({ job, sync: true, cap: 123 }, patch);
  if (!('opt' in patch)) app.opt.byTier = false;
  return app;
};

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

test('piece lab view: the default two substats both reach the cap; the healer note only for Mind jobs; shares in percent', () => {
  const rpr = pieceView(makeApp('RPR', { cap: 123, sync: true, level: 50 }));
  assert.deepEqual(
    rpr.rows.map(r => [r.stat, r.w, r.syn]),
    [
      ['main', 100, 30],
      ['vit', 100, 32],
      ['crit', 100, 29],
      ['spd', 70, 29], // the 70% line is cut to the full-share head cap, not to 70% of it
    ],
  );
  assert.equal(rpr.evenSubs, true);
  assert.equal(rpr.healerNote, false);
  assert.match(rpr.rows[0].ownFormula, /^6050 × 8\.5% = 514\.3 → 514/);
  assert.equal(pieceView(makeApp('SGE', { cap: 123, sync: true, level: 50 })).healerNote, true);
  // no sync, or a piece at the cap: nothing is cut
  assert.equal(pieceView(makeApp('RPR', { sync: false, cap: null, level: 100 })).evenSubs, false);
  const atCap = makeApp('RPR', { level: 50 });
  atCap.piece = { ...atCap.piece, ilvl: 123 };
  assert.equal(pieceView(atCap).evenSubs, false);
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
  // at the job's own cap no gear it can wear is level-synced: How the math works shows no sync
  assert.equal(pieceView(app).status, 'off');
  assert.equal(explainerView(app), null);
  const bst = makeApp('BST', { sync: false, cap: null, level: 50 });
  assert.equal(explainerView(bst), null);
  // below the cap, level sync applies as for any job
  assert.equal(explainerView({ ...bst, level: 40 }).cap, 40); // ParamGrow: levels 1 to 49 sync to their own number
});

test('sync off: piece lab leaves stats as they are and shows no ceiling', () => {
  const app = makeApp('SGE', { cap: 123, sync: false });
  app.piece = { ilvl: 130, slot: 'head', subs: ['spd', 'spec'] };
  const v = pieceView(app);
  assert.equal(v.status, 'off');
  assert.ok(v.rows.every(r => r.syn === r.raw && r.cap == null && r.ownKept));
  assert.match(v.summary, /^No sync applies/);
  assert.deepEqual(
    pieceView({ ...app, sync: true }).rows.map(r => r.cap),
    [30, 29, 29, 29],
  );
});

/* Piece stats' step by step, the example the layout was designed on: a Sage head at item level 170 with Critical Hit
   and Spell Speed, synced to 130. Each line is the lower of the head's own value and the item level 130 head's (its
   ceiling); the ceiling's arithmetic is capValue's own order (the factor first, the slot share floored in tenths). */
test('piece lab: each stat against its ceiling, with the sentences and the arithmetic', () => {
  const app = makeApp('SGE', { cap: 130, sync: true, level: 100 });
  app.piece = { ilvl: 170, slot: 'head', subs: ['crit', 'spd'] };
  const v = pieceView(app);
  assert.equal(v.status, 'above');
  assert.deepEqual(
    v.rows.map(r => [r.stat, r.raw, r.cap, r.syn, r.ownKept]),
    [
      ['main', 40, 33, 33, false],
      ['vit', 35, 32, 32, false],
      ['crit', 47, 31, 31, false],
      ['spd', 33, 31, 31, false],
    ],
  );
  assert.equal(
    v.summary,
    'Synced to 130, this item level 170 head keeps 62 of its 80 substat points. Critical Hit, its 100% stat, loses the most (−16).',
  );
  const vit = v.rows[1],
    spd = v.rows[3];
  assert.equal(vit.ownFormula, '460 × 8.5% = 39.1 → 39; × 0.9 = 35.1 → 35');
  assert.equal(vit.capFormula, '414 × 90% = 372; × 8.5% = 31.6 → 32');
  assert.match(vit.ownText, /then 90%: Intelligence and Mind gear has less Vitality\.$/);
  assert.match(spd.ownText, /then 70%: it is the second substat\.$/);
  assert.match(spd.capText, /The full share, even for the 70% stat\.$/);
  assert.equal(spd.capFormula, '363 × 8.5% = 30.8 → 31');
  // the slices: the job's slots with both rings make up the whole budget, the head marked
  assert.equal(
    v.slices.reduce((a, s) => a + s.width, 0),
    1000,
  );
  assert.deepEqual(
    v.slices.filter(s => s.on).map(s => [s.label, s.share]),
    [['Head', '8.5%']],
  );
  assert.equal(v.slotShare, '8.5%');
  // at the cap: nothing is cut, the head's own numbers are kept
  app.piece = { ...app.piece, ilvl: 130 };
  const at = pieceView(app);
  assert.equal(at.status, 'below');
  assert.ok(at.rows.every(r => r.ownKept && r.lost === 0));
});

test('piece lab: an off-hand is the two-handed value minus the one-handed one, its ceiling too', () => {
  const app = makeApp('PLD', { cap: 130, sync: true, level: 100 });
  app.piece = { ilvl: 170, slot: 'offhand', subs: ['crit', 'det'] };
  const v = pieceView(app);
  const crit = v.rows.find(r => r.stat === 'crit');
  assert.match(crit.ownText, /^The two-handed weapon's \d+ minus the one-handed weapon's \d+\.$/);
  assert.match(crit.capText, /^The two-handed cap \d+ minus the one-handed cap \d+\.$/);
  assert.equal(v.slotShare, null);
  assert.deepEqual(
    v.slices.filter(s => s.on).map(s => s.label),
    ['Off-hand'],
  );
  assert.equal(
    v.slices.reduce((a, s) => a + s.width, 0),
    1000,
  );
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
  // the weapon row: whichever piece with the same result it shows (the easiest), its synced Critical Hit and
  // Determination are at the item level 535 cap
  const synced = optimizerView(app).rows.find(r => r.label === 'Weapon');
  assert.deepEqual(
    [synced.cells[k].value, synced.cells[k].atCap, synced.cells[det].value, synced.cells[det].atCap],
    [210, true, 210, true],
  );
});

/* Character panel numbers against AkhMorning's Level Modifiers table (AKH_LEVEL, helpers/common.js). */
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
  // below the game's 1.50 s floor nothing can be had, whatever the gear
  nin.opt.gcd = 1.4;
  const floor = optimizerView(nin, gamePool(makeJobContext('NIN'), window));
  assert.equal(floor.kind, 'nogcd');
  assert.equal(floor.gcdLine.text, "The GCD can't go below 1.50");
  // the goal is speed: the box is off, the GCD typed is ignored
  Object.assign(nin.opt, { target: 'spd' });
  const spd = optimizerView(nin, gamePool(makeJobContext('NIN'), window));
  assert.equal(spd.kind, 'ok');
  assert.equal(spd.gcdLine, null);
  assert.equal(spd.gcdUi.off, true);
});

test('optimizer view: Food adds a meal row and the totals with it, counts tiers and the GCD with food, keeps the gear', () => {
  const app = makeApp('SGE', { level: 50 });
  const job = app.jobCtx;
  Object.assign(app.opt, { target: 'spd', tb: 'crit' });
  const pool = windowPool(job);
  const off = optimizerView(app, pool);
  assert.equal(off.food, null);
  // character panel numbers: level 50 base speed 341 (AkhMorning) plus gear
  const i = job.stats.indexOf('spd');
  const gearSpd = off.totals[i] - 341;
  assert.equal(off.spd, gearSpd);
  assert.match(off.totalLabel, /^Spell Speed \(base \+ gear, synced\)$/);
  assert.equal(off.spdText, `${off.totals[i]} Spell Speed (341 base, ${gearSpd} gear)`);

  app.opt.food = true; // best for the goal
  const on = optimizerView(app, pool);
  assert.deepEqual(
    on.rows.map(r => r.item?.name),
    off.rows.map(r => r.item?.name),
    'the same gear with food',
  );
  assert.deepEqual(on.totals, off.totals, 'the gear totals row is unchanged');
  const gearTotals = Object.fromEntries(job.stats.map((s, k) => [s, off.totals[k] - panelBase(job, s, 50)]));
  const meal = bestFood(job, foodChoices(job), gearTotals, 50, ['spd', 'crit', '']);
  assert.equal(on.food.name, meal.name);
  assert.equal(on.food.best, true);
  const want = gearSpd + Math.min(meal.stats.find(s => s.stat === 'spd').max, Math.floor((341 + gearSpd) / 10));
  assert.equal(on.food.totals[i], 341 + want);
  assert.equal(on.total, 341 + want);
  assert.match(on.totalLabel, /base \+ gear \+ food, synced/);
  assert.equal(on.gcd, gcdFor(want, 50).toFixed(2));
  assert.equal(on.spdText, `${341 + want} Spell Speed (341 base, ${gearSpd} gear, ${want - gearSpd} food)`);
  assert.equal(on.tiers[i].effect, statTier(job, 'spd', want, 50).effect);
  // main stat and Vitality get no food cell
  assert.deepEqual([on.food.cells[0], on.food.cells[1]], [null, null]);

  app.opt.foodPair = 'det+crit'; // a chosen meal
  const det = optimizerView(app, pool);
  assert.equal(det.food.best, false);
  assert.equal(det.food.totals[i], 341 + gearSpd, 'no speed on this meal');
  assert.ok(det.food.cells[job.stats.indexOf('det')].value > 0);
});

/* Level sync (synced level 90, item level sync off) in the views. Real gear at item level 663 to 666: the equip level
   94 and 95 pieces are synced to 660 at level 90, the level 90 ones are not (level-sync.test.js). */
const sge = makeJobContext('SGE');
const sgeApp = patch => appState({ job: 'SGE' }, patch);
const LEVEL_SYNC_WINDOW = { ilvlMin: 663, ilvlMax: 666, lvlMax: 100 };

test('views: level sync with item level sync off shows the level item level as the cap', () => {
  const app = sgeApp({ sync: false, cap: null, level: 90 });
  const v = explainerView(app);
  assert.equal(v.cap, 660);
  assert.equal(v.byLevel, true);
  const p = pieceView(Object.assign(app, { piece: { ilvl: 790, slot: 'head', subs: ['spd', null, null] } }));
  assert.equal(p.cap, 660);
  assert.equal(p.status, 'above');
  // at the level cap with item level sync off nothing applies
  assert.equal(explainerView(sgeApp({ sync: false, cap: null, level: 100 })), null);
  assert.equal(pieceView(sgeApp({ sync: false, cap: null, level: 100 })).status, 'off');
  // item level sync on: its cap is shown, whatever the level
  assert.equal(explainerView(sgeApp({ sync: true, cap: 123, level: 50 })).cap, 123);
});

test('views: the gear browser and the optimizer apply level sync per piece', () => {
  const app = sgeApp({ sync: false, cap: null, level: 90 });
  Object.assign(app.browse, { q: '', type: 'head', min: 780, max: '', lvl: 100 });
  const g = gearView(app);
  const lv100 = g.shown.filter(x => x.lvl === 100);
  assert.ok(lv100.length >= 2);
  for (const x of lv100) assert.ok(x.eff.main === 248 && x.raw.main > 248, x.name);
  const pool = gamePool(sge, LEVEL_SYNC_WINDOW);
  Object.assign(app.opt, { target: 'spd', tb: 'main', tb2: 'vit' });
  const sync = { cap: null, sync: false, level: 90 };
  const o = optimizerView(app, pool);
  assert.equal(o.kind, 'ok');
  assert.equal(o.synced, true);
  // the total is the character panel's: level 90 base speed 400 (AkhMorning) plus gear
  assert.equal(o.total, 400 + exhaustive(sge, pool, sync, { target: 'spd', tiebreak: ['main', 'vit'] })[0]);
  // gear no piece of which is synced at this level is not marked synced
  assert.equal(optimizerView(app, gamePool(sge, { ilvlMin: 660, ilvlMax: 665, lvlMax: 90 })).synced, false);
});

test('Rank by tier: the view shows the core result, each key held at its tier and marked, food chosen with the gear', () => {
  // Sage, unsynced level 100 gear from the item level 125-135 window, Critical Hit then Determination then Direct Hit
  const app = makeApp('SGE', { sync: false });
  Object.assign(app.opt, { target: 'crit', tb: 'det', tb2: 'dh', food: true, foodPair: '', byTier: true });
  const pool = windowPool(app.jobCtx);
  const r = rankByTier(app.jobCtx, pool, syncSettings(app), {
    target: 'crit',
    tiebreak: ['det', 'dh'],
    melds: app.opt.melds,
    food: 'best',
    level: app.level,
  });
  assert.ok(r.ok);
  const v = optimizerView(app, pool);
  assert.equal(v.kind, 'ok');
  assert.equal(v.byTier, true);
  // the meal is the one tier ranking chose with the gear
  assert.equal(v.food.name, r.food.name);
  // every key keeps the tier the core held it at (the rows may show other pieces with the same tiers, same-result.js)
  const stats = app.jobCtx.stats;
  for (const h of r.held) {
    const shown = v.tiers[stats.indexOf(h.stat)];
    assert.equal(shown.held, true, h.stat);
    assert.equal(shown.effect, statTier(app.jobCtx, h.stat, r.withFood[h.stat], app.level).effect, h.stat);
  }
  // only the keys are marked; the readout names them in order
  assert.deepEqual(
    stats.filter((s, k) => v.tiers[k]?.held),
    stats.filter(s => ['crit', 'det', 'dh'].includes(s)),
  );
  assert.match(v.heldText, /^Critical Hit [\d.]+%, then Determination \+[\d.]+%, then Direct Hit [\d.]+%$/);

  // switched off: the plain ranking (the same view as before tier ranking existed)
  app.opt.byTier = false;
  const plain = optimizerView(app, pool);
  assert.equal(plain.byTier, false);
  assert.equal(plain.heldText, null);
  assert.ok(plain.tiers.every(c => !c?.held));
});

test('Rank by tier with a Target GCD: the GCD line and band come from the tier search', () => {
  const app = makeApp('SGE', { sync: false });
  const pool = windowPool(app.jobCtx);
  const fastest = optimizerView({ ...app, opt: { ...app.opt, target: 'spd', byTier: false } }, pool);
  // halfway between the GCD with no speed and the fastest the window reaches: reachable, and not trivially
  const gcd = Math.round(((2.5 + Number(fastest.gcd)) / 2) * 100) / 100;
  Object.assign(app.opt, { target: 'crit', tb: 'det', tb2: '', byTier: true, gcd, gcdMode: 'exact' });
  const v = optimizerView(app, pool);
  assert.equal(v.kind, 'ok');
  assert.equal(v.gcd, gcd.toFixed(2));
  assert.equal(v.gcdLine.bad, false);
  assert.match(v.gcdLine.text, /^Spell Speed \d+ to \d+ \(character panel\)$/);
  // a GCD faster than any set reaches: no set, said on the GCD line
  app.opt.gcd = 1.6;
  const none = optimizerView(app, pool);
  assert.equal(none.kind, 'nogcd');
  assert.equal(none.gcdLine.bad, true);
});
