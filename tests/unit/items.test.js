import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeJobContext } from '../../src/core/job-context.js';
import { browseItems, poolItemFromRow, parseRow } from '../../src/core/items.js';

const pld = makeJobContext('PLD');
const war = makeJobContext('WAR');
const sge = makeJobContext('SGE');
const names = rows => rows.map(r => r.name);

test('weapon mode: Paladin sees one-handed weapons and shields, never two-handed weapons', () => {
  const all = browseItems(pld, { type: 'any' });
  const codes = new Set(all.map(r => r.slotCode));
  assert.ok(!codes.has(0), 'no 2H weapons');
  assert.ok(codes.has(1) && codes.has(2), '1H weapons and off-hands present');
  const dw = names(browseItems(pld, { q: 'Dreadwyrm', lvlMax: 50 }));
  assert.ok(dw.includes('Dreadwyrm Blade') && dw.includes('Dreadwyrm Shield'));
});

test('weapon mode: Warrior sees two-handed weapons only, no one-handed weapons or off-hands', () => {
  const codes = new Set(browseItems(war, { type: 'any' }).map(r => r.slotCode));
  assert.ok(codes.has(0));
  assert.ok(!codes.has(1) && !codes.has(2));
  assert.ok(names(browseItems(war, { q: 'Dreadwyrm', lvlMax: 50 })).includes('Dreadwyrm Bardiche'));
});

test('job mask: a Warrior does not see healer (Mind) gear, a Sage does', () => {
  assert.equal(browseItems(war, { q: 'Dreadwyrm Hood of Healing' }).length, 0);
  assert.equal(browseItems(sge, { q: 'Dreadwyrm Hood of Healing' }).length, 1);
});

test('main-stat filter: gear the job can equip but without its main stat is hidden', () => {
  // Occult Earrings of Blood: equippable by Warrior (job mask) but carries no Strength
  assert.equal(browseItems(war, { q: 'Occult Earrings of Blood' }).length, 0);
  const strIdx = 0; // raw order str,dex,int,mind,...
  assert.ok(browseItems(war, { ilvlMin: 700 }).every(r => r.st[strIdx] > 0));
});

test('item level and equip level bounds', () => {
  const q = 'Dreadwyrm';
  const ilvls = rows => [...new Set(rows.map(r => r.ilvl))].sort((a, b) => a - b);
  assert.deepEqual(ilvls(browseItems(war, { q })), [130, 135, 345]);
  assert.deepEqual(ilvls(browseItems(war, { q, ilvlMin: 131 })), [135, 345]);
  assert.deepEqual(ilvls(browseItems(war, { q, ilvlMax: 130 })), [130]);
  assert.deepEqual(ilvls(browseItems(war, { q, ilvlMin: 135, ilvlMax: 135 })), [135]);
  assert.deepEqual(ilvls(browseItems(war, { q, lvlMax: 50 })), [130, 135]);
  assert.ok(browseItems(war, { q, lvlMax: 49 }).length === 0);
});

test('name query is case-insensitive and trimmed', () => {
  const a = names(browseItems(war, { q: 'dreadwyrm' }));
  assert.equal(a.length, 15);
  assert.deepEqual(names(browseItems(war, { q: '  DREADWYRM ' })), a);
  assert.deepEqual(names(browseItems(war, { q: 'DrEaDwYrM' })), a);
});

test('slot type filter', () => {
  const rings = browseItems(war, { q: 'Dreadwyrm', type: 'ring' });
  assert.deepEqual(names(rings).sort(), ['Dreadwyrm Ring of Fending', 'Dreadwyrm Ring of Slaying']);
  assert.ok(rings.every(r => r.type === 'ring' && r.slotCode === 11));
  assert.equal(browseItems(war, { q: 'Dreadwyrm', type: 'any' }).length, browseItems(war, { q: 'Dreadwyrm' }).length);
  assert.equal(browseItems(war, { q: 'Dreadwyrm', type: 'offhand' }).length, 0);
});

test('poolItemFromRow maps raw stats to neutral keys (Dreadwyrm Hood of Healing for a Sage)', () => {
  const [row] = browseItems(sge, { q: 'Dreadwyrm Hood of Healing' });
  const it = poolItemFromRow(sge, row);
  assert.equal(it.src, 'game');
  assert.equal(it.type, 'head');
  assert.equal(it.ilvl, 130);
  assert.equal(it.copies, 1);
  assert.deepEqual(it.stats, { main: 33, vit: 32, crit: 0, det: 0, dh: 6, spd: 31, spec: 22 });
});

test('poolItemFromRow copies: a Unique ring once, a non-unique ring twice', () => {
  const [unique] = browseItems(war, { q: 'Dreadwyrm Ring of Fending' });
  assert.equal(unique.unique, true);
  assert.equal(poolItemFromRow(war, unique).copies, 1);

  const [plain] = browseItems(war, { q: 'Augmented Ironworks Ring of Fending' });
  assert.equal(plain.unique, false);
  assert.equal(poolItemFromRow(war, plain).copies, 2);

  // non-ring, non-unique pieces are still a single copy
  const synthetic = parseRow(['Test Earring', 8, 130, 50, 1 << war.jobIndex, '26,0,0,0,28,0,24,0,0,17,0,0', 0]);
  assert.equal(poolItemFromRow(war, synthetic).copies, 1);
});
