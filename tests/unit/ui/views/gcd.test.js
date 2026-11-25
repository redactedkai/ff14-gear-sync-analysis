/* How the math works, GCD (src/ui/views/gcd.js): the facts for a speed, the step table around it, the level box's
   correction, the Haste menu and the chart; and the stored most-speed table it is held to (src/data/max-speed.json). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { levelParams } from '../../../../src/core/level-params.js';
import { recastMult } from '../../../../src/core/speed.js';
import { MAX_LEVEL, MAX_SPEED } from '../../../../src/core/tables.js';
import { HASTE } from '../../../../src/core/constants.js';
import {
  GCD_LEVELS,
  GCD_STEPS_NEAR,
  HASTE_OPTIONS,
  gcdControlsView,
  gcdLevelInput,
  gcdLevelTyped,
  gcdSpeedTyped,
  gcdView,
  speedPerStep,
  speedRange,
} from '../../../../src/ui/views/gcd.js';
import { groupMaxSpeed, jobGroups } from '../../../../scripts/data/gen_max_speed.mjs';
import { hasNumber } from '../../helpers/common.js';

const ROWS = 2 * GCD_STEPS_NEAR + 1;

test('recastMult: the speed modifier times the haste share (level 50, DIV 341)', () => {
  // 412 gear speed: 1000 - floor(130 x 412 / 341) = 843, a 15.7% cut; the GCD 2500 x 0.843 = 2.1075 -> 2.10 s
  assert.equal(recastMult(412, 50), 0.843);
  assert.equal(recastMult(0, 50), 1);
  assert.equal(recastMult(412, 50, 13), 0.843 * 0.87);
});

test('level box: out of range is corrected, with a note for its hover text; other text is no level', () => {
  assert.deepEqual(gcdLevelInput('50'), { level: 50 });
  assert.deepEqual(gcdLevelInput('150'), { level: 100 });
  assert.deepEqual(gcdLevelInput('0'), { level: 1 });
  for (const text of ['', '7.5', 'x']) {
    assert.equal(gcdLevelInput(text), null, text);
  }
});

test('the stored most speed: one value per level, at least the base, and level 50 as the searches give it', () => {
  assert.equal(MAX_SPEED.length, MAX_LEVEL);
  for (const [i, v] of MAX_SPEED.entries()) {
    assert.ok(v >= levelParams(i + 1).sub, `level ${i + 1}`);
  }
  // level 50: 341 base + 387 gear (level 100 gear synced to the 135 cap, melds) + 72 food
  assert.equal(MAX_SPEED[49], 800);
  const groups = jobGroups();
  const truncated = [];
  assert.equal(
    Math.max(...groups.map(g => groupMaxSpeed(g, 50, truncated) ?? 0)),
    MAX_SPEED[49],
    'regenerate: node scripts/data/gen_max_speed.mjs src/data/max-speed.json',
  );
  // no search stopped at the generator's node limit, so 800 is the true most speed
  assert.deepEqual(truncated, []);
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

test('haste menu: None, then each haste job and its source by name, with no percent', () => {
  assert.deepEqual(
    HASTE_OPTIONS.map(o => [o.value, o.label]),
    [
      ['', 'None'],
      ['MNK', 'Monk, Greased Lightning'],
      ['NIN', 'Ninja, Increase Attack Speed'],
      ['SAM', 'Samurai, Fuka'],
      ['VPR', 'Viper, Swiftscaled'],
    ],
  );
  // one option per haste job, and none shows a percent or a list of them (the percents are in the facts and the chart)
  assert.deepEqual(
    HASTE_OPTIONS.slice(1).map(o => o.value),
    Object.keys(HASTE),
  );
  for (const o of HASTE_OPTIONS) {
    assert.ok(!/[%/]|\d/.test(o.label), o.label);
  }
});

test('haste: the percent the level has is in the facts and the chart, so the menu needs none', () => {
  // Monk at level 70: Enhanced Greased Lightning II, 15%; at level 76 and up the III trait, 20%
  assert.equal(gcdView(70, 'MNK', null).facts.at(-1).value, '15%');
  assert.equal(gcdView(76, 'MNK', null).facts.at(-1).value, '20%');
  // the chart labels each step of a source with several values
  const marks = gcdView(70, 'MNK', null).chartSvg.match(/>\d+% at \d+</g);
  assert.deepEqual(marks, ['>5% at 1<', '>10% at 20<', '>15% at 40<', '>20% at 76<']);
  const sam78 = gcdView(78, 'SAM', null);
  assert.equal(sam78.facts.at(-1).value, '13%');
  assert.ok(sam78.facts.at(-1).label.includes('Fuka'), sam78.facts.at(-1).label);
  assert.equal(sam78.facts[0].value, '2.17s');
  assert.ok(sam78.facts[3].label.includes('13%'), sam78.facts[3].label);
  const early = gcdView(10, 'SAM', null).facts.at(-1);
  assert.equal(early.value, '0%');
  assert.ok(early.label.includes('Fuka') && hasNumber(early.label, 18), early.label); // the haste and the level it starts at
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

test('controls: the level follows the synced level until one is typed; the speed is held to that level range and the thumb fill follows it', () => {
  const { base, most } = speedRange(50);
  const atSync = gcdControlsView(null, 50, null);
  assert.deepEqual([atSync.level, atSync.base, atSync.most, atSync.speed, atSync.fill], [50, base, most, base, 0]);
  assert.equal(gcdControlsView(null, 50, most + 100).speed, most);
  assert.equal(gcdControlsView(null, 50, most + 100).fill, 100);
  assert.equal(gcdControlsView(null, 50, base - 1).speed, base);
  assert.ok(Math.abs(gcdControlsView(null, 50, Math.round((base + most) / 2)).fill - 50) < 1);
  // a typed level wins over the synced one, and the range follows it
  const typed = gcdControlsView(90, 50, null);
  assert.deepEqual([typed.level, typed.base, typed.most], [90, speedRange(90).base, speedRange(90).most]);
  assert.equal(gcdControlsView(null, 250, null).level, GCD_LEVELS, 'the synced level is held to the levels the tab covers');
});

test('Level box, settled: a level out of range is corrected, the synced level itself and an empty box follow the synced level, other text is an error', () => {
  assert.deepEqual(gcdLevelTyped('70', 50), { error: false, patch: { level: 70 }, shown: 70 });
  assert.deepEqual(gcdLevelTyped('250', 50), { error: false, patch: { level: GCD_LEVELS }, shown: GCD_LEVELS });
  assert.deepEqual(gcdLevelTyped('0', 50), { error: false, patch: { level: 1 }, shown: 1 });
  assert.deepEqual(gcdLevelTyped('50', 50), { error: false, patch: { level: null }, shown: 50 });
  assert.deepEqual(gcdLevelTyped('', 50), { error: false, patch: { level: null }, shown: 50 });
  assert.deepEqual(gcdLevelTyped('4.5', 50), { error: true, patch: null, shown: null });
});

test('speed box, settled: a number is kept as asked and the box shows the speed used; other text changes nothing', () => {
  const { base, most } = speedRange(50);
  assert.deepEqual(gcdSpeedTyped(`${most + 50}`, 50, null), { patch: { speed: most + 50 }, shown: most });
  assert.deepEqual(gcdSpeedTyped('600', 50, null), { patch: { speed: 600 }, shown: 600 });
  assert.deepEqual(gcdSpeedTyped('fast', 50, 600), { patch: null, shown: 600 });
  assert.deepEqual(gcdSpeedTyped('', 50, null), { patch: null, shown: base });
});
