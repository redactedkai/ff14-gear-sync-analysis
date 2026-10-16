/* Food (src/core/food.js): the bonus formula, the base it starts from, the job's food choices, the best meal for a goal,
   and the property the optimizer relies on (gear plus food rises with every gear point). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEVEL_MAIN } from '../../src/core/constants.js';
import { bestFood, foodBonus, foodChoices, gearNeeded, statBase, withFood } from '../../src/core/food.js';
import { makeJobContext } from '../../src/core/job-context.js';
import { mkItem } from '../../src/core/items.js';
import { optimize } from '../../src/core/optimizer/index.js';
import { PG, FOODS } from '../../src/core/tables.js';
import { rngInt } from './helpers/common.js';

const SGE = makeJobContext('SGE');
const WAR = makeJobContext('WAR');
const DRG = makeJobContext('DRG');
const JOB_IDS = ['PLD', 'WHM', 'SGE', 'DRG', 'NIN', 'BLM', 'BLU', 'BST'];

test('LEVEL_MAIN: 100 levels, equal to xivgear at 50, 60, ..., 100, never falling', () => {
  assert.equal(LEVEL_MAIN.length, 100);
  // xivgear LEVEL_STATS baseMainStat (packages/xivmath/src/xivconstants.ts, commit 6c3c878)
  const xivgear = { 50: 202, 60: 218, 70: 292, 80: 340, 90: 390, 100: 440 };
  for (const [lv, v] of Object.entries(xivgear)) assert.equal(LEVEL_MAIN[lv - 1], v, `level ${lv}`);
  assert.ok(LEVEL_MAIN.every((v, i) => i === 0 || v >= LEVEL_MAIN[i - 1]));
});

test('base: Determination and Piety from the main stat base, the other substats from ParamGrow BaseSpeed', () => {
  assert.equal(statBase(SGE, 'det', 50), 202);
  assert.equal(statBase(SGE, 'spec', 50), 202); // Piety
  assert.equal(statBase(WAR, 'spec', 50), PG[49][0]); // Tenacity
  for (const s of ['crit', 'dh', 'spd']) assert.equal(statBase(SGE, s, 100), 420);
  assert.equal(statBase(SGE, 'crit', 100), PG[99][0]);
});

test('food data: real HQ meals from the game files', () => {
  const byName = Object.fromEntries(FOODS.map(f => [f[0], f]));
  // ItemFood rows of these meals (datamining d9582a6): HQ 10% up to 151 / 91, Vitality left out
  assert.deepEqual(byName['Rroneek au Gratin'], [
    'Rroneek au Gratin',
    770,
    [
      ['sps', 10, 151],
      ['dh', 10, 91],
    ],
  ]);
  assert.deepEqual(byName['Prune Ponzecake'], [
    'Prune Ponzecake',
    770,
    [
      ['piety', 10, 151],
      ['det', 10, 91],
    ],
  ]);
  // a one-substat meal (Vitality plus Critical Hit)
  assert.deepEqual(byName['Royal Toast'], ['Royal Toast', 656, [['crit', 10, 107]]]);
  assert.ok(FOODS.every(f => f[2].length >= 1 && f[2].length <= 2 && f[2].every(([k]) => k !== 'vit')));
  assert.ok(
    FOODS.every((f, i) => i === 0 || f[1] >= FOODS[i - 1][1]),
    'sorted by item level',
  );
});

test('within a stat pair, a newer meal never has a lower maximum (each choice can be the newest of its pair)', () => {
  const byPair = new Map();
  for (const [name, ilvl, stats] of FOODS) {
    const key = stats.map(s => s[0]).join('+');
    const prev = byPair.get(key);
    if (prev)
      for (const [i, s] of stats.entries()) assert.ok(s[2] >= prev.stats[i][2] && s[1] >= prev.stats[i][1], `${name} vs ${prev.name}`);
    byPair.set(key, { name, ilvl, stats });
  }
});

test('bonus: xivgear test values (custom food 12% up to 200 Critical Hit, 10% up to 100 Direct Hit on 420)', () => {
  // xivgear custom_items_test.ts "Supports a custom food": 420 Critical Hit -> 470, 420 Direct Hit -> 462. 420 is the
  // level 100 base, so these are a character with no gear points in either stat.
  const food = {
    stats: [
      { stat: 'crit', pct: 12, max: 200 },
      { stat: 'dh', pct: 10, max: 100 },
    ],
  };
  const b = foodBonus(DRG, food, { crit: 0, dh: 0 }, 100);
  assert.deepEqual(b, { crit: { bonus: 50, capped: false }, dh: { bonus: 42, capped: false } });
  assert.deepEqual([420 + b.crit.bonus, 420 + b.dh.bonus], [470, 462]);
});

test('bonus: a percentage of base plus gear, rounded down, up to the maximum', () => {
  const food = {
    stats: [
      { stat: 'spd', pct: 10, max: 151 },
      { stat: 'det', pct: 10, max: 91 },
    ],
  };
  // level 50: speed 341 + 344 = 685 -> 68; Determination 202 + 344 = 546 -> 54
  assert.deepEqual(foodBonus(SGE, food, { spd: 344, det: 344 }, 50), {
    spd: { bonus: 68, capped: false },
    det: { bonus: 54, capped: false },
  });
  // level 100 with full gear: both at the maximum
  assert.deepEqual(foodBonus(SGE, food, { spd: 2500, det: 2500 }, 100), {
    spd: { bonus: 151, capped: true },
    det: { bonus: 91, capped: true },
  });
  // exactly at the maximum counts as capped: 10% of (420 + 1090) = 151
  assert.deepEqual(foodBonus(SGE, food, { spd: 1090 }, 100).spd, { bonus: 151, capped: true });
  assert.deepEqual(foodBonus(SGE, food, { spd: 1089 }, 100).spd, { bonus: 150, capped: false });
  // a stat with no gear points still gets the percentage of its base
  assert.equal(foodBonus(SGE, food, {}, 50).det.bonus, 20);
  assert.deepEqual(withFood({ spd: 344, crit: 5 }, foodBonus(SGE, food, { spd: 344 }, 50)), { spd: 412, crit: 5, det: 20 });
});

test('gear plus food rises with every gear point, for every choice, stat and level (the gear set never changes)', () => {
  for (const id of JOB_IDS) {
    const job = makeJobContext(id);
    for (const c of foodChoices(job)) {
      for (const level of [1, 30, 50, 63, 80, 100]) {
        for (const s of c.stats) {
          let last = -1;
          for (let g = 0; g <= 4000; g += 1) {
            const v = g + foodBonus(job, c, { [s.stat]: g }, level)[s.stat].bonus;
            assert.ok(v > last, `${id} ${c.key} ${s.stat} level ${level} gear ${g}`);
            last = v;
          }
        }
      }
    }
  }
});

test('choices: only stats the job has, none covered by another, and every relevant meal covered by one', () => {
  for (const id of JOB_IDS) {
    const job = makeJobContext(id);
    const choices = foodChoices(job);
    assert.ok(choices.length > 0, id);
    assert.ok(
      choices.every(c => c.stats.every(s => job.substats.includes(s.stat))),
      id,
    );
    assert.equal(new Set(choices.map(c => c.key)).size, choices.length, id);
    const covers = (a, b) => b.stats.every(s => a.stats.some(x => x.stat === s.stat && x.pct >= s.pct && x.max >= s.max));
    for (const c of choices) assert.ok(!choices.some(d => d !== c && covers(d, c)), `${id} ${c.key} is covered`);
    // every meal the job can use is matched or beaten on each stat by some choice, so leaving it out loses nothing
    const raw = {
      crit: 'crit',
      det: 'det',
      dh: 'dh',
      [job.profile.spd]: 'spd',
      ...(job.profile.spec ? { [job.profile.spec]: 'spec' } : {}),
    };
    for (const [name, , stats] of FOODS) {
      if (!stats.every(([k]) => raw[k])) continue;
      const meal = { stats: stats.map(([k, pct, max]) => ({ stat: raw[k], pct, max })) };
      assert.ok(
        choices.some(c => covers(c, meal)),
        `${id}: ${name} is not covered`,
      );
    }
  }
  // Piety and Tenacity meals only for the jobs that have the stat
  assert.ok(foodChoices(SGE).some(c => c.key.includes('spec')));
  assert.ok(!foodChoices(DRG).some(c => c.key.includes('spec')));
});

/* every choice, compared on (keys..., food points in all), the highest first; the first in the list on a tie */
function bruteBest(job, choices, totals, level, keys) {
  const vals = c => {
    const b = foodBonus(job, c, totals, level);
    const t = withFood(totals, b);
    return [...keys.filter(Boolean).map(k => t[k] || 0), Object.values(b).reduce((n, x) => n + x.bonus, 0)];
  };
  return [...choices].sort((a, b) => {
    const va = vals(a),
      vb = vals(b);
    const i = va.findIndex((v, j) => v !== vb[j]);
    return i < 0 ? choices.indexOf(a) - choices.indexOf(b) : vb[i] - va[i];
  })[0];
}

