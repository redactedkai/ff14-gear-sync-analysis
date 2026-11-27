/* Story of <gsa-expansion-menu>: the Expansion filter's menu as the Gear browser's filter row has it, a control before and one after
   (where Tab goes). The page's part is played by a listener that keeps the list the menu sends as its `off` property, so a box
   ticked stays ticked and the button's text follows; every list the menu sends is appended to the `events` output. */
import { html } from 'lit';
import '../../../src/ui/elements/gear-browser/expansion-menu.ts';
import { recordEvents } from '../gallery/record.ts';

const record = recordEvents('events');

/* The menu with the expansions in `off` switched off, between two buttons. */
export const Default = ({ off = /** @type {string[]} */ ([]) } = {}) => html`
  <div style="display: flex; gap: 24px; align-items: flex-start">
    <button type="button">Before</button>
    <gsa-expansion-menu
      class="f multi"
      style="width: 200px"
      id-prefix="b"
      .off=${off}
      @expansion-change=${event => {
        event.currentTarget.off = event.detail;
        record(event);
      }}></gsa-expansion-menu>
    <button type="button">After</button>
  </div>
  <output data-testid="events" hidden></output>
`;
