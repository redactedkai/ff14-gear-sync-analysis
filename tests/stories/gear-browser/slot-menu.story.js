/* Stories of <gsa-slot-menu>: the Gear browser's Slot menu as the page shows it, in the round search bar, with a button before
   the bar and the search box after it (where Tab goes). Every pick is appended to the `events` output. */
import { html } from 'lit';
import '../../../src/ui/elements/gear-browser/slot-menu.ts';
import { recordEvents } from '../gallery/record.js';

/* The rows a job with a weapon, an off-hand and two armor slots has under the filters of the story: "Off-hand" has no match. */
export const CHOICES = [
  { key: 'any', label: 'Any slot', count: 410, countText: '410' },
  { key: 'weapon', label: 'Weapon', count: 52, countText: '52' },
  { key: 'offhand', label: 'Off-hand', count: 0, countText: '0' },
  { key: 'head', label: 'Head', count: 31, countText: '31' },
  { key: 'ring', label: 'Ring', count: 1203, countText: '1,203' },
];

/* The menu with `value` chosen, as the Gear browser has it: the button names the chosen row (the page's view works that out).
   `choices` replaces the rows (a test passes its own). */
export const Default = ({ value = 'any', choices = CHOICES } = {}) => html`
  <button type="button">Before</button>
  <div class="searchbar" style="max-width: 520px">
    <gsa-slot-menu .choices=${choices} .value=${value} .label=${(choices.find(choice => choice.key === value) ?? choices[0]).label} @slot-change=${recordEvents('events')}></gsa-slot-menu>
    <input type="text" aria-label="Search gear by name" placeholder="Search gear by name" />
  </div>
  <output data-testid="events" hidden></output>
`;
