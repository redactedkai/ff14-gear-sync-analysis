/* Leaving a set page: the store's leave guard, the question asked when a draft, a running Fill or a waiting result would be
   lost, the moves that ask the same (Copy, New set), and the keys of the page (Escape, Tab inside a dialog).
   A part of the setPage component (components/set-page.js composes the parts). */

/* The question while a Fill runs and the page is left. */
export function runningLeaveText(name) {
  return `A Fill is still running for “${name}”. Leaving cancels it, and the set stays as it is.`;
}

/* `page`: {el, refs} (frame.js). Returns the part's members. */
export function leavePart(page) {
  return {
    // the question before leaving: {kind: 'draft' | 'running' | 'result', move}, or null
    leaveAsk: null,

    /* ---- leaving the page ---- */

    /* The store's leave guard: with a draft, a running Fill or a waiting result, ask first and hold `move` back. */
    guardLeave(move) {
      const kind = this.draft ? 'draft' : this.running ? 'running' : this.suggestion ? 'result' : null;
      if (!kind) return false;
      this.open = null;
      this.settingsOpen = false;
      this.leaveAsk = { kind, move };
      this.afterDraw(() => page.refs.leaveKeep.focus());
      return true;
    },
    /* The question's text. */
    get leaveQuestion() {
      const ask = this.leaveAsk;
      if (!ask) return '';
      if (ask.kind === 'running') return runningLeaveText(this.saved.name);
      return this.view.leaveText;
    },
    /* A button of the question: 'apply' or 'discard' (a draft), 'leave' (cancel the Fill, or drop the result), 'keep'. */
    answerLeave(choice) {
      const ask = this.leaveAsk;
      if (!ask) return;
      this.leaveAsk = null;
      if (choice === 'keep') return this.afterDraw(() => page.refs.setsButton.focus());
      if (ask.kind === 'draft') {
        if (choice === 'apply') this.applyDraft();
        else this.discardDraft();
      } else if (ask.kind === 'running') this.cancelFill();
      else {
        this.suggestion = null;
        this.$store.sheets.note = 'Fill result dropped.';
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
      this.open = null;
      this.leave(() => this.$store.sheets.newSet());
    },
    /* Keys on the page: Escape closes the open menu or note (the Fill settings' own menus take the key first, helpers.js
       closeMenuOnEscape), then the settings dialog, the question (Keep), or discards a waiting
       Fill result; Tab stays inside the question and the settings dialog. */
    pageKey(event) {
      if (event.key === 'Tab' && (this.leaveAsk || this.settingsOpen)) {
        const box = this.leaveAsk ? this.$refs.leave : this.$refs.settings;
        const stops = [...box.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled)')];
        const at = stops.indexOf(event.target);
        if (stops.length && (event.shiftKey ? at <= 0 : at === stops.length - 1)) {
          event.preventDefault();
          stops[event.shiftKey ? stops.length - 1 : 0].focus();
        }
        return;
      }
      if (event.key !== 'Escape') return;
      if (this.leaveAsk) this.answerLeave('keep');
      else if (this.open) {
        this.open = null;
      } else if (this.rankHelp) this.rankHelp = false;
      else if (this.settingsOpen) this.closeSettings();
      else if (this.suggestion && !this.dialog) this.discardSuggestion();
      else return;
      event.preventDefault();
    },
  };
}
