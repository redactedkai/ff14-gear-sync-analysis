/* A set page's edits by hand (src/ui/elements/set-page/edits.js) bound to a real sheet store: the
   manual draft (Apply, Discard) and pins saved at once. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placePiece } from '../../../../../src/ui/sheets/set-edits.js';
import { makeJobContext } from '../../../../../src/core/job-context.js';
import { bind } from '../../../helpers/set-page-bind.js';
import { hasNumber } from '../../../helpers/common.js';
import { SAGE_IDS, sageSet } from '../../../helpers/sheet-fixtures.js';
import { createSheetsFacade } from '../../../helpers/stores.js';

const SGE = makeJobContext('SGE');
const HEAD = 2;
const HANDS = 4;
const FEET = 6;
const RING_2 = 11;
/* Augmented Bygone Brass Ring of Healing (item level 790): a Unique ring. */
const UNIQUE_RING = 49656;

test('a draft: edits by hand stay in memory until Apply, which saves them with their pins; Discard drops them', () => {
  const { session, sheets, storage, view, fillButton } = bind();
  session.edits.pick(HEAD, SAGE_IDS.head);
  assert.equal(view().mode, 'draft');
  assert.ok(hasNumber(view().apply.text, 1), view().apply.text);
  assert.equal(sheets.currentSet.pieces[HEAD].stones.length, 3, 'the saved set keeps its stones');
  assert.equal(fillButton().disabled, true, 'no Auto-fill in a draft');
  session.edits.setStone(HEAD, 0, 'det', 4);
  session.edits.applyDraft();
  assert.equal(session.draft, null);
  const appliedNote = sheets.note;
  assert.ok(appliedNote, 'Apply leaves a note');
  assert.deepEqual(sheets.currentSet.pieces[HEAD].stones, [{ stat: 'det', grade: 4 }, null, null, null, null]);
  assert.deepEqual(sheets.currentSet.pinned.pieces, [HEAD]);
  // a reload (a second store on the same storage) reads the applied set back
  const reloaded = createSheetsFacade({ storage }).sheet('s_1').sets[0];
  assert.deepEqual(reloaded.pieces[HEAD].stones[0], { stat: 'det', grade: 4 });

  session.edits.setMeal(null);
  session.edits.pick(HANDS, null);
  session.edits.discardDraft();
  assert.equal(session.draft, null);
  assert.ok(sheets.note && sheets.note !== appliedNote, 'Discard leaves its own note');
  assert.equal(sheets.currentSet.pieces[HANDS].gameId, SAGE_IDS.hands);
});

test('Apply on a draft with nothing changed closes it with no note, and keeps the pin the pick made', () => {
  const { session, sheets, view } = bind();
  session.edits.pick(HANDS, SAGE_IDS.hands); // the piece the row already holds
  assert.equal(view().mode, 'draft');
  assert.equal(view().apply.disabled, true, 'the Apply button is off at 0 changes');
  const noteBefore = sheets.note;
  session.edits.applyDraft(); // the leave question's Apply and leave reaches it with the button off
  assert.equal(session.draft, null);
  assert.equal(sheets.note, noteBefore, 'no Applied: no changes. note');
  assert.deepEqual(sheets.currentSet.pinned.pieces, [HANDS], 'the pin of the pick is saved as before');
});

test('a Unique ring already worn is refused with no note; pins are saved at once and kept in a draft', () => {
  const start = placePiece(SGE, sageSet(), 10, UNIQUE_RING).gearSet;
  const { session, sheets } = bind(start);
  const noteBefore = sheets.note;
  session.edits.pick(RING_2, UNIQUE_RING);
  assert.equal(session.draft, null);
  assert.equal(sheets.note, noteBefore, 'the picker never offers it, so there is no toast');

  session.edits.togglePin(FEET);
  assert.ok(sheets.currentSet.pinned.pieces.includes(FEET));
  session.edits.pick(HEAD, SAGE_IDS.head);
  session.edits.togglePin(FEET);
  assert.ok(!sheets.currentSet.pinned.pieces.includes(FEET), 'saved while a draft is open');
  assert.ok(!session.draft.pinned.pieces.includes(FEET), 'and shown in the draft');
  session.edits.toggleMealPin();
  assert.equal(sheets.currentSet.pinned.meal, true);
});

test('the draft is in the store: a frozen copy, one entry per page, gone with Apply, Discard and the page', () => {
  const { session, store, sheets } = bind();
  assert.deepEqual(Object.keys(store.state.setPages), [session.setId], 'the open page has its entry');
  session.edits.pick(HEAD, SAGE_IDS.head);
  const held = store.state.setPages[session.setId].draft;
  assert.equal(session.draft, held, 'the component reads the store, not a field of its own');
  assert.equal(sheets.page(session.setId).draft, held);
  assert.ok(Object.isFrozen(held) && Object.isFrozen(held.pieces) && Object.isFrozen(held.pieces[HEAD]), 'frozen all through');
  assert.notEqual(held.pieces[0], sheets.currentSet.pieces[0], 'a copy: the saved set is not frozen with it');
  assert.ok(!Object.isFrozen(sheets.currentSet.pieces));
  session.edits.togglePin(FEET);
  assert.notEqual(session.draft, held, 'a pin replaces the draft with a new object');
  session.edits.discardDraft();
  assert.equal(store.state.setPages[session.setId].draft, null);
  session.edits.pick(HEAD, SAGE_IDS.head);
  session.stop();
  assert.deepEqual(store.state.setPages, {}, 'a page left takes its draft with it');
});
