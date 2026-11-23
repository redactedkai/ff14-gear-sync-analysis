/* Small helpers shared by the unit tests: seeded random numbers, item lookup by name, store-shaped state, values
   typed in from outside sources (slot shares, AkhMorning's level table), so tests stay independent of the code under
   test, and a stand-in for Alpine's $watch. The brute-force reference and real-gear pools are in exhaustive.js. */
import assert from 'node:assert/strict';
import { ROW } from '../../../src/core/constants.js';
import { browseItems, poolItemFromRow } from '../../../src/core/items.js';
import { makeJobContext } from '../../../src/core/job-context.js';
import { ITEMS, MAX_REAL } from '../../../src/core/tables.js';
import { restoreState } from '../../../src/ui/state.js';
import { defaultFillSettings, fillRecipe } from '../../../src/ui/sheets/fill-settings.js';

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

/* The real item named `name` as `job`'s pool item (poolItemFromRow), searched over every item level and type; fails
   the test, naming the item, if there is none. */
export function piece(job, name) {
  const r = browseItems(job, { q: name, type: 'any', ilvlMin: 1, ilvlMax: 999, lvlMax: 100 }).find(x => x.name === name);
  assert.ok(r, name);
  return poolItemFromRow(job, r);
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

/* A saved state restored for the screen it names: a test's save may hold `tab` and `mathTab` (the page no longer saves them; the
   address names the open tab, so restoreState takes them apart from the save). Returns restoreState's state. */
export function restoreOpen(saved) {
  if (saved === null || typeof saved !== 'object') return restoreState(saved);
  const { tab, mathTab, ...rest } = saved;
  return restoreState(rest, { tab, mathTab });
}

/* A store-shaped state object, as the Alpine store holds it: a save restored by restoreState, plus the job context
   and the highest real item level, and `recipe`, a set's recipe at its Auto-fill settings' defaults for the job
   (sheets/fill-settings.js fillRecipe), then `patch` on top. */
export function appState(saved, patch = {}) {
  const s = restoreState(saved);
  const jobCtx = makeJobContext(s.job);
  return Object.assign(s, { jobCtx, maxReal: MAX_REAL, recipe: fillRecipe(defaultFillSettings(jobCtx)) }, patch);
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

/* Runs the component's init() with a $watch that, like Alpine's, calls back when a watched property's value changes;
   returns settle(), which delivers the changes made since the last call (Alpine does this after each change). */
export function watched(c) {
  const checks = [];
  c.$watch = (prop, callback) => {
    let last = c[prop];
    checks.push(() => {
      const now = c[prop];
      if (now === last) return;
      const before = last;
      last = now;
      callback(now, before);
    });
  };
  c.init?.();
  return () => {
    for (const check of checks) check();
  };
}

/* True when `text` holds the number `value` as a whole word (hasNumber('Auto-fill 12 slots', 12); 2 is not found in
   '12'). A test of a note or label asserts the numbers the text must reflect, not its sentence. */
export function hasNumber(text, value) {
  return new RegExp(`\\b${value}\\b`).test(text);
}

/* True when `text` holds every one of `parts` (names, stat labels, numbers as text). The same use as hasNumber:
   the inputs a note must show, not its wording. */
export function hasParts(text, ...parts) {
  return parts.every(part => text.includes(part));
}

/* True when a chart's SVG has a text label that starts with the stat value `value` and holds the item level `itemLevel`
   (the chart's "24: at the cap from 140" lines), whatever the words between. */
export function labelled(svg, value, itemLevel) {
  return [...svg.matchAll(/<text[^>]*>([^<]*)</g)].some(match => match[1].startsWith(`${value}:`) && hasNumber(match[1], itemLevel));
}
