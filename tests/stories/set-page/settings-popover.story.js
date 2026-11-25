/* Story of <gsa-settings-popover>: the Auto-fill settings popover as the set page has it, in a bar with a button before and after
   (where Tab goes), a select and a number box for the first and last boxes, and the two kinds of menu that open inside it (the
   Expansion menu and the Spare points note). Every open and close the element reports is appended to the `events` output. */
import { html } from 'lit';
import '../../../src/ui/elements/gear-browser/expansion-menu.ts';
import '../../../src/ui/elements/set-page/rank-note.ts';
import '../../../src/ui/elements/set-page/settings-popover.ts';
import '../../../src/ui/elements/shared/select.ts';
import { recordEvents } from '../gallery/record.js';

/* The ids the page's own markup gives (the page's tests name them). */
export const GEAR_ID = 'sh-settings';
export const POPOVER_ID = 'sh-settings-dialog';

/* The options of the story's select (a select is the first box the popover's focus goes to). */
const TARGETS = [
  { value: 'mind', label: 'Mind' },
  { value: 'crit', label: 'Critical Hit' },
];

export const Default = () => html`
  <div class="tbar" style="position: relative; display: flex; gap: 12px; align-items: center; width: 100%">
    <button type="button">Before</button>
    <gsa-settings-popover class="gearwrap" trigger-id=${GEAR_ID} content-id=${POPOVER_ID} @settings-open=${recordEvents('events')}>
      <button type="button" class="linkbtn gearbtn" aria-label="Auto-fill settings" data-zag-part="trigger">&#9881;</button>
      <div data-zag-part="positioner">
        <div class="setpop" data-overlay-layer="settings" data-zag-part="content" aria-label="Auto-fill settings">
          <button type="button" class="dlgclose" data-zag-part="close-trigger">&times;</button>
          <div class="f field"><label for="s-target">Maximize</label><gsa-select button-id="s-target" label="Maximize" .options=${TARGETS} .value=${'mind'}></gsa-select></div>
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
