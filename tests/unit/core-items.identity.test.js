/* Item identity (src/core/items.js): a kept piece refers to a database row by its gameId (itemById, poolItemById); the
   pool key only groups the same piece from several sources. The ids are the game's own (Item.csv rows): Kirin's Osode
   of Fending is item 24850. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROW } from '../../src/core/constants.js';
import { itemById, mkItem, parseRow, poolItemById, poolItemFromRow, poolKey } from '../../src/core/items.js';
import { makeJobContext } from '../../src/core/job-context.js';
import { ITEMS } from '../../src/core/tables.js';
import { itemRow, piece } from './helpers/common.js';

const war = makeJobContext('WAR');
const sge = makeJobContext('SGE');

test('every database row has its own gameId, and itemById finds each row by it', () => {
  const ids = ITEMS.map(r => r[ROW.gameId]);
  assert.ok(ids.every(Number.isInteger), 'every gameId is an integer');
  assert.equal(new Set(ids).size, ITEMS.length, 'no two rows share a gameId');
  for (const r of ITEMS) assert.equal(itemById(r[ROW.gameId]), r);
});

test('itemById: a real item by its game id; null for an id no row has', () => {
  const row = itemById(24850);
  assert.equal(row[ROW.name], "Kirin's Osode of Fending");
  assert.equal(row[ROW.ilvl], 300);
  assert.equal(itemById(0), null);
  assert.equal(itemById(-1), null);
  assert.equal(itemById('24850'), null, 'a number, not a string');
  assert.equal(itemById(undefined), null);
});

test('pool items from the database carry their gameId; hand-made ones have none', () => {
  const osode = piece(war, "Kirin's Osode of Fending");
  assert.equal(osode.gameId, 24850);
  assert.equal(
    poolItemFromRow(sge, parseRow(itemRow("Courtly Lover's Pendulums"))).gameId,
    itemRow("Courtly Lover's Pendulums")[ROW.gameId],
  );
  assert.equal(mkItem('Hand-made', 'head', 300, { crit: 10 }).gameId, undefined);
});

test('poolItemById: the job pool item of a game id, one object per job and id', () => {
  const osode = poolItemById(war, 24850);
  const fromRow = piece(war, "Kirin's Osode of Fending");
  // the same piece as poolItemFromRow builds, but for its fresh `id`
  assert.deepEqual({ ...osode, id: null }, { ...fromRow, id: null });
  assert.equal(poolKey(osode), poolKey(fromRow));
  assert.equal(poolItemById(war, 24850), osode, 'cached per job');
  assert.notEqual(poolItemById(sge, 24850), osode, 'stats are per job: another job has its own');
  assert.equal(poolItemById(war, 0), null);
});
