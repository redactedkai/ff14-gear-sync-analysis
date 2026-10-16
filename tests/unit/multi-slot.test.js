import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeJobContext } from '../../src/core/job-context.js';
import { browseItems, kindFactors, slotInfo, slotLabel } from '../../src/core/items.js';
import { predictRaw, syncStats } from '../../src/core/formulas.js';
import { optimize, effStats } from '../../src/core/optimizer/index.js';
import { ITEMS } from '../../src/core/tables.js';
import { exhaustive, gamePool, loadoutCount } from './helpers/exhaustive.js';

/* Gear that takes more than its own slot: a two-handed weapon leaves the off-hand empty, and the Vermilion Cloaks
   (Eureka, item level 300, slot code 12) leave the head empty. White Mage keeps one A Realm Reborn wand and shield
   pair in the database (Tidal Wave, item level 100), so it can wear a one-handed weapon plus a shield. */

const whm = makeJobContext('WHM');
const blm = makeJobContext('BLM');
const row = name => {
  const r = ITEMS.find(x => x[0] === name);
  assert.ok(r, name);
  return r;
};

test('the cloaks and the Tidal Wave wand and shields: real stats equal the formula at their own slot share', () => {
  // the share comes from the game's BaseParam sheet: ChestHeadPercent 220, OneHandWeaponPercent 100, OffHandPercent 40
  for (const name of ['Vermilion Cloak of Casting', 'Vermilion Cloak of Healing', 'Tidal Wave Wand']) {
    const r = row(name);
    const st = r[5].split(',').map(Number);
    assert.deepEqual(predictRaw(r[2], r[1], st, r[9]), st, name);
  }
  assert.equal(row('Vermilion Cloak of Casting')[1], 12);
});

test('White Mage can browse its wand and shield as well as its two-handed weapons; Sage has no off-hand', () => {
  const names = browseItems(whm, { ilvlMin: 100, ilvlMax: 100 }).map(r => `${r.name}|${r.slotCode}`);
  assert.ok(names.includes('Tidal Wave Wand|1'));
  assert.ok(names.includes('Tidal Wave Buckler|2'));
  assert.ok(names.includes('Tidal Wave Cane|0'));
  assert.equal(browseItems(makeJobContext('SGE'), { type: 'offhand' }).length, 0);
});

test('slot info: a piece is capped at its own slot share, and names what it covers', () => {
  const [cloak] = gamePool(blm, { q: 'Vermilion Cloak' });
  assert.deepEqual(slotInfo(blm, cloak), { pct: 220, blocks: ['head'], factors: kindFactors(blm, row('Vermilion Cloak of Casting')[9]) });
  assert.equal(slotLabel(cloak.type, slotInfo(blm, cloak).blocks), 'Body + Head');
  // synced to 290, the cloak keeps a 220-share cap, well above a plain body piece's 135 share
  const sync = { cap: 290, sync: true };
  const eff = effStats(blm, cloak, sync);
  assert.deepEqual(eff, syncStats(blm, cloak.stats, 'body', 290, 300, 220, slotInfo(blm, cloak).factors));
  assert.ok(eff.main > syncStats(blm, cloak.stats, 'body', 290, 300).main);
  const [wand] = gamePool(whm, { q: 'Tidal Wave Wand' });
  assert.deepEqual(slotInfo(whm, wand), { pct: 100, blocks: [], factors: kindFactors(whm, row('Tidal Wave Wand')[9]) });
  const [cane] = gamePool(whm, { q: 'Tidal Wave Cane' });
  assert.deepEqual(slotInfo(whm, cane), { pct: 140, blocks: ['offhand'], factors: kindFactors(whm, row('Tidal Wave Cane')[9]) });
});

/* Real pools with multi-slot choices; the brute force checks blocked slots on the whole loadout. */
/* Item level 100 White Mage gear: every weapon and the shield, and two sets for the other slots (to keep the brute
   force small). */
