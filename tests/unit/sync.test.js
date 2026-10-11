import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeJobContext } from '../../src/core/job-context.js';
import { capsFor, syncStats } from '../../src/core/formulas.js';
import { browseItems, poolItemFromRow } from '../../src/core/items.js';
import { IL } from '../../src/core/tables.js';

const sge = makeJobContext('SGE');
const blm = makeJobContext('BLM');
const pld = makeJobContext('PLD');

/* A real item level 130 healer head piece from the game files, chosen by its properties: Spell Speed above the
   head cap at 123 (29) and at least one substat below it, so the clamp both applies and leaves a stat alone. */
const HEAD_CAP_123 = { sub: 29, main: 30 }; // head caps at item level 123 (substat, main stat), docs/math.md

/* Head caps derived here, independently of capsFor / pieceValue: the raw ItemLevel row times the head slot share
   (85 per mille, BaseParam; the Wiki's item level 475 head cap 112 = round(1314 x 0.085) confirms it), rounded;
   Vitality for an Int/Mind job is then x 0.9 and rounded again. Only the healer's columns are needed here. */
const HEAD_PCT = 85;
const headCap = (col, ilvl) => Math.round((IL[col][ilvl] * HEAD_PCT) / 1000);
function healerHeadCaps(ilvl) {
  return {
    main: headCap('mind', ilvl),
    vit: Math.round(headCap('vit', ilvl) * 0.9),
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

test('the head caps at 123 follow from the raw ItemLevel row (346 substat, 355 main) and the 85 per mille share', () => {
  assert.equal(IL.sps[123], 346);
  assert.equal(IL.mind[123], 355);
  const c = healerHeadCaps(123);
  assert.equal(c.spd, HEAD_CAP_123.sub);
  assert.equal(c.main, HEAD_CAP_123.main);
});

test('the real head piece exists and has stats on both sides of the 123 cap', () => {
  assert.ok(hood);
  assert.ok(hood.main > HEAD_CAP_123.main);
});

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
  const c = healerHeadCaps(129); // main 32, Vitality 32, substats 31
  assert.deepEqual([c.main, c.vit, c.spd], [32, 32, 31]);
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
