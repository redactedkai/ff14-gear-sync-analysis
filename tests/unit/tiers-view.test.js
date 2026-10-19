/* How the math works, Tiers (src/ui/views/tiers.js): the ladder's view object, where its values come from (the
   optimizer result only when it was solved for the current settings), and typed values. Tier numbers are checked in
   tiers.test.js; here, the table's shape and wording. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AKH_LEVEL, appState } from './helpers/common.js';
import { optimizerKey, optimizerView, resultPanel } from '../../src/ui/views/optimizer.js';
import { TIER_NEAR, TIER_NEAR_MORE, tierFill, tierInput, tierLevel, tiersView, tierValues } from '../../src/ui/views/tiers.js';

const app = (job, patch = {}) => appState({ job, level: 100, sync: false }, patch);

test('no job: no view', () => {
  assert.equal(tiersView(appState(null), {}, {}, false), null);
});

test('Sage: a column group per substat, From and one column per effect, in the column names the header uses', () => {
  const a = app('SGE');
  // 2380 Critical Hit at level 100: 1960 gear, floor(200 x 1960 / 2780) = 141 -> 19.1% rate, +54.1% on a critical hit
  const v = tiersView(a, { crit: 2380 }, {}, false);
  assert.equal(v.title, 'Sage substat tiers at level');
  assert.equal(v.level, 100);
  assert.deepEqual(
    v.groups.map(g => [g.stat, g.span]),
    [
      ['crit', 3],
      ['det', 2],
      ['dh', 2],
      ['spd', 2],
      ['spec', 2],
    ],
  );
  assert.deepEqual(v.groups[0].lines, ['19.1% rate', '+54.1% on crit']);
  assert.deepEqual(v.groups[1].lines, ['+0.0% dmg & heal']); // no value given: the base
  assert.deepEqual(v.groups[3].lines, ['2.50s GCD']);
  assert.deepEqual(v.groups[4].lines, ['+0 MP']);
  assert.deepEqual(
    v.names.map(n => n.text),
    ['From', 'Rate', 'On crit', 'From', 'Dmg & heal', 'From', 'Rate', 'From', 'GCD', 'From', 'MP'],
  );
  assert.equal(v.cols.length, v.names.length);
  assert.equal(v.haste, '');
});

test('rows: the same count for every value, the current tier in the middle; empty cells keep the columns', () => {
  const a = app('SGE');
  for (const [more, near] of [
    [false, TIER_NEAR],
    [true, TIER_NEAR_MORE],
  ]) {
    const v = tiersView(a, { crit: 3022 }, {}, more);
    assert.equal(v.rows.length, 2 * near + 1);
    assert.equal(v.rows[near].label, 'Current');
    assert.ok(v.rows[near].cur);
    assert.equal(v.rows[0].label, `−${near}`);
    // every row has a cell per column, at the base too (Direct Hit has no tiers below it)
    for (const r of v.rows) assert.equal(r.cells.length, v.names.length);
  }
  const v = tiersView(a, { crit: 3022 }, {}, false);
  const dhFrom = v.names.findIndex((n, i) => n.text === 'From' && v.names[i + 1].text === 'Rate' && i > 2);
  assert.equal(v.rows[0].cells[dhFrom].text, '');
  assert.equal(v.rows[TIER_NEAR].cells[dhFrom].text, '420');
  // a click on any cell of a tier sets the value to the tier's start
  assert.equal(v.rows[TIER_NEAR].cells[0].to, 'crit:3020');
  assert.equal(v.rows[TIER_NEAR].cells[1].to, 'crit:3020');
  assert.deepEqual(v.foot[0], { span: 3, spare: '2', toNext: '12' });
});

test('Paladin: Tenacity has Dmg & heal and Dmg taken, the one that changes at a tier marked', () => {
  const v = tiersView(app('PLD'), { spec: 1617 }, {}, false);
  const ten = v.groups.find(g => g.stat === 'spec');
  assert.equal(ten.label, 'Tenacity');
  assert.deepEqual(ten.lines, ['+4.8% dmg & heal', '−8.6% dmg taken']);
  assert.deepEqual(
    v.names.slice(-3).map(n => n.text),
    ['From', 'Dmg & heal', 'Dmg taken'],
  );
  const cur = v.rows[TIER_NEAR].cells.slice(-3);
  assert.deepEqual(
    cur.map(c => [c.text, !!c.mark]),
    [
      ['1,616', false],
      ['+4.8%', false],
      ['−8.6%', true],
    ],
  );
  assert.match(ten.help.size, /Dmg & heal steps every 24 or 25 points and Dmg taken every 13 or 14/);
});

test('Monk: no special substat, and the GCD includes its haste', () => {
  const v = tiersView(app('MNK'), {}, {}, false);
  assert.deepEqual(
    v.groups.map(g => g.stat),
    ['crit', 'det', 'dh', 'spd'],
  );
  assert.equal(v.haste, 'Greased Lightning (20% haste)');
  assert.match(v.groups[3].help.size, /each 0\.01 s step is 85, 86, .* points/);
});

test('values: from the optimizer result only when it was solved for the current settings, else each base', () => {
  const a = app('SGE');
  assert.equal(tierFill(a), null);
  assert.deepEqual(tierValues(a), { crit: 420, det: 440, dh: 420, spd: 420, spec: 440 });
  const view = optimizerView(a);
  const values = resultPanel(a.jobCtx, view);
  a.optPanel = { key: optimizerKey(a), values };
  assert.deepEqual(tierFill(a), values);
  assert.deepEqual(tierValues(a), values);
  // the With food row's substats (Food is off by default: the Total row), base included
  assert.equal(values.crit, view.totals[a.jobCtx.stats.indexOf('crit')]);
  // any setting the result depends on: the result no longer applies
  for (const change of [{ level: 90 }, { sync: true, cap: 700 }, { opt: { ...a.opt, tb: 'crit' } }]) {
    const b = { ...a, ...change };
    assert.equal(tierFill(b), null, JSON.stringify(change));
  }
});

test('a typed value: held to the base and the box limit, with a note; not a number is ignored', () => {
  const a = app('SGE');
  assert.deepEqual(tierInput(a, 'crit', '3000'), { value: 3000, note: '' });
  assert.deepEqual(tierInput(a, 'crit', '5'), { value: 420, note: 'Under the base of 420; shown at 420.' });
  assert.deepEqual(tierInput(a, 'det', '400'), { value: 440, note: 'Under the base of 440; shown at 440.' });
  assert.equal(tierInput(a, 'crit', '1e9').value, 99999);
  assert.equal(tierInput(a, 'crit', ''), null);
  assert.equal(tierInput(a, 'crit', 'abc'), null);
});

test("the sub-tab's own level: the synced level until one is typed, held to the job's cap; bases and the result follow it", () => {
  const a = app('SGE');
  assert.equal(tierLevel(a, null), 100);
  assert.equal(tierLevel(a, 80), 80);
  assert.equal(tierLevel(a, 0), 1);
  assert.equal(tierLevel(app('BLU'), 100), 80);
  // AkhMorning's SUB at level 80 is 380 (AKH_LEVEL); the view says the level it shows
  assert.equal(tierValues(a, 80).spd, AKH_LEVEL[80][1]);
  assert.deepEqual(tierInput(a, 'crit', '5', 80), { value: 380, note: 'Under the base of 380; shown at 380.' });
  assert.equal(tiersView(a, {}, {}, false, 80).level, 80);
  // the optimizer result is for the synced level only
  a.optPanel = { key: optimizerKey(a), values: resultPanel(a.jobCtx, optimizerView(a)) };
  assert.equal(tierValues(a).crit, a.optPanel.values.crit);
  assert.equal(tierValues(a, 80).crit, 380);
});
