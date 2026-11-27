/* A body piece that also covers the head (a cloak) picked by hand: placePiece takes the covered head off in the same change,
   and refuses a head while the cloak is worn, so the set never holds both (the totals counted both before). Real items:
   Sage's Vermilion Cloak of Healing (body, covers the head) and the fixture head (SAGE_IDS.head). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeJobContext } from '../../../../src/core/job-context.ts';
import { poolItemById } from '../../../../src/core/items.ts';
import { evaluateSet, makeSet } from '../../../../src/core/set.ts';
import { placePiece, removedNote } from '../../../../src/ui/sheets/set-edits.ts';
import { SAGE_IDS, sageSet } from '../../helpers/sheet-fixtures.js';

const SGE = makeJobContext('SGE');
const HEAD = 2;
const BODY = 3;
const NO_SYNC = { cap: 795, sync: false, level: 100 };
const VERMILION_CLOAK_OF_HEALING = 24856; // a Sage body piece that covers the head

/* The fixture set (a head, a body, ...) with the head pinned. */
function setWithHead() {
  return sageSet({ pinned: { pieces: [HEAD], meal: false } });
}

test('a cloak picked over a held head empties and unpins the head row and names the head', () => {
  const placed = placePiece(SGE, setWithHead(), BODY, VERMILION_CLOAK_OF_HEALING);
  assert.equal(placed.ok, true);
  assert.equal(placed.gearSet.pieces[BODY].gameId, VERMILION_CLOAK_OF_HEALING);
  assert.equal(placed.gearSet.pieces[HEAD].gameId, undefined);
  assert.deepEqual(placed.gearSet.pinned.pieces, [BODY]);
  const headName = poolItemById(SGE, SAGE_IDS.head).name;
  assert.equal(placed.removedNote, removedNote([headName], poolItemById(SGE, VERMILION_CLOAK_OF_HEALING).name));
  assert.ok(placed.removedNote.includes(headName));
});

test('the set the cloak makes counts the cloak alone, not the cloak and the head', () => {
  const placed = placePiece(SGE, setWithHead(), BODY, VERMILION_CLOAK_OF_HEALING);
  const cloakAlone = sageSet();
  cloakAlone.pieces[HEAD] = { slot: 'head' };
  cloakAlone.pieces[BODY] = { slot: 'body', gameId: VERMILION_CLOAK_OF_HEALING, stones: [] };
  const mind = set => evaluateSet(SGE, makeSet(set.pieces), NO_SYNC, 100).gear.mind;
  assert.equal(mind(placed.gearSet), mind(cloakAlone));
});

test('a head picked while the cloak is worn is refused and the set is unchanged', () => {
  const set = sageSet({ pinned: { pieces: [BODY], meal: false } });
  set.pieces[HEAD] = { slot: 'head' };
  set.pieces[BODY] = { slot: 'body', gameId: VERMILION_CLOAK_OF_HEALING, stones: [] };
  assert.deepEqual(placePiece(SGE, set, HEAD, SAGE_IDS.head), { ok: false });
});

test('a body piece that covers nothing removes nothing', () => {
  const placed = placePiece(SGE, setWithHead(), BODY, SAGE_IDS.body);
  assert.equal(placed.ok, true);
  assert.equal(placed.gearSet.pieces[HEAD].gameId, SAGE_IDS.head);
  assert.equal(placed.removedNote, '');
});
