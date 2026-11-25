/* Story of <gsa-settings-popover>: the Auto-fill settings popover as the set page has it, in a bar with a button before and after
   (where Tab goes), a select and a number box for the first and last boxes, and the two kinds of menu that open inside it (the
   Expansion menu and the Spare points note). Every open and close the element reports is appended to the `events` output. */
import { html } from 'lit';
import '../../../src/ui/elements/gear-browser/expansion-menu.ts';
import '../../../src/ui/elements/set-page/rank-note.ts';
import '../../../src/ui/elements/set-page/settings-popover.ts';
import { recordEvents } from '../gallery/record.js';

/* The ids the page's own markup gives (the page's tests name them). */
export const GEAR_ID = 'sh-settings';
export const POPOVER_ID = 'sh-settings-dialog';

export const Default = () => html`
  <div class="tbar" style="position: relative; display: flex; gap: 12px; align-items: center; width: 100%">
    <button type="button">Before</button>
    <gsa-settings-popover class="gearwrap" trigger-id=${GEAR_ID} content-id=${POPOVER_ID} @settings-open=${recordEvents('events')}>
      <button type="button" class="linkbtn gearbtn" aria-label="Auto-fill settings" data-zag-part="trigger">&#9881;</button>
      <div data-zag-part="positioner">
        <div class="setpop" data-overlay-layer="settings" data-zag-part="content" aria-label="Auto-fill settings">
          <button type="button" class="dlgclose" data-zag-part="close-trigger">&times;</button>
          <label class="f">Maximize<select id="s-target"><option>Mind</option><option>Critical Hit</option></select></label>
          <span class="rankwrap"><label class="toggle"><input type="checkbox" role="switch" id="s-by-tier"><span>Spare points to tiebreaks</span></label>
            <gsa-rank-note></gsa-rank-note></span>
          <gsa-expansion-menu class="f multi" id-prefix="s"></gsa-expansion-menu>
          <label class="f">Item level<input type="number" id="s-min"></label>
        </div>
      </div>
    </gsa-settings-popover>
    <button type="button">After</button>
  </div>
  <output data-testid="events" hidden></output>
`;
