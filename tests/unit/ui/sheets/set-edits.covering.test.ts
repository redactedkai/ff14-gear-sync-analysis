/* A body piece that also covers the head (a cloak) picked by hand: placePiece takes the covered head off in the same change,
   so the set never holds both (the totals counted both before). Real items: Sage's Vermilion Cloak of Healing (body, covers the head)
   and the fixture head (SAGE_IDS.head). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeJobContext } from '../../../../src/core/job-context.ts';
import { poolItemById } from '../../../../src/core/items.ts';
import { evaluateSet, makeSet } from '../../../../src/core/set.ts';
import { placePiece, removedNote } from '../../../../src/ui/sheets/set-edits.ts';
import { mustFind } from '../../helpers/fixtures/common.ts';
import type { SavedGearSet } from '../../../../src/ui/sheets/saved-types.ts';
import { SAGE_IDS, sageSet, placedOk } from '../../helpers/fixtures/sheet-fixtures.ts';

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
  const placed = placedOk(placePiece(SGE, setWithHead(), BODY, VERMILION_CLOAK_OF_HEALING));
  assert.equal(placed.ok, true);
  assert.equal(placed.gearSet.pieces[BODY].gameId, VERMILION_CLOAK_OF_HEALING);
  assert.equal(placed.gearSet.pieces[HEAD].gameId, undefined);
  assert.deepEqual(placed.gearSet.pinned?.pieces, [BODY]);
  const headName = mustFind(poolItemById(SGE, SAGE_IDS.head), 'the head').name;
  assert.equal(placed.removedNote, removedNote([headName], mustFind(poolItemById(SGE, VERMILION_CLOAK_OF_HEALING), 'the cloak').name));
  assert.ok(placed.removedNote.includes(headName));
});

test('the set the cloak makes counts the cloak alone, not the cloak and the head', () => {
  const placed = placedOk(placePiece(SGE, setWithHead(), BODY, VERMILION_CLOAK_OF_HEALING));
  const cloakAlone = sageSet();
  cloakAlone.pieces[HEAD] = { slot: 'head' };
  cloakAlone.pieces[BODY] = { slot: 'body', gameId: VERMILION_CLOAK_OF_HEALING, stones: [] };
  const mind = (set: SavedGearSet) => evaluateSet(SGE, makeSet(set.pieces), NO_SYNC, 100).gear.mind;
  assert.equal(mind(placed.gearSet), mind(cloakAlone));
});
