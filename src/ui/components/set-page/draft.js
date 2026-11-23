/* A set page's edits by hand: the manual draft (a second GearSet in memory from the first edit to Apply or Discard) and the
   pins, which are saved at once and kept in an open draft.
   A part of the setPage component (components/set-page.js composes the parts). */
import { draftNote, draftView, samePieces } from '../../views/set-draft.js';
import { editableCopy, placePiece, withMeal, withMealPin, withPin, withStone, withoutStone } from '../../sheets/set-edits.js';

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
      let toast = '';
      this.edit(set => {
        const done = placePiece(this.job, set, index, gameId);
        if (done.ok) toast = done.removedNote;
        return done.ok ? done.gearSet : null;
      });
      // a pick that took a piece off (a 2H weapon, a shield) says so; a refused one (the picker does not offer it) does nothing
      if (toast) this.$store.sheets.note = toast;
      this.closeOpenMenu();
    },
    setStone(index, slot, stat, grade) {
      this.edit(set => withStone(this.job, set, index, slot, { stat, grade }));
      this.closeOpenMenu();
    },
    removeStone(index, slot) {
      this.edit(set => withoutStone(this.job, set, index, slot));
      this.closeOpenMenu();
    },
    setMeal(key) {
      this.edit(set => withMeal(set, key ?? null));
      this.closeOpenMenu();
    },
    /* Apply on a draft: the set takes it (pieces, stones, meal, pins), and a note says what changed. The Apply button is off at
       0 changes, but the leave question's "Apply and leave" is not: a draft that equals the saved set closes with no note
       (it would only say "no changes"), and the pins it holds are saved as before. */
    applyDraft() {
      const draft = raw(this.draft);
      if (!draft) return;
      const changes = draftView(this.sheet, this.saved, draft).changes;
      // a change of a piece or a stone by hand ends "best for goal" (the set is no longer as Auto-fill made it); a meal or a pin
      // alone keeps it
      const saved = this.$store.sheets.updateSet(this.saved.id, {
        pieces: draft.pieces,
        meal: draft.meal,
        pinned: draft.pinned,
        bestMeals: samePieces(this.saved, draft) ? this.saved.bestMeals : null,
      });
      if (saved.ok === false && saved.error) return;
      this.draft = null;
      this.closeOpenMenu(false);
      if (changes.count) this.$store.sheets.note = draftNote('Applied', changes);
      this.focusFill();
    },
    /* Discard on a draft: back as the set is saved. */
    discardDraft() {
      const draft = raw(this.draft);
      if (!draft) return;
      const changes = draftView(this.sheet, this.saved, draft).changes;
      this.draft = null;
      this.closeOpenMenu(false);
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
