import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bandAccuracy, wikiChecks, rowItem } from '../../src/core/validation.js';
import { MAX_REAL, MAX_ILVL } from '../../src/core/tables.js';
import { ROW } from '../../src/core/constants.js';
import { rowStats } from '../../src/core/items.js';

test('formula reproduces the Wiki sync caps at item level 475', () => {
  for (const c of wikiChecks()) assert.equal(c.computed, c.published, c.label);
});

test('formula accuracy against every real piece, by item level band', t => {
  for (const b of bandAccuracy()) {
    const exact = b.exact / b.n,
      within1 = b.within1 / b.n;
    t.diagnostic(`band ${b.label} n=${b.n} exact ${(exact * 100).toFixed(1)}% within1 ${(within1 * 100).toFixed(1)}%`);
    assert.ok(exact >= 0.985, `exact share in band ${b.label}: ${exact}`);
    assert.ok(within1 >= 0.985, `within-1 share in band ${b.label}: ${within1}`);
  }
});

test('highest real item level is inside the ItemLevel table', () => {
  assert.ok(MAX_REAL <= MAX_ILVL);
});

/* Real pieces that the three refinements of the formula reproduce (docs/mechanics/math.md, section 4): equal substats share the
   higher rank (relic weapon steps with two full substats), every main stat counts (a few pieces carry Strength and
   Dexterity), and an off-hand is the two-handed value minus the one-handed value. */
test('the formula reproduces relic weapons with two full substats, two main stats, and off-hands', async () => {
  const { ITEMS } = await import('../../src/core/tables.js');
  const { predictRaw } = await import('../../src/core/formulas.js');
  for (const name of [
    'Phantom Staff Eclipticum', // 790: Critical Hit and Spell Speed both 443
    'Hyperconductive Draconomicon', // 230: Determination and Spell Speed both 88
    'Gloam Tabard', // 110: Strength and Dexterity both 41
    'Vanguard Shield', // 672: Critical Hit 63 = 218 - 155
    'Ironworks Magitek Shield', // 120: Tenacity 13 = 47 - 34
  ]) {
    const r = ITEMS.find(x => x[ROW.name] === name);
    assert.ok(r, name);
    const st = rowStats(r);
    assert.deepEqual(predictRaw(r[ROW.ilvl], r[ROW.slotCode], st, r[ROW.kind]), st, name);
  }
});

/* Beastmaster's own gear (job mask exactly its bit), weapons and shields included, follows the same rules exactly. */
test("the formula reproduces every piece of Beastmaster's own gear", async () => {
  const { ITEMS } = await import('../../src/core/tables.js');
  const { predictRaw } = await import('../../src/core/formulas.js');
  const { makeJobContext } = await import('../../src/core/job-context.js');
  const bit = 1 << makeJobContext('BST').jobIndex;
  const own = ITEMS.filter(r => r[ROW.jobMask] === bit);
  assert.ok(own.length >= 30 && own.some(r => r[ROW.slotCode] === 1) && own.some(r => r[ROW.slotCode] === 2));
  for (const r of own) {
    const st = rowStats(r);
    assert.deepEqual(predictRaw(r[ROW.ilvl], r[ROW.slotCode], st, r[ROW.kind], rowItem(r)), st, r[ROW.name]);
  }
});

/* Direct Hit on gear whose only main stat is Mind is a fixed 20% line outside the substat ranking (the old healer
   Accuracy): as the only substat, as the second, and as the third. Direct Hit on other gear ranks like any substat. */
