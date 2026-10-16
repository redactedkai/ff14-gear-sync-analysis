/* Small helpers shared by the unit tests: seeded random numbers, item lookup by name, store-shaped state, and
   values typed in from outside sources (slot shares, AkhMorning's level table), so tests stay independent of the
   code under test. The brute-force reference and real-gear pools are in exhaustive.js. */
import assert from 'node:assert/strict';
import { ROW } from '../../../src/core/constants.js';
import { makeJobContext } from '../../../src/core/job-context.js';
import { ITEMS, MAX_REAL } from '../../../src/core/tables.js';
import { restoreState } from '../../../src/ui/state.js';

/* A seeded random number generator returning floats in [0, 1): the same seed gives the same sequence, so a failure
   names a case that can be reproduced. */
export function rng(seed) {
  return () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
}

/* A random integer in [0, n) from rng(seed). */
export function rngInt(seed) {
  const rand = rng(seed);
  return n => Math.floor(rand() * n);
}

/* The raw database row of the item named `name` (the first, if several share it); fails the test if there is none. */
export function itemRow(name) {
  const r = ITEMS.find(x => x[ROW.name] === name);
  assert.ok(r, name);
  return r;
}

/* Round half up, independent of the code under test (real items at an exact .5 round up). */
export const roundHalfUp = x => Math.floor(x + 0.5 + 1e-9);

/* BaseParam slot shares in per mille, the same for every combat stat (docs/mechanics/math.md, section 2). Typed in
   here, not read from item-format.json, so the tests that use them check the format file too. */
export const SLOT_PERMILLE = {
  weapon2h: 140,
  weapon1h: 100,
  offhand: 40,
  head: 85,
  body: 135,
  hands: 85,
  legs: 135,
  feet: 85,
  ear: 67,
  neck: 67,
  wrist: 67,
  ring: 67,
};

/* A store-shaped state object, as the Alpine store holds it: a save restored by restoreState, plus the job context
   and the highest real item level, then `patch` on top. */
export function appState(saved, patch = {}) {
  const s = restoreState(saved);
  return Object.assign(s, { jobCtx: makeJobContext(s.job), maxReal: MAX_REAL }, patch);
}

/* AkhMorning's Level Modifiers table (Allagan Studies), read from the page's script
   (https://www.akhmorning.com/allagan-studies/modifiers/levelmods/), 2026-10-16: [MAIN, SUB, DIV] by level. All 100
   rows equal ours (checked once; these are a sample). */
export const AKH_LEVEL = {
  1: [20, 56, 56],
  15: [46, 96, 96],
  30: [97, 173, 173],
  50: [202, 341, 341],
  60: [218, 354, 600],
  70: [292, 364, 900],
  80: [340, 380, 1300],
  90: [390, 400, 1900],
  100: [440, 420, 2780],
};
