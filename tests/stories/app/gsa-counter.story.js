/* Stories of <gsa-counter>. A story is a function from props (plain data from the test) to a Lit template; the gallery
   renders it. Events are recorded in a hidden output so a test can read them. */
import { html } from 'lit';
import '../../../src/ui/elements/app/gsa-counter.ts';
import { recordEvents } from '../gallery/record.js';

/* The counter at `count`; every count-change is appended to the `events` output as JSON. */
export const Default = ({ count = 1 } = {}) => html`
  <gsa-counter .count=${count} @count-change=${recordEvents('events')}></gsa-counter>
  <output data-testid="events" hidden></output>
`;
