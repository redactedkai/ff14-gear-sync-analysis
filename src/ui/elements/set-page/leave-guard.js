/* Leaving a set page: the store's leave guard, the question asked when a draft, a running Auto-fill or a waiting result would be lost,
   the moves that ask the same (Copy, New set), and the key of the page (Escape). Part of the page's session (session.js). */
import { overlays } from '../../overlays.js';
import { unsettledKind } from '../../store/app-state.ts';
import { RESULT_DISCARDED_TEXT } from '../../views/set-page.js';

/* The question while an Auto-fill runs and the page is left. */
export function runningLeaveText(name) {
  return `An Auto-fill is still running for “${name}”. Leaving cancels it, and the set stays as it is.`;
}

export class PageLeave {
  /* `session`: the page's session (session.js). */
  constructor(session) {
    this.session = session;
    // the question before leaving: {kind: 'draft' | 'running' | 'result', move}, or null
    this.ask = null;
  }

  /* The store's leave guard: with a draft, a running Auto-fill or a waiting result (the store's unsettledKind of this page, the same
     rule as the reload and close guard's `unsettled`), ask first and hold `move` back. */
  guardLeave(move) {
    const kind = unsettledKind(this.session.pageState);
    if (!kind) {
      return false;
    }
    overlays.closeAll(); // no menu or popover stays open under the question
    this.ask = { kind, move }; // the question's <gsa-dialog> puts the focus on Keep when it is drawn
    this.session.changed();
    return true;
  }

  /* The question's text, '' while none is asked. `view`: the page's view (its leaveText). */
  questionText(view) {
    const ask = this.ask;
    if (!ask) {
      return '';
    }
    if (ask.kind === 'running') {
      return runningLeaveText(this.session.saved.name);
    }
    return view.leaveText;
  }

  /* A button of the question: 'apply' or 'discard' (a draft), 'leave' (cancel the Auto-fill, or discard the result), 'keep'. */
  answerLeave(choice) {
    const { session } = this;
    const ask = this.ask;
    if (!ask) {
      return;
    }
    this.ask = null;
    session.changed();
    if (choice === 'keep') {
      session.afterDraw(() => session.host.query('#sh-set-switch')?.focus());
      return;
    }
    if (ask.kind === 'draft') {
      if (choice === 'apply') {
        session.edits.applyDraft();
      } else {
        session.edits.discardDraft();
      }
    } else if (ask.kind === 'running') {
      session.fill.cancelFill();
    } else {
      session.pages.setSuggestion(session.setId, null);
      session.sheets.setNote(RESULT_DISCARDED_TEXT);
    }
    ask.move();
  }

  /* A move off the page that the store does not guard (a copy, a new set): asked first like the others. */
  leave(move) {
    if (!this.guardLeave(move)) {
      move();
    }
  }

  /* Copy from a set page: the copy goes next to the set and the sheet's list shows (sheets.md, "Where an action lands"). */
  copySet() {
    const { sheets, saved } = this.session;
    if (sheets.busy) {
      return;
    }
    const id = saved.id;
    this.leave(() => {
      if (sheets.copySet(id).ok) {
        sheets.closeSet();
      }
    });
  }

  newSet() {
    const { sheets } = this.session;
    if (sheets.busy) {
      return;
    }
    this.leave(() => sheets.newSet());
  }

  /* Escape on the page (`event` its keydown): the question answers Keep, else, with no menu or popover open (those are layers of the
     overlay manager, which closes the topmost one on this same key), a waiting Auto-fill result is discarded. The question is a
     <gsa-dialog> whose own Escape (`dialog-escape`) answers Keep and marks the key as handled (defaultPrevented); a key that comes
     before the page has drawn the question is answered here. Tab is kept inside by the dialog. */
  pageKey(event) {
    const { session } = this;
    if (event.key !== 'Escape' || event.defaultPrevented) {
      return;
    }
    if (this.ask) {
      this.answerLeave('keep');
    } else if (overlays.openIds.length) {
      return;
    } else if (session.suggestion && !session.host.dialogOpen) {
      session.fill.discardSuggestion();
    } else {
      return;
    }
    event.preventDefault();
  }
}
