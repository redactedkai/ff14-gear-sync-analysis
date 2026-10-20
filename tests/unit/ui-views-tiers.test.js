/* How the math works, Tiers (src/ui/views/tiers.js): the view object (a card per substat), where its values come from,
   and typed values. Tier numbers are checked in core-tiers.test.js; here, the cards' shape and wording. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AKH_LEVEL } from './helpers/common.js';
import { makeJobContext } from '../../src/core/job-context.js';
import { MAX_SPEED } from '../../src/core/tables.js';
import { TIER_NEAR, tierInput, tierLevel, tiersView, tierValues } from '../../src/ui/views/tiers.js';

/* The job's context (the views take it, not the store); every test is at level 100 unless it names another. */
const app = id => makeJobContext(id);

test('no job: no view', () => {
  assert.equal(tiersView(null, {}, 100), null);
});

test('Sage: a card per substat, From and one column per effect, in the column names the header uses', () => {
  const a = app('SGE');
  // 2380 Critical Hit at level 100: 1960 gear, floor(200 x 1960 / 2780) = 141 -> 19.1% rate, +54.1% on a critical hit
  const v = tiersView(a, { crit: 2380 }, 100);
  assert.equal(v.level, 100);
  assert.deepEqual(
    v.cards.map(c => [c.stat, c.names]),
    [
      ['crit', ['From', 'Rate', 'On crit']],
      ['det', ['From', 'Dmg & heal']],
      ['dh', ['From', 'Rate']],
      ['spd', ['From', 'GCD']],
      ['spec', ['From', 'MP']],
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

test('rows: the same count in every card, its current tier in the middle unless near its base', () => {
  const v = tiersView(app('SGE'), { crit: 3022 }, 100);
  const [crit, , dh] = v.cards;
  for (const c of v.cards) {
    assert.equal(c.rows.length, 2 * TIER_NEAR + 1, c.stat);
    // a cell per column in every row, none empty (at the base the rows run on above it)
    assert.ok(
      c.rows.every(r => r.length === c.names.length && r.every(cell => cell.text !== '')),
      c.stat,
    );
  }
  assert.ok(crit.rows[TIER_NEAR][0].cur, 'Critical Hit, far above its base: the middle row');
  // Direct Hit at its base: its first row, not the middle
  assert.deepEqual([dh.rows[0][0].text, dh.rows[0][0].cur, dh.rows[TIER_NEAR][0].cur], ['420', true, false]);
  // a click on any cell of a tier sets the value to the tier's start
  assert.deepEqual([crit.rows[TIER_NEAR][0].to, crit.rows[TIER_NEAR][1].to], ['crit:3020', 'crit:3020']);
  assert.deepEqual(crit.foot, { spare: '2', toNext: '12' });
});

test('Paladin: Tenacity has Dmg & heal and Dmg taken, the one that changes at a tier marked', () => {
  const ten = tiersView(app('PLD'), { spec: 1617 }, 100).cards.find(c => c.stat === 'spec');
  assert.equal(ten.label, 'Tenacity');
  assert.deepEqual(ten.lines, ['+4.8% dmg & heal', '−8.6% dmg taken']);
  assert.deepEqual(ten.names, ['From', 'Dmg & heal', 'Dmg taken']);
  assert.deepEqual(
    ten.rows[TIER_NEAR].map(c => [c.text, !!c.mark]),
    [
      ['1,616', false],
      ['+4.8%', false],
      ['−8.6%', true],
    ],
  );
  assert.match(ten.help.size, /Dmg & heal steps every 24 or 25 points and Dmg taken every 13 or 14/);
});

test('Monk and Samurai: the speed card names the haste the GCD counts at the level', () => {
  const v = tiersView(app('MNK'), {}, 100);
  assert.deepEqual(
    v.cards.map(c => c.stat),
    ['crit', 'det', 'dh', 'spd'],
  );
  assert.equal(v.cards[3].haste, 'with Greased Lightning 20%');
  assert.deepEqual(
    v.cards.slice(0, 3).map(c => c.haste),
    ['', '', ''],
  );
  // Samurai: none before Fuka (level 18), 10% until 78, 13% from it
  const sam = level => tiersView(app('SAM'), {}, level).cards.find(c => c.stat === 'spd').haste;
  assert.deepEqual([sam(10), sam(70), sam(78)], ['', 'with Fuka 10%', 'with Fuka 13%']);
  assert.match(v.cards[3].help.size, /each 0\.01 s step is 85, 86, .* points/);
});

test('values: each substat starts at its base', () => {
  assert.deepEqual(tierValues(app('SGE'), 100), { crit: 420, det: 440, dh: 420, spd: 420, spec: 440 });
});

test('a typed value: held to the base and the most it can be, with no note; not a number is ignored', () => {
  const a = app('SGE');
  assert.equal(tierInput(a, 'crit', '3000', 100), 3000);
  assert.equal(tierInput(a, 'crit', '5', 100), 420);
  assert.equal(tierInput(a, 'det', '400', 100), 440);
  assert.equal(tierInput(a, 'crit', '1e9', 100), 99999);
  // speed: no more than any job can have at the level (the GCD tab's slider top)
  assert.equal(tierInput(a, 'spd', '99999', 100), MAX_SPEED[99]);
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
  assert.equal(tierValues(a, 80).spd, AKH_LEVEL[80][1]);
  assert.equal(tierInput(a, 'crit', '5', 80), 380);
  assert.equal(tiersView(a, {}, 80).level, 80);
});
