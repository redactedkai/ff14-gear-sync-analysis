/* Other pieces with the same result (core/same-result.js, roadmap A9): which pieces each row of a result can show
   without changing what the result does, and which one it shows. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeJobContext } from '../../../src/core/job-context.js';
import { equipLevel, mkItem } from '../../../src/core/items.js';
import { resultOf, sameOutcome, sameResult } from '../../../src/core/same-result.js';
import { dotMult, gcdFor } from '../../../src/core/speed.js';
import { rankTierOf, statTier } from '../../../src/core/tiers.js';
import { makeApp, solveOf } from '../helpers/views.js';

const sge = makeJobContext('SGE');
const CTX = { level: 100, food: null, haste: 0 };

/* A hand-made candidate (the shape buildCandidates gives): every job stat, 0 unless given. Each has a made-up gameId,
   as a database piece has, so a row's menu can pick it. */
let nextGameId = 1;
function cand(name, type, stats, blocks = []) {
  const item = mkItem(name, type, 700, {}, { gameId: nextGameId++ });
  const eff = Object.fromEntries(sge.stats.map(s => [s, stats[s] || 0]));
  return { item, eff, copies: 1, blocks, meld: null };
}
const pickOf = (type, c) => ({ type, item: c.item, eff: c.eff, meld: null });

/* Two rows whose Critical Hit is 1 point above a tier start, and for each a piece with 1 point less: either swap alone
   keeps the tier, both together lose it. */
function sharedSpare() {
  const start = statTier(sge, 'crit', 1000, 100).start;
  const head = cand('Head A', 'head', { mind: 100, crit: start + 1 - 50 });
  const head2 = cand('Head B', 'head', { mind: 100, crit: start - 50 });
  const body = cand('Body A', 'body', { mind: 200, crit: 50 });
  const body2 = cand('Body B', 'body', { mind: 200, crit: 49 });
  return {
    head,
    head2,
    body,
    body2,
    picks: [pickOf('head', head), pickOf('body', body)],
    cands: { head: [head, head2], body: [body, body2] },
  };
}

test('resultOf: points within a tier give the same result, a tier lost or a main stat point does not', () => {
  const start = statTier(sge, 'crit', 1000, 100).start;
  const at = crit => resultOf(sge, { mind: 300, crit }, CTX);
  assert.deepEqual(at(start), at(start + 1));
  assert.notDeepEqual(at(start - 1), at(start));
  assert.notDeepEqual(resultOf(sge, { mind: 301, crit: start }, CTX), at(start));
});

test('resultOf: speed keeps its GCD; its DoT/HoT tick scaling may drop a step (owner, 2026-10-16)', () => {
  // the first speed above 400 whose DoT/HoT scaling is one step up while its GCD is the same as one point less
  let spd = 400;
  while (gcdFor(spd, 100) !== gcdFor(spd - 1, 100) || dotMult(spd, 100) === dotMult(spd - 1, 100)) spd++;
  const at = points => resultOf(sge, { mind: 300, sps: points }, CTX);
  assert.deepEqual(at(spd - 1), at(spd));
  // a GCD step lost is a different result
  let step = 400;
  while (gcdFor(step, 100) === gcdFor(step - 1, 100)) step++;
  assert.notDeepEqual(at(step - 1), at(step));
});

test('resultOf: Tenacity keeps its mitigation step (200); its damage step (112) may drop (owner, 2026-10-16)', () => {
  const war = makeJobContext('WAR');
  const at = (ten, mitigation) => sameOutcome(resultOf(war, { str: 300, ten }, CTX), resultOf(war, { str: 300, ten: mitigation }, CTX));
  // the first Tenacity above 400 where one step moves and the other doesn't, each way
  const mit = rankTierOf(war, 'ten', 100);
  const dmg = p => statTier(war, 'ten', p, 100).effect;
  let a = 400;
  while (mit(a) === mit(a - 1) || dmg(a) !== dmg(a - 1)) a++;
  let b = 400;
  while (dmg(b) === dmg(b - 1) || mit(b) !== mit(b - 1)) b++;
  assert.ok(!at(a, a - 1), 'a mitigation step lost');
  assert.ok(at(b, b - 1), 'a damage step lost, the mitigation step kept');
});

test('resultOf: the goal stat keeps its exact points when asked (the plain optimizer), only its tier without (tier ranking)', () => {
  const start = statTier(sge, 'crit', 1000, 100).start;
  const at = (crit, goal) => resultOf(sge, { mind: 300, crit }, { ...CTX, goal });
  assert.notDeepEqual(at(start, 'crit'), at(start + 5, 'crit'));
  assert.deepEqual(at(start, null), at(start + 5, null));
});

