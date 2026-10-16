/* The sync clamp (syncStats, src/core/formulas.js) at its edges: at, below and one above the cap, on a real piece, with
   the caps derived from the raw ItemLevel rows; plus the Wiki's item level 475 caps for Paladin's weapon and shield. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeJobContext } from '../../src/core/job-context.js';
import { capsFor, syncStats } from '../../src/core/formulas.js';
import { browseItems, poolItemFromRow } from '../../src/core/items.js';
import { IL } from '../../src/core/tables.js';
import { SLOT_PERMILLE } from './helpers/common.js';

const sge = makeJobContext('SGE');
const blm = makeJobContext('BLM');
const pld = makeJobContext('PLD');

/* A real item level 130 healer head piece from the game files, chosen by its properties: Spell Speed above the
   head cap at 123 (29) and at least one substat below it, so the clamp both applies and leaves a stat alone. */
const HEAD_CAP_123 = { sub: 29, main: 30 }; // head caps at item level 123 (substat, main stat), docs/mechanics/math.md

/* Head caps derived here, independently of capsFor / pieceValue: the raw ItemLevel row times the head slot share
   (85 per mille, BaseParam; the Wiki's item level 475 head cap 112 = round(1314 x 0.085) confirms it), rounded.
   Vitality for an Int/Mind job takes its 90% first: floor(row x 0.9), then floor(x 85 / 100), then / 10 rounded
   (the cap order of in-game sync values; docs/mechanics/math.md section 5). Only the healer's columns are needed here. */
const HEAD_PCT = SLOT_PERMILLE.head;
const headCap = (col, ilvl) => Math.round((IL[col][ilvl] * HEAD_PCT) / 1000);
const headCapFactor = (col, ilvl, f) => Math.round(Math.floor((Math.floor((IL[col][ilvl] * f) / 100) * HEAD_PCT) / 100) / 10);
function healerHeadCaps(ilvl) {
  return {
    main: headCap('mind', ilvl),
    vit: headCapFactor('vit', ilvl, 90),
    crit: headCap('crit', ilvl),
    det: headCap('det', ilvl),
    dh: headCap('dh', ilvl),
    spd: headCap('sps', ilvl),
    spec: headCap('piety', ilvl),
  };
}
const hood = browseItems(sge, { type: 'head', ilvlMin: 130, ilvlMax: 130, lvlMax: 50 })
  .map(r => poolItemFromRow(sge, r).stats)
  .find(st => st.spd > HEAD_CAP_123.sub && sge.substats.some(k => st[k] > 0 && st[k] < HEAD_CAP_123.sub));
assert.ok(hood && hood.main > HEAD_CAP_123.main, 'a real item level 130 healer head piece with stats on both sides of the 123 cap');

test('an item exactly at the cap is untouched (and returned as a copy)', () => {
  const out = syncStats(sge, hood, 'head', 130, 130);
  assert.deepEqual(out, hood);
  assert.notEqual(out, hood);
});

test('an item below the cap is untouched even if its stats exceed the cap values', () => {
  const big = { main: 99, vit: 99, crit: 99, det: 99, dh: 99, spd: 99, spec: 99 };
  assert.deepEqual(syncStats(sge, big, 'head', 123, 100), big);
});

test('one item level above the cap clamps every stat (head at cap 123: substats 29, main 30)', () => {
  const out = syncStats(sge, hood, 'head', 123, 124);
  assert.equal(out.spd, 29);
  assert.equal(out.main, 30);
  for (const k of sge.substats) assert.equal(out[k], Math.min(hood[k], HEAD_CAP_123.sub), k); // lower ones untouched
  const c = healerHeadCaps(123);
  for (const k of Object.keys(out)) assert.equal(out[k], Math.min(hood[k], c[k]), k);
});

test('the head piece one item level below its own: capped at the 129 values (from the raw table, not capsFor)', () => {
  // main 32, Vitality 31 (floor(409 x 0.9) = 368, floor(368 x 0.85) = 312, 31.2 -> 31; the item-stat order gives 32),
  // substats 31
  const c = healerHeadCaps(129);
  assert.deepEqual([c.main, c.vit, c.spd], [32, 31, 31]);
  const out = syncStats(sge, hood, 'head', 129, 130);
  for (const k of Object.keys(hood)) assert.equal(out[k], Math.min(hood[k], c[k]), k);
});

test('item level unknown (null) is treated as above the cap', () => {
  assert.equal(syncStats(sge, hood, 'head', 123, null).spd, 29);
  assert.equal(syncStats(sge, hood, 'head', 123).spd, 29);
});

test('a job without a spec stat has its spec capped to 0', () => {
  assert.equal(capsFor(blm, 'head', 123).spec, 0);
  assert.equal(syncStats(blm, { spec: 40, spd: 10 }, 'head', 123, 200).spec, 0);
  assert.ok(capsFor(sge, 'head', 123).spec > 0);
});

test('missing stat keys are treated as 0', () => {
  const out = syncStats(sge, { spd: 50 }, 'body', 123, 200);
  assert.deepEqual(out, { main: 0, vit: 0, crit: 0, det: 0, dh: 0, spd: 47, spec: 0 });
});

// FFXIV Wiki, Item Level Sync page: substat caps at item level 475
test('Paladin caps at item level 475 match the Wiki (1H weapon 131, shield 53)', () => {
  assert.equal(capsFor(pld, 'weapon', 475).crit, 131);
  assert.equal(capsFor(pld, 'offhand', 475).crit, 53);
  assert.equal(capsFor(pld, 'offhand', 475).spd, 53);
});
