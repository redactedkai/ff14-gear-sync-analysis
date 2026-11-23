/* A set page's edits by hand (src/ui/components/set-page/draft.js) bound to a real sheet store, as Alpine binds it: the
   manual draft (Apply, Discard) and pins saved at once. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSheetStore } from '../../../../../src/ui/sheets/store.js';
import { placePiece } from '../../../../../src/ui/sheets/set-edits.js';
import { makeJobContext } from '../../../../../src/core/job-context.js';
import { bind } from '../../../helpers/set-page-bind.js';
import { hasNumber } from '../../../helpers/common.js';
import { SAGE_IDS, sageSet } from '../../../helpers/sheet-fixtures.js';

const SGE = makeJobContext('SGE');
const HEAD = 2;
const HANDS = 4;
const FEET = 6;
const RING_2 = 11;
/* Augmented Bygone Brass Ring of Healing (item level 790): a Unique ring. */
const UNIQUE_RING = 49656;

test('a draft: edits by hand stay in memory until Apply, which saves them with their pins; Discard drops them', () => {
  const { c, sheets, storage } = bind();
  c.pick(HEAD, SAGE_IDS.head);
  assert.equal(c.view.mode, 'draft');
  assert.ok(hasNumber(c.view.apply.text, 1), c.view.apply.text);
  assert.equal(sheets.currentSet.pieces[HEAD].stones.length, 3, 'the saved set keeps its stones');
  assert.equal(c.fillButton.disabled, true, 'no Auto-fill in a draft');
  c.setStone(HEAD, 0, 'det', 4);
  c.applyDraft();
  assert.equal(c.draft, null);
  const appliedNote = sheets.note;
  assert.ok(appliedNote, 'Apply leaves a note');
  assert.deepEqual(sheets.currentSet.pieces[HEAD].stones, [{ stat: 'det', grade: 4 }, null, null, null, null]);
  assert.deepEqual(sheets.currentSet.pinned.pieces, [HEAD]);
  // a reload (a second store on the same storage) reads the applied set back
  const reloaded = createSheetStore({ storage }).sheet('s_1').sets[0];
  assert.deepEqual(reloaded.pieces[HEAD].stones[0], { stat: 'det', grade: 4 });

  c.setMeal(null);
  c.pick(HANDS, null);
  c.discardDraft();
  assert.equal(c.draft, null);
  assert.ok(sheets.note && sheets.note !== appliedNote, 'Discard leaves its own note');
  assert.equal(sheets.currentSet.pieces[HANDS].gameId, SAGE_IDS.hands);
});

test('Apply on a draft with nothing changed closes it with no note, and keeps the pin the pick made', () => {
  const { c, sheets } = bind();
  c.pick(HANDS, SAGE_IDS.hands); // the piece the row already holds
  assert.equal(c.view.mode, 'draft');
  assert.equal(c.view.apply.disabled, true, 'the Apply button is off at 0 changes');
  const noteBefore = sheets.note;
  c.applyDraft(); // the leave question's Apply and leave reaches it with the button off
  assert.equal(c.draft, null);
  assert.equal(sheets.note, noteBefore, 'no Applied: no changes. note');
  assert.deepEqual(sheets.currentSet.pinned.pieces, [HANDS], 'the pin of the pick is saved as before');
});

test('a Unique ring already worn is refused with no note; pins are saved at once and kept in a draft', () => {
  const start = placePiece(SGE, sageSet(), 10, UNIQUE_RING).gearSet;
  const { c, sheets } = bind(start);
  const noteBefore = sheets.note;
  c.pick(RING_2, UNIQUE_RING);
  assert.equal(c.draft, null);
  assert.equal(sheets.note, noteBefore, 'the picker never offers it, so there is no toast');

  c.togglePin(FEET);
  assert.ok(sheets.currentSet.pinned.pieces.includes(FEET));
  c.pick(HEAD, SAGE_IDS.head);
  c.togglePin(FEET);
  assert.ok(!sheets.currentSet.pinned.pieces.includes(FEET), 'saved while a draft is open');
  assert.ok(!c.draft.pinned.pieces.includes(FEET), 'and shown in the draft');
  c.toggleMealPin();
  assert.equal(sheets.currentSet.pinned.meal, true);
});
