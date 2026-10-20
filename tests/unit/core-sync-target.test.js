/* Level sync: which item level a piece is synced to (src/core/sync-target.js) and how the optimizer applies it (the
   views under level sync are in ui-views.level-sync.test.js). Expected values come from the game's ParamGrow sheet, the ItemLevel
   rows and real items. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeJobContext } from '../../src/core/job-context.js';
import { IL, ITEMS } from '../../src/core/tables.js';
import { JOBS } from '../../src/core/constants.js';
import { capCeiling, levelSyncIlvl, syncTarget } from '../../src/core/sync-target.js';
import { capsFor } from '../../src/core/formulas.js';
import { browseItems, dbStats, kindFactors, parseRow, poolItemFromRow } from '../../src/core/items.js';
import { effStats, itemSyncIlvl, optimize } from '../../src/core/optimizer/index.js';
import { exhaustive, gamePool, loadoutCount } from './helpers/exhaustive.js';
import { SLOT_PERMILLE, roundHalfUp } from './helpers/common.js';

const sge = makeJobContext('SGE');
const ROWS = ITEMS.map(parseRow);
const jobsOf = r => JOBS.filter((_, i) => r.mask & (1 << i)).map(j => makeJobContext(j[0]));

/* ParamGrow.ItemLevelSync, read from the game file: the level caps of each expansion. xivgear's tests sync level 94
   to 100 gear to item level 660 in a level 90 duty (issue #317, in-game reports), the same value. */
test('level sync item level: ParamGrow.ItemLevelSync at each level cap, and levels 1 to 49 map to themselves', () => {
  const want = { 50: 130, 60: 270, 70: 400, 80: 530, 90: 660, 100: 690 };
  for (const [l, il] of Object.entries(want)) assert.equal(levelSyncIlvl(+l), il, `level ${l}`);
  for (let l = 1; l <= 49; l++) assert.equal(levelSyncIlvl(l), l, `level ${l}`);
  for (let l = 2; l <= 100; l++) assert.ok(levelSyncIlvl(l) >= levelSyncIlvl(l - 1), `never falls at level ${l}`);
});

test('syncTarget: the item level trigger, the level trigger, both, and neither', () => {
  const t = (itemLevel, equipLevel, syncOn, cap, syncedLevel) => syncTarget({ itemLevel, equipLevel, syncOn, cap, syncedLevel });
  // item level sync only: above the cap -> the cap; at or below it -> untouched
  assert.equal(t(130, 50, true, 123, 100), 123);
  assert.equal(t(123, 50, true, 123, 100), null);
  // item level sync off: the cap is ignored
  assert.equal(t(130, 50, false, 123, 100), null);
  // level sync only: equip level above the synced level -> the level's item level, whatever the item level
  assert.equal(t(790, 100, false, null, 90), 660);
  assert.equal(t(663, 94, false, null, 90), 660);
  assert.equal(t(120, 51, false, null, 50), 130);
  assert.equal(t(665, 90, false, null, 90), null); // equip level equal to the synced level: untouched
  // both triggers: the item level cap wins, lower (T13: level 50, item level 123) or higher (Aloalo Island: level 90,
  // item level 665, where level 95 gear at item level 666 showed item level 665 stats; xivgear issue #317)
  assert.equal(t(130, 51, true, 123, 50), 123);
  assert.equal(t(666, 95, true, 665, 90), 665);
  // only the level triggers: level 94 gear at item level 663, under the 665 cap -> 660 (the same report)
  assert.equal(t(663, 94, true, 665, 90), 660);
  // both, with the cap far above the level's item level, which no duty does: gear made for a higher level goes no
  // higher than the best gear made for the level (capCeiling: 135, level 50's weapons), so level 50 with cap 400 syncs
  // a level 70 piece to 135, not 400, while a level 60 piece under the cap gets 130 (owner's decision, 2026-10-18)
  assert.equal(t(405, 70, true, 400, 50), 135);
  assert.equal(t(270, 60, true, 400, 50), 130);
  assert.equal(t(405, 50, true, 400, 50), 400); // wearable at the level: the cap alone
  assert.equal(t(669, 96, true, 665, 90), 665); // Aloalo Island: the cap is the ceiling itself
  // no equip level (generated or hand-made pieces) or no synced level: only the item level cap
  assert.equal(t(790, null, false, null, 50), null);
  assert.equal(t(790, null, true, 700, 50), 700);
  assert.equal(t(790, 100, false, null, null), null);
});

test('at level 100 (the level cap) no real piece is level-synced', () => {
  assert.ok(ROWS.every(r => r.lvl <= 100));
  assert.equal(
    ROWS.filter(
      r => syncTarget({ itemLevel: r.ilvl, equipLevel: r.lvl, scales: r.scales, syncOn: false, cap: null, syncedLevel: 100 }) != null,
    ).length,
    0,
  );
});

/* T13 with Minimum Item Level: level 50 and item level 123 at once. The level only adds pieces at equip level 51 and
   above with item level 123 or less: synced to 130, which is above their item level, so no stat drops. */
