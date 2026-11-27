/* The clan and the party bonus in evaluateSet (src/core/set.ts) and foodBonus (src/core/food.ts). Expected numbers are
   summed by hand from real items a Warrior in the Ironworks and Demon armor of Fending (item level
   120, no sync), whose gear is 342 Strength and 356 Vitality at the level 100 base of 462 Strength and 484 Vitality
   (440 x 105% and 110%), and a Sage in the crafted item level 115 set, whose gear is 279 Mind and 257 Vitality at 506 and 440. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allMeals, foodBonus } from '../../../src/core/food.ts';
import { makeJobContext } from '../../../src/core/job-context.ts';
import { evaluateSet, makeSet } from '../../../src/core/set.ts';
import { rawGear, sageSet, warSet } from '../helpers/sheet-fixtures.ts';

const NO_SYNC = { cap: 795, sync: false, level: 100 };

const war = makeJobContext('WAR');
const sage = makeJobContext('SGE');
const warGear = rawGear('WAR', warSet().pieces);

/* The saved set's rows as a core set for `job`, with `meal` (an allMeals key or null); the rows a two-handed job does not use
   (the Warrior set repeats its axe in the off-hand row) are emptied, as evaluateInSheet does. */
function coreSet(job, saved, meal = null) {
  return makeSet(
    saved.pieces.map(p => (job.activeSlotTypes.includes(p.slot) ? p : { slot: p.slot })),
    meal,
  );
}

test('the raw gear of the Warrior set is the 342 Strength and 356 Vitality the other numbers are built on', () => {
  assert.equal(warGear.str, 342);
  assert.equal(warGear.vit, 356);
});

test('no bonuses: the panel is base + gear (+ meal) and nothing else changes', () => {
  const plain = evaluateSet(war, coreSet(war, warSet(), null), NO_SYNC, 100);
  assert.deepEqual(plain.bonuses, { clan: null, partyRoles: 0 });
  for (const stat of war.stats) {
    assert.equal(plain.panelGear[stat], plain.base[stat] + plain.gear[stat], stat);
    assert.equal(plain.panel[stat], plain.base[stat] + plain.withFood[stat], stat);
  }
  const meal = allMeals(war).at(-1).key;
  const fed = evaluateSet(war, coreSet(war, warSet(), meal), NO_SYNC, 100);
  for (const stat of war.stats) {
    assert.equal(fed.panel[stat], fed.base[stat] + fed.withFood[stat], stat);
  }
  // an unknown clan and a missing field count as none
  const odd = evaluateSet(war, coreSet(war, warSet(), meal), NO_SYNC, 100, { clan: 'Nobody', partyRoles: undefined });
  assert.deepEqual(odd.bonuses, { clan: null, partyRoles: 0 });
  assert.deepEqual(odd.panel, fed.panel);
  assert.deepEqual(evaluateSet(war, coreSet(war, warSet(), meal), NO_SYNC, 100, { clan: null, partyRoles: 0 }).panel, fed.panel);
});

test('Warrior with a Midlander clan (+2 Strength, 0 Vitality) and 5 party roles', () => {
  const view = evaluateSet(war, coreSet(war, warSet()), NO_SYNC, 100, { clan: 'Midlander', partyRoles: 5 });
  assert.deepEqual(view.bonuses, { clan: 'Midlander', partyRoles: 5 });
  // Strength: floor((462 + 2 + 342) x 1.05) = floor(846.3); Vitality: floor((484 + 0 + 356) x 1.05) = 882
  assert.equal(view.panel.str, 846);
  assert.equal(view.panelGear.str, 846);
  assert.equal(view.panel.vit, 882);
  // a substat gets neither bonus: its base (420 for Critical Hit) + gear
  assert.equal(view.panel.crit, 420 + warGear.crit);
  // the gear's own numbers do not move
  assert.deepEqual(view.gear, evaluateSet(war, coreSet(war, warSet()), NO_SYNC, 100).gear);
});

