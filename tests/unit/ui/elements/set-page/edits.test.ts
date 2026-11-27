/* A set page's edits by hand (src/ui/elements/set-page/edits.ts) bound to a real sheet store: the
   manual draft (Apply, Discard) and pins saved at once. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placePiece } from '../../../../../src/ui/sheets/set-edits.ts';
import { makeJobContext } from '../../../../../src/core/job-context.ts';
import { bind } from '../../../helpers/set-page-bind.ts';
import { hasNumber } from '../../../helpers/common.ts';
import { SAGE_IDS, sageSet } from '../../../helpers/sheet-fixtures.ts';
import type { PageView } from '../../../../../src/ui/elements/set-page/set-page-types.ts';
import type { SavedGearSet } from '../../../../../src/ui/sheets/saved-types.ts';
import { createSheetsFacade } from '../../../helpers/stores.ts';

const SGE = makeJobContext('SGE');

/* The saved gear set the page is open on; fails the test when none is. */
function savedSet(sheets: { currentSet: SavedGearSet | null }): SavedGearSet {
  assert.ok(sheets.currentSet, 'no gear set is open');
  return sheets.currentSet;
}
/* The Apply button of a view in draft mode; fails the test when the view has none. */
function applyOf(view: PageView): NonNullable<PageView['apply']> {
  assert.ok(view.apply, 'the view has no Apply button');
  return view.apply;
}
/* The manual draft the page holds; fails the test when there is none. */
function draftOf(session: { draft: Readonly<SavedGearSet> | null }): Readonly<SavedGearSet> {
  assert.ok(session.draft, 'no draft is open');
  return session.draft;
}
/* The rows pinned in `set` (none when it has no pins saved). */
const pinnedRows = (set: SavedGearSet): number[] => set.pinned?.pieces ?? [];
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
  assert.ok(hasNumber(applyOf(view()).text, 1), applyOf(view()).text);
  assert.equal(savedSet(sheets).pieces[HEAD].stones?.length, 3, 'the saved set keeps its stones');
  assert.equal(fillButton().disabled, true, 'no Auto-fill in a draft');
  session.edits.setStone(HEAD, 0, 'det', 4);
  session.edits.applyDraft();
  assert.equal(session.draft, null);
  const appliedNote = sheets.note;
  assert.ok(appliedNote, 'Apply leaves a note');
  assert.deepEqual(savedSet(sheets).pieces[HEAD].stones, [{ stat: 'det', grade: 4 }, null, null, null, null]);
  assert.deepEqual(pinnedRows(savedSet(sheets)), [HEAD]);
  // a reload (a second store on the same storage) reads the applied set back
  const reloaded = createSheetsFacade({ storage }).sheet('s_1')?.sets[0];
  assert.ok(reloaded, 'the sheet is read back');
  assert.deepEqual(reloaded.pieces[HEAD].stones?.[0], { stat: 'det', grade: 4 });

  session.edits.setMeal(null);
  session.edits.pick(HANDS, null);
  session.edits.discardDraft();
  assert.equal(session.draft, null);
  assert.ok(sheets.note && sheets.note !== appliedNote, 'Discard leaves its own note');
  assert.equal(savedSet(sheets).pieces[HANDS].gameId, SAGE_IDS.hands);
});

test('Apply on a draft with nothing changed closes it with no note, and keeps the pin the pick made', () => {
  const { session, sheets, view } = bind();
  session.edits.pick(HANDS, SAGE_IDS.hands); // the piece the row already holds
  assert.equal(view().mode, 'draft');
  assert.equal(applyOf(view()).disabled, true, 'the Apply button is off at 0 changes');
  const noteBefore = sheets.note;
  session.edits.applyDraft(); // the leave question's Apply and leave reaches it with the button off
  assert.equal(session.draft, null);
  assert.equal(sheets.note, noteBefore, 'no Applied: no changes. note');
  assert.deepEqual(pinnedRows(savedSet(sheets)), [HANDS], 'the pin of the pick is saved as before');
});

test('a Unique ring already worn is refused with no note; pins are saved at once and kept in a draft', () => {
  const placed = placePiece(SGE, sageSet(), 10, UNIQUE_RING);
  assert.ok(placed.ok, 'the ring is placed');
  const start = placed.gearSet;
  const { session, sheets } = bind(start);
  const noteBefore = sheets.note;
  session.edits.pick(RING_2, UNIQUE_RING);
  assert.equal(session.draft, null);
  assert.equal(sheets.note, noteBefore, 'the picker never offers it, so there is no toast');

  session.edits.togglePin(FEET);
  assert.ok(pinnedRows(savedSet(sheets)).includes(FEET));
  session.edits.pick(HEAD, SAGE_IDS.head);
  session.edits.togglePin(FEET);
  assert.ok(!pinnedRows(savedSet(sheets)).includes(FEET), 'saved while a draft is open');
  assert.ok(!pinnedRows(draftOf(session)).includes(FEET), 'and shown in the draft');
  session.edits.toggleMealPin();
  assert.equal(savedSet(sheets).pinned?.meal, true);
});

test('the draft is in the store: a frozen copy, one entry per page, gone with Apply, Discard and the page', () => {
  const { session, store, sheets } = bind();
  assert.deepEqual(Object.keys(store.state.setPages), [session.setId], 'the open page has its entry');
  session.edits.pick(HEAD, SAGE_IDS.head);
  const held = draftOf(session);
  assert.equal(store.state.setPages[session.setId].draft, held, 'the component reads the store, not a field of its own');
  assert.equal(sheets.page(session.setId).draft, held);
  assert.ok(Object.isFrozen(held) && Object.isFrozen(held.pieces) && Object.isFrozen(held.pieces[HEAD]), 'frozen all through');
  assert.notEqual(held.pieces[0], savedSet(sheets).pieces[0], 'a copy: the saved set is not frozen with it');
  assert.ok(!Object.isFrozen(savedSet(sheets).pieces));
  session.edits.togglePin(FEET);
  assert.notEqual(session.draft, held, 'a pin replaces the draft with a new object');
  session.edits.discardDraft();
  assert.equal(store.state.setPages[session.setId].draft, null);
  session.edits.pick(HEAD, SAGE_IDS.head);
  session.stop();
  assert.deepEqual(store.state.setPages, {}, 'a page left takes its draft with it');
});