test('level 50 with cap 123: 71 pieces are synced by level alone, to item level 130, and keep every stat', () => {
  const sync = { cap: 123, sync: true, level: 50 };
  const levelOnly = ROWS.filter(r => r.lvl > 50 && r.ilvl <= 123);
  assert.equal(levelOnly.length, 71);
  let changed = 0;
  for (const r of ROWS) {
    const now = syncTarget({ itemLevel: r.ilvl, equipLevel: r.lvl, scales: r.scales, syncOn: true, cap: 123, syncedLevel: 50 });
    const before = r.ilvl > 123 ? 123 : null; // item level sync alone
    if (now !== before) changed++;
  }
  assert.equal(changed, 71, 'only the level-only pieces get a new target');
  for (const r of levelOnly) {
    for (const job of jobsOf(r)) {
      const item = poolItemFromRow(job, r);
      assert.equal(itemSyncIlvl(item, sync), 130, r.name);
      assert.deepEqual(effStats(job, item, sync), item.stats, `${r.name} (${job.jobId})`);
      // a direct clamp to the item level 130 caps (not relying on "at or below the cap is untouched") lowers nothing
      const c = capsFor(job, r.type, 130, r.pct, kindFactors(job, r.kind));
      const raw = dbStats(job, r.st);
      for (const s of job.stats) assert.ok((raw[s] || 0) <= c[s], `${r.name} ${job.jobId} ${s} ${raw[s]} > ${c[s]}`);
    }
  }
});

/* Gear whose item level follows the wearer's level (Item.SubStatCategory 2; the game's description: "IL and attributes
   synced to current job level."). Below the level its item level is for, it is synced to the level's item level
   whatever its equip level, or to the item level cap where that is lower. Expected item levels for the boost gear are
   the Wiki's artifact armor values: 548 at level 89, 678 at level 99. */
test('syncTarget: gear that scales with the level follows the level whatever its equip level', () => {
  const t = (itemLevel, equipLevel, syncOn, cap, syncedLevel) =>
    syncTarget({ itemLevel, equipLevel, scales: true, syncOn, cap, syncedLevel });
  assert.equal(t(430, 1, false, null, 50), 130); // equip level 1: plain level sync would leave it
  assert.equal(t(430, 1, false, null, 70), 400);
  assert.equal(t(430, 1, false, null, 80), null); // 530 is above its own item level
  assert.equal(t(430, 1, true, 123, 50), 123); // the item level cap is lower
  assert.equal(t(430, 1, true, 135, 50), 130); // the level's item level is lower
  assert.equal(t(430, 1, true, 290, 80), 290); // only the item level cap applies
  assert.equal(t(690, 99, false, null, 99), 678);
  assert.equal(t(560, 89, false, null, 89), 548);
  assert.equal(t(690, 99, false, null, 100), null);
  assert.equal(t(430, 1, false, null, null), null); // no synced level
  assert.equal(syncTarget({ itemLevel: 430, equipLevel: 1, scales: false, syncOn: false, cap: null, syncedLevel: 50 }), null);
});

test('scaling gear: every real piece drops to the level item level at its own level, and none is synced at 100', () => {
  const scaling = ROWS.filter(r => r.scales);
  assert.ok(scaling.length > 200); // 260 in the current data; new field operation gear adds more
  const target = (r, level) =>
    syncTarget({ itemLevel: r.ilvl, equipLevel: r.lvl, scales: true, syncOn: false, cap: null, syncedLevel: level });
  for (const r of scaling) {
    assert.equal(target(r, 100), null, r.name);
    if (r.lvl === 89) assert.equal(target(r, 89), 548, r.name);
    if (r.lvl === 99) assert.equal(target(r, 99), 678, r.name);
  }
  // the Wiki's artifact armor: a level 99 head at item level 690 is 678 at level 99
  const visor = ROWS.find(r => r.name === 'Asklepian Visor');
  assert.ok(visor.scales && visor.ilvl === 690 && visor.lvl === 99);
  // Bozjan Earring (equip level 71, item level 430): at level 75 plain level sync leaves it, the scaling rule does not
  const bozja = ROWS.find(r => r.name === 'Bozjan Earring');
  assert.ok(bozja.scales);
  assert.equal(target(bozja, 75), levelSyncIlvl(75));
  assert.ok(levelSyncIlvl(75) < 430);
});

test("Menphina's Earring at level 50: synced to item level 130, its stats capped at the 130 earring caps", () => {
  const row = ROWS.find(r => r.name === "Menphina's Earring");
  assert.ok(row.scales && row.lvl === 1 && row.ilvl === 430);
  for (const job of [sge, makeJobContext('WAR'), makeJobContext('BST')]) {
    const item = poolItemFromRow(job, row);
    const sync = { cap: null, sync: false, level: 50 };
    assert.equal(itemSyncIlvl(item, sync), 130, job.jobId);
    const c = capsFor(job, row.type, 130, row.pct, kindFactors(job, row.kind));
    const eff = effStats(job, item, sync);
    for (const s of job.stats) assert.equal(eff[s] || 0, Math.min(item.stats[s] || 0, c[s]), `${job.jobId} ${s}`);
    assert.ok(eff.main < item.stats.main, `${job.jobId}: main stat lowered`);
    assert.deepEqual(effStats(job, item, { cap: null, sync: false, level: 100 }), item.stats);
  }
});

