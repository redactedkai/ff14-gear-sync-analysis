/* The clan and party bonus (src/core/clan-bonus.ts). Expected values are published numbers: the clan offsets are the Wiki's
   Starting Attributes page (a base of 20 plus the offset: Midlander 22 Strength, Keeper of the Moon 23 Mind), and the party
   case is a real xivgear sheet (level 70, item level sync 375, no clan, 5 unique roles): the 1311 Strength of the set shows as 1376. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PARTY_ROLES_MAX,
  bonusStats,
  characterStat,
  clanGroups,
  clanOffset,
  isClan,
  partyRoles,
  withPartyBonus,
} from '../../../src/core/clan-bonus.ts';
import { makeJobContext } from '../../../src/core/job-context.ts';

test('the 16 clans come in 8 races of 2, in the game order', () => {
  const groups = clanGroups();
  assert.deepEqual(
    groups.map(g => g.race),
    ['Hyur', 'Elezen', 'Lalafell', "Miqo'te", 'Roegadyn', 'Au Ra', 'Hrothgar', 'Viera'],
  );
  assert.ok(groups.every(g => g.clans.length === 2));
  assert.deepEqual(groups[0].clans, ['Midlander', 'Highlander']);
  assert.ok(isClan('Keeper of the Moon'));
  assert.ok(!isClan('Hyur') && !isClan('') && !isClan(null));
});

test('a clan adds its offset to the five attributes and nothing else', () => {
  assert.equal(clanOffset('Midlander', 'str'), 2); // 22 on the Wiki's page, base 20
  assert.equal(clanOffset('Midlander', 'dex'), -1);
  assert.equal(clanOffset('Keeper of the Moon', 'mind'), 3);
  assert.equal(clanOffset('Helions', 'dex'), -3);
  assert.equal(clanOffset('Sea Wolf', 'vit'), 3);
  // no clan, an unknown clan, a substat and a field of the clan record that is not a stat
  assert.equal(clanOffset(null, 'str'), 0);
  assert.equal(clanOffset('', 'str'), 0);
  assert.equal(clanOffset('Nobody', 'str'), 0);
  assert.equal(clanOffset('Midlander', 'crit'), 0);
  assert.equal(clanOffset('Midlander', 'clan'), 0);
});

test('the party bonus is 1% a role up to 5 roles, rounded down', () => {
  assert.equal(withPartyBonus(1311, 5), 1376); // the xivgear sheet: no clan, 5 roles (1376.55 rounds down)
  assert.equal(withPartyBonus(1313, 5), 1378); // a Strength +2 clan on the same gear
  assert.equal(withPartyBonus(1313, 0), 1313);
  assert.equal(withPartyBonus(100, 1), 101);
  assert.equal(withPartyBonus(199, 1), 200); // 200.99 rounds down to 200, not up
  assert.equal(withPartyBonus(1313, 9), withPartyBonus(1313, 5)); // more than 5 roles counts as 5
  assert.equal(withPartyBonus(1313, -2), 1313);
});

test('roles are held to a whole number from 0 to 5', () => {
  assert.equal(PARTY_ROLES_MAX, 5);
  assert.deepEqual([0, 3, 5, 6, -1, 2.7, '4', 'x', null, undefined, NaN].map(partyRoles), [0, 3, 5, 5, 0, 2, 4, 0, 0, 0, 0]);
});

test('the bonuses change the main stat and Vitality; the meal is added after the party bonus', () => {
  const samurai = makeJobContext('SAM');
  assert.deepEqual(bonusStats(samurai), ['str', 'vit']);
  // base + clan + gear = 1313, x 1.05 = 1378, a meal's 10 points after it
  assert.equal(characterStat(samurai, 'str', { base: 400, gear: 911, clan: 'Midlander', roles: 5 }), 1378);
  assert.equal(characterStat(samurai, 'str', { base: 400, gear: 911, meal: 10, clan: 'Midlander', roles: 5 }), 1388);
  assert.equal(characterStat(samurai, 'str', { base: 400, gear: 911 }), 1311); // no bonus: base + gear
  // a substat starts from its own base and gets neither bonus
  assert.equal(characterStat(samurai, 'crit', { base: 420, gear: 500, meal: 12, clan: 'Midlander', roles: 5 }), 932);
  // Vitality takes the party bonus and its own clan offset (Midlander 0, Sea Wolf +3)
  assert.equal(characterStat(samurai, 'vit', { base: 100, gear: 200, clan: 'Sea Wolf', roles: 5 }), 318); // 303 x 1.05 = 318.15
});
