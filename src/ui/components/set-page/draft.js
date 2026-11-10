/* A set page's edits by hand: the manual draft (a second GearSet in memory from the first edit to Apply or Discard) and the
   pins, which are saved at once and kept in an open draft.
   A part of the setPage component (components/set-page.js composes the parts). */
import { draftNote, draftView, samePieces } from '../../views/set-draft.js';
import { editableCopy, placePiece, withMeal, withMealPin, withPin, withStone, withoutStone } from '../../views/set-edits.js';

/* `raw`: Alpine.raw or a stand-in (components/set-page.js). Returns the part's members. */
export function draftPart(raw) {
  return {
    // the manual draft: a GearSet in memory, from the first edit by hand to Apply or Discard; null without one
    draft: null,

    /* ---- edits by hand: a manual draft ---- */

    /* An edit by hand: `change(set)` gives the GearSet after it (or {ok: false, note} when refused). The first edit opens
       the draft, a copy of the saved set. */
    edit(change) {
      if (this.locked) return false;
      const base = raw(this.draft) ?? editableCopy(this.saved);
      const next = change(base);
      if (!next) return false;
      this.draft = next;
      return true;
    },
    /* A piece picked for row `index` (null: Empty this slot). */
    pick(index, gameId) {
      let refused = '';
      this.edit(set => {
        const done = placePiece(this.job, set, index, gameId);
        if (!done.ok) refused = done.note;
        return done.ok ? done.gearSet : null;
      });
      if (refused) this.$store.sheets.note = refused;
      this.open = null;
    },
    setStone(index, slot, stat, grade) {
      this.edit(set => withStone(this.job, set, index, slot, { stat, grade }));
      this.open = null;
    },
    removeStone(index, slot) {
      this.edit(set => withoutStone(this.job, set, index, slot));
      this.open = null;
    },
    setMeal(key) {
      this.edit(set => withMeal(set, key ?? null));
      this.open = null;
    },
    /* Apply on a draft: the set takes it (pieces, stones, meal, pins), and a note says what changed. */
    applyDraft() {
      const draft = raw(this.draft);
      if (!draft) return;
      const changes = draftView(this.sheet, this.saved, draft).changes;
      // a change of a piece or a stone by hand ends "best for goal" (the set is no longer as Fill made it); a meal or a pin
      // alone keeps it
      const saved = this.$store.sheets.updateSet(this.saved.id, {
        pieces: draft.pieces,
        meal: draft.meal,
        pinned: draft.pinned,
        bestMeals: samePieces(this.saved, draft) ? this.saved.bestMeals : null,
      });
      if (saved.ok === false && saved.error) return;
      this.draft = null;
      this.open = null;
      this.$store.sheets.note = draftNote('Applied', changes);
      this.focusFill();
    },
    /* Discard on a draft: back as the set is saved. */
    discardDraft() {
      const draft = raw(this.draft);
      if (!draft) return;
      const changes = draftView(this.sheet, this.saved, draft).changes;
      this.draft = null;
      this.open = null;
      this.$store.sheets.note = draftNote('Discarded', changes);
      this.focusFill();
    },

    /* ---- pins: saved at once (and kept in an open draft) ---- */

    /* Row `index` pinned or unpinned, as the table shows it now. */
    togglePin(index) {
      if (this.locked) return;
      const shown = raw(this.draft) ?? this.saved;
      const on = !(shown.pinned?.pieces ?? []).includes(index);
      this.$store.sheets.updateSet(this.saved.id, { pinned: withPin(this.saved, index, on).pinned });
      if (this.draft) this.draft = withPin(raw(this.draft), index, on);
    },
    toggleMealPin() {
      if (this.locked) return;
      const on = !(raw(this.draft) ?? this.saved).pinned?.meal;
      this.$store.sheets.updateSet(this.saved.id, { pinned: withMealPin(this.saved, on).pinned });
      if (this.draft) this.draft = withMealPin(raw(this.draft), on);
    },
  };
}
