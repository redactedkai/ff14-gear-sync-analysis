/* Stories of <gsa-slot-menu>: the Gear browser's Slot menu as the page shows it, in the round search bar, with a button before
   the bar and the search box after it (where Tab goes). Every pick is appended to the `events` output. */
import { html } from 'lit';
import '../../../src/ui/elements/gear-browser/slot-menu.ts';
import '../shared/layer-elements.ts';
import { ANY_SLOT_KEY, ANY_SLOT_LABEL } from '../../../src/ui/elements/gear-browser/slot-menu-names.ts';
import { overlays } from '../../../src/ui/overlays.js';
import { recordEvents } from '../gallery/record.js';

/* The ids of the layers the page's overlay manager holds open, for a test that checks the element lets go of its layer. */
globalThis.gsaOpenLayerIds = () => [...overlays.openIds];

/* The rows a job with a weapon, an off-hand and two armor slots has under the filters of the story: "Off-hand" has no match. */
export const CHOICES = [
  { key: ANY_SLOT_KEY, label: ANY_SLOT_LABEL, count: 410, countText: '410' },
  { key: 'weapon', label: 'Weapon', count: 52, countText: '52' },
  { key: 'offhand', label: 'Off-hand', count: 0, countText: '0' },
  { key: 'head', label: 'Head', count: 31, countText: '31' },
  { key: 'ring', label: 'Ring', count: 1203, countText: '1,203' },
];

/* The menu with `value` chosen, as the Gear browser has it: the button names the chosen row (the page's view works that out).
   `choices` replaces the rows (a test passes its own). */
export const Default = ({ value = ANY_SLOT_KEY, choices = CHOICES } = {}) => html`
  <button type="button">Before</button>
  <div class="searchbar" style="max-width: 520px">
    <gsa-slot-menu .choices=${choices} .value=${value} .label=${(choices.find(choice => choice.key === value) ?? choices[0]).label} @slot-change=${recordEvents('events')}></gsa-slot-menu>
    <input type="text" aria-label="Search gear by name" placeholder="Search gear by name" />
  </div>
  <output data-testid="events" hidden></output>
`;

/* The menu beside a page menu (the overlay manager's own kind of layer, `app-menu-stub`), for the stories where one layer opens
   while the other is open. */
export const BesideAppMenu = () => html`
  <div style="display: flex; gap: 400px; align-items: flex-start">
    <div class="searchbar">
      <gsa-slot-menu .choices=${CHOICES} value="any" label="Any slot"></gsa-slot-menu>
    </div>
    <app-menu-stub layer-id="app-menu" label="App menu"></app-menu-stub>
  </div>
`;