test('clan only and party only each count alone', () => {
  const clanOnly = evaluateSet(war, coreSet(war, warSet()), NO_SYNC, 100, { clan: 'Midlander', partyRoles: 0 });
  assert.equal(clanOnly.panel.str, 462 + 2 + 342);
  assert.equal(clanOnly.panel.vit, 484 + 356);
  const partyOnly = evaluateSet(war, coreSet(war, warSet()), NO_SYNC, 100, { clan: null, partyRoles: 3 });
  assert.equal(partyOnly.panel.str, Math.floor((462 + 342) * 1.03)); // 828.12
  assert.equal(partyOnly.panel.vit, Math.floor((484 + 356) * 1.03)); // 865.2
});

test("a meal's Vitality is worked out on base + clan + gear, then added after the party bonus", () => {
  const meal = allMeals(war).at(-1);
  assert.deepEqual([meal.vit.pct, meal.vit.max], [10, 297]);
  // Keeper of the Moon: -1 Strength, -2 Vitality. Vitality before the party bonus 484 - 2 + 356 = 838, so the meal gives
  // floor(838 / 10) = 83 (840 without the clan would give 84)
  const keeper = { clan: 'Keeper of the Moon', partyRoles: 0 };
  const clanOnly = evaluateSet(war, coreSet(war, warSet(), meal.key), NO_SYNC, 100, keeper);
  assert.equal(clanOnly.bonus.vit.bonus, 83);
  assert.equal(clanOnly.panelGear.vit, 838);
  assert.equal(clanOnly.panel.vit, 838 + 83);
  // the same meal on no clan
  assert.equal(evaluateSet(war, coreSet(war, warSet(), meal.key), NO_SYNC, 100).bonus.vit.bonus, 84);
  // with 5 roles: floor(838 x 1.05) = 879 with the meal's 83 added after, not 5% of the meal's total
  const party = evaluateSet(war, coreSet(war, warSet(), meal.key), NO_SYNC, 100, { ...keeper, partyRoles: 5 });
  assert.equal(party.bonus.vit.bonus, 83);
  assert.equal(party.panelGear.vit, 879);
  assert.equal(party.panel.vit, 879 + 83);
  // Strength gets no meal: floor((462 - 1 + 342) x 1.05) = floor(843.15)
  assert.equal(party.panel.str, 843);
  // withFood stays the gear's points plus the meal (the searches' numbers), now with the clan-based Vitality bonus
  assert.equal(party.withFood.vit, warGear.vit + 83);
});

test('Sage: the main stat is Mind, so Keeper of the Moon (+3 Mind, -2 Vitality) changes Mind', () => {
  const sageGear = rawGear('SGE', sageSet().pieces);
  assert.equal(sageGear.mind, 279);
  assert.equal(sageGear.vit, 257);
  const view = evaluateSet(sage, coreSet(sage, sageSet()), { cap: 123, sync: true, level: 100 }, 100, {
    clan: 'Keeper of the Moon',
    partyRoles: 3,
  });
  // Mind: floor((506 + 3 + 279) x 1.03) = floor(811.64); Vitality: floor((440 - 2 + 257) x 1.03) = floor(715.85)
  assert.equal(view.panel.mind, 811);
  assert.equal(view.panel.vit, 715);
  assert.equal(view.panel.piety, 440 + sageGear.piety); // Piety is not changed by a clan or a party
});

test('foodBonus takes the extra base for a stat and leaves every existing call as it was', () => {
  const meal = allMeals(war).at(-1);
  const gear = { vit: 356, det: 100, dh: 100 };
  const plain = foodBonus(war, meal, gear, 100);
  assert.deepEqual(foodBonus(war, meal, gear, 100, {}), plain);
  assert.equal(plain.vit.bonus, 84); // floor(10% of 840)
  assert.equal(foodBonus(war, meal, gear, 100, { vit: -2 }).vit.bonus, 83);
  assert.equal(foodBonus(war, meal, gear, 100, { vit: 3 }).vit.bonus, 84); // floor(84.3)
  assert.equal(foodBonus(war, meal, gear, 100, { vit: 10 }).vit.bonus, 85);
  // other stats are untouched by it
  assert.equal(foodBonus(war, meal, gear, 100, { vit: 10 }).det.bonus, plain.det.bonus);
});
