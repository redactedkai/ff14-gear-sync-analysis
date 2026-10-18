/* How the math works (src/ui/views/sync-explainer.js): one piece and a full set against the same at the cap with their
   melds, the item level range, melds from the optimizer's Goal, and the caps behind them. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IL, MAX_REAL } from '../../src/core/tables.js';
import { capsFor } from '../../src/core/formulas.js';
import { meldInfo, mkItem } from '../../src/core/items.js';
import { gcdFor } from '../../src/core/speed.js';
import { makeJobContext } from '../../src/core/job-context.js';
import { explainerItemLevel, explainerView, meldKeys } from '../../src/ui/views/sync-explainer.js';
import { SLOT_PERMILLE, appState, roundHalfUp } from './helpers/common.js';

/* A store-shaped state: a job, a sync (item level `cap`, or level sync when `cap` is null), and the explainer's piece. */
function app(job, { level, cap = null, slot = 'body', ilvl = null, subs = ['crit', 'spd'], target = 'main' }) {
  const a = appState({ job, sync: cap != null, cap, level }, {});
  a.piece = { ilvl, slot, subs };
  a.opt = { ...a.opt, target, tb: '', tb2: '' };
  return a;
}

test('level 80 (level sync, item level 530): a body at 590 against the melded 530 body', () => {
  const v = explainerView(app('RPR', { level: 80, ilvl: 590 }));
  assert.equal(v.cap, 530);
  assert.equal(v.byLevel, true);
  assert.deepEqual(
    v.vsRows.map(r => [r.il, r.tag, r.points]),
    [
      [590, 'overgeared', 375],
      [530, 'melded', 388],
    ],
  );
  assert.equal(v.verdict, 'The melded body (item level 530) has 13 more.');
  // the same slot at every item level: the overgeared body has more from 624 (+94)
  assert.match(v.curveNote, /item level 624 \(\+94\)/);
  // a full set: 1,300 Skill Speed synced (2.17 s) against 1,442 melded (2.14 s)
  assert.deepEqual(
    v.gcd.rows.map(r => [r.il, r.spd, r.gcd]),
    [
      [590, 1300, 2.17],
      [530, 1442, 2.14],
    ],
  );
  assert.equal(v.gcd.verdict, 'The melded set (item level 530) has a GCD 0.03 s shorter.');
});

test('level 50, cap 130: overgeared gear has more almost at once, materia adds little', () => {
  const v = explainerView(app('RPR', { level: 50, cap: 130 }));
  assert.deepEqual(v.range, [100, 170]); // the full set stops changing at 150
  assert.equal(v.il, 170); // 60 above the cap, held to the range
  assert.deepEqual(
    v.vsRows.map(r => r.points),
    [98, 91],
  );
  assert.equal(v.verdict, 'The overgeared body (item level 170) has 7 more.');
  assert.match(v.curveNote, /item level 143 \(\+13\)/);
  assert.deepEqual(
    v.gcd.rows.map(r => r.gcd),
    [2.15, 2.18],
  );
});

test("the Wiki's item level 475 example: rings at 500 and 600 synced to 475", () => {
  const ring = il => explainerView(app('RPR', { level: 80, cap: 475, slot: 'ring', ilvl: il })).bars.slice(2);
  // 93 / 65 -> 88 / 65; 127 / 89 -> 88 / 88: the 70% line is cut to the full cap, and never raised
  assert.deepEqual(
    ring(500).map(b => [b.raw, b.kept]),
    [
      [93, 88],
      [65, 65],
    ],
  );
  assert.deepEqual(
    ring(600).map(b => [b.raw, b.kept]),
    [
      [127, 88],
      [89, 88],
    ],
  );
});

test("melds follow the optimizer's Goal; a main stat Goal falls back to the two substats, 2nd first", () => {
  const goalMain = app('RPR', { level: 80, ilvl: 530, target: 'main' });
  assert.deepEqual(meldKeys(goalMain), { keys: ['spd', 'crit'], fromGoal: false });
  assert.match(explainerView(goalMain).goalNote, /Strength/);
  const goalDet = app('RPR', { level: 80, ilvl: 530, target: 'det' });
  assert.deepEqual(meldKeys(goalDet), { keys: ['det'], fromGoal: true });
  const v = explainerView(goalDet);
  assert.equal(v.goalNote, '');
  assert.match(v.vsRows[0].materia, /^2 × Grade VIII Determination \(\+24 each\)$/);
});