test('Direct Hit on Mind-only gear is a fixed 20% line; elsewhere it ranks normally', async () => {
  const { ITEMS } = await import('../../src/core/tables.js');
  const { predictRaw } = await import('../../src/core/formulas.js');
  for (const name of [
    'Omnilex Novus', // 110: Direct Hit 9, its only substat (20% of 44)
    'Platinum Earrings of Healing', // 110: Direct Hit 4 below Critical Hit (20% of 21, not 70%)
    'Dreadwyrm Cane', // 135: Direct Hit as the third line
    'Augmented Ironworks Magitek Spear', // 130, Strength gear: Direct Hit at a normal rank
  ]) {
    const r = ITEMS.find(x => x[ROW.name] === name);
    assert.ok(r, name);
    const st = rowStats(r);
    assert.deepEqual(predictRaw(r[ROW.ilvl], r[ROW.slotCode], st, r[ROW.kind], rowItem(r)), st, name);
  }
});

/* The rule above replaces a general 20% third share: a third substat exists only as that Direct Hit line. A patch that
   adds another kind of three-substat piece fails here. */
test('every piece with three substats is Mind-only gear whose lowest line is Direct Hit', async () => {
  const { ITEMS } = await import('../../src/core/tables.js');
  const { ITEM_STAT_ORDER, RAW_SUBSTAT_IDX, RAW_MAIN_IDX } = await import('../../src/core/constants.js');
  const { MODEL_MIN_ILVL } = await import('../../src/core/validation.js');
  const mind = ITEM_STAT_ORDER.indexOf('mind'),
    dh = ITEM_STAT_ORDER.indexOf('dh');
  let n = 0;
  for (const r of ITEMS) {
    if (r[ROW.ilvl] < MODEL_MIN_ILVL) continue;
    const st = rowStats(r);
    const subs = RAW_SUBSTAT_IDX.filter(i => st[i]).sort((a, b) => st[b] - st[a]);
    if (subs.length < 3) continue;
    n++;
    assert.equal(subs.length, 3, r[ROW.name]);
    assert.deepEqual(
      RAW_MAIN_IDX.filter(i => st[i]),
      [mind],
      r[ROW.name],
    );
    assert.equal(subs[2], dh, r[ROW.name]);
  }
  assert.ok(n > 100, `three-substat pieces: ${n}`);
});

/* On green, HQ-able Mind-only pieces with three substats the Direct Hit line is 25% (eight item level 110 crafted
   healer pieces, raised in patch 4.0); their blue crafted and green non-HQ siblings keep 20%. */
test('green HQ-able healer pieces with three substats carry Direct Hit at 25%; their siblings at 20%', async () => {
  const { ITEMS } = await import('../../src/core/tables.js');
  const { predictRaw } = await import('../../src/core/formulas.js');
  for (const [name, rarity, hq] of [
    ['Ebony Cane', 2, 1], // two-handed: Direct Hit 11 = 25% of 44
    ['Arachne Robe', 2, 1], // body: 11 = 25% of 42 (10.5 rounds up)
    ['Platinum Circlet of Healing', 2, 1], // head: 7 = 25% of 27
    ["High Adjudicator's Gavel", 3, 1], // blue crafted sibling: 9 = 20% of 44
    ["Bogatyr's Circlet of Healing", 2, 0], // green, not HQ-able: 20%
  ]) {
    const r = ITEMS.find(x => x[ROW.name] === name);
    assert.ok(r, name);
    assert.equal(r[ROW.rarity], rarity, name);
    assert.equal(r[ROW.hq], hq, name);
    const st = rowStats(r);
    assert.deepEqual(predictRaw(r[ROW.ilvl], r[ROW.slotCode], st, r[ROW.kind], rowItem(r)), st, name);
  }
});

/* The 11 Zodiac Atma weapons (item level 100) carry their Zenith step's item level 90 stats; the Animus step at the
   same item level carries item level 100 stats. */
test('Atma weapons are predicted at item level 90; Animus at its own 100', async () => {
  const { ITEMS } = await import('../../src/core/tables.js');
  const { predictRaw } = await import('../../src/core/formulas.js');
  const atma = ITEMS.filter(r => r[ROW.name].endsWith(' Atma'));
  assert.equal(atma.length, 11);
  for (const r of [...atma, ...ITEMS.filter(x => ['Curtana Animus', 'Thyrus Animus'].includes(x[ROW.name]))]) {
    const st = rowStats(r);
    assert.deepEqual(predictRaw(r[ROW.ilvl], r[ROW.slotCode], st, r[ROW.kind], rowItem(r)), st, r[ROW.name]);
  }
});

