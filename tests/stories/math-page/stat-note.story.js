/* Stories of <gsa-stat-note>: the Substat tiers "?" note, hung under whichever of two buttons the page names. The page's
   part is played here by two plain buttons and a listener that clears the anchor when the note closes by itself. */
import { html } from 'lit';
import '../../../src/ui/elements/math-page/stat-note.ts';

/* The two substats of the story, with the words of their notes. */
export const NOTES = {
  crit: { title: 'Critical Hit', affects: 'Chance and size of critical hits.', size: 'One tier is 9.5 points.' },
  det: { title: 'Determination', affects: 'All damage and healing.', size: 'One tier is 8 points.' },
};

/* The page's job: a press on a "?" opens its note (or closes it when it is the open one); the note's own close clears it. */
function toggle(event, stat) {
  const note = event.currentTarget.closest('.story-note-page').querySelector('gsa-stat-note');
  const open = note.anchor === event.currentTarget;
  note.note = open ? null : NOTES[stat];
  note.anchor = open ? null : event.currentTarget;
}

/* The element beside two "?" buttons and a control after them (where Tab goes). */
export const Default = () => html`
  <div class="story-note-page" style="position: relative; padding: 20px" @note-close=${event => {
    event.currentTarget.querySelector('gsa-stat-note').anchor = null;
  }}>
    <button type="button" data-help="crit" @click=${event => toggle(event, 'crit')}>? Critical Hit</button>
    <button type="button" data-help="det" @click=${event => toggle(event, 'det')}>? Determination</button>
    <input type="text" aria-label="After the buttons" />
    <gsa-stat-note></gsa-stat-note>
  </div>
`;
