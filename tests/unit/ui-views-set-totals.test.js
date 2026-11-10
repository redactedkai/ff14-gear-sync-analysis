/* A saved set's numbers (src/ui/views/set-totals.js): the Total row with and without the meal against the character
   panel's rule (gear + meal + the character's base), the Tier and Defense rows, the header figures and the delta lines.
   Expected numbers are summed from the raw item data and the level 100 constants, not from the code under test. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allMeals } from '../../src/core/food.js';
import { makeJobContext } from '../../src/core/job-context.js';
import { evaluateInSheet, figureChange, figuresAgainst, setFigures, setTotalsView } from '../../src/ui/views/set-totals.js';
import { piece, rawGear, sageSet, sheetOf, warSet } from './helpers/sheet-fixtures.js';

/* Level 100: the character's own points before any gear (Sage: the main stat base 440 x the job's modifier (115%) and Vitality (100%),
   420 for the speed-based substats and 440 for Determination and Piety; the level's divisor. */
const SAGE_BASE = { mind: 506, vit: 440, crit: 420, det: 440, dh: 420, sps: 420, piety: 440 };
const DIV = 2780;

/* Sage's gear points: the raw item stats, plus the head's three Critical Hit IV stones (+8 of 12, 4 lost past the cap of 28). */
function sageGear(set) {
  const gear = rawGear('SGE', set.pieces);
  gear.crit += 8;
  return gear;
}

test('Sage: Total is gear plus the character base, with and without the meal', () => {
  const sheet = sheetOf('SGE', []);
  const plain = sageSet();
  const gear = sageGear(plain);
  const view = setTotalsView(evaluateInSheet(sheet, plain));
  const job = makeJobContext('SGE');
  assert.deepEqual(
    view.total.cells.map(c => [c.stat, c.header, c.value]),
    job.stats.map(s => [s, job.short[s], gear[s] + SAGE_BASE[s]]),
  );
  assert.equal(view.total.hasMeal, false);
  assert.deepEqual(view.total.withoutMeal, view.total.cells);

  // the newest meal: each of its stats gets floor(pct x (base + gear) / 100), at most its maximum
  const meal = allMeals(job).at(-1);
  const fed = setTotalsView(evaluateInSheet(sheet, sageSet({ meal: meal.key })));
  const lines = [...meal.stats, ...(meal.vit ? [meal.vit] : [])];
  const bonus = Object.fromEntries(
    lines.map(l => [l.stat, Math.min(l.max, Math.floor((l.pct * (SAGE_BASE[l.stat] + gear[l.stat])) / 100))]),
  );
  assert.ok(Object.keys(bonus).length >= 2);
  assert.equal(fed.total.hasMeal, true);
  assert.deepEqual(
    fed.total.cells.map(c => c.value),
    job.stats.map(s => gear[s] + SAGE_BASE[s] + (bonus[s] ?? 0)),
  );
  assert.deepEqual(
    fed.total.withoutMeal.map(c => c.value),
    job.stats.map(s => gear[s] + SAGE_BASE[s]),
  );
});

test('Sage: the Total row counts empty rows ("1 slot empty") and a set with nothing is just the base', () => {
  const sheet = sheetOf('SGE', []);
  const full = setTotalsView(evaluateInSheet(sheet, sageSet()));
  // the weapon is empty; the off-hand row is not used by a two-handed job
  assert.deepEqual([full.total.emptyCount, full.total.emptyText], [1, '1 slot empty']);
  const bare = { ...sageSet(), pieces: sageSet().pieces.map(p => ({ slot: p.slot })) };
  const view = setTotalsView(evaluateInSheet(sheet, bare));
  assert.equal(view.total.emptyText, '11 slots empty');
  assert.deepEqual(
    view.total.cells.map(c => c.value),
    makeJobContext('SGE').stats.map(s => SAGE_BASE[s]),
  );
});

test('a job with an always-on haste says its Tier row counts the hasted speed; one without keeps the plain caption', () => {
  const caption = jobId =>
    setTotalsView(evaluateInSheet(sheetOf(jobId, [], { sync: { on: false, cap: 795 } }), { ...warSet(), pieces: [{ slot: 'weapon' }] }))
      .tier.caption;
  for (const jobId of ['MNK', 'NIN', 'SAM', 'VPR']) assert.equal(caption(jobId), 'spare · to next tier (hasted speed)', jobId);
  for (const jobId of ['SGE', 'WAR', 'DRG']) assert.equal(caption(jobId), 'spare · to next tier', jobId);
});

test('Sage: the Tier row is the spare points and the points to the next tier of the gear total', () => {
  const gear = sageGear(sageSet());
  const view = setTotalsView(evaluateInSheet(sheetOf('SGE', []), sageSet()));
  const job = makeJobContext('SGE');
  const cells = Object.fromEntries(job.stats.map((s, i) => [s, view.tier.cells[i]]));
  assert.equal(view.tier.caption, 'spare · to next tier');
  assert.equal(cells.mind, null);
  assert.equal(cells.vit, null);
  // tier = floor(step x points / div); a tier starts at ceil(tier x div / step)
  for (const [stat, step] of [
    ['crit', 200],
    ['det', 140],
    ['dh', 550],
  ]) {
    const tier = Math.floor((step * gear[stat]) / DIV);
    const start = Math.ceil((tier * DIV) / step);
    const next = Math.ceil(((tier + 1) * DIV) / step);
    assert.equal(cells[stat].spare, gear[stat] - start, stat);
    assert.equal(cells[stat].toNext, next - gear[stat], stat);
    assert.equal(cells[stat].text, `${gear[stat] - start} · +${next - gear[stat]}`, stat);
  }
});