test('the GCD sub-tab needs speed: as a chosen substat, or as a meld from the Goal', () => {
  assert.equal(explainerView(app('RPR', { level: 80, subs: ['crit', 'det'] })).gcd, null);
  assert.notEqual(explainerView(app('RPR', { level: 80, subs: ['crit', 'det'], target: 'spd' })).gcd, null);
});

test('the range: 30 below the cap to 20 past the last change, at most the highest real item level', () => {
  const a = app('SGE', { level: 100, cap: 690 });
  const pick = explainerItemLevel(a);
  assert.deepEqual(pick.range, [660, MAX_REAL]);
  assert.equal(pick.il, 750);
  assert.match(pick.note, /highest real item level, 795/);
  // a saved item level outside the range is held to it
  assert.equal(explainerItemLevel({ ...a, piece: { ...a.piece, ilvl: 300 } }).il, 660);
  // no sync: every real item level, the highest by default
  const off = app('SGE', { level: 100 });
  assert.deepEqual(explainerItemLevel(off).range, [1, MAX_REAL]);
  assert.equal(explainerItemLevel(off).il, MAX_REAL);
});

test('a hand-made piece can declare its meld slots (the explainer gives its pieces 2)', () => {
  assert.equal(meldInfo(mkItem('Hand-made', 'head', 700, { crit: 100 })), null);
  assert.deepEqual(meldInfo(mkItem('Generic', 'head', 700, { crit: 100 }, { meld: { slots: 2, overmeld: false } })), {
    slots: 2,
    overmeld: false,
  });
});

/* The caps behind the explainer, from the ItemLevel table times the slot share (BaseParam, typed in), rounded half up.
   Piety and Tenacity have their own ItemLevel column, higher at a few item levels than the shared substat column. */
const expectedCap = (column, ilvl, type, oneHanded) => {
  const pm = type === 'weapon' ? (oneHanded ? SLOT_PERMILLE.weapon1h : SLOT_PERMILLE.weapon2h) : SLOT_PERMILLE[type];
  return roundHalfUp((IL[column][ilvl] * pm) / 1000);
};
for (const [job, column, oneHanded] of [
  ['SGE', 'piety', false],
  ['PLD', 'ten', true],
]) {
  test(`${job} at cap 540: the special substat's cap comes from its own ItemLevel column`, () => {
    const ctx = makeJobContext(job);
    for (const t of ctx.activeSlotTypes.filter(x => x !== 'offhand')) {
      const c = capsFor(ctx, t, 540);
      assert.equal(c.spec, expectedCap(column, 540, t, oneHanded), `${t} special substat cap`);
      assert.equal(c.crit, expectedCap('crit', 540, t, oneHanded), `${t} substat cap`);
    }
    assert.deepEqual([capsFor(ctx, 'ring', 540).spec, capsFor(ctx, 'ring', 540).crit], [102, 101]); // 1518 and 1514 x 67 / 1000
  });
}

test('cap 123: one substat over all eleven slots is at most 344, a 2.17 s GCD at level 50 (math.md section 6)', () => {
  const sge = makeJobContext('SGE');
  const total = sge.activeSlotTypes.reduce((a, t) => a + capsFor(sge, t, 123).crit * (t === 'ring' ? 2 : 1), 0);
  assert.equal(total, 296 + 48); // the ten armor and accessory slots, plus the weapon
  assert.equal(gcdFor(total, 50), 2.17);
});

/* The overgeared chart names its substats and draws its points as bands: each substat, then the melds, with where each
   substat reaches its cap. Sage head, Critical Hit / Spell Speed, synced to 130: the melds go into Spell Speed (the 2nd
   substat, Goal: main stat). */
test('the overgeared chart: the substats named, a band each and the melds, and where each reaches the cap', () => {
  const v = explainerView(app('SGE', { level: 100, cap: 130, slot: 'head', ilvl: 170 }));
  assert.deepEqual(
    v.curveBands.map(b => b.label),
    ['Critical Hit (100%)', 'Spell Speed (70%)', 'Melds: 2 × Grade IV Spell Speed (+4 each)'],
  );
  assert.equal(v.curveNote, 'From item level 148 (+18), overgeared has as much; from item level 149 (+19), more: up to 62 vs 61.');
  assert.equal((v.curveChartSvg.match(/<polygon /g) || []).length, 3);
  // Critical Hit is at its 31 cap from 131, Spell Speed (70%) from 149
  assert.match(v.curveChartSvg, />31: at the cap from 131</);
  assert.match(v.curveChartSvg, />31: at the cap from 149</);
});

