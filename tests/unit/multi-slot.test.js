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
