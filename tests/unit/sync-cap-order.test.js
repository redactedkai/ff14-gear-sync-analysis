/* The rounding order of sync caps (docs/mechanics/math.md, section 5). A cap takes the stat factor first and floors each step:
   round(floor(floor(B x f / 100) x pct / 100) / 10). An item's own stats keep the other order (slot share rounded
   first, then the factor), which fits real items far better (validation.test.js).

   Expected values are in-game sync values, quoted second-hand from xivgear's tests (commit 6c3c878):
   - sync_stats_tests.ts 'BLU 270 head VIT': 56, "Verified in-game by Xi";
   - sync_stats_tests.ts 'RDM 530 head VIT': 123, "600 item synced down gives us 123? tested in game";
   - item_stats_tests.ts 'Feature 24': Azeyma's Earrings (560) at 430, "in-game NIN: 71 main/79 dh/72 vit/79 det" and
     "in-game SGE: 71 main/71 piety/72 vit/79 det"; Menphina's Earring (430) at 425, "Actual values in-game: 72 vit,
     69 mind, 78 det, 70 piety".
   Budgets and real pieces come from the game data, never from the code under test. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeJobContext } from '../../src/core/job-context.js';
import { capValue, capsFor, pieceValue, syncStats } from '../../src/core/formulas.js';
import { browseItems, kindFactors, poolItemFromRow } from '../../src/core/items.js';
import { ALL_STATS } from '../../src/core/constants.js';
import { IL, ITEMS, MAX_REAL } from '../../src/core/tables.js';

const row = name => {
  const r = ITEMS.find(x => x[0] === name);
  assert.ok(r, name);
  return r;
};
/* A database piece as the job sees it, synced to `cap` at its own slot share and item kind. */
function synced(job, name, cap) {
  const [p] = browseItems(job, { q: name });
  assert.ok(p, `${job.jobId} ${name}`);
  return syncStats(job, poolItemFromRow(job, p).stats, p.type, cap, p.ilvl, p.pct, kindFactors(job, p.kind));
}

test('Blue Mage head at item level 270: Vitality cap 56 (in game), not 57', () => {
  const blu = makeJobContext('BLU');
  assert.equal(IL.vit[270], 736);
  // floor(736 x 0.9) = 662, floor(662 x 0.85) = 562, 56.2 -> 56; the item-stat order: round(62.56) = 63, x 0.9 -> 57
  assert.equal(capsFor(blu, 'head', 270).vit, 56);
  // the item the in-game value was taken on: Edenmorn Hat of Casting (530, Vitality 122)
  assert.equal(synced(blu, 'Edenmorn Hat of Casting', 270).vit, 56);
});

test('Red Mage head at item level 530: Vitality cap 123 (in game), one above the native 530 head', () => {
  const rdm = makeJobContext('RDM');
  assert.equal(IL.vit[530], 1603);
  // floor(1603 x 0.9) = 1442, floor(1442 x 0.85) = 1225, 122.5 -> 123; the item-stat order: round(136.255) = 136, x 0.9 -> 122
  assert.equal(capsFor(rdm, 'head', 530).vit, 123);
  assert.equal(row('Edenmorn Hat of Casting')[5].split(',').map(Number)[4], 122); // the native 530 head
  // a higher Intelligence head synced to 530 keeps 123
  const high = ITEMS.find(r => r[1] === 3 && r[2] >= 600 && r[9] === row('Edenmorn Hat of Casting')[9]);
  assert.ok(high);
  assert.equal(synced(rdm, high[0], 530).vit, 123);
});

test("Azeyma's Earrings (all jobs, item kind 0) synced to 430: the in-game values for Ninja and Sage", () => {
  const nin = makeJobContext('NIN'),
    sge = makeJobContext('SGE');
  assert.deepEqual([IL.dex[430], IL.vit[430], IL.dh[430], IL.det[430], IL.piety[430]], [1170, 1197, 1175, 1175, 1175]);
  const n = synced(nin, "Azeyma's Earrings", 430);
  assert.deepEqual([n.main, n.dh, n.vit, n.det], [71, 79, 72, 79]); // main: the item-stat order gives 70
  const s = synced(sge, "Azeyma's Earrings", 430);
  assert.deepEqual([s.main, s.spec, s.vit, s.det], [71, 71, 72, 79]);
});

test("Menphina's Earring (430) synced to 425 for Sage: the in-game 72 Vitality, 69 Mind, 78 Determination, 70 Piety", () => {
  const sge = makeJobContext('SGE');
  const s = synced(sge, "Menphina's Earring", 425);
  assert.deepEqual([s.vit, s.main, s.det, s.spec], [72, 69, 78, 70]);
});

test('with a factor of 1 the cap order equals the item-stat order at every item level and slot share', () => {
  // one job per stat profile; every stat whose factor is 1 for it (all but Int/Mind Vitality), shares of every slot
  const shares = [
    ['head', 85],
    ['body', 135],
    ['ear', 67],
    ['weapon', 140],
    ['weapon', 100],
    ['body', 220],
    ['offhand', null],
  ];
  for (const id of ['PLD', 'WHM', 'MNK', 'NIN', 'BLM']) {
    const job = makeJobContext(id);
    for (const s of ALL_STATS) {
      if (s === 'spec' && !job.profile.spec) continue;
      const f = s === 'vit' ? job.vitFactor : 1;
      if (f !== 1) continue;
      for (const [type, pct] of shares) {
        for (let il = 1; il <= MAX_REAL; il++) {
          assert.equal(
            capValue(job, s, il, type, pct ?? undefined),
            pieceValue(job, s, il, type, 100, pct ?? undefined),
            `${id} ${s} ${type} ${pct} ${il}`,
          );
        }
      }
    }
  }
});

test('an off-hand cap is the two-handed cap minus the one-handed cap, each in the cap order', () => {
  const pld = makeJobContext('PLD');
  for (const il of [123, 475, 530, 795]) {
    const c = capValue(pld, 'crit', il, 'offhand');
    assert.equal(c, capValue(pld, 'crit', il, 'weapon', 140) - capValue(pld, 'crit', il, 'weapon', 100));
  }
  // with a factor below 1: an Intelligence 2H weapon's Vitality minus a 1H weapon's, both factor first
  const rdm = makeJobContext('RDM');
  const vit90 = (b, pct) => Math.round(Math.floor((Math.floor((b * 90) / 100) * pct) / 100) / 10);
  for (const il of [123, 530, 795]) {
    assert.equal(capValue(rdm, 'vit', il, 'offhand'), vit90(IL.vit[il], 140) - vit90(IL.vit[il], 100));
  }
});
