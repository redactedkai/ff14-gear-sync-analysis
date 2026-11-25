/* How the math works, Tiers (src/ui/views/tiers.js): the view object (a card per substat, every tier of it from the base
   up to the most a box takes, each row a range of panel values), where its values come from, and typed values. Tier
   numbers are checked in core/tiers.test.js; here, the cards' shape and wording. Expected tiers are worked by hand from
   AkhMorning's formulas at level 100 (DIV 2780, SUB 420), as in core/tiers.test.js. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AKH_LEVEL, hasNumber, hasParts } from '../../helpers/common.js';
import { makeJobContext } from '../../../../src/core/job-context.js';
import { MAX_SPEED } from '../../../../src/core/tables.js';
import {
  NO_TIER_EDITS,
  tierEdited,
  tierEditsKept,
  tierEditsKey,
  tierInput,
  tierLevel,
  tierLevelTyped,
  tierPicked,
  tiersView,
  tierValues,
} from '../../../../src/ui/views/tiers.js';

/* The job's context (the views take it, not the store); every test is at level 100 unless it names another. */
const app = id => makeJobContext(id);

/* A row's range text as [first, last] panel values (last null for "N+", equal to the first for a one-point tier). */
function bounds(range) {
  const number = text => Number(text.replaceAll(',', ''));
  if (range.endsWith('+')) {
    return [number(range.slice(0, -1)), null];
  }
  const [first, last = first] = range.split('–');
  return [number(first), number(last)];
}

test('no job: no view', () => {
  assert.equal(tiersView(null, {}, 100), null);
});

test('Sage: a card per substat, Points and one column per effect, in the column names the header uses', () => {
  const a = app('SGE');
  // 2380 Critical Hit at level 100: 1960 gear, floor(200 x 1960 / 2780) = 141 -> 19.1% rate, +54.1% on a critical hit
  const v = tiersView(a, { crit: 2380 }, 100);
  assert.equal(v.level, 100);
  assert.deepEqual(
    v.cards.map(c => [c.stat, c.names]),
    [
      ['crit', ['Points', 'Rate', 'On crit']],
      ['det', ['Points', 'Dmg & heal']],
      ['dh', ['Points', 'Rate']],
      ['sps', ['Points', 'GCD']],
      ['piety', ['Points', 'MP']],
    ],
  );
  assert.deepEqual(v.cards[0].lines, ['19.1% rate', '+54.1% on crit']);
  assert.deepEqual(v.cards[1].lines, ['+0.0% dmg & heal']); // no value given: the base
  assert.deepEqual(v.cards[3].lines, ['2.50s GCD']);
  assert.deepEqual(v.cards[4].lines, ['+0 MP']);
  assert.ok(
    v.cards.every(c => c.haste === ''),
    'Sage: no haste',
  );
});

test('rows: every tier from the base to the most a box takes, each a range of panel values', () => {
  // the most any substat can be at level 100 is 3679 (MAX_SPEED): 3259 gear points over the base of 420
  const v = tiersView(app('SGE'), { crit: 3022 }, 100);
  const [crit, det, dh, , piety] = v.cards;
  // Critical Hit steps every 13.9 points: floor(200 x 3259 / 2780) = 234 steps, so 235 tiers. Determination every 19.9:
  // 164 steps; Direct Hit every 5.05: 644; Piety every 18.5: 175
  assert.deepEqual(
    [crit, det, dh, piety].map(c => c.rows.length),
    [235, 165, 645, 176],
  );
  assert.deepEqual(
    crit.rows.slice(0, 3).map(r => r.range),
    ['420–433', '434–447', '448–461'],
  );
  assert.deepEqual(
    dh.rows.slice(0, 3).map(r => r.range),
    ['420–425', '426–430', '431–435'],
  );
  // the last tier has no end to show: its first value and a plus
  assert.equal(crit.rows.at(-1).range, '3,673+');
  assert.equal(crit.rows.at(-2).range, '3,659–3,672');
  assert.equal(dh.rows.at(-1).range, '3,676+');
  for (const c of v.cards) {
    // a range and a value per effect in every row, none empty
    assert.ok(
      c.rows.every(r => r.range !== '' && r.values.length === c.names.length - 1 && r.values.every(text => text !== '')),
      c.stat,
    );
    // the rows follow each other: a row ends the value before the next one starts, the last one stays open
    for (let i = 1; i < c.rows.length; i++) {
      assert.equal(bounds(c.rows[i - 1].range)[1] + 1, bounds(c.rows[i].range)[0], `${c.stat} row ${i}`);
    }
    assert.equal(bounds(c.rows.at(-1).range)[1], null, c.stat);
  }
  // the value's tier: Critical Hit 3022 is gear 2602, tier floor(200 x 2602 / 2780) = 187, the 188th row
  assert.equal(crit.cur, 187);
  assert.equal(crit.rows[crit.cur].range, '3,020–3,033');
  // Direct Hit at its base: its first row
  assert.deepEqual([dh.cur, dh.rows[0].range], [0, '420–425']);
  // a click on a row sets the value to the tier's start
  assert.equal(crit.rows[crit.cur].to, 'crit:3020');
  assert.deepEqual(crit.foot, { spare: '2', toNext: '12' });
});

