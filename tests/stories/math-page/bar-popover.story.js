/* Stories of <gsa-bar-popover>: the math bar's popovers as the page marks them up. The chip popover (a button, a popover with two
   fields, `align-bar`) sits at the right end of a narrow bar, so its popover is wider than the room to its right; the help is the
   modal one, with its backdrop. */
import { html } from 'lit';
import '../../../src/ui/elements/math-page/bar-popover.ts';

/* The chip at the bar's right end, a modal help, and a field after both (where Tab goes). */
export const Default = () => html`
  <div class="mathbar" style="position: relative; width: 420px; padding: 8px; display: flex; justify-content: flex-end; gap: 12px">
    <gsa-bar-popover class="mctl syncwrap" trigger-id="story-chip" content-id="story-chip-pop" focus-in="#story-level" align-bar>
      <button type="button" class="multi-btn syncchip" data-zag-part="trigger" aria-label="Level 85, sync settings">Level 85</button>
      <div data-zag-part="positioner">
        <div class="popover syncpop" data-zag-part="content" aria-label="Sync settings" hidden>
          <label>Level <input type="number" id="story-level" style="width: 70px" /></label>
          <label>Synced IL <input type="number" id="story-cap" style="width: 70px" /></label>
        </div>
      </div>
    </gsa-bar-popover>
    <gsa-bar-popover class="helpwrap" trigger-id="story-help" content-id="story-help-pop" placement="bottom-end" gap="8" modal>
      <button type="button" class="help" data-zag-part="trigger" aria-label="Help">?</button>
      <div class="backdrop" data-zag-part="backdrop" hidden></div>
      <div data-zag-part="positioner">
        <div class="popover" data-zag-part="content" aria-label="Gear stats and syncing" hidden>
          <h3>How gear stats work</h3>
          <p>Text with a <a href="#story-source">link</a> and <button type="button">a button</button>.</p>
        </div>
      </div>
    </gsa-bar-popover>
  </div>
  <input type="text" aria-label="After the bar" />
`;