/* A level 90 roulette: level sync to 90, no item level sync. A level 100 healer head piece is capped at the item level
   660 head values, derived here from the ItemLevel row and the head share (85 per mille), Vitality x 0.9 for Mind
   gear, rounded half up each time. */
test('level 90, item level sync off: level 100 head pieces are capped at the item level 660 head values', () => {
  // every level 100 healer head piece at item level 780 or more (each has a main stat above the 660 cap)
  const rows = browseItems(sge, { type: 'head', ilvlMin: 780, lvlMax: 100 }).filter(r => r.lvl === 100);
  assert.ok(rows.length >= 2);
  const head = col => roundHalfUp((IL[col][660] * SLOT_PERMILLE.head) / 1000);
  const cap = {
    main: head('mind'),
    vit: roundHalfUp(head('vit') * 0.9),
    crit: head('crit'),
    det: head('det'),
    dh: head('dh'),
    spd: head('sps'),
    spec: head('piety'),
  };
  assert.deepEqual([cap.main, cap.vit, cap.crit], [248, 249, 184]);
  for (const row of rows) {
    const item = poolItemFromRow(sge, row);
    const eff = effStats(sge, item, { cap: null, sync: false, level: 90 });
    assert.ok(item.stats.main > cap.main, row.name);
    for (const s of sge.stats) assert.equal(eff[s] || 0, Math.min(item.stats[s] || 0, cap[s]), `${row.name} ${s}`);
    // at level 100 the same piece is untouched
    assert.deepEqual(effStats(sge, item, { cap: null, sync: false, level: 100 }), item.stats);
  }
  // level 90 gear at item level 665 is not level-synced at level 90 (equip level not above it)
  const relic = ROWS.find(r => r.lvl === 90 && r.ilvl === 665 && r.mask & (1 << sge.jobIndex));
  assert.ok(relic);
  assert.equal(itemSyncIlvl(poolItemFromRow(sge, relic), { cap: null, sync: false, level: 90 }), null);
});

/* Real gear at item level 663 to 666 (equip levels 90, 94 and 95): at level 90 the level 94 and 95 pieces are synced
   to 660, the level 90 ones are not. */
const WINDOW = { ilvlMin: 663, ilvlMax: 666, lvlMax: 100 };
for (const id of ['SGE', 'WAR', 'PLD']) {
  test(`optimizer equals the exhaustive reference under level sync (${id}, level 90, item level 663 to 666)`, () => {
    const job = makeJobContext(id);
    const pool = gamePool(job, WINDOW);
    assert.ok(loadoutCount(job, pool) <= 20000);
    const levelOnly = { cap: null, sync: false, level: 90 };
    assert.ok(pool.some(i => itemSyncIlvl(i, levelOnly) === 660) && pool.some(i => itemSyncIlvl(i, levelOnly) == null));
    let differs = false;
    for (const sync of [levelOnly, { cap: 662, sync: true, level: 90 }, { cap: 664, sync: true, level: 90 }]) {
      for (const [target, tiebreak] of [
        ['spd', ['main', 'vit']],
        ['crit', ['det']],
        ['main', []],
      ]) {
        const r = optimize(job, pool, sync, { target, tiebreak });
        const want = exhaustive(job, pool, sync, { target, tiebreak });
        assert.deepEqual(
          [target, ...tiebreak].map(k => r.totals[k]),
          want,
          `${JSON.stringify(sync)} ${target}`,
        );
        const free = optimize(job, pool, { cap: null, sync: false, level: 100 }, { target, tiebreak });
        if (free.totals[target] !== r.totals[target]) differs = true;
      }
    }
    assert.ok(differs, 'level sync changes at least one best total');
  });
}

/* capCeiling is the best gear made for a level: the Wiki's table (Item Level page, "Item Level vs. Class Level") at the
   level caps, 130 for armor and 5 more for weapons; between them the level's own item level. Real duties
   (ContentFinderCondition at datamining d9582a6): the highest cap at each synced level below 100 is at or under it, so
   holding gear made for a higher level to it changes no real duty. At 100 no gear is made for a higher level. */
test('capCeiling: the best gear made for a level, at or above the highest real cap there', () => {
  assert.deepEqual([50, 55, 60, 70, 75, 80, 90, 95, 99].map(capCeiling), [135, 136, 275, 405, 406, 535, 665, 666, 678]);
  // [level, highest cap a real duty has there]
  for (const [level, cap] of [
    [15, 5],
    [50, 135],
    [60, 240],
    [70, 395],
    [75, 406],
    [80, 525],
    [90, 665],
    [92, 655],
    [94, 663],
    [95, 666],
    [98, 675],
  ]) {
    assert.ok(cap <= capCeiling(level), `level ${level}: cap ${cap} above ${capCeiling(level)}`);
  }
  assert.equal(capCeiling(90), 665); // Mount Rokkon and Aloalo Island, the most above the level's 660
});
