/* How the math works, Piece stats (src/ui/views/sync-explainer.ts): one piece against the same at the cap with its
   melds, the item level range, melds into the chosen substats, and the caps behind them. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IL, MAX_REAL } from '../../../../src/core/tables.ts';
import { capsFor } from '../../../../src/core/formulas.ts';
import { meldInfo, mkItem } from '../../../../src/core/items.ts';
import { gcdFor } from '../../../../src/core/speed.ts';
import { meldSlotChoices, meldSlotsOf } from '../../../../src/ui/job-sync-panel.ts';
import type { RawStatKey, SlotType } from '../../../../src/core/types.ts';
import { makeJobContext } from '../../../../src/core/job-context.ts';
import { SLOT_PERMILLE, appState, hasNumber, hasParts, labelled, roundHalfUp } from '../../helpers/fixtures/common.ts';
import { explainerItemLevelOf, explainerViewOf as maybeExplainerViewOf, meldKeysOf } from '../../helpers/fixtures/views.ts';
import { mustFind } from '../../helpers/fixtures/common.ts';

/* The explainer view of a state that shows one (a synced state), never null. */
const explainerViewOf = (...args: Parameters<typeof maybeExplainerViewOf>) => mustFind(maybeExplainerViewOf(...args), 'the explainer view');

/* A store-shaped state: a job, a sync (item level `cap`, or level sync when `cap` is null), and the explainer's piece. */
interface AppOptions {
  level: number;
  cap?: number | null;
  slot?: string;
  ilvl?: number | null;
  subs?: (string | null)[];
  slots?: number;
}
function app(
  job: string,
  { level, cap = null, slot = 'body', ilvl = null, subs = ['crit', makeJobContext(job).speedKey], slots = 2 }: AppOptions,
) {
  const a = appState({ job, sync: cap != null, cap, level }, {});
  a.piece = { ...a.piece, ilvl, slot, subs, slots };
  return a;
}

test('level 80 (level sync, item level 530): a body at 590 against the melded 530 body', () => {
  const v = explainerViewOf(app('RPR', { level: 80, ilvl: 590 }));
  assert.equal(v.cap, 530);
  assert.equal(v.byLevel, true);
  assert.deepEqual(
    v.vsRows.map(r => [r.il, r.kind, r.points]),
    [
      [590, 'overgeared', 375],
      [530, 'melded', 388],
    ],
  );
  assert.ok(hasParts(v.verdict, 'melded', 'body') && hasNumber(v.verdict, 530) && hasNumber(v.verdict, 13), v.verdict);
  // the piece is said to be made up (audit 11 #3)
  // the same slot at every item level: the overgeared body has more from 624 (+94)
  assert.ok(hasNumber(v.curveNote, 624) && hasNumber(v.curveNote, 94), v.curveNote);
});

test('level 50, cap 130: overgeared gear has more almost at once, materia adds little', () => {
  assert.equal(explainerViewOf(app('RPR', { level: 50, cap: 130 })).il, 130); // no saved item level: the cap, as Reset sets
  const v = explainerViewOf(app('RPR', { level: 50, cap: 130, ilvl: 170 }));
  assert.deepEqual(v.range, [100, 170]); // the full set stops changing at 150
  assert.equal(v.il, 170);
  assert.deepEqual(
    v.vsRows.map(r => r.points),
    [98, 91],
  );
  assert.ok(hasParts(v.verdict, 'overgeared', 'body') && hasNumber(v.verdict, 170) && hasNumber(v.verdict, 7), v.verdict);
  assert.ok(hasNumber(v.curveNote, 143) && hasNumber(v.curveNote, 13), v.curveNote);
});