/* AkhMorning's level 100 2.5 s tier table (https://www.akhmorning.com/allagan-studies/stats/speed/, core-speed.test.js)
   lists the tier starting at 2,238 (2.28 s) and the next at 2,324 (2.27 s) in full speed: base 420 + gear 1,818 and 1,904.
   A Sage wearing ten real item level 725 to 790 pieces whose Spell Speed adds up to 1,839 (188 + 293 + 188 + 286 + 184
   + 148 + 142 + 148 + 133 + 129, read from the item data) sits 21 above the first start and 65 below the second
   (1,839 - 1,818 = 21; 1,904 - 1,839 = 65). Roadmap A3. */
test('Tier row at 1,839 gear speed (level 100): 21 above the tier start (2,238 on the panel), 65 to the next (2,324)', () => {
  const ids = { head: 49705, body: 50879, hands: 49707, legs: 49455, feet: 51161, ear: 49718, neck: 49470, wrist: 49651 };
  const pieces = [
    { slot: 'weapon' },
    { slot: 'offhand' },
    ...Object.entries(ids).map(([slot, gameId]) => piece(slot, gameId)),
    piece('ring', 46452),
    piece('ring', 46397),
  ];
  const gearSet = { ...sageSet(), pieces };
  assert.equal(rawGear('SGE', pieces).sps, 1839);
  const view = setTotalsView(evaluateInSheet(sheetOf('SGE', [], { sync: { on: false, cap: 795 } }), gearSet));
  const job = makeJobContext('SGE');
  const cell = view.tier.cells[job.stats.indexOf('sps')];
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
  const withoutOffhand = { ...warSet(), pieces: warSet().pieces.map(p => (p.slot === 'offhand' ? { slot: 'offhand' } : p)) };
  assert.deepEqual(setTotalsView(evaluateInSheet(sheet, withoutOffhand)).total.cells, view.total.cells);
  // the raw sums match, the weapon included; the job has a special substat (Tenacity, TNC)
  const gear = rawGear('WAR', warSet().pieces);
  assert.equal(view.total.cells.find(c => c.stat === 'det').value, gear.det + 440);
  assert.equal(view.total.cells.find(c => c.stat === 'ten').header, 'TNC');
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
  const pct = perMille => `${(perMille / 10).toFixed(1)}%`;
  assert.equal(text.main, String(gear.mind + SAGE_BASE.mind));
  // the GCD: recast 2500 x (1000 + ceil(130 x -gear / div)) / 1000, in hundredths of a second
  const recast = Math.floor((2500 * (1000 + Math.ceil((-130 * gear.sps) / DIV))) / 1000);
  assert.equal(text.gcd, `${(Math.floor(recast / 10) / 100).toFixed(2)}s`);
  assert.equal(text.crit, pct(Math.floor((200 * gear.crit) / DIV) + 50));
  assert.equal(text.critDmg, `+${pct(Math.floor((200 * gear.crit) / DIV) + 400)}`);
  assert.equal(text.det, `+${pct(Math.floor((140 * gear.det) / DIV))}`);
  assert.equal(text.dh, pct(Math.floor((550 * gear.dh) / DIV)));
  assert.equal(text.spec, `+${Math.floor((150 * gear.piety) / DIV)} MP`);
  assert.equal(text.dot, `+${(Math.floor((130 * gear.sps) / DIV) / 10).toFixed(1)}%`);
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
  for (const [jobId, hasted] of Object.entries(expected)) {
    const sheet = sheetOf(jobId, [], { sync: { on: false, cap: 795 } });
    const gcd = setFigures(evaluateInSheet(sheet, { ...warSet(), pieces: [{ slot: 'weapon' }] })).find(f => f.key === 'gcd');
    assert.deepEqual([gcd.label, gcd.text, gcd.shown], ['GCD (with Haste)', hasted, `2.50s (${hasted})`], jobId);
  }
  // a job without haste keeps the plain label and no `shown`
  const sage = setFigures(evaluateInSheet(sheetOf('SGE', []), sageSet())).find(f => f.key === 'gcd');
  assert.deepEqual([sage.label, sage.shown], ['GCD', undefined]);
});

test("figureChange: signed difference in the figure's own unit and decimals; equal figures give null", () => {
  assert.deepEqual(figureChange('19.3%', '21.0%'), { text: '+1.7%', up: true });
  assert.deepEqual(figureChange('2.49s', '2.48s'), { text: '−0.01s', up: false });
  assert.equal(figureChange('+54.3%', '+54.3%'), null);
  assert.deepEqual(figureChange('6406', '6420'), { text: '+14', up: true });
  assert.deepEqual(figureChange('+120 MP', '+117 MP'), { text: '−3', up: false });
});

test('figuresAgainst: green when better, red when worse; the GCD is better lower', () => {
  const before = [
    { key: 'main', label: 'MND', text: '6406' },
    { key: 'gcd', label: 'GCD', text: '2.49s' },
    { key: 'crit', label: 'CRT', text: '19.3%' },
    { key: 'det', label: 'DET', text: '+8.1%' },
  ];
  const after = [
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
