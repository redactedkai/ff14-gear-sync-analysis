/* Stories of <gsa-switch-menu>: the caret menu after a sheet's name, as the Sheets screens show it, in a breadcrumb with a link
   before it and a button after it (where Tab goes). Every pick is appended to the `events` output as `kind:id`. */
import { html } from 'lit';
import type { SwitchItem, SwitchPick } from '../../../src/ui/elements/sheets/switch-menu.ts';
import '../../../src/ui/elements/sheets/switch-menu.ts';
import { recordEvents } from '../gallery/record.ts';

/* The rows of a sheet with three gear sets, the second the open one. */
export const ITEMS: SwitchItem[] = [
  { id: 's1', name: 'Raid', href: '#/sheets/a/s1', current: false },
  { id: 's2', name: 'Dungeons', href: '#/sheets/a/s2', current: true },
  { id: 's3', name: 'Crafting', href: '#/sheets/a/s3', current: false },
];
/* The words the specs look for. */
export const BUTTON_NAME = 'Switch gear set';
export const MENU_NAME = 'Gear sets';

/* The menu with `items` (a test passes its own); a pick is recorded as `kind:id`. */
export const Default = ({ items = ITEMS }: { items?: SwitchItem[] } = {}) => html`
  <nav class="setcrumb" aria-label="Breadcrumb">
    <a href="#/sheets">Sheets</a>
    <span class="setsw">
      <gsa-switch-menu
        button-id="sh-set-switch"
        menu-id="sh-set-menu"
        button-label=${BUTTON_NAME}
        menu-label=${MENU_NAME}
        .items=${items}
        .allLabel=${'All gear sets (3)'}
        .allHref=${'#/sheets/a'}
        .newLabel=${'+ New set'}
        @switch-pick=${(event: CustomEvent<SwitchPick>) => recordEvents('events')({ detail: `${event.detail.kind}:${event.detail.id}` })}
      ></gsa-switch-menu>
    </span>
    <button type="button">After</button>
  </nav>
  <output data-testid="events" hidden></output>
`;
