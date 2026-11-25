/* Story of <gsa-dialog>: a form box in the element's markup contract (backdrop, positioner, content, close button, a title the
   box is named by), with a button behind it. Each event the element sends is appended to the `events` output by its name. */
import { html } from 'lit';
import '../../../src/ui/elements/shared/dialog.ts';
import { recordEvents } from '../gallery/record.js';

/* The words the spec looks for: the box's title and the button behind it. */
export const TITLE = 'Story dialog';
export const BEHIND_LABEL = 'Behind the dialog';

/* The dialog, open: its first control is the name box, the one asked to take the focus. */
export const Default = () => {
  const recordDetail = recordEvents('events');
  const record = event => recordDetail({ detail: event.type });
  return html`
    <button type="button">${BEHIND_LABEL}</button>
    <gsa-dialog content-id="story-dialog" title-id="story-title" initial-focus="#story-name" @dialog-close=${record} @dialog-escape=${record}>
      <div class="dlg-backdrop" data-zag-part="backdrop"></div>
      <div class="dlg-positioner" data-zag-part="positioner">
        <div class="dlg" data-zag-part="content">
          <h3 id="story-title">${TITLE}</h3>
          <input type="text" id="story-name" aria-label="Name" />
          <button type="button" class="primary">Save</button>
          <button type="button" class="dlgclose" data-zag-part="close-trigger" aria-label="Close">x</button>
        </div>
      </div>
    </gsa-dialog>
    <output data-testid="events" hidden></output>
  `;
};

/* The same box as a question (`alert`): the leave question of the set page and the Sheets Delete question. */
export const Alert = () => html`
  <gsa-dialog alert content-id="story-alert" title-id="story-alert-title" initial-focus="#story-keep">
    <div class="dlg-backdrop" data-zag-part="backdrop"></div>
    <div class="dlg-positioner" data-zag-part="positioner">
      <div class="dlg" data-zag-part="content">
        <p class="question" id="story-alert-title">Leave the page?</p>
        <button type="button" id="story-keep">Keep</button>
      </div>
    </div>
  </gsa-dialog>
`;
