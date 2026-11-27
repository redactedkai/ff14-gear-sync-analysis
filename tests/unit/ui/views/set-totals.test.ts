/* A saved set's numbers (src/ui/views/set-totals.ts): the Total row with and without the meal against the character
   panel's rule (gear + meal + the character's base), the Tier and Defense rows, the header figures and the delta lines.
   Expected numbers are summed from the raw item data and the level 100 constants, not from the code under test. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allMeals } from '../../../../src/core/food.ts';
import { makeJobContext } from '../../../../src/core/job-context.ts';
import { evaluateInSheet, figureChange, figuresAgainst, setFigures, setTotalsView } from '../../../../src/ui/views/set-totals.ts';
import { hasNumber, mustFind } from '../../helpers/fixtures/common.ts';
import type { SlotType, StatKey } from '../../../../src/core/types.ts';
import type { Figure } from '../../../../src/ui/views/set-totals.ts';
import type { SavedGearSet, SavedRow } from '../../../../src/ui/sheets/saved-types.ts';
import { piece, rawGear, sageSet, sheetOf, warSet } from '../../helpers/fixtures/sheet-fixtures.ts';

/* Level 100: the character's own points before any gear (Sage: the main stat base 440 x the job's modifier (115%) and Vitality (100%),
   420 for the speed-based substats and 440 for Determination and Piety; the level's divisor. */
const SAGE_BASE: Partial<Record<StatKey, number>> = { mind: 506, vit: 440, crit: 420, det: 440, dh: 420, sps: 420, piety: 440 };
const DIV = 2780;

/* Sage's gear points: the raw item stats, plus the head's three Critical Hit IV stones (+8 of 12, 4 lost past the cap of 28). */
function sageGear(set: SavedGearSet): Partial<Record<StatKey, number>> {
  const gear = rawGear('SGE', set.pieces);
  gear.crit = (gear.crit ?? 0) + 8;
  return gear;
}

/* The number a stat key holds in a set of points, 0 when it holds none. */
const pointsOf = (points: Partial<Record<StatKey, number>>, stat: StatKey): number => points[stat] ?? 0;

test('Sage: Total is gear plus the character base, with and without the meal', () => {
  const sheet = sheetOf('SGE', []);
  const plain = sageSet();
  const gear = sageGear(plain);
  const view = setTotalsView(evaluateInSheet(sheet, plain));
  const job = makeJobContext('SGE');
  assert.deepEqual(
    view.total.cells.map(c => [c.stat, c.header, c.value]),
    job.stats.map(s => [s, job.short[s], pointsOf(gear, s) + pointsOf(SAGE_BASE, s)]),
  );
  assert.equal(view.total.hasMeal, false);
  assert.deepEqual(view.total.withoutMeal, view.total.cells);

  // the newest meal: each of its stats gets floor(pct x (base + gear) / 100), at most its maximum
  const meal = mustFind(allMeals(job).at(-1), 'a meal');
  const fed = setTotalsView(evaluateInSheet(sheet, sageSet({ meal: meal.key })));
  const lines = [...meal.stats, ...(meal.vit ? [meal.vit] : [])];
  const bonus = Object.fromEntries(
    lines.map(l => [l.stat, Math.min(l.max, Math.floor((l.pct * (pointsOf(SAGE_BASE, l.stat) + pointsOf(gear, l.stat))) / 100))]),
  );
  assert.ok(Object.keys(bonus).length >= 2);
  assert.equal(fed.total.hasMeal, true);
  assert.deepEqual(
    fed.total.cells.map(c => c.value),
    job.stats.map(s => pointsOf(gear, s) + pointsOf(SAGE_BASE, s) + (bonus[s] ?? 0)),
  );
  assert.deepEqual(
    fed.total.withoutMeal.map(c => c.value),
    job.stats.map(s => pointsOf(gear, s) + pointsOf(SAGE_BASE, s)),
  );
});

