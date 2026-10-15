/* The page's view builders (src/ui/views/): what each tab shows, computed from store-shaped state without Alpine. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeJobContext } from '../../src/core/job-context.js';
import { MAX_REAL } from '../../src/core/tables.js';
import { browseItems, mkItem, poolItemFromRow } from '../../src/core/items.js';
import { exhaustive, gamePool } from './helpers/exhaustive.js';
import { gcdFor, gcdTierAt } from '../../src/core/speed.js';
import { restoreState } from '../../src/ui/state.js';
import { jobGear, optimizerView, searchCount, searchPool, tierText } from '../../src/ui/views/optimizer.js';
import { syncView } from '../../src/ui/views/sync-caps.js';
import { pieceView } from '../../src/ui/views/piece.js';
import { gearView } from '../../src/ui/views/gear.js';
import { JOBS, SOURCES } from '../../src/core/constants.js';
import { sourceMask, withoutSources } from '../../src/core/items.js';
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

/* 1,818 (2.28 s) and 1,904 (2.27 s) are tier starts in AkhMorning's level 100 2.5s tier table
   (https://www.akhmorning.com/allagan-studies/stats/speed/; see tests/unit/speed.test.js). */
test('A3: tier text is right above 1,200 gear speed (level 100, 1,839 speed)', () => {
  assert.equal(tierText(1839, 100), 'tier starts at 1818, next at 1904 (+65)');
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
  assert.equal(v.total, want(true));
  assert.equal(v.targetLabel, 'Spell Speed');
  assert.equal(v.rows.filter(r => r.label.startsWith('Ring')).length, 2);
  assert.ok(v.rows.every(r => r.item));
  const unsynced = optimizerView({ ...app, sync: false }, pool).total;
  assert.equal(unsynced, want(false));
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

test('A5: optimizer errors become an error view instead of throwing', () => {
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
