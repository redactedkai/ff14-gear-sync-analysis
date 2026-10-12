/* The per-item stat factor (BaseParam MeldParam, picked by the item's BaseParamModifier; docs/mechanics/math.md section 4).
   Expected values are real items from the game data and derivations from raw ItemLevel rows, never the code under
   test. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS, IL, MP, MAX_REAL } from '../../src/core/tables.js';
import { JOBS, ITEM_STAT_ORDER, RAW_MAIN_IDX } from '../../src/core/constants.js';
import { makeJobContext } from '../../src/core/job-context.js';
import { predictRaw, syncStats, capsFor, jobFactor } from '../../src/core/formulas.js';
import { kindFactors, browseItems, poolItemFromRow } from '../../src/core/items.js';
import { effStats } from '../../src/core/optimizer/index.js';
import { gearView } from '../../src/ui/views/gear.js';
import { restoreState } from '../../src/ui/state.js';

const row = name => {
  const r = ITEMS.find(x => x[0] === name);
  assert.ok(r, name);
  return r;
};
const stats = r => r[5].split(',').map(Number);
const at = (r, key) => stats(r)[ITEM_STAT_ORDER.indexOf(key)];
const rnd = x => Math.floor(x + 0.5 + 1e-9);

test("the job's own factor equals the game files' factor on every piece of its own kind", () => {
  // every database piece a job can equip that carries its main stat and only that main stat: the item's factor for the
  // main stat is 100 and its Vitality factor is the job's (90 for Int/Mind, 100 otherwise)
  for (const [id] of JOBS) {
    const job = makeJobContext(id);
    let n = 0;
    for (const r of ITEMS) {
      if (!(r[4] & (1 << job.jobIndex))) continue;
      const st = stats(r);
      const mains = RAW_MAIN_IDX.filter(i => st[i]).map(i => ITEM_STAT_ORDER[i]);
      if (mains.length !== 1 || mains[0] !== job.profile.main) continue;
      n++;
      assert.equal(MP[job.profile.main][r[9]], 100, `${id} ${r[0]}`);
      assert.equal(MP.vit[r[9]] / 100, jobFactor(job, 'vit'), `${id} ${r[0]}`);
    }
    assert.ok(n > 100, id);
  }
});

test('the only pieces whose factors differ from the job rule are kind 0: the four-main-stat pieces and the Main Attribute pieces', () => {
  const odd = new Set();
  for (const [id] of JOBS) {
    const job = makeJobContext(id);
    for (const p of browseItems(job, {})) {
      const f = kindFactors(job, p.kind);
      if (f.main !== 1 || f.vit !== jobFactor(job, 'vit')) odd.add(p.name);
    }
  }
  const fourMain = [...odd].filter(name => RAW_MAIN_IDX.every(i => stats(row(name))[i]));
  const attr = [...odd].filter(name => stats(row(name))[ITEM_STAT_ORDER.indexOf('mainAttr')] > 0);
  assert.equal(fourMain.length, 13);
  // pre-order earrings and Neophyte's Ring carry Main Attribute and are kind 0 (all jobs): main stat and Vitality caps
  // x 0.9 for every job; the 10 Occult accessories have their own kinds and match the job rule
  assert.deepEqual(attr.sort(), [
    'Aetheryte Earring',
    "Azeyma's Earrings",
    'Bozjan Earring',
    "Halone's Earring",
    "Menphina's Earring",
    "Neophyte's Ring",
  ]);
  assert.equal(odd.size, fourMain.length + attr.length);
  for (const name of odd) assert.equal(row(name)[9], 0, name);
});

test('pieces with all four main stats: every main stat and Vitality at the full value x 0.9', () => {
  // Field Commander's Coat, body (135), item level 160: Mind row 448 -> 60.48 -> 60, x 0.9 = 54; Vitality 444 -> 60 -> 54
  const coat = row("Field Commander's Coat");
  assert.equal(rnd(rnd((IL.mind[160] * 135) / 1000) * 0.9), 54);
  assert.equal(rnd(rnd((IL.vit[160] * 135) / 1000) * 0.9), 54);
  assert.deepEqual(stats(coat).slice(0, 5), [54, 54, 54, 54, 54]);
  const four = ITEMS.filter(r => RAW_MAIN_IDX.every(i => stats(r)[i]));
  assert.equal(four.length, 13);
  for (const r of four) assert.deepEqual(predictRaw(r[2], r[1], stats(r), r[9]), stats(r), r[0]);
});

test('Occult accessories at 745: "of Magic" Vitality 307 (x 0.9), "of Blood" 341 (full), from the item, not a job', () => {
  // Vitality row 745 = 5085; x 67 / 1000 = 340.695 -> 341; x 0.9 = 306.9 -> 307
  assert.equal(rnd((IL.vit[745] * 67) / 1000), 341);
  for (const [name, vit] of [
    ['Occult Earrings of Magic', 307],
    ['Occult Ring of Magic', 307],
    ['Occult Earrings of Blood', 341],
    ['Occult Ring of Blood', 341],
  ]) {
    const r = row(name);
    assert.equal(at(r, 'vit'), vit, name);
    // no main stat on these pieces: the old rule (factor from the main stat) could not predict them at all
    assert.deepEqual(predictRaw(r[2], r[1], stats(r), r[9]), stats(r), name);
  }
});

test('an Intelligence accessory every job can wear still has Vitality x 0.9', () => {
  // Alexandrian Earrings of Casting, item level 270: Vitality row 736 x 67 / 1000 = 49.3 -> 49; x 0.9 = 44.1 -> 44
  const r = row('Alexandrian Earrings of Casting');
  assert.equal(r[4], 2 ** 22 - 1);
  assert.equal(at(r, 'vit'), 44);
  assert.equal(rnd(rnd((IL.vit[270] * 67) / 1000) * 0.9), 44);
  assert.deepEqual(predictRaw(r[2], r[1], stats(r), r[9]), stats(r));
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
  const app = Object.assign(restoreState({ job: 'WAR', sync: true, cap: 123 }), { jobCtx: war, maxReal: MAX_REAL, poolVersion: 0 });
  app.browse = { ...app.browse, q: "Field Commander's Coat" };
  const v = gearView(app);
  assert.equal(v.all.length, 1);
  assert.deepEqual([v.all[0].eff.main, v.all[0].eff.vit], [43, 45]);
  // a piece of the job's own kind is unchanged by the switch: same caps as before
  const helm = ITEMS.find(r => r[1] === 3 && r[2] === 130 && r[9] === 6);
  const p = browseItems(sge, { q: helm[0], ilvlMin: 130, ilvlMax: 130 }).find(x => x.slotCode === 3);
  assert.deepEqual(
    syncStats(sge, poolItemFromRow(sge, p).stats, 'head', 123, 130, 85, kindFactors(sge, 6)),
    syncStats(sge, poolItemFromRow(sge, p).stats, 'head', 123, 130),
  );
});
