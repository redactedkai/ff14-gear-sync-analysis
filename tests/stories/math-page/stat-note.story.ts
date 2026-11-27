/* Stories of <gsa-stat-note>: the Substat tiers "?" note, hung under whichever of two buttons the page names. The page's
   part is played here by two plain buttons and a listener that clears the anchor when the note closes by itself. */
import { html } from 'lit';
import { GsaStatNote } from '../../../src/ui/elements/math-page/stat-note.ts';
import { closestElement, findElement, listenerElement } from '../gallery/dom.ts';

/* The two substats of the story, with the words of their notes. */
export const NOTES = {
  crit: { title: 'Critical Hit', affects: 'Chance and size of critical hits.', size: 'One tier is 9.5 points.' },
  det: { title: 'Determination', affects: 'All damage and healing.', size: 'One tier is 8 points.' },
};

/* The page's job: a press on a "?" opens its note (or closes it when it is the open one); the note's own close clears it. */
function toggle(event: Event, stat: keyof typeof NOTES) {
  const button = listenerElement(event);
  const note = findElement(closestElement(button, '.story-note-page'), 'gsa-stat-note', GsaStatNote);
  const open = note.anchor === button;
  note.note = open ? null : NOTES[stat];
  note.anchor = open ? null : button;
}

/* The element beside two "?" buttons and a control after them (where Tab goes). */
export const Default = () => html`
  <div class="story-note-page" style="position: relative; padding: 20px" @note-close=${(event: Event) => {
    findElement(listenerElement(event), 'gsa-stat-note', GsaStatNote).anchor = null;
  }}>
    <button type="button" data-help="crit" @click=${(event: Event) => toggle(event, 'crit')}>? Critical Hit</button>
    <button type="button" data-help="det" @click=${(event: Event) => toggle(event, 'det')}>? Determination</button>
    <input type="text" aria-label="After the buttons" />
    <gsa-stat-note></gsa-stat-note>
  </div>
`;
