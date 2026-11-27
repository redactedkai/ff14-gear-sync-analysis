/* Story of <gsa-notes>: the note and the failed-save message of the page's bottom edge, with the buttons the page's actions stand
   for. The page's part is played here: a button says a note (`note` and a new `noteSeq`), another says a failed save, and the element's
   `note-expire` clears the note, as the root does; the expiry is appended to the `events` output. */
import { html } from 'lit';
import { GsaNotes } from '../../../src/ui/elements/app/notes.ts';
import { closestElement, findElement, listenerElement } from '../gallery/dom.ts';
import { recordEvents } from '../gallery/record.ts';

/* The two texts the buttons say. */
export const NOTE_TEXT = 'Deleted “UwU” sheet.';
export const SAVE_MESSAGE = 'The sheets could not be saved.';

export const Default = () => {
  const record = recordEvents('events');
  const notes = (event: Event) => findElement(closestElement(listenerElement(event), '[data-story-root]'), 'gsa-notes', GsaNotes);
  const sayNote = (event: Event) => {
    const element = notes(event);
    Object.assign(element, { note: NOTE_TEXT, noteSeq: element.noteSeq + 1 });
  };
  const failSave = (event: Event) => {
    notes(event).saveMessage = SAVE_MESSAGE;
  };
  const onExpire = (event: Event) => {
    listenerElement(event, GsaNotes).note = '';
    record({ detail: 'note-expire' });
  };
  return html`
    <div data-story-root>
      <button type="button" @click=${sayNote}>Say a note</button>
      <button type="button" @click=${failSave}>Fail a save</button>
      <gsa-notes @note-expire=${onExpire}></gsa-notes>
    </div>
    <output data-testid="events" hidden></output>
  `;
};
