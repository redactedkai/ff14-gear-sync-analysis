/* How the math works, GCD (src/ui/views/gcd.js): the facts for a speed, the step table around it, the level box's
   correction, the Haste menu and the chart; and the stored most-speed table it is held to (src/data/max-speed.json). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recastMult, speedParams } from '../../src/core/speed.js';
import { MAX_SPEED } from '../../src/core/tables.js';
import { GCD_STEPS_NEAR, HASTE_OPTIONS, gcdLevelInput, gcdView, speedPerStep, speedRange } from '../../src/ui/views/gcd.js';
import { groupMaxSpeed, jobGroups } from '../../scripts/data/gen_max_speed.mjs';

const ROWS = 2 * GCD_STEPS_NEAR + 1;

test('recastMult: the speed modifier times the haste share (level 50, DIV 341)', () => {
  // 412 gear speed: 1000 - floor(130 x 412 / 341) = 843, a 15.7% cut; the GCD 2500 x 0.843 = 2.1075 -> 2.10 s
  assert.equal(recastMult(412, 50), 0.843);
  assert.equal(recastMult(0, 50), 1);
  assert.equal(recastMult(412, 50, 13), 0.843 * 0.87);
});

test('level box: out of range is corrected with a note, as Synced item level is; other text is no level', () => {
  assert.deepEqual(gcdLevelInput('50'), { level: 50, note: '' });
  assert.deepEqual(gcdLevelInput('150'), { level: 100, note: 'Lowered to 100, the highest level.' });
  assert.deepEqual(gcdLevelInput('0'), { level: 1, note: 'Raised to 1, the lowest level.' });
  for (const text of ['', '7.5', 'x']) assert.equal(gcdLevelInput(text), null, text);
});

test('the stored most speed: one value per level, at least the base, and level 50 as the searches give it', () => {
  assert.equal(MAX_SPEED.length, 100);
  for (const [i, v] of MAX_SPEED.entries()) assert.ok(v >= speedParams(i + 1).sub, `level ${i + 1}`);
  // level 50: 341 base + 387 gear (level 100 gear synced to the 135 cap, melds) + 72 food
  assert.equal(MAX_SPEED[49], 800);
  const groups = jobGroups();
  assert.equal(
    Math.max(...groups.map(g => groupMaxSpeed(g, 50) ?? 0)),
    MAX_SPEED[49],
    'regenerate: node scripts/data/gen_max_speed.mjs src/data/max-speed.json',
  );
  // above a limited job's level cap it has no value
  assert.equal(
    groupMaxSpeed(
      groups.find(g => g.jobs.includes('BST')),
      51,
    ),
    null,
  );
});

test('facts at level 50 with 753 speed: the optimizer reaches the same GCD and next step (2.10 s, +11)', () => {
  const v = gcdView(50, '', 753);
  assert.deepEqual(
    v.facts.map(f => [f.value, f.label]),
    [
      ['2.10s', 'GCD (2.50s at base)'],
      ['28.6', 'GCDs / min (24.0 at base)'],
      ['+11', 'more to reach 2.09s'],
      ['−15.7%', 'cast and recast times'],
      ['+15.7%', 'DoT, HoT and auto-attacks'],
    ],
  );
  assert.deepEqual([v.base, v.most, v.speed], [341, 800, 753]);
});

test("the speed is held to the level's range; none asked is the base, with nothing cut", () => {
  assert.equal(gcdView(50, '', 5000).speed, 800);
  assert.equal(gcdView(50, '', 1).speed, 341);
  const atBase = gcdView(50, '', null);
  assert.equal(atBase.speed, 341);
  assert.deepEqual(atBase.facts[3].value, '0.0%');
  assert.deepEqual(atBase.facts[4].value, '0.0%');
  assert.equal(atBase.fill, 0);
});

test("steps: always 13, the speed's step in the middle unless near the base; past the most greyed out", () => {
  const mid = gcdView(50, '', 753).steps;
  assert.equal(mid.length, ROWS);
  assert.equal(
    mid.findIndex(r => r.cur),
    GCD_STEPS_NEAR,
  );
  assert.deepEqual(mid[GCD_STEPS_NEAR], { speed: 753, gcd: '2.10s', cut: '−15.7%', cur: true, out: false });
  // at the base no rows are left empty: the base step first, then the next twelve
  const base = gcdView(50, '', null).steps;
  assert.equal(base.length, ROWS);
  assert.equal(
    base.findIndex(r => r.cur),
    0,
  );
  assert.deepEqual([base[0].speed, base[1].speed, base[2].speed], [341, 344, 355]); // AkhMorning: gear 3 and 14
  // at the most (800) the steps above it are out of reach
  const top = gcdView(50, '', 800).steps;
  assert.ok(top.filter(r => r.speed > 800).every(r => r.out));
  assert.ok(top.filter(r => r.speed <= 800).every(r => !r.out));
});

test('haste: the menu lists every percent, the facts name the haste the level has, or when it starts', () => {
  assert.deepEqual(
    HASTE_OPTIONS.map(o => o.label),
    [
      'None',
      'Monk, Greased Lightning: 5/10/15/20%',
      'Ninja, Increase Attack Speed: 15%',
      'Samurai, Fuka: 10/13%',
      'Viper, Swiftscaled: 15%',
    ],
  );
  const sam78 = gcdView(78, 'SAM', null);
  assert.deepEqual(sam78.facts.at(-1), { value: '13%', label: 'haste (Fuka)' });
  assert.equal(sam78.facts[0].value, '2.17s');
  assert.equal(sam78.facts[3].label, 'cast and recast times, with 13% haste');
  assert.deepEqual(gcdView(10, 'SAM', null).facts.at(-1), { value: '0%', label: 'Fuka starts at level 18' });
  // the chart marks where it starts and grows
  assert.equal((sam78.chartSvg.match(/class="hasteline"/g) ?? []).length, 2);
  assert.equal((gcdView(50, '', null).chartSvg.match(/class="hasteline"/g) ?? []).length, 0);
});

test("the chart: a bar per level, the tab's level highlighted; a step takes about 10 or 11 speed at level 50", () => {
  const svg = gcdView(50, '', null).chartSvg;
  assert.equal((svg.match(/data-level="/g) ?? []).length, 100);
  assert.match(svg, /class="stepbar on" data-level="50"/);
  // the first ten steps at level 50: the first only 3 (the base sits partway into it), then 10 or 11 (AkhMorning: 4 x
  // 341 / 130 = 10.5), 98 in all: about 10
  assert.equal(speedPerStep(50), 9.8);
  assert.match(svg, />level 50: ~10</);
  assert.deepEqual(speedRange(100), { base: 420, most: MAX_SPEED[99] });
});
