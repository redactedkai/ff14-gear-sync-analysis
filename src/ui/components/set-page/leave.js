/* Leaving a set page: the store's leave guard, the question asked when a draft, a running Auto-fill or a waiting result would be
   lost, the moves that ask the same (Copy, New set), and the keys of the page (Escape, Tab inside a dialog).
   A part of the setPage component (components/set-page.js composes the parts). */
import { overlays } from '../../overlays.js';
import { RESULT_DISCARDED_TEXT } from './view.js';

/* The question while an Auto-fill runs and the page is left. */
export function runningLeaveText(name) {
  return `An Auto-fill is still running for “${name}”. Leaving cancels it, and the set stays as it is.`;
}

/* `page`: {el, refs} (frame.js). Returns the part's members. */
export function leavePart(page) {
  return {
    // the question before leaving: {kind: 'draft' | 'running' | 'result', move}, or null
    leaveAsk: null,

    /* ---- leaving the page ---- */

    /* The store's leave guard: with a draft, a running Auto-fill or a waiting result, ask first and hold `move` back. */
    guardLeave(move) {
      const kind = this.draft ? 'draft' : this.running ? 'running' : this.suggestion ? 'result' : null;
      if (!kind) return false;
      overlays.closeAll(); // no menu or popover stays open under the question
      this.leaveAsk = { kind, move };
      this.afterDraw(() => page.refs.leaveKeep?.focus()); // gone when Escape came first
      return true;
    },
    /* The question's text. */
    get leaveQuestion() {
      const ask = this.leaveAsk;
      if (!ask) return '';
      if (ask.kind === 'running') return runningLeaveText(this.saved.name);
      return this.view.leaveText;
    },
    /* A button of the question: 'apply' or 'discard' (a draft), 'leave' (cancel the Auto-fill, or discard the result), 'keep'. */
    answerLeave(choice) {
      const ask = this.leaveAsk;
      if (!ask) return;
      this.leaveAsk = null;
      if (choice === 'keep') return this.afterDraw(() => page.refs.setsButton?.focus());
      if (ask.kind === 'draft') {
        if (choice === 'apply') this.applyDraft();
        else this.discardDraft();
      } else if (ask.kind === 'running') this.cancelFill();
      else {
        this.suggestion = null;
        this.$store.sheets.note = RESULT_DISCARDED_TEXT;
      }
      ask.move();
    },
    /* A move off the page that the store does not guard (a copy, a new set): asked first like the others. */
    leave(move) {
      if (!this.guardLeave(move)) move();
    },
    /* Copy from a set page: the copy goes next to the set and the sheet's list shows (sheets.md, "Where an action
       lands"). */
    copySet() {
      if (this.$store.sheets.busy) return;
      const id = this.saved.id;
      this.leave(() => {
        const store = this.$store.sheets;
        if (store.copySet(id).ok) store.closeSet();
      });
    },
    newSet() {
      if (this.$store.sheets.busy) return;
      this.closeOpenMenu(false);
      this.leave(() => this.$store.sheets.newSet());
    },
    /* Escape on the page: the question answers Keep, else, with no menu or popover open (those are layers of the overlay manager,
       which closes the topmost one on this same key), a waiting Auto-fill result is discarded. The question is a modal <dialog>
       that also answers Escape as its own cancel event (when the focus is outside it); a key that comes before Alpine has drawn
       it is answered here. Tab is kept inside by x-modal. */
    pageKey(event) {
      if (event.key !== 'Escape') return;
      if (this.leaveAsk) this.answerLeave('keep');
      else if (overlays.openIds.length) return;
      else if (this.suggestion && !this.dialog) this.discardSuggestion();
      else return;
      event.preventDefault();
    },
  };
}
