/* Stories of <gsa-slot-menu>: the Gear browser's Slot menu as the page shows it, in the round search bar, with a button before
   the bar and the search box after it (where Tab goes). Every pick is appended to the `events` output. */
import { html } from 'lit';
import '../../../src/ui/elements/gear-browser/slot-menu.ts';
import '../shared/layer-elements.ts';
import { APP_MENU_LABEL } from '../shared/layer-elements.story.ts';
import { ANY_SLOT_KEY, ANY_SLOT_LABEL } from '../../../src/ui/elements/gear-browser/slot-menu-names.ts';
import { overlays } from '../../../src/ui/overlays.ts';
import { recordEvents } from '../gallery/record.ts';

/* The accessible names the stories and their specs share, written once: the search box beside the button and the page menu. */
export const SEARCH_LABEL = 'Search gear by name';
export { APP_MENU_LABEL };
/* The words of the weapon row, which the keyboard specs look for by name. */
export const WEAPON_LABEL = 'Weapon';

/* The ids of the layers the page's overlay manager holds open, for a test that checks the element lets go of its layer. */
globalThis.gsaOpenLayerIds = () => [...overlays.openIds];

/* The rows a job with a weapon, an off-hand and two armor slots has under the filters of the story: "Off-hand" has no match. */
export const CHOICES = [
  { key: ANY_SLOT_KEY, label: ANY_SLOT_LABEL, count: 410, countText: '410' },
  { key: 'weapon', label: WEAPON_LABEL, count: 52, countText: '52' },
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
    <input type="text" aria-label=${SEARCH_LABEL} placeholder=${SEARCH_LABEL} />
  </div>
  <output data-testid="events" hidden></output>
`;

/* The menu beside a page menu (the overlay manager's own kind of layer, `app-menu-stub`), for the stories where one layer opens
   while the other is open. */
export const BesideAppMenu = () => html`
  <div style="display: flex; gap: 400px; align-items: flex-start">
    <div class="searchbar">
      <gsa-slot-menu .choices=${CHOICES} value=${ANY_SLOT_KEY} label=${ANY_SLOT_LABEL}></gsa-slot-menu>
    </div>
    <app-menu-stub layer-id="app-menu" label=${APP_MENU_LABEL}></app-menu-stub>
  </div>
`;

/* The rows of the real Slot menu for a job with every slot (twelve rows, as the page lists them), each with a match. */
export const FULL_CHOICES = [
  [ANY_SLOT_KEY, ANY_SLOT_LABEL],
  ['weapon', 'Weapon'],
  ['offhand', 'Off-hand'],
  ['head', 'Head'],
  ['body', 'Body'],
  ['hands', 'Hands'],
  ['legs', 'Legs'],
  ['feet', 'Feet'],
  ['ears', 'Earrings'],
  ['neck', 'Necklace'],
  ['wrists', 'Bracelets'],
  ['ring', 'Ring'],
].map(([key, label]) => ({ key, label, count: 120, countText: '120' }));

/* The menu as it stands in the page: about 300 px below the top, with a long page under it, so the open list has little room
   below it in a short window and the page could scroll if it wanted to. */
export const LowOnPage = ({ choices = FULL_CHOICES } = {}) => html`
  <div style="height: 280px"></div>
  <div class="searchbar" style="max-width: 520px">
    <gsa-slot-menu .choices=${choices} value=${ANY_SLOT_KEY} label=${ANY_SLOT_LABEL} @slot-change=${recordEvents('events')}></gsa-slot-menu>
    <input type="text" aria-label=${SEARCH_LABEL} placeholder=${SEARCH_LABEL} />
  </div>
  <div style="height: 1400px"></div>
  <output data-testid="events" hidden></output>
`;
