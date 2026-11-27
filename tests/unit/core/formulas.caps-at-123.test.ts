/* The sync caps at item level 123, checked against game data without calling capsFor.

   The game has no gear at item level 123 (Item.csv jumps from 120 to 125), so no real piece carries the 123 caps
   directly. What the data does allow:
   1. real pieces at 120 and 125, in every slot, carry round(ItemLevel row x slot percent) as their main stat and
      their largest substat (the rule the caps come from, checked on both sides of 123);
   2. the 123 caps derived from the raw ItemLevel row 123 and the BaseParam slot percents typed into the tests
      (SLOT_PERMILLE in helpers/common.ts, not read from item-format.json) equal what the page uses (capsFor), for a
      healer, a Strength job and Paladin;
   3. the ten armor and accessory substat caps sum to 296, a 2.22 s GCD at level 50 (AkhMorning's table, see
      core/speed.test.ts), and the generic-piece optimizer reaches exactly that sum.
   Expected values come from the game data (ItemLevel rows, real items) and BaseParam, never from capsFor. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SlotType, StatKey } from '../../../src/core/types.ts';
import { makeJobContext } from '../../../src/core/job-context.ts';
import { capsFor } from '../../../src/core/formulas.ts';
import { genericItems, rowStats } from '../../../src/core/items.ts';
import { ROW } from '../../../src/core/constants.ts';
import { optimize } from '../../../src/core/optimizer/index.ts';
import { gcdFor } from '../../../src/core/speed.ts';
import { IL, ITEMS } from '../../../src/core/tables.ts';
import { SLOT_PERMILLE, roundHalfUp } from '../helpers/common.ts';

// Raw row layout (src/core/item-format.json): [name, slot code, item level, equip level, job mask, "12 stats", unique];
// stats are str, dex, int, mind, vit, then seven substats.
type CapSlot = keyof typeof SLOT_PERMILLE;
const SLOT_CODE: Record<CapSlot, number> = {
  weapon2h: 0,
  weapon1h: 1,
  offhand: 2,
  head: 3,
  body: 4,
  hands: 5,
  legs: 6,
  feet: 7,
  ear: 8,
  neck: 9,
  wrist: 10,
  ring: 11,
};
const SLOT_NAMES: CapSlot[] = ['weapon2h', 'weapon1h', 'offhand', 'head', 'body', 'hands', 'legs', 'feet', 'ear', 'neck', 'wrist', 'ring'];
const ARMOR: (SlotType & CapSlot)[] = ['head', 'body', 'hands', 'legs', 'feet', 'ear', 'neck', 'wrist', 'ring'];

// round(a x p / 1000), half up: real items at an exact .5 round up (e.g. 1H swords at 780: 570.5 -> 571).
const share = (a: number | undefined, pct: number) => roundHalfUp(((a ?? 0) * pct) / 1000);
// An off-hand is the two-handed value minus the one-handed value (140 - 100 = 40 per mille; docs/mechanics/math.md, section 3).
const full = (a: number | undefined, slot: CapSlot) =>
  slot === 'offhand' ? share(a, SLOT_PERMILLE.weapon2h) - share(a, SLOT_PERMILLE.weapon1h) : share(a, SLOT_PERMILLE[slot]);
// Every stat column of ItemLevel has the same value for all main stats and for all substats (checked below).
const derived = (ilvl: number, slot: CapSlot) => ({ main: full(IL.str[ilvl], slot), sub: full(IL.crit[ilvl], slot) });

function realPieces(ilvl: number, slot: CapSlot) {
  return ITEMS.filter(r => r[ROW.ilvl] === ilvl && r[ROW.slotCode] === SLOT_CODE[slot])
    .map(r => rowStats(r))
    .filter(st => Math.max(...st.slice(0, 4)) > 0 && Math.max(...st.slice(5)) > 0); // has a main stat and a substat
}

test('the game has no gear at item level 123, so the 123 caps are derived, not read off a real piece', () => {
  // If a patch adds item level 123 gear, compare it with the caps here and promote them to external truth.
  assert.equal(ITEMS.filter(r => r[ROW.ilvl] === 123).length, 0);
  assert.ok(realPieces(120, 'head').length > 0 && realPieces(125, 'head').length > 0);
});

test('ItemLevel rows 120, 123, 125: one value for all main stats and one for all substats', () => {
  const subs: StatKey[] = ['piety', 'ten', 'dh', 'crit', 'det', 'sks', 'sps'];
  for (const L of [120, 123, 125]) {
    for (const k of ['dex', 'int', 'mind'] as const) {
      assert.equal(IL[k][L], IL.str[L], `${k} ${L}`);
    }
    for (const k of subs) {
      assert.equal(IL[k][L], IL.crit[L], `${k} ${L}`);
    }
  }
  assert.deepEqual([IL.str[123], IL.crit[123]], [355, 346]);
});

test('real pieces at 120 and 125 carry round(row x slot percent) as main stat and largest substat, in every slot', () => {
  for (const L of [120, 125]) {
    for (const slot of SLOT_NAMES) {
      const pieces = realPieces(L, slot);
      assert.ok(pieces.length > 0, `${slot} ${L}: real pieces`);
      const want = derived(L, slot);
      for (const st of pieces) {
        assert.equal(Math.max(...st.slice(0, 4)), want.main, `${slot} ${L}: main stat`);
      }
      const top = Math.max(...pieces.map(st => Math.max(...st.slice(5))));
      // the two item level 120 shields carry Tenacity 13: 2H 47 - 1H 34 (the plain 40 share would give 14)
      assert.equal(top, want.sub, `${slot} ${L}: largest substat`);
    }
  }
});

const CAPS_123 = Object.fromEntries(SLOT_NAMES.map(slot => [slot, derived(123, slot)]));
/* The derived caps (substat, main stat) of a slot at 123. */
function capsOf(slot: CapSlot): { main: number; sub: number } {
  const caps = capsOf(slot);
  assert.ok(caps, slot);
  return caps;
}