test('each swap alone fits, so both rows list their other piece; the shown set keeps the result', () => {
  const { picks, cands } = sharedSpare();
  const rows = sameResult(sge, picks, cands, CTX);
  assert.deepEqual(
    rows.map(r => r.options.map(c => c.item.name)),
    [
      ['Head A', 'Head B'],
      ['Body A', 'Body B'],
    ],
  );
  // equal equip and item levels: the optimizer's own pick stays
  assert.deepEqual(
    rows.map(r => r.pick.item.name),
    ['Head A', 'Body A'],
  );
});

test('rows share their spare points: after one swap, the other row no longer offers its swap', () => {
  const { picks, cands, head2 } = sharedSpare();
  const rows = sameResult(sge, picks, cands, CTX, { 0: head2.item.gameId });
  assert.equal(rows[0].pick.item.name, 'Head B');
  assert.deepEqual(
    rows[1].options.map(c => c.item.name),
    ['Body A'],
  );
  const totals = Object.fromEntries(sge.stats.map(s => [s, rows.reduce((n, r) => n + r.pick.eff[s], 0)]));
  assert.deepEqual(resultOf(sge, totals, CTX), resultOf(sge, { mind: 300, crit: statTier(sge, 'crit', 1000, 100).start }, CTX));
});

test('a pick that no longer fits is ignored', () => {
  const { picks, cands } = sharedSpare();
  const rows = sameResult(sge, picks, cands, CTX, { 1: 'no such piece' });
  assert.equal(rows[1].pick.item.name, 'Body A');
});

test('a piece that leaves another slot empty never replaces one that does not (a cloak for a body)', () => {
  const { picks, cands, body } = sharedSpare();
  const cloak = cand('Cloak', 'body', body.eff, ['head']);
  const rows = sameResult(sge, picks, { ...cands, body: [body, cloak] }, CTX);
  assert.deepEqual(
    rows[1].options.map(c => c.item.name),
    ['Body A'],
  );
});

/* The owner's case (a screenshot): Sage, level 50, item level 123, crafted and tomestone gear, Endwalker and Dawntrail
   off, Mind then Critical Hit and Determination, best meal. Most pieces of item level 150 and up reach the same caps, so
   every row has others. Solved as a set page's Auto-fill (core/recipe.js runRecipe): found.options per row, found.picks. */
function ownerCase() {
  const app = makeApp('SGE', { level: 50, cap: 123, sync: true });
  Object.assign(app.recipe, {
    target: 'mind',
    tb: 'crit',
    tb2: 'det',
    food: true,
    expOff: ['EW', 'DT'],
    exclude: ['relic', 'savage', 'ultimate', 'pvp'],
  });
  return app;
}

test("the owner's case: every row has others, shows the lowest equip level, and the result is unchanged", () => {
  const { run, set, panel } = solveOf(ownerCase());
  assert.equal(run.status, 'ok');
  const { picks, options } = run.found;
  assert.ok(options.every(list => list.length > 1));
  // the result (gear and food) is the search's: Mind 356 from gear plus Sage's base 232 at level 50 (202 x 115%)
  assert.deepEqual(
    [panel('mind'), set.gcd.gcd.toFixed(2), ...set.tiers.map(t => t?.effect ?? null)],
    [588, '2.50', null, null, '29.1%', '+16.3%', '0.0%', '2.50s', '+0 MP'],
  );
  for (const [row, list] of options.entries()) {
    const shown = picks[row].item;
    assert.ok(
      list.some(c => c.item === shown),
      shown.name,
    );
    assert.equal(equipLevel(shown), Math.min(...list.map(c => equipLevel(c.item))), shown.name);
  }
});

test("the owner's case: a Unique ring is never in both ring rows, nor in the other row's options", () => {
  const { run } = solveOf(ownerCase());
  const rings = run.found.picks.map((p, row) => ({ p, row })).filter(({ p }) => p.type === 'ring');
  const [r1, r2] = rings.map(({ p, row }) => ({ item: p.item, names: run.found.options[row].map(c => c.item.name) }));
  assert.equal(r1.item.copies, 1, 'the easiest ring is Unique, so the rule matters here');
  assert.notEqual(r1.item, r2.item);
  assert.ok(!r2.names.includes(r1.item.name));
  assert.ok(!r1.names.includes(r2.item.name) || r2.item.copies === 2);
});

test("the owner's case: a piece picked from a row's options is shown, and the result stays the same", () => {
  const app = ownerCase();
  const before = solveOf(app);
  const other = before.run.found.options[0].find(c => c.item !== before.run.found.picks[0].item);
  const after = solveOf(app, undefined, { pieces: { 0: other.item.gameId } });
  assert.equal(after.run.found.picks[0].item.name, other.item.name);
  const effects = v => v.set.tiers.map(t => t?.effect ?? null);
  assert.deepEqual(effects(after), effects(before));
  assert.equal(after.panel('mind'), before.panel('mind'));
});
