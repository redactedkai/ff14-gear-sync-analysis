/* The entries of the Clan and Party bonus boxes (src/ui/sheets/bonus-options.js): the 16 clans under their 8 races, the
   party texts "No party bonus" to "5 unique roles (5%)", and the sizing text that holds every entry. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isClan } from '../../../../src/core/clan-bonus.js';
import { NO_CLAN_TEXT, bonusOptions, partyText } from '../../../../src/ui/sheets/bonus-options.js';

test('the Clan list is the 16 clans under their 8 races, in the game order', () => {
  const { groups, noClanText } = bonusOptions();
  assert.equal(noClanText, NO_CLAN_TEXT);
  assert.deepEqual(
    groups.map(group => group.race),
    ['Hyur', 'Elezen', 'Lalafell', "Miqo'te", 'Roegadyn', 'Au Ra', 'Hrothgar', 'Viera'],
  );
  assert.deepEqual(groups[0].clans, ['Midlander', 'Highlander']);
  assert.equal(groups.flatMap(group => group.clans).filter(isClan).length, 16);
});

test('the Party bonus entries run from none to five unique roles, one percent each', () => {
  const { parties } = bonusOptions();
  assert.deepEqual(
    parties.map(party => [party.roles, party.text]),
    [
      [0, 'No party bonus'],
      [1, '1 unique role (1%)'],
      [2, '2 unique roles (2%)'],
      [3, '3 unique roles (3%)'],
      [4, '4 unique roles (4%)'],
      [5, '5 unique roles (5%)'],
    ],
  );
  assert.equal(partyText(1), '1 unique role (1%)');
});

test('the sizing text of each box holds every entry, one per line', () => {
  const { clanSizer, partySizer } = bonusOptions();
  assert.equal(clanSizer.split('\n').length, 17);
  assert.ok(clanSizer.startsWith(`${NO_CLAN_TEXT}\nMidlander\n`));
  assert.equal(partySizer.split('\n').length, 6);
});