test('best food for the goal equals trying every choice', () => {
  const rand = rngInt(11);
  for (const id of JOB_IDS) {
    const job = makeJobContext(id);
    const choices = foodChoices(job);
    for (let k = 0; k < 40; k++) {
      const totals = Object.fromEntries(job.stats.map(s => [s, rand(3000)]));
      const level = [50, 70, 90, 100][k % 4];
      const keys = [job.stats[rand(job.stats.length)], rand(2) ? job.substats[rand(job.substats.length)] : '', ''];
      assert.equal(bestFood(job, choices, totals, level, keys), bruteBest(job, choices, totals, level, keys), `${id} ${keys}`);
    }
  }
});

test('optimizer gear plus best food equals the best (gear set, meal) pair over every loadout and meal', () => {
  // three pieces in each of four slots: 81 loadouts, each with every Sage choice
  const stat = (a, b, c) => ({ spd: a, crit: b, det: c, main: 10, vit: 10 });
  const pool = [];
  ['head', 'body', 'hands', 'legs'].forEach((t, i) => {
    pool.push(
      mkItem(`${t} a`, t, 130, stat(20 + i, 5, 0)),
      mkItem(`${t} b`, t, 130, stat(18, 9 + i, 3)),
      mkItem(`${t} c`, t, 130, stat(19, 0, 12 - i)),
    );
  });
  const choices = foodChoices(SGE);
  for (const [target, tb] of [
    ['spd', 'crit'],
    ['crit', 'det'],
    ['det', ''],
    ['main', 'spd'],
  ]) {
    const keys = [target, tb, ''];
    const opt = optimize(SGE, pool, { cap: null, sync: false, level: 50 }, { target, tiebreak: [tb, ''] });
    const meal = bestFood(SGE, choices, opt.totals, 50, keys);
    const mine = withFood(opt.totals, foodBonus(SGE, meal, opt.totals, 50));
    let best = null;
    const by = t => pool.filter(i => i.type === t);
    for (const a of by('head'))
      for (const b of by('body'))
        for (const c of by('hands'))
          for (const d of by('legs')) {
            const g = {};
            for (const it of [a, b, c, d]) for (const s of SGE.stats) g[s] = (g[s] || 0) + (it.stats[s] || 0);
            for (const f of choices) {
              const t = withFood(g, foodBonus(SGE, f, g, 50));
              const v = keys.filter(Boolean).map(k => t[k]);
              const i = best ? v.findIndex((x, j) => x !== best[j]) : 0;
              if (!best || (i >= 0 && v[i] > best[i])) best = v;
            }
          }
    assert.deepEqual(
      keys.filter(Boolean).map(k => mine[k]),
      best,
      `${target}/${tb}`,
    );
  }
});

test('gearNeeded: the fewest gear points that reach a total with food', () => {
  const [food] = foodChoices(SGE).filter(c => c.key === 'spd+dh');
  assert.equal(gearNeeded(SGE, food, 'spd', 412, 50), 344); // 344 + 68
  assert.equal(gearNeeded(SGE, food, 'spd', 411, 50), 343); // 343 + floor(68.4)
  assert.equal(gearNeeded(SGE, null, 'spd', 412, 50), 412);
  assert.equal(gearNeeded(SGE, food, 'crit', 412, 50), 412); // no Critical Hit on this meal
  for (const level of [50, 100])
    for (let total = 0; total <= 3000; total += 37) {
      const g = gearNeeded(SGE, food, 'spd', total, level);
      const reach = x => x + foodBonus(SGE, food, { spd: x }, level).spd.bonus >= total;
      assert.ok(reach(g) && (g === 0 || !reach(g - 1)), `level ${level}, total ${total}`);
    }
});