test("the Wiki's item level 475 example: rings at 500 and 600 synced to 475", () => {
  const ring = (il: number) => explainerViewOf(app('RPR', { level: 80, cap: 475, slot: 'ring', ilvl: il })).bars.slice(2);
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

test('melds go into the two chosen substats, the 2nd (70%) line first', () => {
  const a = app('RPR', { level: 80, ilvl: 530 });
  assert.deepEqual(meldKeysOf(a), ['sks', 'crit']);
  const det = app('RPR', { level: 80, ilvl: 530, subs: ['crit', 'det'] });
  assert.deepEqual(meldKeysOf(det), ['det', 'crit']);
  const stones = explainerViewOf(det).vsRows[0].materia;
  assert.ok(hasParts(stones, 'Grade VIII', 'Determination') && hasNumber(stones, 2) && hasNumber(stones, 24), stones);
  assert.deepEqual(meldKeysOf(app('RPR', { level: 80, ilvl: 530, subs: ['det', null] })), ['det']);
});

test('the range: 30 below the cap to 20 past the last change, at most the highest real item level', () => {
  const a = app('SGE', { level: 100, cap: 690 });
  const pick = explainerItemLevelOf(a);
  assert.deepEqual(pick.range, [660, MAX_REAL]);
  assert.equal(pick.il, 690); // no saved item level: the cap
  // a saved item level outside the range is held to it
  assert.equal(explainerItemLevelOf({ ...a, piece: { ...a.piece, ilvl: 300 } }).il, 660);
  // no sync: every real item level, the highest by default
  const off = app('SGE', { level: 100 });
  assert.deepEqual(explainerItemLevelOf(off).range, [1, MAX_REAL]);
  assert.equal(explainerItemLevelOf(off).il, MAX_REAL);
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
const expectedCap = (column: RawStatKey, ilvl: number, type: SlotType, oneHanded: boolean) => {
  let pm: number;
  if (type === 'weapon') {
    pm = oneHanded ? SLOT_PERMILLE.weapon1h : SLOT_PERMILLE.weapon2h;
  } else {
    pm = SLOT_PERMILLE[type];
  }
  return roundHalfUp((IL[column][ilvl] * pm) / 1000);
};
const specialCaps: { job: string; column: 'piety' | 'ten'; oneHanded: boolean }[] = [
  { job: 'SGE', column: 'piety', oneHanded: false },
  { job: 'PLD', column: 'ten', oneHanded: true },
];
for (const { job, column, oneHanded } of specialCaps) {
  test(`${job} at cap 540: the special substat's cap comes from its own ItemLevel column`, () => {
    const ctx = makeJobContext(job);
    for (const t of ctx.activeSlotTypes.filter(x => x !== 'offhand')) {
      const c = capsFor(ctx, t, 540);
      assert.equal(c[column], expectedCap(column, 540, t, oneHanded), `${t} special substat cap`);
      assert.equal(c.crit, expectedCap('crit', 540, t, oneHanded), `${t} substat cap`);
    }
    assert.deepEqual([capsFor(ctx, 'ring', 540)[column], capsFor(ctx, 'ring', 540).crit], [102, 101]); // 1518 and 1514 x 67 / 1000
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
  const v = explainerViewOf(app('SGE', { level: 100, cap: 130, slot: 'head', ilvl: 170 }));
  assert.deepEqual(
    v.curveBands.map(b => b.label),
    ['Critical Hit (100%)', 'Spell Speed (70%)', 'Spell Speed (Melds)'],
  );
  for (const number of [61, 148, 18, 149, 19, 62]) {
    assert.ok(hasNumber(v.curveNote, number), `${number} in: ${v.curveNote}`);
  }
  assert.equal((v.curveChartSvg.match(/<polygon /g) || []).length, 3);
  // Critical Hit is at its 31 cap from 129 (below the cap 130: the curve is flat there), Spell Speed (70%) from 149
  assert.ok(labelled(v.curveChartSvg, 31, 129) && labelled(v.curveChartSvg, 31, 149));
});

/* A piece at or below the cap keeps its materia, so its bars include the melds (owner's screenshot, 2026-10-18: an item
   level 169 head synced to 169 with two Grade V Critical Hit stones showed Critical Hit 25 → 25). Above the cap the
   melds are lost and no bar has any. */
test('one piece: a piece that keeps its melds shows them on its bars; a synced piece has none', () => {
  const kept = explainerViewOf(app('SGE', { level: 100, cap: 169, slot: 'head', ilvl: 169, subs: ['dh', 'crit'] }));
  const crit = mustFind(
    kept.bars.find(b => b.label.startsWith('Critical Hit')),
    'the Critical Hit bar',
  );
  const gain = kept.vsRows[0].points - kept.bars.filter(b => b.label.includes('·')).reduce((a, b) => a + b.kept, 0);
  assert.ok(gain > 0, 'the piece keeps some melds');
  assert.equal(crit.melds, gain); // both stones are Critical Hit
  assert.equal(crit.total, crit.kept + crit.melds);
  assert.ok(kept.bars.filter(b => b !== crit).every(b => b.melds === 0 && b.total === b.kept));
  const synced = explainerViewOf(app('SGE', { level: 100, cap: 130, slot: 'head', ilvl: 170, subs: ['dh', 'crit'] }));
  assert.ok(synced.bars.every(b => b.melds === 0 && b.total === b.kept));
});

/* The table under the bars names the stones and, on a second line, what the cap leaves of them, so a longer meld does
   not wrap the row (owner's screenshots, 2026-10-18: the earring synced to 169 jumped in height along the slider). */
test('one piece: the table splits the materia into the stones and what is left after the cap', () => {
  const v = explainerViewOf(app('SGE', { level: 100, cap: 169, slot: 'ear', ilvl: 291, subs: ['dh', 'crit'] }));
  assert.deepEqual(
    v.vsRows.map(r => [r.il, r.kind, r.points]),
    [
      [291, 'overgeared', 74],
      [169, 'melded', 74],
    ],
  );
  const [overgeared, melded] = v.vsRows;
  assert.ok(overgeared.materiaNote.length > 0, 'the overgeared piece says its stones are ignored');
  assert.ok(
    hasParts(melded.materia, 'Grade V', 'Critical Hit') && hasNumber(melded.materia, 2) && hasNumber(melded.materia, 6),
    melded.materia,
  );
  assert.ok(hasNumber(melded.materiaNote, 11), melded.materiaNote); // what the cap leaves of the stones
  assert.equal(new Set(v.vsRows.map(r => r.tag)).size, 2, 'each kind has its own words');
  assert.ok(
    v.verdict.length > 0 && v.verdict !== explainerViewOf(app('RPR', { level: 50, cap: 130, ilvl: 170 })).verdict,
    'a tie has its own verdict',
  );
});

/* Every row of the table has its second line filled (owner's screenshot, 2026-10-18: at 168 with the cap at 169 the
   line under each item level was blank). */
test('one piece: at or below the cap the table rows say below the cap and at the cap', () => {
  const rows = (ilvl: number) => explainerViewOf(app('SGE', { level: 100, cap: 169, slot: 'neck', ilvl, subs: ['dh', 'crit'] })).vsRows;
  const tags = (ilvl: number) => rows(ilvl).map(r => [r.il, r.kind]);
  assert.deepEqual(tags(168), [
    [168, 'below-cap'],
    [169, 'at-cap'],
  ]);
  assert.deepEqual(tags(169), [[169, 'at-cap']]);
  assert.ok(
    rows(168).every(r => r.tag.length > 0),
    'every row has its second line filled',
  );
  assert.deepEqual(tags(170), [
    [170, 'overgeared'],
    [169, 'melded'],
  ]);
});

/* An overgeared piece that only matches the melded one counts too (owner's screenshot, 2026-10-18: the earring synced to
   169 reaches the melded 74 from item level 289, but the chart shaded nothing and the note said no earring has more). */
test('overgeared chart: an overgeared piece with as much as the melded one is shaded and named', () => {
  const v = explainerViewOf(app('SGE', { level: 100, cap: 169, slot: 'ear', ilvl: 291, subs: ['dh', 'crit'] }));
  for (const number of [74, 289, 120]) {
    assert.ok(hasNumber(v.curveNote, number), `${number} in: ${v.curveNote}`);
  }
  assert.ok(v.curveNote.includes('earring'), v.curveNote);
  assert.match(v.curveChartSvg, /data-shade="289-309"/);
  // the synced item level's line is named in the page's legend, not inside the chart (owner, 2026-10-18)
  assert.doesNotMatch(v.curveChartSvg, /Synced item level/);
  // as much, then more; and never as much
  const passes = explainerViewOf(app('RPR', { level: 80, ilvl: 590 })).curveNote;
  for (const number of [388, 620, 90, 624, 94, 400]) {
    assert.ok(hasNumber(passes, number), `${number} in: ${passes}`);
  }
  const never = explainerViewOf(app('SGE', { level: 100, cap: 790, slot: 'head', ilvl: 795 })).curveNote;
  for (const number of [538, 459]) {
    assert.ok(hasNumber(never, number), `${number} in: ${never}`);
  }
  assert.ok(never.includes('head'), never);
  assert.equal(new Set([passes, never, v.curveNote]).size, 3, 'matches, passes and never reaches read differently');
});

/* The materia row shows only what the piece has in the duty (owner's screenshots, 2026-10-18: above the cap it showed
   the stones the piece would take at its own item level, Grade VI at 415 and Grade VIII at 429, struck through). */
test('one piece: the materia row shows no stones above the cap, the kept stones at or below it', () => {
  const synced = explainerViewOf(app('SGE', { level: 70, cap: 405, slot: 'body', ilvl: 429, subs: ['det', 'sps'] }));
  assert.deepEqual(synced.stoneChips, []);
  assert.ok(synced.meldNote.length > 0, 'a synced piece says why it has no melds');
  const kept = explainerViewOf(app('SGE', { level: 100, cap: 169, slot: 'ear', ilvl: 169, subs: ['dh', 'crit'] }));
  assert.deepEqual(kept.stoneChips, ['+6', '+6']);
  assert.ok(hasParts(kept.meldNote, 'Grade V', 'Critical Hit') && hasNumber(kept.meldNote, 2), kept.meldNote);
  assert.notEqual(kept.meldNote, synced.meldNote);
});

test('Materia slots: the example piece takes stones up to its slots (none with 0, one with 1)', () => {
  const settings = { level: 100, cap: 169, slot: 'ear', ilvl: 169, subs: ['dh', 'crit'] };
  const chips = (slots: number) => explainerViewOf(app('SGE', { ...settings, slots })).stoneChips;
  assert.deepEqual(chips(0), []);
  assert.deepEqual(chips(1), ['+6']);
  assert.deepEqual(chips(2), ['+6', '+6']);
  assert.deepEqual(chips(5), ['+6', '+6']); // more slots than room: the piece at the cap has room for only two stones
  const noSlots = explainerViewOf(app('SGE', { ...settings, slots: 0 })).meldNote;
  assert.ok(noSlots.length > 0, 'a piece with no slots says so');
  // slots the stones do not fill: the 2nd substat has room for two stones, so 3 of 5 slots stay empty
  const empty = explainerViewOf(app('SGE', { ...settings, slots: 5 })).emptyNote;
  assert.ok(hasNumber(empty, 3) && hasNumber(empty, 5), empty);
  assert.equal(explainerViewOf(app('SGE', { ...settings, slots: 2 })).emptyNote, '');
});

test("Materia slots: with no choice (null), the slot's usual total; a choice its pieces do not have goes back to it", () => {
  const usual = (piece: { slot: string }) => meldSlotsOf({ slots: null, ...piece });
  assert.deepEqual(
    ['head', 'body', 'hands', 'legs', 'feet'].map(slot => usual({ slot })),
    [2, 2, 2, 2, 2],
  );
  assert.deepEqual(
    ['ear', 'neck', 'wrist', 'ring'].map(slot => usual({ slot })),
    [1, 1, 1, 1],
  );
  assert.equal(usual({ slot: 'weapon' }), 2);
  assert.equal(usual({ slot: 'offhand' }), 0); // most shields have none
  assert.equal(meldSlotsOf({ slot: 'ear', slots: 2 }), 2);
  assert.equal(meldSlotsOf({ slot: 'head', slots: 1 }), 2); // no armor piece has 1
  assert.equal(meldSlotsOf({ slot: 'head', slots: 4 }), 2); // nothing has 4
  assert.deepEqual(meldSlotChoices('weapon'), [0, 1, 2, 3, 5]);
  assert.deepEqual(meldSlotChoices('ring'), [0, 1, 2, 5]);
});

test('synced levels 1 to 4 (item level budget 0): every bar width is a percentage, none NaN', () => {
  // Real jobs of each role; at these levels ParamGrow gives no budget, so every stat and cap is 0 and the bars have no length.
  for (const job of ['PLD', 'SGE', 'DRG', 'BRD']) {
    for (const level of [1, 2, 3, 4]) {
      const v = explainerViewOf(app(job, { level }));
      assert.ok(v, `${job} level ${level} shows Piece stats`);
      for (const bar of v.bars) {
        for (const key of ['keep', 'riseLeft', 'rise', 'cutLeft', 'cut', 'meldLeft', 'meldWidth', 'capAt'] as const) {
          assert.match(bar[key], /^\d+(\.\d+)?%$/, `${job} level ${level} ${bar.label} ${key}`);
        }
        assert.equal(bar.keep, '0%', `${job} level ${level} ${bar.label}: no stat, no bar`);
      }
    }
  }
});