test('rows are made once per job and level: a value, a click or a typed number does not change them', () => {
  const crit = (id, value, level) => tiersView(app(id), { crit: value }, level).cards[0];
  const first = crit('SGE', 3022, 100);
  assert.equal(crit('SGE', 600, 100).rowsKey, first.rowsKey);
  assert.equal(crit('SGE', 600, 100).rows, first.rows);
  assert.notEqual(crit('SGE', 600, 99).rowsKey, first.rowsKey);
  assert.notEqual(crit('WHM', 600, 100).rowsKey, first.rowsKey);
});

test('a value at the most a box takes is in the last tier, which has no next', () => {
  const crit = tiersView(app('SGE'), { crit: MAX_SPEED[99] }, 100).cards[0];
  assert.equal(crit.cur, crit.rows.length - 1);
  // 3679 is 6 points into the tier that starts at 3673
  assert.deepEqual([crit.foot.spare, crit.foot.toNext], ['6', null]);
});

test('Sage: Spell Speed tiers are the GCD steps, the first shorter, the last one open', () => {
  const sps = tiersView(app('SGE'), {}, 100).cards.find(c => c.stat === 'sps');
  // AkhMorning level 100: gear speed 22 -> 2.49 s, 107 -> 2.48 s, 193 -> 2.47 s: 442, 527 and 613 on the panel (validation.md)
  assert.deepEqual(
    sps.rows.slice(0, 4).map(r => [r.range, r.values[0]]),
    [
      ['420–441', '2.50s'],
      ['442–526', '2.49s'],
      ['527–612', '2.48s'],
      ['613–697', '2.47s'],
    ],
  );
  // about 3259 / 85.5 steps, and the GCD never rises
  assert.ok(sps.rows.length > 35 && sps.rows.length < 45, `${sps.rows.length} speed tiers`);
  assert.equal(bounds(sps.rows.at(-1).range)[1], null);
  const gcds = sps.rows.map(r => Number(r.values[0].slice(0, -1)));
  assert.ok(gcds.every((gcd, i) => i === 0 || gcd < gcds[i - 1]));
});

test('Paladin: Tenacity has uneven tiers, one point long where its two effects step next to each other', () => {
  const ten = tiersView(app('PLD'), {}, 100).cards.find(c => c.stat === 'ten');
  // Dmg & heal steps every 24.8 points, Dmg taken every 13.9: 357 tiers up to 3679. At 545 Dmg & heal steps (floor(112 x
  // 125 / 2780) = 5) and at 546 Dmg taken (floor(200 x 126 / 2780) = 9): the tier at 545 is one point
  assert.equal(ten.rows.length, 357);
  assert.deepEqual(
    ten.rows.filter(r => ['532–544', '545', '546–558'].includes(r.range)).map(r => [r.range, r.values]),
    [
      ['532–544', ['+0.4%', '−0.8%']],
      ['545', ['+0.5%', '−0.8%']],
      ['546–558', ['+0.5%', '−0.9%']],
    ],
  );
  assert.deepEqual(
    ten.rows.slice(-2).map(r => r.range),
    ['3,672', '3,673+'],
  );
});

test('Paladin: Tenacity has Dmg & heal and Dmg taken, the one that changes at a tier marked', () => {
  const ten = tiersView(app('PLD'), { ten: 1617 }, 100).cards.find(c => c.stat === 'ten');
  assert.equal(ten.label, 'Tenacity');
  assert.deepEqual(ten.lines, ['+4.8% dmg & heal', '−8.6% dmg taken']);
  assert.deepEqual(ten.names, ['Points', 'Dmg & heal', 'Dmg taken']);
  // 1617 is gear 1197: the tier from 1,616 to 1,629, where only Dmg taken changed
  const row = ten.rows[ten.cur];
  assert.deepEqual([row.range, row.values, row.marks], ['1,616–1,629', ['+4.8%', '−8.6%'], [false, true]]);
  for (const number of [24, 25, 13, 14]) {
    assert.ok(hasNumber(ten.help.size, number), `${number} in: ${ten.help.size}`);
  }
});

test('Monk and Samurai: the speed card names the haste the GCD counts at the level', () => {
  const v = tiersView(app('MNK'), {}, 100);
  assert.deepEqual(
    v.cards.map(c => c.stat),
    ['crit', 'det', 'dh', 'sks'],
  );
  assert.ok(hasParts(v.cards[3].haste, 'Greased Lightning', '20%'), v.cards[3].haste);
  assert.deepEqual(
    v.cards.slice(0, 3).map(c => c.haste),
    ['', '', ''],
  );
  // Samurai: none before Fuka (level 18), 10% until 78, 13% from it
  const sam = level => tiersView(app('SAM'), {}, level).cards.find(c => c.stat === 'sks').haste;
  assert.equal(sam(10), '');
  assert.ok(hasParts(sam(70), 'Fuka', '10%'), sam(70));
  assert.ok(hasParts(sam(78), 'Fuka', '13%'), sam(78));
  assert.ok(hasNumber(v.cards[3].help.size, 85) && hasNumber(v.cards[3].help.size, 86), v.cards[3].help.size);
});

