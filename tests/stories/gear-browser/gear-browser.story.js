/* Stories of <gsa-gear-browser>: the Gear browser screen with a real job and the real item database. The page's part (the Alpine
   wrapper with the store) is played by a listener that applies each `browse-edit` patch to the element's `browse`. Every patch is
   also appended to the `edits` output. */
import { html } from 'lit';
import '../../../src/ui/elements/gear-browser/gear-browser.ts';
import { makeJobContext } from '../../../src/core/job-context.js';
import { defaultBrowse } from '../../../src/ui/state.js';
import { recordEvents } from '../gallery/record.js';

/* The page's job: a `browse-edit` patch becomes the element's next `browse` (frozen, as the store hands it out). */
function applyEdit(event) {
  const screen = event.currentTarget.querySelector('gsa-gear-browser');
  screen.browse = Object.freeze({ ...screen.browse, ...event.detail });
  recordEvents('edits')(event);
}

/* The screen for a Sage at level 100 with sync off and the default filters: the open tab, so it builds its list. */
export const Default = () => {
  const jobCtx = makeJobContext('SGE');
  const panel = { job: 'SGE', jobCtx, cap: null, sync: false, level: jobCtx.maxLevel };
  return html`
    <div style="width: 1100px" @browse-edit=${applyEdit}>
      <gsa-gear-browser class="panel" .panel=${panel} .browse=${Object.freeze(defaultBrowse(jobCtx))} .active=${true}></gsa-gear-browser>
    </div>
    <output data-testid="edits" hidden></output>
  `;
};
