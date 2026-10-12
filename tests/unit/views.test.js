/* The page's view builders (src/ui/views/): what each tab shows, computed from store-shaped state without Alpine. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeJobContext } from '../../src/core/job-context.js';
import { MAX_REAL } from '../../src/core/tables.js';
import { browseItems, poolItemFromRow, mkItem } from '../../src/core/items.js';
import { exhaustive, gamePool } from './helpers/exhaustive.js';
import { gcdFor, gcdTierAt } from '../../src/core/speed.js';
import { restoreState } from '../../src/ui/state.js';
import { optimizerView, ceilingView, tierText } from '../../src/ui/views/optimizer.js';
import { syncView } from '../../src/ui/views/sync-caps.js';
import { pieceView } from '../../src/ui/views/piece.js';
import { gearView } from '../../src/ui/views/gear.js';
import { poolKey } from '../../src/core/items.js';

/* A store-shaped state object, as the Alpine store holds it; sync on at cap 123 unless `patch` says otherwise. */
function makeApp(job = 'SGE', patch = {}) {
  const s = restoreState({ job, sync: true, cap: 123 });
  return Object.assign(s, { jobCtx: makeJobContext(s.job), maxReal: MAX_REAL, poolVersion: 0 }, patch);
}

/* Real gear, chosen by properties. A small item level window (with weapons) whose best loadouts exhaustive() can
   check; and item level 130 Sage gear (no weapon: Sage gear starts at level 70) keeping only Unique rings, which
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
  app.pool = windowPool(app.jobCtx);
  const o = app.opt;
  Object.assign(o, { target: 'spd', tb: 'main', tb2: 'vit' });
  const want = sync => exhaustive(app.jobCtx, app.pool, { cap: app.cap, sync }, { target: 'spd', tiebreak: ['main', 'vit'] })[0];
  const v = optimizerView(app);
  assert.equal(v.kind, 'ok');
  assert.equal(v.total, want(true));
  assert.equal(v.targetLabel, 'Spell Speed');
  assert.equal(v.rows.filter(r => r.label.startsWith('Ring')).length, 2);
  assert.ok(v.rows.every(r => r.item));
  const unsynced = optimizerView({ ...app, sync: false }).total;
  assert.equal(unsynced, want(false));
  assert.ok(v.total < unsynced);
});

test('optimizer view: one Unique ring fills the first ring slot and leaves the second empty', () => {
  const app = makeApp('SGE');
  assert.equal(optimizerView(app).kind, 'empty');
  app.pool = uniqueRingPool(app.jobCtx);
  assert.equal(app.pool.filter(i => i.type === 'ring').length, 1);
  const v = optimizerView(app);
  assert.equal(v.kind, 'ok');
  assert.deepEqual(
    v.rows.filter(r => r.label.startsWith('Ring')).map(r => !!r.item),
    [true, false],
  );
});

test('A5: optimizer errors become an error view instead of throwing', () => {
  const app = makeApp('SGE');
  app.pool = ['head', 'body', 'hands', 'legs', 'feet', 'ear', 'neck', 'wrist', 'ring'].map(t =>
    mkItem(t, t, 130, { spd: 9e5, main: 9e5, vit: 9e5 }),
  );
  Object.assign(app.opt, { target: 'spd', tb: 'main', tb2: 'vit' }); // tiebreaks make the scores large
  app.sync = false; // with sync on these stats would be clamped to normal values
  const v = optimizerView(app);
  assert.equal(v.kind, 'error');
  assert.match(v.message, /too large/);
});

test('ceiling view: per-stat maxima, synced vs unsynced, equal brute force', () => {
  const app = makeApp('WAR', { cap: 123 }); // below the 125-135 window, so sync bites
  app.pool = windowPool(app.jobCtx);
  const job = app.jobCtx;
  const v = ceilingView(app);
  assert.equal(v.truncated, false);
  job.stats.forEach((s, k) => {
    assert.equal(v.synced[k], String(exhaustive(job, app.pool, { cap: app.cap, sync: true }, { target: s })[0]), s);
    assert.equal(v.unsynced[k], String(exhaustive(job, app.pool, { cap: app.cap, sync: false }, { target: s })[0]), s);
  });
  const spd = v.headers.indexOf('SkS');
  assert.ok(+v.synced[spd] < +v.unsynced[spd]);
});

/* No real pool hits the page's ceiling limit since the ring-pair bound (Ninja 600-640 needed over 150,000 steps before
   it), so the limit is lowered to force a truncated run. */
test('A7: a ceiling search that hits its step limit is marked as a lower bound', () => {
  const app = makeApp('NIN');
  app.pool = browseItems(app.jobCtx, { q: '', type: 'any', ilvlMin: 600, ilvlMax: 640, lvlMax: 100 }).map(r =>
    poolItemFromRow(app.jobCtx, r),
  );
  assert.equal(ceilingView(app).truncated, false);
  const v = ceilingView(app, 20);
  assert.equal(v.truncated, true);
  assert.ok([...v.synced, ...v.unsynced].some(t => t.startsWith('≥ ')));
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

test('gear view: all matches, each marked when it is in the pool; the pool view lists only pool items', () => {
  const app = makeApp('SGE');
  app.browse = { ...app.browse, q: '', min: 130, max: 130, lvl: 50 };
  const rows = browseItems(app.jobCtx, { ilvlMin: 130, ilvlMax: 130, lvlMax: 50 });
  assert.ok(rows.length >= 9);
  let v = gearView(app);
  assert.equal(v.showPool, false);
  assert.equal(v.all.length, rows.length);
  assert.ok(v.shown.every(x => x.item === null));
  app.pool = uniqueRingPool(app.jobCtx);
  const n = app.pool.length;
  assert.equal(n, rows.length - rows.filter(r => r.type === 'ring' && !r.unique).length);
  v = gearView(app);
  const inPool = new Set(app.pool.map(poolKey));
  assert.ok(v.shown.every(x => !!x.item === inPool.has(x.key)));
  assert.equal(v.shown.filter(x => x.item).length, n);
  app.browse.show = 'pool';
  v = gearView(app);
  assert.equal(v.showPool, true);
  assert.equal(v.shown.length, n);
  assert.ok(v.shown.every(x => x.item));
  assert.match(v.countText, new RegExp(`^${n} items · `));
  // the same filters narrow the pool view
  app.browse.type = 'ring';
  v = gearView(app);
  assert.equal(v.shown.length, 1);
  assert.match(v.countText, /1 match the filters$/);
});

test('sync off: the ceiling has no synced row and its GCD comes from the unsynced ceiling', () => {
  const app = makeApp('WAR', { cap: 123, sync: false });
  app.pool = windowPool(app.jobCtx);
  const v = ceilingView(app);
  assert.equal(v.synced, null);
  const spd = v.headers.indexOf('SkS');
  assert.equal(v.gcd, gcdFor(+v.unsynced[spd], app.level).toFixed(2) + 's');
  assert.deepEqual(v.unsynced, ceilingView({ ...app, sync: true }).unsynced);
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