/* The all-jobs earrings and rings (kind 0 with Main Attribute) were edited by hand; each is predicted exactly with its
   own factors, and the table lists exactly these pieces (a new one after a patch needs an entry). */
test('all-jobs accessories: the factor table covers exactly them, each predicted exactly', async () => {
  const { ITEMS } = await import('../../src/core/tables.js');
  const { predictRaw } = await import('../../src/core/formulas.js');
  const { ALL_JOBS_ACCESSORY_FACTORS, ITEM_STAT_ORDER } = await import('../../src/core/constants.js');
  const ma = ITEM_STAT_ORDER.indexOf('mainAttr');
  const rows = ITEMS.filter(r => r[ROW.kind] === 0 && rowStats(r)[ma]);
  assert.deepEqual(rows.map(r => r[ROW.name]).sort(), Object.keys(ALL_JOBS_ACCESSORY_FACTORS).sort());
  for (const r of rows) {
    const st = rowStats(r);
    assert.deepEqual(predictRaw(r[ROW.ilvl], r[ROW.slotCode], st, r[ROW.kind], rowItem(r)), st, r[ROW.name]);
  }
});

/* Below item level 100 (outside the model's range): three rules every piece follows, each shown by the pieces that
   needed it, and the 18 item level 46 dungeon pieces with reduced stats (by name). */
test('below item level 100: Direct Hit above another substat ranks, a tied third substat, Vitality only when carried', async () => {
  const { ITEMS } = await import('../../src/core/tables.js');
  const { predictRaw } = await import('../../src/core/formulas.js');
  const names = ['Wolf Ringbands', 'Herklaedi', 'Gridanian Ring', 'Lominsan Ring', "Ul'dahn Ring"];
  for (const name of names) {
    const r = ITEMS.find(x => x[ROW.name] === name);
    assert.ok(r, name);
    const st = rowStats(r);
    assert.deepEqual(predictRaw(r[ROW.ilvl], r[ROW.slotCode], st, r[ROW.kind], rowItem(r)), st, name);
  }
});

test('reduced-stat dungeon pieces: the list matches the data, each within 1, all but one exact', async () => {
  const { ITEMS } = await import('../../src/core/tables.js');
  const { predictRaw } = await import('../../src/core/formulas.js');
  const { REDUCED_STAT_PIECES } = await import('../../src/core/constants.js');
  const rows = ITEMS.filter(r => REDUCED_STAT_PIECES.names.has(r[ROW.name]));
  assert.equal(rows.length, REDUCED_STAT_PIECES.names.size);
  let exact = 0;
  for (const r of rows) {
    assert.equal(r[ROW.ilvl], 46, r[ROW.name]);
    const st = rowStats(r);
    const d = Math.max(...predictRaw(r[ROW.ilvl], r[ROW.slotCode], st, r[ROW.kind], rowItem(r)).map((x, i) => Math.abs(x - st[i])));
    assert.ok(d <= 1, r[ROW.name]);
    if (d === 0) exact++;
  }
  assert.equal(exact, rows.length - 1);
});

test('every piece below item level 100 is predicted within 1', async () => {
  const { ITEMS } = await import('../../src/core/tables.js');
  const { predictRaw } = await import('../../src/core/formulas.js');
  const { MODEL_MIN_ILVL } = await import('../../src/core/validation.js');
  const off = ITEMS.filter(r => {
    if (r[ROW.ilvl] >= MODEL_MIN_ILVL) return false;
    const st = rowStats(r);
    return predictRaw(r[ROW.ilvl], r[ROW.slotCode], st, r[ROW.kind], rowItem(r)).some((x, i) => Math.abs(x - st[i]) > 1);
  });
  assert.deepEqual(
    off.map(r => r[ROW.name]),
    [],
  );
});