const twoSets = r => r.type === 'weapon' || r.type === 'offhand' || /^(Bogatyr's|Scylla's)/.test(r.name);
const POOLS = [
  ['WHM', { ilvlMin: 100, ilvlMax: 100, lvlMax: 50 }, twoSets, 'wand and shield or a two-handed weapon'],
  ['BLM', { ilvlMin: 290, ilvlMax: 310 }, twoSetsOrCloak, 'cloak or a head and body'],
  ['WHM', { ilvlMin: 290, ilvlMax: 310 }, twoSetsOrCloak, 'cloak or a head and body'],
];
/* item level 290 to 310 gear without the 290 head, body and weapons (to keep the brute force small) */
function twoSetsOrCloak(r) {
  return !['head', 'body', 'weapon'].includes(r.type) || r.ilvl !== 290;
}
for (const [jobId, filter, keep, what] of POOLS) {
  test(`${jobId} item level ${filter.ilvlMin}-${filter.ilvlMax} (${what}): optimizer equals brute force, synced and unsynced`, () => {
    const job = makeJobContext(jobId);
    const pool = gamePool(job, filter, keep);
    assert.ok(
      pool.some(i => slotInfo(job, i).blocks.some(t => t !== 'offhand') || i.type === 'offhand'),
      'a multi-slot choice',
    );
    const n = loadoutCount(job, pool);
    assert.ok(n >= 100 && n <= 400000, `${n} loadouts`);
    for (const sync of [
      { cap: 90, sync: true },
      { cap: 290, sync: true },
      { cap: 290, sync: false },
    ]) {
      for (const target of ['main', 'vit', ...job.substats]) {
        const opts = { target, tiebreak: ['main', 'vit'].filter(s => s !== target) };
        const r = optimize(job, pool, sync, opts);
        const label = `${target} sync=${sync.sync} cap=${sync.cap}`;
        assert.ok(r.ok && !r.truncated, label);
        assert.deepEqual(
          [target, ...opts.tiebreak].map(s => r.totals[s]),
          exhaustive(job, pool, sync, opts),
          label,
        );
        // a blocked slot is empty and names its blocker; nothing sits in a slot a pick blocks
        const blocked = r.picks.flatMap(p => (p.item ? slotInfo(job, p.item).blocks : []));
        for (const p of r.picks) {
          if (blocked.includes(p.type)) assert.ok(!p.item && p.blockedBy, `${label}: ${p.type} should be covered`);
        }
      }
    }
  });
}

test('the cloak and a separate head and body each win somewhere, so the brute force checks above test both', () => {
  // Under a low cap the cloak keeps a 220-share cap on one piece and wins; unsynced, the item level 310 head and body
  // win. A cloak must not prune the body pieces it beats on stats alone (it also costs the head).
  const pool = gamePool(blm, { ilvlMin: 290, ilvlMax: 310 }, twoSetsOrCloak);
  const head = (sync, target) => optimize(blm, pool, sync, { target }).picks.find(p => p.type === 'head');
  const low = head({ cap: 90, sync: true }, 'main');
  assert.equal(low.item, null);
  assert.equal(low.blockedBy.name, 'Vermilion Cloak of Casting');
  assert.equal(head({ cap: 290, sync: false }, 'main').item.ilvl, 310);
});

test('a cloak in a full pool keeps the search small: the bound drops the head it blocks', () => {
  // Every piece Sage can wear, synced to 123: the healer cloak's branch used to keep a head in its bound and was not
  // pruned, so ceiling runs hit their node limit (150,000) with many tied candidates.
  const sge = makeJobContext('SGE');
  const pool = gamePool(sge, {});
  assert.ok(pool.some(i => i.name === 'Vermilion Cloak of Healing'));
  for (const target of sge.stats) {
    const r = optimize(sge, pool, { cap: 123, sync: true }, { target, nodeLimit: 150000 });
    assert.ok(!r.truncated && r.nodes < 1000, `${target}: ${r.nodes} nodes`);
  }
});

/* Two shapes of A Realm Reborn tank gear: legs that also cover the feet (the Flanchards, slot code 13, share 220) and
   Herklaedi, a body that also covers the hands, legs and feet (slot code 14, share 440). The game's BaseParam columns
   give the shares; Herklaedi's main stat, Vitality and first substat are the 440 share of its item level 50 row. */
const war = makeJobContext('WAR');

