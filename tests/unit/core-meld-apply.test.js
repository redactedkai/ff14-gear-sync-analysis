/* applyStones (src/core/meld.js): a given list of stones on a piece, by the rules the optimizer melds by. Expected
   values come from the game files (materia values I-XII 1, 2, 3, 4, 6, 16, 8, 24, 12, 36, 18, 54; gates 15, 30, 45, 70,
   160, 290, 420, 420, 560, 560, 690, 690; VI, VIII, X, XII only in the big slots) and materia.md's worked examples:
   Kirin's Osode of Fending (item level 300 body, 5 guaranteed slots, every substat capped at 110, Console Games Wiki;
   Determination 77: two VI and one V add 33 and lose 5) and Courtly Lover's Earrings of Healing (item level 770, 1
   guaranteed slot and overmelding: 2 big and 3 small slots; Critical Hit 142 of its 203 cap). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { browseItems, mkItem, poolItemFromRow } from '../../src/core/items.js';
import { makeJobContext } from '../../src/core/job-context.js';
import { applyStones, bestMeld, meldStones, meldText, meldVersions } from '../../src/core/meld.js';
import { effStats } from '../../src/core/piece.js';
import { piece, rngInt } from './helpers/common.js';

const war = makeJobContext('WAR');
const sge = makeJobContext('SGE');
const sam = makeJobContext('SAM');
const NO_SYNC = { cap: null, sync: false, level: 100 };
const stone = (stat, grade) => ({ stat, grade });
const osode = piece(war, "Kirin's Osode of Fending");
const ears = piece(sge, "Courtly Lover's Earrings of Healing");

test("Kirin's Osode of Fending: two VI and one V in Determination fill it to the 110 cap, 5 points lost", () => {
  const r = applyStones(war, osode, [stone('det', 6), stone('det', 6), stone('det', 5), null, null], NO_SYNC);
  assert.equal(r.stats.det, 110);
  assert.deepEqual(r.gain, { det: 33 });
  assert.deepEqual(r.lost, { det: 5 });
  assert.deepEqual(r.removed, []);
  assert.equal(meldText(war, r.meld), 'DET VI ×2, DET V, 2 slots empty');
  // the other stats as the piece has them
  assert.deepEqual([r.stats.main, r.stats.vit, r.stats.crit], [108, 107, 110]);
  // Critical Hit is already at its cap: a stone in it adds nothing and loses its whole value
  const crit = applyStones(war, osode, [stone('crit', 6)], NO_SYNC);
  assert.equal(crit.stats.crit, 110);
  assert.deepEqual([crit.gain, crit.lost], [{}, { crit: 16 }]);
});

test('gates: a grade above what the item level allows, or no such grade, is removed', () => {
  // item level 300: VI (gate 290) fits, VII and VIII (420) and XII (690) do not
  const r = applyStones(war, osode, [stone('det', 6), stone('det', 7), stone('det', 12), stone('det', 13), stone('det', 0)], NO_SYNC);
  assert.deepEqual(
    r.removed.map(x => [x.slot, x.reason]),
    [
      [1, 'gate'],
      [2, 'gate'],
      [3, 'gate'],
      [4, 'gate'],
    ],
  );
  assert.deepEqual(r.gain, { det: 16 });
  assert.equal(r.meld.free, 4);
});

test('overmeld slots: a high grade only in the big slots (the guaranteed ones and the first overmeld slot)', () => {
  // the earrings' best meld for Critical Hit then Determination: XII and XI in Critical Hit (61 of room), XII and two XI
  // in Determination (+90), as materia.md works it
  const best = [stone('crit', 12), stone('det', 12), stone('crit', 11), stone('det', 11), stone('det', 11)];
  const r = applyStones(sge, ears, best, NO_SYNC);
  assert.deepEqual(r.gain, { crit: 61, det: 90 });
  assert.deepEqual(r.lost, { crit: 11 });
  assert.deepEqual([r.stats.crit, r.stats.det], [203, 90]);
  assert.equal(meldText(sge, r.meld), 'CRT XII, DET XII, CRT XI, DET XI ×2');
  // XII in slot 3, the second overmeld slot: refused; the slots after it can't be filled past the gap
  const high = applyStones(sge, ears, [stone('det', 12), stone('det', 12), stone('det', 12), stone('det', 11)], NO_SYNC);
  assert.deepEqual(
    high.removed.map(x => [x.slot, x.reason]),
    [
      [2, 'high'],
      [3, 'order'],
    ],
  );
  assert.deepEqual(high.gain, { det: 108 });
  // an odd grade fits a small slot
  assert.deepEqual(applyStones(sge, ears, [stone('det', 12), stone('det', 12), stone('det', 11)], NO_SYNC).gain, { det: 126 });
});

test('stats, slots and order: only substats, only the slots the piece has, filled in order', () => {
  // the main stat and Vitality take no materia; a Samurai has no Tenacity or Piety
  const r = applyStones(war, osode, [stone('main', 6), stone('vit', 6), stone('det', 6)], NO_SYNC);
  assert.deepEqual(
    r.removed.map(x => [x.slot, x.reason]),
    [
      [0, 'stat'],
      [1, 'stat'],
      [2, 'order'],
    ],
  );
  const samBody = piece(sam, "Kirin's Osode of Striking");
  assert.equal(applyStones(sam, samBody, [stone('spec', 6)], NO_SYNC).removed[0].reason, 'stat');
  // a sixth stone on a 5-slot piece; a piece with no slot data takes nothing
  assert.equal(applyStones(war, osode, [...Array(5).fill(stone('det', 5)), stone('det', 5)], NO_SYNC).removed[0].reason, 'slot');
  const handMade = mkItem('Hand-made', 'head', 300, { crit: 10 });
  const none = applyStones(war, handMade, [stone('crit', 6)], NO_SYNC);
  assert.deepEqual([none.removed[0].reason, none.meld, none.stats.crit], ['slot', null, 10]);
  // a stone after an empty slot
  assert.equal(applyStones(war, osode, [stone('det', 6), null, stone('det', 6)], NO_SYNC).removed[0].reason, 'order');
  // no stones: no melds, nothing shown; empty slots: shown as empty
  assert.equal(applyStones(war, osode, [], NO_SYNC).meld, null);
  assert.equal(meldText(war, applyStones(war, osode, [null, null, null, null, null], NO_SYNC).meld), '5 slots empty');
});

test('sync removes every stone: item level sync below the piece, or level sync below its equip level', () => {
  const stones = [stone('det', 6), stone('det', 6)];
  for (const sync of [
    { cap: 290, sync: true, level: 100 },
    { cap: null, sync: false, level: 60 },
  ]) {
    const r = applyStones(war, osode, stones, sync);
    assert.deepEqual(
      r.removed.map(x => x.reason),
      ['sync', 'sync'],
    );
    assert.equal(r.meld, null);
    assert.deepEqual(r.stats, Object.fromEntries(war.stats.map(s => [s, effStats(war, osode, sync)[s]])));
  }
  // a piece exactly at the cap keeps them
  assert.deepEqual(applyStones(war, osode, stones, { cap: 300, sync: true, level: 100 }).gain, { det: 32 });
});

test("the optimizer's melds as stones give its gains back: bestMeld and every meld version, on real pieces", () => {
  const pick = rngInt(7);
  for (const job of [sge, war, sam, makeJobContext('BLM'), makeJobContext('DNC')]) {
    const rows = browseItems(job, { ilvlMin: 15 }).filter(r => r.meldSlots);
    for (let n = 0; n < 60; n++) {
      const item = poolItemFromRow(job, rows[pick(rows.length)]);
      const keys = [job.substats[pick(job.substats.length)], job.substats[pick(job.substats.length)]];
      for (const meld of [bestMeld(job, item, keys), ...meldVersions(job, item, [...keys, 'spd'])]) {
        const r = applyStones(job, item, meldStones(item, meld), NO_SYNC);
        assert.deepEqual(r.removed, [], item.name);
        assert.deepEqual(r.meld, meld, `${item.name} ${keys}`);
        for (const s of job.stats) assert.equal(r.stats[s], item.stats[s] + (meld?.gain[s] || 0), `${item.name} ${s}`);
      }
    }
  }
});
