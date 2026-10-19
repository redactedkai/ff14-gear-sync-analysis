/* Weapon damage and defense (core/damage-defense.js) on real items, and the optimizer ranking weapon damage first
   (owner's decision 2026-10-18; docs/scratchpad/weapon-damage/spec.md). Expected values: the game files and xivgear's
   in-instance sync tests (defense). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeJobContext } from '../../src/core/job-context.js';
import { mkItem } from '../../src/core/items.js';
import { itemSyncIlvl, optimize } from '../../src/core/optimizer/index.js';
import { mitigationPct, setDefense, syncedValue, weaponDamage } from '../../src/core/damage-defense.js';
import { resultOf } from '../../src/core/same-result.js';
import { IL } from '../../src/core/tables.js';
import { gamePool } from './helpers/exhaustive.js';
import { piece } from './helpers/common.js';

const sge = makeJobContext('SGE');
const NO_SYNC = { cap: null, sync: false, level: 100 };

test('weapon damage: physical for Strength and Dexterity jobs, magic for Intelligence and Mind, none for Blue Mage', () => {
  assert.equal(makeJobContext('WAR').damageKey, 'damagePhys');
  assert.equal(makeJobContext('BRD').damageKey, 'damagePhys');
  assert.equal(makeJobContext('BLM').damageKey, 'damageMag');
  assert.equal(sge.damageKey, 'damageMag');
  assert.equal(makeJobContext('BLU').damageKey, null);
});

/* Item.csv: Phantom Pendulums Eclipticum (item level 790) 157; Courtly Lover's Pendulums (770, crafted) 138 + 15 HQ =
   153, the ItemLevel table's value. Under sync, the table's value at the synced item level (690: 137, 660: 131, 123:
   64; the clamp is a guess, as the tools do it). */
test('weapon damage of real weapons, with the HQ bonus, synced by the cap and by level sync', () => {
  const w = piece(sge, 'Phantom Pendulums Eclipticum');
  const wd = sync => weaponDamage(sge, w, itemSyncIlvl(w, sync));
  assert.equal(wd(NO_SYNC), 157);
  assert.equal(wd({ cap: 690, sync: true, level: 100 }), 137);
  assert.equal(wd({ cap: null, sync: false, level: 90 }), 131); // level 90 syncs level 100 gear to 660
  assert.equal(wd({ cap: 123, sync: true, level: 100 }), 64);
  assert.equal(weaponDamage(sge, piece(sge, "Courtly Lover's Pendulums"), null), 153);
  assert.equal([IL.damageMag[123], IL.damageMag[660], IL.damageMag[795]].join(), '64,131,158');
  // armor carries none, and Blue Mage ranks none
  assert.equal(weaponDamage(sge, piece(sge, 'Augmented Bygone Brass Calot of Healing'), null), 0);
  assert.equal(weaponDamage(makeJobContext('BLU'), w, null), 0);
  // a piece not from the database: the table's value at its item level
  assert.equal(weaponDamage(sge, mkItem('hand-made', 'weapon', 660, {}), null), 131);
});

/* xivgear's in-instance tests: an item level 663 chest synced to 660, 758 + 84 HQ → 837 physical (Maiming) and
   433 + 48 → 478 physical (Healing); accessory defense 1 → 0. */
test('defense: real armor with the HQ bonus, synced as measured in game, and its mitigation', () => {
  const maiming = piece(makeJobContext('DRG'), 'Cobalt Tungsten Vest of Maiming');
  assert.equal(syncedValue(maiming, 'defensePhys', null), 842);
  assert.equal(syncedValue(maiming, 'defensePhys', 660), 837);
  const healing = piece(sge, 'Sarcenet Chestwrap of Healing');
  assert.equal(syncedValue(healing, 'defensePhys', 660), 478);
  const ring = piece(sge, 'Augmented Bygone Brass Ring of Healing');
  assert.equal(syncedValue(ring, 'defensePhys', null), 1);
  assert.equal(syncedValue(ring, 'defensePhys', 660), 0);
  // a set's total and the share it removes: floor(15 x defense / 2780) % at level 100 (AkhMorning)
  const total = setDefense([
    { item: maiming, target: null },
    { item: ring, target: null },
  ]);
  assert.deepEqual(total, { phys: 843, mag: 663 });
  assert.equal(mitigationPct(2958, 100), 15);
  assert.equal(mitigationPct(5176, 100), 27);
});

/* The optimizer never gives up weapon damage for the goal's stats: its weapon has the most weapon damage of the pool
   after sync, in cases where it used to pick another (the 2026-10-18 check, docs/scratchpad/weapon-damage/spec.md). */
test('the optimizer takes the most weapon damage, then the goal', () => {
  for (const [id, sync, target, tiebreak, ilvlMin, ilvlMax] of [
    ['GNB', { cap: 475, sync: true, level: 80 }, 'dh', ['crit', 'det'], 400, 520],
    ['SAM', NO_SYNC, 'spd', ['crit', 'det'], 700, 790],
    ['SGE', NO_SYNC, 'crit', ['det', 'dh'], 760, 790],
  ]) {
    const job = makeJobContext(id);
    const pool = gamePool(job, { ilvlMin, ilvlMax });
    const most = Math.max(...pool.filter(i => i.type === 'weapon').map(i => weaponDamage(job, i, itemSyncIlvl(i, sync))));
    const r = optimize(job, pool, sync, { target, tiebreak, melds: true });
    assert.ok(r.ok, id);
    assert.equal(r.totals.wd, most, `${id}: weapon damage`);
  }
});

/* With a speed minimum only a weapon with less weapon damage reaches, the optimizer takes the most weapon damage that
   does: the key ranks, it never empties the result. */
test('a speed limit only a lower weapon meets: the most weapon damage that meets it, not "no set"', () => {
  const high = mkItem('fast-less', 'weapon', 700, { main: 500, crit: 300 });
  const low = mkItem('slow-more', 'weapon', 690, { main: 490, spd: 300 });
  const head = mkItem('head', 'head', 690, { main: 200, crit: 100 });
  const pool = [high, low, head];
  const free = optimize(sge, pool, NO_SYNC, { target: 'crit' });
  assert.equal(free.picks.find(p => p.type === 'weapon').item, high);
  const limited = optimize(sge, pool, NO_SYNC, { target: 'crit', spdMin: 200 });
  assert.ok(limited.ok);
  assert.equal(limited.picks.find(p => p.type === 'weapon').item, low);
  assert.equal(limited.totals.wd, IL.damageMag[690]);
});

/* Same-result rows (same-result.js) keep weapon damage: two sets that differ only in it are not the same result. */
test('same result: a weapon with less weapon damage is not the same result', () => {
  const ctx = { level: 100, food: null, haste: 0, goal: null };
  const t = { main: 800, vit: 800, crit: 400, det: 300, dh: 0, spd: 0, spec: 0 };
  assert.notEqual(resultOf(sge, { ...t, wd: 157 }, ctx), resultOf(sge, { ...t, wd: 156 }, ctx));
  assert.equal(resultOf(sge, { ...t, wd: 157 }, ctx), resultOf(sge, { ...t, wd: 157 }, ctx));
});