test('legs covering the feet and a body covering hands, legs and feet: slot share and what they block', () => {
  assert.equal(row('High Mythril Flanchard')[1], 13);
  assert.equal(row('Herklaedi')[1], 14);
  const [flanchard] = gamePool(war, { q: 'High Mythril Flanchard' });
  const herklaedi = gamePool(war, { q: 'Herklaedi' }).find(i => i.name === 'Herklaedi');
  assert.deepEqual(slotInfo(war, flanchard).blocks, ['feet']);
  assert.equal(slotInfo(war, flanchard).pct, 220);
  assert.deepEqual(slotInfo(war, herklaedi).blocks, ['hands', 'legs', 'feet']);
  assert.equal(slotInfo(war, herklaedi).pct, 440);
  assert.equal(slotLabel(herklaedi.type, slotInfo(war, herklaedi).blocks), 'Body + Hands + Legs + Feet');
  // ItemLevel row 50: Strength 95, Vitality 121, Tenacity 170; x 440 / 1000 = 41.8, 53.24, 74.8
  assert.deepEqual([herklaedi.stats.main, herklaedi.stats.vit, herklaedi.stats.spec], [42, 53, 75]);
});

/* Warrior gear from item level 44 to 70 (equip level 50 or below): Herklaedi, the Flanchards up to item level 70, and
   the first two pieces of every other slot (to keep the brute force small). Level sync below 50 syncs most of it to
   nearly the same item level, where the two shapes compete with a plain body, legs and feet. */
function multiSlotPool() {
  const all = gamePool(war, { ilvlMin: 44, ilvlMax: 70, lvlMax: 50 });
  const multi = all.filter(i => slotInfo(war, i).blocks.some(t => t !== 'offhand'));
  const plain = all.filter(i => !multi.includes(i));
  return [...multi, ...plain.filter(i => plain.filter(p => p.type === i.type).indexOf(i) < 2)];
}

test('WAR item level 44-70 (Herklaedi, Flanchards or a plain body, legs and feet): optimizer equals brute force', () => {
  const pool = multiSlotPool();
  assert.ok(pool.some(i => i.name === 'Herklaedi') && pool.some(i => /Flanchard/.test(i.name)));
  const n = loadoutCount(war, pool);
  assert.ok(n >= 100 && n <= 400000, `${n} loadouts`);
  const covered = new Set();
  for (const sync of [{ level: 18 }, { level: 30 }, { level: 45 }, { cap: 40, sync: true }, {}]) {
    for (const target of ['main', 'vit', ...war.substats]) {
      const opts = { target, tiebreak: ['main', 'vit'].filter(s => s !== target) };
      const r = optimize(war, pool, sync, opts);
      const label = `${target} ${JSON.stringify(sync)}`;
      assert.ok(r.ok && !r.truncated, label);
      assert.deepEqual(
        [target, ...opts.tiebreak].map(s => r.totals[s]),
        exhaustive(war, pool, sync, opts),
        label,
      );
      const blocked = r.picks.flatMap(p => (p.item ? slotInfo(war, p.item).blocks : []));
      for (const p of r.picks) {
        if (blocked.includes(p.type)) assert.ok(!p.item && p.blockedBy, `${label}: ${p.type} should be covered`);
        if (p.item && slotInfo(war, p.item).blocks.length) covered.add(p.item.name);
      }
    }
  }
  // both shapes win somewhere, so the brute force above checks their blocked slots
  assert.ok(covered.has('Herklaedi') && [...covered].some(n => /Flanchard/.test(n)), [...covered].join(', '));
});

test('below level 50 a full pool keeps the search small: a piece covering later slots is bounded with them', () => {
  // Every piece the job can wear, level-synced below 50: the bound counted a Flanchard's 220 share and the best feet
  // piece both, and with every piece synced to nearly the same item level the search hit its node limit
  for (const id of ['PLD', 'WAR']) {
    const job = makeJobContext(id);
    const pool = gamePool(job, {});
    for (const level of [18, 30, 49]) {
      const r = optimize(job, pool, { level }, { target: 'main', tiebreak: ['vit'], nodeLimit: 150000 });
      assert.ok(!r.truncated && r.nodes < 2000, `${id} level ${level}: ${r.nodes} nodes`);
    }
  }
});
