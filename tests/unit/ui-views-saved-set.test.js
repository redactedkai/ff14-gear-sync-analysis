/* The saved gear set's shared rules (src/ui/views/saved-set.js): the rows a job uses, ring numbering, and when two rows
   hold the same thing (sameRow), which the draft's change count and a Fill suggestion's both go by. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeJobContext } from '../../src/core/job-context.js';
import { holdsPiece, isUsed, rowLabel, sameRow, usedRows } from '../../src/ui/views/saved-set.js';
import { draftChanges } from '../../src/ui/views/set-draft.js';
import { suggestionView } from '../../src/ui/views/set-suggestion.js';
import { THREE_CRIT_IV, sageSet, sheetOf } from './helpers/sheet-fixtures.js';

const SGE = makeJobContext('SGE');

test('sameRow: a missing stone list is an empty one, trailing empty sockets do not count, a missing game id is none', () => {
  const head = { slot: 'head', gameId: 5, stones: [] };
  assert.equal(sameRow(head, { slot: 'head', gameId: 5 }), true);
  assert.equal(sameRow(head, { slot: 'head', gameId: 5, stones: [null, null] }), true);
  assert.equal(sameRow({ slot: 'head', gameId: null, stones: [] }, { slot: 'head' }), true);
  assert.equal(sameRow(head, { ...head, gameId: 6 }), false);
  assert.equal(sameRow({ ...head, stones: THREE_CRIT_IV }, { ...head, stones: structuredClone(THREE_CRIT_IV) }), true);
  assert.equal(sameRow({ ...head, stones: THREE_CRIT_IV }, head), false);
});

test('rows a job uses and their labels: a Sage has no off-hand row; the rings are Ring 1 and Ring 2', () => {
  const saved = sageSet();
  const used = usedRows(SGE, saved).map(r => r.index);
  assert.equal(used.length, 11);
  assert.ok(saved.pieces.every((row, index) => isUsed(SGE, row) === used.includes(index)));
  const rings = saved.pieces.flatMap((row, index) => (row.slot === 'ring' ? [rowLabel(saved, index)] : []));
  assert.deepEqual(rings, ['Ring 1', 'Ring 2']);
  assert.equal(
    holdsPiece(SGE, saved),
    saved.pieces.some(row => row.gameId != null),
  );
});

test('the draft count and a Fill suggestion agree: an empty stone list against a missing one is no change', () => {
  const saved = sageSet();
  const sheet = sheetOf('SGE', [saved]);
  // the same set, written the other way: stones missing where they are empty, game ids undefined where null
  const rewritten = {
    ...saved,
    pieces: saved.pieces.map(row => {
      const copy = { slot: row.slot };
      if (row.gameId != null) copy.gameId = row.gameId;
      if (row.stones?.some(Boolean)) copy.stones = row.stones;
      return copy;
    }),
  };
  assert.deepEqual(draftChanges(SGE, saved, rewritten).count, 0);
  const view = suggestionView(sheet, saved, { pieces: rewritten.pieces, meal: saved.meal });
  assert.equal(view.total, 0);
  // one real change: both count it
  const index = usedRows(SGE, saved).find(r => r.row.gameId != null).index;
  const changed = rewritten.pieces.map((row, i) => (i === index ? { ...row, gameId: null } : row));
  assert.equal(draftChanges(SGE, saved, { ...rewritten, pieces: changed }).count, 1);
  assert.equal(suggestionView(sheet, saved, { pieces: changed, meal: saved.meal }).total, 1);
});