test('Sage: the Total row counts empty rows ("1 slot empty") and a set with nothing is just the base', () => {
  const sheet = sheetOf('SGE', []);
  const full = setTotalsView(evaluateInSheet(sheet, sageSet()));
  // the weapon is empty; the off-hand row is not used by a two-handed job
  assert.equal(full.total.emptyCount, 1);
  assert.ok(hasNumber(full.total.emptyText, 1), full.total.emptyText);
  const bare = { ...sageSet(), pieces: sageSet().pieces.map(p => ({ slot: p.slot })) };
  const view = setTotalsView(evaluateInSheet(sheet, bare));
  assert.ok(hasNumber(view.total.emptyText, 11), view.total.emptyText);
  assert.deepEqual(
    view.total.cells.map(c => c.value),
    makeJobContext('SGE').stats.map(s => SAGE_BASE[s]),
  );
});

test('a job with an always-on haste says its Tier row counts the hasted speed; one without keeps the plain caption', () => {
  const caption = (jobId: string) =>
    setTotalsView(evaluateInSheet(sheetOf(jobId, [], { sync: { on: false, cap: 795 } }), { ...warSet(), pieces: [{ slot: 'weapon' }] }))
      .tier.caption;
  const plain = caption('SGE');
  assert.ok(plain.length > 0);
  for (const jobId of ['MNK', 'NIN', 'SAM', 'VPR']) {
    assert.ok(caption(jobId).length > 0 && caption(jobId) !== plain, `${jobId}: the hasted caption differs`);
  }
  for (const jobId of ['WAR', 'DRG']) {
    assert.equal(caption(jobId), plain, jobId);
  }
});

test('Sage: the Tier row is the spare points and the points to the next tier of the gear total', () => {
  const gear = sageGear(sageSet());
  const view = setTotalsView(evaluateInSheet(sheetOf('SGE', []), sageSet()));
  const job = makeJobContext('SGE');
  const cells = Object.fromEntries(job.stats.map((s, i) => [s, view.tier.cells[i]]));
  assert.ok(view.tier.caption.length > 0);
  assert.equal(cells.mind, null);
  assert.equal(cells.vit, null);
  // tier = floor(step x points / div); a tier starts at ceil(tier x div / step)
  const steps: [StatKey, number][] = [
    ['crit', 200],
    ['det', 140],
    ['dh', 550],
  ];
  for (const [stat, step] of steps) {
    const cell = mustFind(cells[stat], `the ${stat} tier cell`);
    const tier = Math.floor((step * pointsOf(gear, stat)) / DIV);
    const start = Math.ceil((tier * DIV) / step);
    const next = Math.ceil(((tier + 1) * DIV) / step);
    assert.equal(cell.spare, pointsOf(gear, stat) - start, stat);
    assert.equal(cell.toNext, next - pointsOf(gear, stat), stat);
    assert.equal(cell.text, `${pointsOf(gear, stat) - start} · +${next - pointsOf(gear, stat)}`, stat);
  }
});

/* AkhMorning's level 100 2.5 s tier table (https://www.akhmorning.com/allagan-studies/stats/speed/, core/speed.test.ts)
   lists the tier starting at 2,238 (2.28 s) and the next at 2,324 (2.27 s) in full speed: base 420 + gear 1,818 and 1,904.
   A Sage wearing ten real item level 725 to 790 pieces whose Spell Speed adds up to 1,839 (188 + 293 + 188 + 286 + 184
   + 148 + 142 + 148 + 133 + 129, read from the item data) sits 21 above the first start and 65 below the second
   (1,839 - 1,818 = 21; 1,904 - 1,839 = 65). Roadmap A3. */
test('Tier row at 1,839 gear speed (level 100): 21 above the tier start (2,238 on the panel), 65 to the next (2,324)', () => {
  const ids: [SlotType, number][] = [
    ['head', 49705],
    ['body', 50879],
    ['hands', 49707],
    ['legs', 49455],
    ['feet', 51161],
    ['ear', 49718],
    ['neck', 49470],
    ['wrist', 49651],
  ];
  const pieces: SavedRow[] = [
    { slot: 'weapon' },
    { slot: 'offhand' },
    ...ids.map(([slot, gameId]) => piece(slot, gameId)),
    piece('ring', 46452),
    piece('ring', 46397),
  ];
  const gearSet = { ...sageSet(), pieces };
  assert.equal(rawGear('SGE', pieces).sps, 1839);
  const view = setTotalsView(evaluateInSheet(sheetOf('SGE', [], { sync: { on: false, cap: 795 } }), gearSet));
  const job = makeJobContext('SGE');
  const cell = mustFind(view.tier.cells[job.stats.indexOf('sps')], 'the Spell Speed tier cell');
  assert.deepEqual([cell.spare, cell.toNext, cell.text], [21, 65, '21 · +65']);
});

