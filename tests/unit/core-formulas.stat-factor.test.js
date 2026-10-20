/* The per-item stat factor (BaseParam MeldParam, picked by the item's BaseParamModifier; docs/mechanics/math.md section 4).
   Expected values are real items from the game data and derivations from raw ItemLevel rows, never the code under
   test. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS, IL, MP } from '../../src/core/tables.js';
import { ALL_JOBS_ACCESSORY_FACTORS, JOBS, ITEM_STAT_ORDER, RAW_MAIN_IDX, ROW } from '../../src/core/constants.js';
import { makeJobContext } from '../../src/core/job-context.js';
import { predictRaw, syncStats, capsFor, jobFactor } from '../../src/core/formulas.js';
import { kindFactors, browseItems, poolItemFromRow, rowStats } from '../../src/core/items.js';
import { effStats } from '../../src/core/piece.js';
import { MODEL_MIN_ILVL } from '../../src/core/validation.js';
import { appState, itemRow, roundHalfUp } from './helpers/common.js';
import { gearViewOf } from './helpers/views.js';

const at = (r, key) => rowStats(r)[ITEM_STAT_ORDER.indexOf(key)];

test("the job's own factor equals the game files' factor on every piece of its own kind", () => {
  // every database piece a job can equip that carries its main stat and only that main stat: the item's factor for the
  // main stat is 100 and its Vitality factor is the job's (90 for Int/Mind, 100 otherwise)
  for (const { id } of JOBS) {
    const job = makeJobContext(id);
    let n = 0;
    for (const r of ITEMS) {
      if (!(r[ROW.jobMask] & (1 << job.jobIndex)) || r[ROW.ilvl] < MODEL_MIN_ILVL) continue;
      const st = rowStats(r);
      const mains = RAW_MAIN_IDX.filter(i => st[i]).map(i => ITEM_STAT_ORDER[i]);
      if (mains.length !== 1 || mains[0] !== job.profile.main) continue;
      n++;
      assert.equal(MP[job.profile.main][r[ROW.kind]], 100, `${id} ${r[ROW.name]}`);
      assert.equal(MP.vit[r[ROW.kind]] / 100, jobFactor(job, 'vit'), `${id} ${r[ROW.name]}`);
    }
    assert.ok(n > 100, id);
  }
});

test('the only pieces whose factors differ from the job rule are kind 0: the four-main-stat pieces and the Main Attribute pieces', () => {
  const odd = new Set();
  for (const { id } of JOBS) {
    const job = makeJobContext(id);
    for (const p of browseItems(job, { ilvlMin: MODEL_MIN_ILVL })) {
      const f = kindFactors(job, p.kind);
      if (f.main !== 1 || f.vit !== jobFactor(job, 'vit')) odd.add(p.name);
    }
  }
  const fourMain = [...odd].filter(name => RAW_MAIN_IDX.every(i => rowStats(itemRow(name))[i]));
  const attr = [...odd].filter(name => rowStats(itemRow(name))[ITEM_STAT_ORDER.indexOf('mainAttr')] > 0);
  assert.equal(fourMain.length, 13);
  // pre-order earrings and Neophyte's Ring carry Main Attribute and are kind 0 (all jobs): main stat and Vitality caps
  // x 0.9 for every job; the 10 Occult accessories have their own kinds and match the job rule. The list of these
  // pieces is the factor table's (core-validation.test.js checks it against the data)
  assert.deepEqual(attr.sort(), Object.keys(ALL_JOBS_ACCESSORY_FACTORS).sort());
  assert.equal(odd.size, fourMain.length + attr.length);
  for (const name of odd) assert.equal(itemRow(name)[ROW.kind], 0, name);
});

test('pieces with all four main stats: every main stat and Vitality at the full value x 0.9', () => {
  // Field Commander's Coat, body (135), item level 160: Mind row 448 -> 60.48 -> 60, x 0.9 = 54; Vitality 444 -> 60 -> 54
  const coat = itemRow("Field Commander's Coat");
  assert.equal(roundHalfUp(roundHalfUp((IL.mind[160] * 135) / 1000) * 0.9), 54);
  assert.equal(roundHalfUp(roundHalfUp((IL.vit[160] * 135) / 1000) * 0.9), 54);
  assert.deepEqual(rowStats(coat).slice(0, 5), [54, 54, 54, 54, 54]);
  const four = ITEMS.filter(r => r[ROW.ilvl] >= MODEL_MIN_ILVL && RAW_MAIN_IDX.every(i => rowStats(r)[i]));
  assert.equal(four.length, 13);
  for (const r of four) assert.deepEqual(predictRaw(r[ROW.ilvl], r[ROW.slotCode], rowStats(r), r[ROW.kind]), rowStats(r), r[ROW.name]);
});

test('Occult accessories at 745: "of Magic" Vitality 307 (x 0.9), "of Blood" 341 (full), from the item, not a job', () => {
  // Vitality row 745 = 5085; x 67 / 1000 = 340.695 -> 341; x 0.9 = 306.9 -> 307
  assert.equal(roundHalfUp((IL.vit[745] * 67) / 1000), 341);
  for (const [name, vit] of [
    ['Occult Earrings of Magic', 307],
    ['Occult Ring of Magic', 307],
    ['Occult Earrings of Blood', 341],
    ['Occult Ring of Blood', 341],
  ]) {
    const r = itemRow(name);
    assert.equal(at(r, 'vit'), vit, name);
    // no main stat on these pieces: the old rule (factor from the main stat) could not predict them at all
    assert.deepEqual(predictRaw(r[ROW.ilvl], r[ROW.slotCode], rowStats(r), r[ROW.kind]), rowStats(r), name);
  }
});

test('an Intelligence accessory every job can wear still has Vitality x 0.9', () => {
  // Alexandrian Earrings of Casting, item level 270: Vitality row 736 x 67 / 1000 = 49.3 -> 49; x 0.9 = 44.1 -> 44
  const r = itemRow('Alexandrian Earrings of Casting');
  assert.equal(r[ROW.jobMask], 2 ** 23 - 1);
  assert.equal(at(r, 'vit'), 44);
  assert.equal(roundHalfUp(roundHalfUp((IL.vit[270] * 67) / 1000) * 0.9), 44);
  assert.deepEqual(predictRaw(r[ROW.ilvl], r[ROW.slotCode], rowStats(r), r[ROW.kind]), rowStats(r));
});

test("sync: a real piece is capped by its own factors; a piece with no item behind it by the job's", () => {
  // cap 123, body (135), caps take the factor first (docs/mechanics/math.md section 5): main floor(355 x 0.9) = 319,
  // floor(319 x 1.35) = 430, 43.0 -> 43; Vitality floor(375 x 0.9) = 337, floor(337 x 1.35) = 454, 45.4 -> 45
  const war = makeJobContext('WAR'),
    sge = makeJobContext('SGE');
  const sync = { cap: 123, sync: true };
  const [coatWar] = browseItems(war, { q: "Field Commander's Coat" }).map(p => poolItemFromRow(war, p));
  assert.deepEqual([effStats(war, coatWar, sync).main, effStats(war, coatWar, sync).vit], [43, 45]);
  const [coatSge] = browseItems(sge, { q: "Field Commander's Coat" }).map(p => poolItemFromRow(sge, p));
  assert.deepEqual([effStats(sge, coatSge, sync).main, effStats(sge, coatSge, sync).vit], [43, 45]);
  // the same stats as a hand-made piece (no database row): the job's caps, main 48, Vitality 51 / 45
  assert.deepEqual([capsFor(war, 'body', 123).main, capsFor(war, 'body', 123).vit], [48, 51]);
  assert.deepEqual([capsFor(sge, 'body', 123).main, capsFor(sge, 'body', 123).vit], [48, 45]);
  const handMade = { ...coatWar, src: 'custom' };
  assert.equal(effStats(war, handMade, sync).main, 48);
  // the gear browser shows the same synced values as the optimizer uses
  const app = appState({ job: 'WAR', sync: true, cap: 123 });
  app.browse = { ...app.browse, q: "Field Commander's Coat" };
  const v = gearViewOf(app);
  assert.equal(v.shown.length, 1);
  assert.deepEqual([v.shown[0].eff.main, v.shown[0].eff.vit], [43, 45]);
  // a piece of the job's own kind is unchanged by the switch: same caps as before
  const helm = ITEMS.find(r => r[ROW.slotCode] === 3 && r[ROW.ilvl] === 130 && r[ROW.kind] === 6);
  const p = browseItems(sge, { q: helm[ROW.name], ilvlMin: 130, ilvlMax: 130 }).find(x => x.slotCode === 3);
  assert.deepEqual(
    syncStats(sge, poolItemFromRow(sge, p).stats, 'head', 123, 130, 85, kindFactors(sge, 6)),
    syncStats(sge, poolItemFromRow(sge, p).stats, 'head', 123, 130),
  );
});