/* A piece at or below the cap keeps its materia, so its bars include the melds (owner's screenshot, 2026-10-18: an item
   level 169 head synced to 169 with two Grade V Critical Hit stones showed Critical Hit 25 → 25). Above the cap the
   melds are lost and no bar has any. */
test('one piece: a piece that keeps its melds shows them on its bars; a synced piece has none', () => {
  const kept = explainerView(app('SGE', { level: 100, cap: 169, slot: 'head', ilvl: 169, subs: ['dh', 'crit'] }));
  const crit = kept.bars.find(b => b.label.startsWith('Critical Hit'));
  const gain = kept.vsRows[0].points - kept.bars.filter(b => b.label.includes('·')).reduce((a, b) => a + b.kept, 0);
  assert.ok(gain > 0, 'the piece keeps some melds');
  assert.equal(crit.melds, gain); // both stones are Critical Hit
  assert.equal(crit.total, crit.kept + crit.melds);
  assert.ok(kept.bars.filter(b => b !== crit).every(b => b.melds === 0 && b.total === b.kept));
  const synced = explainerView(app('SGE', { level: 100, cap: 130, slot: 'head', ilvl: 170, subs: ['dh', 'crit'] }));
  assert.ok(synced.bars.every(b => b.melds === 0 && b.total === b.kept));
});

/* The table under the bars names the stones and, on a second line, what the cap leaves of them, so a longer meld does
   not wrap the row (owner's screenshots, 2026-10-18: the earring synced to 169 jumped in height along the slider). */
test('one piece: the table splits the materia into the stones and what is left after the cap', () => {
  const v = explainerView(app('SGE', { level: 100, cap: 169, slot: 'ear', ilvl: 291, subs: ['dh', 'crit'] }));
  assert.deepEqual(
    v.vsRows.map(r => [r.il, r.tag, r.materia, r.materiaNote, r.points]),
    [
      [291, 'overgeared', 'none', 'ignored while synced', 74],
      [169, 'melded', '2 × Grade V Critical Hit (+6 each)', '+11 after the cap', 74],
    ],
  );
  assert.equal(v.verdict, 'Both have the same.');
});

/* Every row of the table has its second line filled (owner's screenshot, 2026-10-18: at 168 with the cap at 169 the
   line under each item level was blank). */
test('one piece: at or below the cap the table rows say below the cap and at the cap', () => {
  const tags = ilvl =>
    explainerView(app('SGE', { level: 100, cap: 169, slot: 'neck', ilvl, subs: ['dh', 'crit'] })).vsRows.map(r => [r.il, r.tag]);
  assert.deepEqual(tags(168), [
    [168, 'below the cap'],
    [169, 'at the cap'],
  ]);
  assert.deepEqual(tags(169), [[169, 'at the cap']]);
  assert.deepEqual(tags(170), [
    [170, 'overgeared'],
    [169, 'melded'],
  ]);
});

/* An overgeared piece that only matches the melded one counts too (owner's screenshot, 2026-10-18: the earring synced to
   169 reaches the melded 74 from item level 289, but the chart shaded nothing and the note said no earring has more). */
test('overgeared chart: an overgeared piece with as much as the melded one is shaded and named', () => {
  const v = explainerView(app('SGE', { level: 100, cap: 169, slot: 'ear', ilvl: 291, subs: ['dh', 'crit'] }));
  assert.equal(v.curveNote, 'From item level 289 (+120), overgeared has as much (74), never more.');
  assert.match(v.curveChartSvg, /data-shade="289-309"/);
  // as much, then more; and never as much
  assert.equal(
    explainerView(app('RPR', { level: 80, ilvl: 590 })).curveNote,
    'From item level 620 (+90), overgeared has as much; from item level 624 (+94), more: up to 400 vs 388.',
  );
  assert.equal(
    explainerView(app('SGE', { level: 100, cap: 790, slot: 'head', ilvl: 795 })).curveNote,
    'No overgeared head reaches the melded one: up to 459 vs 538.',
  );
});