test('Warrior (Tenacity, two-handed): the off-hand row holding a piece adds nothing; Defense is the sum of the pieces', () => {
  const sheet = sheetOf('WAR', [], { sync: { on: false, cap: 795 } });
  const view = setTotalsView(evaluateInSheet(sheet, warSet()));
  // 138 + 185 + 138 + 185 + 138 (armor) + 1 x 5 (earrings, necklace, bracelet, two rings) = 789; floor(15 x 789 / 2780) = 4 percent
  assert.deepEqual(
    [view.defense.phys.label, view.defense.phys.value, view.defense.phys.valueText, view.defense.phys.pctText],
    ['Physical', 789, '789', '−4% damage'],
  );
  assert.deepEqual([view.defense.mag.label, view.defense.mag.value, view.defense.mag.pctText], ['Magic', 789, '−4% damage']);
  // the axe in the off-hand row would double the weapon's stats if it were counted
  const withoutOffhand = { ...warSet(), pieces: warSet().pieces.map((p): SavedRow => (p.slot === 'offhand' ? { slot: 'offhand' } : p)) };
  assert.deepEqual(setTotalsView(evaluateInSheet(sheet, withoutOffhand)).total.cells, view.total.cells);
  // the raw sums match, the weapon included; the job has a special substat (Tenacity, TNC)
  const gear = rawGear('WAR', warSet().pieces);
  assert.equal(view.total.cells.find(c => c.stat === 'det')?.value, pointsOf(gear, 'det') + 440);
  assert.equal(view.total.cells.find(c => c.stat === 'ten')?.header, 'TNC');
});

test('the header figures: main stat, GCD, Critical Hit, Crit dmg, Determination, Direct Hit, Piety, DoT (Sage)', () => {
  const gear = sageGear(sageSet());
  const figures = setFigures(evaluateInSheet(sheetOf('SGE', []), sageSet()));
  assert.deepEqual(
    figures.map(f => f.key),
    ['main', 'gcd', 'crit', 'critDmg', 'det', 'dh', 'spec', 'dot'],
  );
  assert.deepEqual(
    figures.map(f => f.label),
    ['MND', 'GCD', 'CRT', 'Crit dmg', 'DET', 'DHT', 'PIE', 'DoT'],
  );
  const text = Object.fromEntries(figures.map(f => [f.key, f.text]));
  const pct = (perMille: number) => `${(perMille / 10).toFixed(1)}%`;
  assert.equal(text.main, String(pointsOf(gear, 'mind') + pointsOf(SAGE_BASE, 'mind')));
  // the GCD: recast 2500 x (1000 + ceil(130 x -gear / div)) / 1000, in hundredths of a second
  const recast = Math.floor((2500 * (1000 + Math.ceil((-130 * pointsOf(gear, 'sps')) / DIV))) / 1000);
  assert.equal(text.gcd, `${(Math.floor(recast / 10) / 100).toFixed(2)}s`);
  assert.equal(text.crit, pct(Math.floor((200 * pointsOf(gear, 'crit')) / DIV) + 50));
  assert.equal(text.critDmg, `+${pct(Math.floor((200 * pointsOf(gear, 'crit')) / DIV) + 400)}`);
  assert.equal(text.det, `+${pct(Math.floor((140 * pointsOf(gear, 'det')) / DIV))}`);
  assert.equal(text.dh, pct(Math.floor((550 * pointsOf(gear, 'dh')) / DIV)));
  assert.equal(text.spec, `+${Math.floor((150 * pointsOf(gear, 'piety')) / DIV)} MP`);
  assert.equal(text.dot, `+${(Math.floor((130 * pointsOf(gear, 'sps')) / DIV) / 10).toFixed(1)}%`);
});

test('a job without a special substat has no such figure (Dragoon); the other figures stay', () => {
  const sheet = sheetOf('DRG', [], { sync: { on: false, cap: 795 } });
  const keys = setFigures(evaluateInSheet(sheet, { ...warSet(), pieces: [{ slot: 'weapon' }] })).map(f => f.key);
  assert.deepEqual(keys, ['main', 'gcd', 'crit', 'critDmg', 'det', 'dh', 'dot']);
});

