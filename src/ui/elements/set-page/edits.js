/* A set page's edits by hand: the manual draft (a second GearSet in memory from the first edit to Apply or Discard) and the pins, which
   are saved at once and kept in an open draft. Part of the page's session (session.js). The draft (a GearSet in memory from the first
   edit by hand to Apply or Discard, null without one) is in the store: `session.draft` reads it, `pages.setDraft` changes it. */
import { frozenCopy } from '../../view-cache.ts';
import { draftNote, draftView, samePieces } from '../../views/set-draft.js';
import { editableCopy, placePiece, withMeal, withMealPin, withPin, withStone, withoutStone } from '../../sheets/set-edits.js';

/* The page's edits by hand and pins (`session.edits`): the manual draft and the pins, with the methods the page's template calls. */
export class PageEdits {
  /* `session`: the page's session (session.js). */
  constructor(session) {
    this.session = session;
  }

  /* An edit by hand: `change(set)` gives the GearSet after it (or {ok: false, note} when refused). The first edit opens the draft, a
     copy of the saved set. */
  edit(change) {
    const { session } = this;
    if (session.locked) {
      return false;
    }
    const base = session.draft ?? editableCopy(session.saved);
    const next = change(base);
    if (!next) {
      return false;
    }
    session.pages.setDraft(session.setId, frozenCopy(next));
    return true;
  }

  /* A piece picked for row `index` (null: Empty this slot). */
  pick(index, gameId) {
    const { session } = this;
    let toast = '';
    this.edit(set => {
      const done = placePiece(session.job, set, index, gameId);
      if (done.ok) {
        toast = done.removedNote;
      }
      return done.ok ? done.gearSet : null;
    });
    // a pick that took a piece off (a 2H weapon, a shield) says so; a refused one (the picker does not offer it) does nothing
    if (toast) {
      session.sheets.setNote(toast);
    }
    session.menus.closeOpenMenu();
  }

  setStone(index, slot, stat, grade) {
    const { session } = this;
    this.edit(set => withStone(session.job, set, index, slot, { stat, grade }));
    session.menus.closeOpenMenu();
  }

  removeStone(index, slot) {
    const { session } = this;
    this.edit(set => withoutStone(session.job, set, index, slot));
    session.menus.closeOpenMenu();
  }

  setMeal(key) {
    this.edit(set => withMeal(set, key ?? null));
    this.session.menus.closeOpenMenu();
  }

  /* Apply on a draft: the set takes it (pieces, stones, meal, pins), and a note says what changed. The Apply button is off at 0
     changes, but the leave question's "Apply and leave" is not: a draft that equals the saved set closes with no note (it would only
     say "no changes"), and the pins it holds are saved as before. */
  applyDraft() {
    const { session } = this;
    const draft = session.draft;
    if (!draft) {
      return;
    }
    const changes = draftView(session.sheet, session.saved, draft).changes;
    // a change of a piece or a stone by hand ends "best for goal" (the set is no longer as Auto-fill made it); a meal or a pin alone
    // keeps it
    const saved = session.sheets.updateSet(session.saved.id, {
      pieces: draft.pieces,
      meal: draft.meal,
      pinned: draft.pinned,
      bestMeals: samePieces(session.saved, draft) ? session.saved.bestMeals : null,
    });
    if (saved.ok === false && saved.error) {
      return;
    }
    session.pages.setDraft(session.setId, null);
    session.menus.closeOpenMenu();
    if (changes.count) {
      session.sheets.setNote(draftNote('Applied', changes));
    }
    session.focusFill();
  }

  /* Discard on a draft: back as the set is saved. */
  discardDraft() {
    const { session } = this;
    const draft = session.draft;
    if (!draft) {
      return;
    }
    const changes = draftView(session.sheet, session.saved, draft).changes;
    session.pages.setDraft(session.setId, null);
    session.menus.closeOpenMenu();
    session.sheets.setNote(draftNote('Discarded', changes));
    session.focusFill();
  }

  /* ---- pins: saved at once (and kept in an open draft) ---- */

  /* Row `index` pinned or unpinned, as the table shows it now. */
  togglePin(index) {
    const { session } = this;
    if (session.locked) {
      return;
    }
    const shown = session.draft ?? session.saved;
    const on = !(shown.pinned?.pieces ?? []).includes(index);
    session.sheets.updateSet(session.saved.id, { pinned: withPin(session.saved, index, on).pinned });
    if (session.draft) {
      session.pages.setDraft(session.setId, frozenCopy(withPin(session.draft, index, on)));
    }
  }

  toggleMealPin() {
    const { session } = this;
    if (session.locked) {
      return;
    }
    const on = !(session.draft ?? session.saved).pinned?.meal;
    session.sheets.updateSet(session.saved.id, { pinned: withMealPin(session.saved, on).pinned });
    if (session.draft) {
      session.pages.setDraft(session.setId, frozenCopy(withMealPin(session.draft, on)));
    }
  }
}
