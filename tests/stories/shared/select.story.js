/* Story of <gsa-select>: a select with a heading group (as the Race / Clan box has), a button before it and one after it (where Tab
   goes). Every pick is appended to the `events` output. */
import { html } from 'lit';
import '../../../src/ui/elements/shared/select.ts';
import { recordEvents } from '../gallery/record.js';

/* The accessible name and the button's id, which the specs use. */
export const SELECT_LABEL = 'Race and clan';
export const BUTTON_ID = 'story-select';
export const NONE_LABEL = 'Select Race/Clan';

/* The options: none first, then two races with their clans. */
export const OPTIONS = [
  { value: '', label: NONE_LABEL },
  { value: 'Midlander', label: 'Midlander', group: 'Hyur' },
  { value: 'Highlander', label: 'Highlander', group: 'Hyur' },
  { value: 'Wildwood', label: 'Wildwood', group: 'Elezen' },
  { value: 'Duskwight', label: 'Duskwight', group: 'Elezen' },
];

/* The select with `value` chosen (the page gives the value back after each pick; the story does not, so a pick shows in `events`). */
export const Default = ({ value = 'Highlander' } = {}) => html`
  <button type="button">Before</button>
  <label for=${BUTTON_ID}>Clan</label>
  <gsa-select button-id=${BUTTON_ID} label=${SELECT_LABEL} .options=${OPTIONS} .value=${value} @change=${recordEvents('events')}></gsa-select>
  <button type="button">After</button>
  <output data-testid="events" hidden></output>
`;