test('a job with an always-on haste labels the GCD "with Haste" and shows it without the haste, then with it', () => {
  // no gear and no meal: the base recast, 2.50 s, then the haste cuts it by its percent (floored to hundredths):
  // Greased Lightning 20% (Monk, level 100), Increase Attack Speed 15% (Ninja), Fuka 13% (Samurai), Swiftscaled 15% (Viper)
  const expected = { MNK: '2.00s', NIN: '2.12s', SAM: '2.17s', VPR: '2.12s' };
  let hastedLabel = '';
  for (const [jobId, hasted] of Object.entries(expected)) {
    const sheet = sheetOf(jobId, [], { sync: { on: false, cap: 795 } });
    const gcd = mustFind(
      setFigures(evaluateInSheet(sheet, { ...warSet(), pieces: [{ slot: 'weapon' }] })).find(f => f.key === 'gcd'),
      'the GCD figure',
    );
    assert.deepEqual([gcd.text, gcd.shown], [hasted, `2.50s (${hasted})`], jobId);
    hastedLabel = gcd.label;
  }
  // a job without haste keeps the plain label and no `shown`
  const sage = mustFind(
    setFigures(evaluateInSheet(sheetOf('SGE', []), sageSet())).find(f => f.key === 'gcd'),
    'the GCD figure',
  );
  assert.equal(sage.shown, undefined);
  assert.notEqual(sage.label, hastedLabel, 'the haste is said in the label');
  assert.ok(hastedLabel.includes('Haste'), hastedLabel);
});

test("figureChange: signed difference in the figure's own unit and decimals; equal figures give null", () => {
  assert.deepEqual(figureChange('19.3%', '21.0%'), { text: '+1.7%', up: true });
  assert.deepEqual(figureChange('2.49s', '2.48s'), { text: '−0.01s', up: false });
  assert.equal(figureChange('+54.3%', '+54.3%'), null);
  assert.deepEqual(figureChange('6406', '6420'), { text: '+14', up: true });
  assert.deepEqual(figureChange('+120 MP', '+117 MP'), { text: '−3', up: false });
});

test('figuresAgainst: green when better, red when worse; the GCD is better lower', () => {
  const before: Figure[] = [
    { key: 'main', label: 'MND', text: '6406' },
    { key: 'gcd', label: 'GCD', text: '2.49s' },
    { key: 'crit', label: 'CRT', text: '19.3%' },
    { key: 'det', label: 'DET', text: '+8.1%' },
  ];
  const after: Figure[] = [
    { key: 'main', label: 'MND', text: '6400' },
    { key: 'gcd', label: 'GCD', text: '2.48s' },
    { key: 'crit', label: 'CRT', text: '19.9%' },
    { key: 'det', label: 'DET', text: '+8.1%' },
  ];
  assert.deepEqual(
    figuresAgainst(before, after).map(f => f.change && [f.change.text, f.change.good]),
    [['−6', false], ['−0.01s', true], ['+0.6%', true], null],
  );
});

test('Sage: the Total row item level is the average of the worn pieces own levels, whole, blank for an empty set', () => {
  // ten pieces of item level 115 over 12 slots: 1150 / 12 = 95.83, shown 96, whatever the sync
  for (const sync of [
    { on: false, cap: 795 },
    { on: true, cap: 123 },
  ]) {
    const view = setTotalsView(evaluateInSheet(sheetOf('SGE', [], { sync }), sageSet()));
    assert.equal(view.total.ilvl, '~96');
    assert.ok(hasNumber(view.total.ilvlLabel, 96), view.total.ilvlLabel);
  }
  // Warrior: 2 x 120 (axe) + 10 x 120 = 120 over 12 slots
  assert.equal(setTotalsView(evaluateInSheet(sheetOf('WAR', []), warSet())).total.ilvl, '~120');
  const bare = { ...sageSet(), pieces: sageSet().pieces.map(p => ({ slot: p.slot })) };
  assert.equal(setTotalsView(evaluateInSheet(sheetOf('SGE', []), bare)).total.ilvl, '');
  assert.equal(setTotalsView(evaluateInSheet(sheetOf('SGE', []), bare)).total.ilvlLabel, '', 'no label for an empty set');
});
