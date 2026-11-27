/* Story of <gsa-rank-note>: the "?" of "Spare points to tiebreaks" with its note, as the Auto-fill settings popover holds it: in the
   switch's row (`.rankwrap`) inside a layer of the overlay manager (`data-overlay-layer`, which makes the note a window-fixed child),
   centred in a row as wide as the window, with a control before and one after (where Tab goes) and room below so the page
   scrolls. */
import { html } from 'lit';
import '../../../src/ui/elements/set-page/rank-note.ts';
import '../../../src/ui/elements/set-page/settings-popover.ts';

/* The label of the row's switch. */
export const SWITCH_LABEL = 'Spare points to tiebreaks';

export const Default = () => html`
  <div style="display: flex; justify-content: center; padding: 16px 8px 0">
    <div class="setpop" data-overlay-layer="rank-story" style="flex-direction: row; gap: 12px; align-items: center; width: auto">
      <button type="button">Before</button>
      <span class="rankwrap">
        <label class="toggle"><input type="checkbox" role="switch" id="s-by-tier"><span>${SWITCH_LABEL}</span></label>
        <gsa-rank-note></gsa-rank-note>
      </span>
      <button type="button">After</button>
    </div>
  </div>
  <div style="height: 1600px" aria-hidden="true"></div>
`;

/* The note as it is on the page: inside the settings popover, which is itself placed by Zag under its gear (by a transform), the
   gear centred in a row as wide as the window, so a resize moves the gear, then the popover, then the note. */
export const InSettings = () => html`
  <div style="display: flex; justify-content: center; padding: 16px 8px 0">
    <gsa-settings-popover class="gearwrap" trigger-id="sh-settings" content-id="sh-settings-dialog">
      <button type="button" class="linkbtn gearbtn" aria-label="Auto-fill settings" data-zag-part="trigger">&#9881;</button>
      <div data-zag-part="positioner">
        <div class="setpop" data-overlay-layer="settings" data-zag-part="content" aria-label="Auto-fill settings">
          <button type="button" class="dlgclose" data-zag-part="close-trigger">&times;</button>
          <span class="rankwrap">
            <label class="toggle"><input type="checkbox" role="switch"><span>${SWITCH_LABEL}</span></label>
            <gsa-rank-note></gsa-rank-note>
          </span>
        </div>
      </div>
    </gsa-settings-popover>
  </div>
  <div style="height: 1600px" aria-hidden="true"></div>
`;
