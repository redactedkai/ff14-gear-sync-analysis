/* The page's notes as a Lit element in light DOM, an island in the Alpine-run page (docs/engineering/architecture.md section 3):
   the note after an action ("Deleted “UwU” sheet.", `#sh-toast`) and the message of a failed save (`#sh-save-error`), shown at
   the window's bottom on every tab, outside the tabs, so a note set while a tab is left is still seen.
   - the page gives it properties from a wrapper's `x-effect`: `note` (the text, '' for none), `noteSeq` (the count of notes
     said, which changes even for an identical note) and `saveMessage` ('' when every edit is saved); the element never reads
     a store;
   - both paragraphs are always in the page, empty when there is nothing to say (the CSS shows an empty one as nothing), so a
     screen reader's polite and assertive live regions announce the text when it arrives;
   - the note clears itself NOTE_MS after it was last said: the element sends `note-expire` and the page clears the note;
   - a failed save's message is not timed: the page clears it when a save succeeds.
   Own element, not Zag's toast group: two fixed messages need no queue or placement. */
import { LitElement, html } from 'lit';
import { createNoteTimer } from './note-timer.ts';

/* The event the element sends when the note's time is up. */
export const NOTE_EXPIRE_EVENT = 'note-expire';

/* The `gsa-notes` element (registered below): see the file header. */
export class GsaNotes extends LitElement {
  static properties = {
    note: { attribute: false },
    noteSeq: { attribute: false },
    saveMessage: { attribute: false },
  };

  declare note: string;
  declare noteSeq: number;
  declare saveMessage: string;
  private readonly timer: ReturnType<typeof createNoteTimer>;

  constructor() {
    super();
    this.note = '';
    this.noteSeq = 0;
    this.saveMessage = '';
    this.timer = createNoteTimer(() => {
      this.dispatchEvent(new CustomEvent(NOTE_EXPIRE_EVENT, { bubbles: true, composed: true }));
    });
  }

  /* Light DOM: draw into the element itself, so the page's CSS reaches the markup. */
  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.timer.stop();
  }

  /* A new note (or the same note said again) starts the wait; the note being cleared stops it. */
  protected override willUpdate(changed: Map<string, unknown>): void {
    if (changed.has('noteSeq') || changed.has('note')) {
      this.timer.restart(this.note !== '');
    }
  }

  protected override render() {
    return html`
      <p class="toast floating" id="sh-toast" role="status">${this.note}</p>
      <p class="toast floating saveerror" id="sh-save-error" role="alert">${this.saveMessage}</p>
    `;
  }
}

customElements.define('gsa-notes', GsaNotes);