test('values: each substat starts at its base', () => {
  assert.deepEqual(tierValues(app('SGE'), 100), { crit: 420, det: 440, dh: 420, sps: 420, piety: 440 });
});

test('a typed value: held to the base and the most it can be, with no note; not a number is ignored', () => {
  const a = app('SGE');
  assert.equal(tierInput(a, 'crit', '3000', 100), 3000);
  assert.equal(tierInput(a, 'crit', '5', 100), 420);
  assert.equal(tierInput(a, 'det', '400', 100), 440);
  // the most is the same for every substat: the most any job can have of one at the level (the GCD tab's slider top)
  assert.equal(tierInput(a, 'crit', '1e9', 100), MAX_SPEED[99]);
  assert.equal(tierInput(a, 'sps', '99999', 100), MAX_SPEED[99]);
  assert.equal(tierInput(a, 'crit', '', 100), null);
  assert.equal(tierInput(a, 'crit', 'abc', 100), null);
});

test("the sub-tab's own level: the synced level until one is typed, held to the job's cap; the bases follow it", () => {
  const a = app('SGE');
  assert.equal(tierLevel(a, 100, null), 100);
  assert.equal(tierLevel(a, 100, 80), 80);
  assert.equal(tierLevel(a, 100, 0), 1);
  assert.equal(tierLevel(app('BLU'), 100, 100), 80);
  // AkhMorning's SUB at level 80 is 380 (AKH_LEVEL); the view says the level it shows
  assert.equal(tierValues(a, 80).sps, AKH_LEVEL[80][1]);
  assert.equal(tierInput(a, 'crit', '5', 80), 380);
  assert.equal(tiersView(a, {}, 80).level, 80);
});

test('values typed or clicked are kept until the job or the level changes, and stay dropped when the settings come back', () => {
  const sage = app('SGE');
  const key100 = tierEditsKey(sage, 100);
  // a click on a row ('stat:start') sets that substat only; a later one adds to it
  const picked = tierPicked('det:420');
  const clicked = tierEdited(NO_TIER_EDITS, key100, picked.stat, picked.value);
  assert.deepEqual(picked, { stat: 'det', value: 420 });
  const both = tierEdited(clicked, key100, 'crit', 600);
  assert.deepEqual(tierEditsKept(both, key100).values, { det: 420, crit: 600 });
  // another level or job: none apply, and a value made there replaces them
  assert.deepEqual(tierEditsKept(both, tierEditsKey(sage, 60)).values, {});
  assert.deepEqual(tierEditsKept(both, tierEditsKey(app('WHM'), 100)).values, {});
  assert.deepEqual(tierEdited(both, tierEditsKey(sage, 60), 'det', 300).values, { det: 300 });
  // the page drops them for good when the settings change (an element keeps what tierEditsKept returns), so the old ones do not come back
  const dropped = tierEditsKept(both, tierEditsKey(sage, 60));
  assert.deepEqual(tierEditsKept(dropped, key100).values, {});
  // the cards show them on top of the bases
  const view = tiersView(sage, { ...tierValues(sage, 100), ...both.values }, 100);
  assert.deepEqual([view.cards[0].value, view.cards[1].value], [600, 420]);
});

test("the Level box: each valid level counts as typed; the job's level cap, or an emptied box left, is the default level again", () => {
  const beastmaster = app('BST'); // level cap 50
  // typing: a level in range counts (the cap itself follows the cap: null), one out of range or no number waits
  assert.deepEqual(tierLevelTyped(beastmaster, '45', 50), { patch: { level: 45 }, shown: null });
  assert.deepEqual(tierLevelTyped(beastmaster, '50', 45), { patch: { level: null }, shown: null });
  assert.equal(tierLevelTyped(beastmaster, '60', 45), null);
  assert.equal(tierLevelTyped(beastmaster, 'abc', 45), null);
  assert.equal(tierLevelTyped(beastmaster, '', 45), null);
  assert.equal(tierLevelTyped(beastmaster, '45', 45).patch, null, 'the level in use already: nothing to count');
  // leaving the box: out of range moves to the nearest end and the box shows it; an empty box shows the level cap and follows it
  assert.deepEqual(tierLevelTyped(beastmaster, '60', 45, true), { patch: { level: null }, shown: 50 });
  assert.deepEqual(tierLevelTyped(beastmaster, '0', 45, true), { patch: { level: 1 }, shown: 1 });
  assert.deepEqual(tierLevelTyped(beastmaster, '', 30, true), { patch: { level: null }, shown: 50 });
  assert.equal(
    tierLevelTyped(beastmaster, '60', 50, true).patch,
    null,
    'a level out of range at the cap changes nothing, but the box is corrected',
  );
  assert.equal(tierLevelTyped(beastmaster, '60', 50, true).shown, 50);
});
