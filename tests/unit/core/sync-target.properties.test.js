/* syncTarget over every distinct (item level, equip level, scales) of the real database, every synced level 1 to 100 and every
   cap 1 to 795 (or none): the target is null or a whole item level in range; level sync alone never takes a piece below the
   level's own item level nor above the piece's; a piece untouched by both triggers has no target; and for a fixed level and
   a cap a duty can have (up to capCeiling), a piece of higher item level (same equip level, not scaling) never ends with a
   lower item level than one of lower item level.
   Not asserted, because the documented rule breaks it (math.md, section 5): that raising the cap or the synced level never
   lowers a piece's item level. A cap equal to a piece's own item level leaves the item level cap rule and the piece falls to
   the level's item level instead (item level 663, equip level 94, level 90: cap 662 gives 662, cap 663 gives 660). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROW } from '../../../src/core/constants.js';
import { ITEMS, MAX_ILVL } from '../../../src/core/tables.js';
import { capCeiling, levelSyncIlvl, syncTarget } from '../../../src/core/sync-target.js';

const MAX_LEVEL = 100;

/* The distinct [item level, equip level, scales] of the database. */
const pieces = [
  ...new Map(
    ITEMS.map(row => [
      `${row[ROW.ilvl]}|${row[ROW.equipLevel]}|${row[ROW.scales] ? 1 : 0}`,
      [row[ROW.ilvl], row[ROW.equipLevel], !!row[ROW.scales]],
    ]),
  ).values(),
];
const targetOf = ([itemLevel, equipLevel, scales], syncedLevel, cap) =>
  syncTarget({ itemLevel, equipLevel, scales, syncOn: cap != null, cap, syncedLevel });
/* The item level a piece has in the duty: its own, or the target when that is lower. */
const effectiveOf = (piece, level, cap) => {
  const target = targetOf(piece, level, cap);
  return target == null ? piece[0] : Math.min(piece[0], target);
};

test('the target is null or a whole item level in range, for every piece, level and cap', () => {
  for (const piece of pieces) {
    for (let level = 1; level <= MAX_LEVEL; level++) {
      for (let cap = 0; cap <= MAX_ILVL; cap++) {
        const target = targetOf(piece, level, cap === 0 ? null : cap);
        const inRange = target === null || (Number.isInteger(target) && target >= 1 && target <= MAX_ILVL);
        if (!inRange) assert.fail(`${piece} level ${level} cap ${cap}: ${target}`);
      }
    }
  }
});

test('level sync alone never takes a piece below the level item level or above its own, and no trigger means no target', () => {
  for (const piece of pieces) {
    const [itemLevel, equipLevel, scales] = piece;
    for (let level = 1; level <= MAX_LEVEL; level++) {
      const target = targetOf(piece, level, null);
      const label = `${piece} level ${level}`;
      assert.ok(effectiveOf(piece, level, null) <= itemLevel, `${label}: raised above the piece`);
      if (target !== null)
        assert.ok(Math.min(itemLevel, target) >= Math.min(itemLevel, levelSyncIlvl(level)), `${label}: below the level's item level`);
      // a piece the level can wear, that does not scale, and no cap: untouched
      if (!scales && equipLevel <= level) assert.equal(target, null, `${label}: synced with nothing to sync`);
      // a cap at or above the piece's item level adds nothing to level sync
      if (!scales) assert.equal(targetOf(piece, level, itemLevel), target, `${label}: a cap at the piece's item level changed the target`);
    }
  }
});

test('for a fixed level and cap a duty can have, a higher item level never ends lower (one equip level, not scaling)', () => {
  const byEquipLevel = new Map();
  for (const piece of pieces) {
    if (piece[2]) continue;
    if (!byEquipLevel.has(piece[1])) byEquipLevel.set(piece[1], []);
    byEquipLevel.get(piece[1]).push(piece);
  }
  for (const [equipLevel, list] of byEquipLevel) {
    list.sort((a, b) => a[0] - b[0]);
    for (let level = 1; level <= MAX_LEVEL; level++) {
      for (let cap = 1; cap <= capCeiling(level); cap++) {
        for (let i = 1; i < list.length; i++) {
          assert.ok(
            effectiveOf(list[i], level, cap) >= effectiveOf(list[i - 1], level, cap),
            `equip level ${equipLevel}, level ${level}, cap ${cap}: item level ${list[i][0]} ends below item level ${list[i - 1][0]}`,
          );
        }
      }
    }
  }
});

test('raising the cap can lower a piece: a level 94 piece of item level 663 at level 90 (the documented rule)', () => {
  const piece = [663, 94, false];
  assert.equal(effectiveOf(piece, 90, 662), 662);
  assert.equal(effectiveOf(piece, 90, 663), 660);
});