test('derived caps at 123: substats 29 / 47 / 23 / 48, main stat 30 / 48 / 24 / 50 (docs/mechanics/math.md)', () => {
  const pick = (s: CapSlot) => [capsOf(s).sub, capsOf(s).main];
  const picks = (...slots: CapSlot[]) => slots.map(pick);
  assert.deepEqual(picks('head', 'hands', 'feet'), Array(3).fill([29, 30]));
  assert.deepEqual(picks('body', 'legs'), Array(2).fill([47, 48]));
  assert.deepEqual(picks('ear', 'neck', 'wrist', 'ring'), Array(4).fill([23, 24]));
  assert.deepEqual(pick('weapon2h'), [48, 50]);
  assert.deepEqual(
    [pick('weapon1h'), pick('offhand')],
    [
      [35, 36],
      [13, 14],
    ],
  ); // Paladin
});

test('the caps the page uses at 123 equal the derived caps, for a healer and a Strength job', () => {
  for (const id of ['SGE', 'WAR']) {
    const job = makeJobContext(id);
    const slots: [type: SlotType, slot: CapSlot][] = [...ARMOR.map((slot): [SlotType, CapSlot] => [slot, slot]), ['weapon', 'weapon2h']];
    for (const [type, slot] of slots) {
      const c = capsFor(job, type, 123);
      assert.equal(c[job.mainKey], capsOf(slot).main, `${id} ${slot} main`);
      for (const k of job.substats) {
        assert.equal(c[k], capsOf(slot).sub, `${id} ${slot} ${k}`);
      }
    }
  }
  const pld = makeJobContext('PLD');
  const shieldSlots: [type: SlotType, slot: CapSlot][] = [
    ['weapon', 'weapon1h'],
    ['offhand', 'offhand'],
  ];
  for (const [type, slot] of shieldSlots) {
    const c = capsFor(pld, type, 123);
    assert.deepEqual([c.str, c.sks, c.ten], [capsOf(slot).main, capsOf(slot).sub, capsOf(slot).sub], `PLD ${slot}`);
  }
});

test('caps at 123 for the one-handed weapon and shield of White Mage and Black Mage (Vitality factor 90)', () => {
  // Vitality: budget row 123 x 90%, floored, then the slot share, floored, in tenths (docs/mechanics/math.md, section 5)
  const afterFactor = Math.floor(((IL.vit[123] ?? 0) * 90) / 100); // 337
  const oneHanded = Math.round(Math.floor((afterFactor * SLOT_PERMILLE.weapon1h) / 100) / 10); // 34
  const twoHanded = Math.round(Math.floor((afterFactor * SLOT_PERMILLE.weapon2h) / 100) / 10); // 47
  assert.deepEqual([afterFactor, oneHanded, twoHanded - oneHanded], [337, 34, 13]);
  for (const id of ['WHM', 'BLM']) {
    const job = makeJobContext(id);
    const handSlots: [type: SlotType, slot: CapSlot, vit: number][] = [
      ['weapon', 'weapon1h', oneHanded],
      ['offhand', 'offhand', twoHanded - oneHanded],
    ];
    for (const [type, slot, vit] of handSlots) {
      const c = capsFor(job, type, 123);
      assert.deepEqual(
        [c[job.mainKey], c.vit, ...job.substats.map(k => c[k])],
        [capsOf(slot).main, vit, ...job.substats.map(() => capsOf(slot).sub)],
        `${id} ${slot}`,
      );
    }
  }
});

test('generic maximum at 123: ten armor and accessory caps sum to 296, a 2.22 s GCD at level 50', () => {
  const twoRings: CapSlot[] = [...ARMOR, 'ring'];
  const sum = twoRings.reduce((t, s) => t + capsOf(s).sub, 0); // two rings
  assert.equal(sum, 296);
  assert.equal(gcdFor(sum, 50), 2.22);
  for (const id of ['SGE', 'WAR']) {
    const job = makeJobContext(id);
    const gen = genericItems(job, 475, job.substats, ARMOR);
    const r = optimize(job, gen, { cap: 123, sync: true }, { target: job.speedKey });
    assert.ok(r.ok, id);
    assert.equal(r.totals[job.speedKey], sum, id);
  }
});
