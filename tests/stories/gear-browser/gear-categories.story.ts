/* Stories of <gsa-gear-categories> and <gsa-expansion-menu>: the filter menus as the Gear browser's filter row has them, a control
   before and after (where Tab goes). Every change the element sends is appended to the `events` output. */
import { html } from 'lit';
import '../../../src/ui/elements/gear-browser/expansion-menu.ts';
import '../../../src/ui/elements/gear-browser/gear-categories.ts';
import { ACTIVITIES } from '../../../src/core/constants.ts';
import { recordEvents } from '../gallery/record.ts';

/* The boxes left out by default (the page's defaults: `on: false` in item-format.json), written out so the story does not read them
   from the code under test. */
export const DEFAULT_LEFT_OUT = ACTIVITIES.filter(activity => !activity.on).map(activity => activity.key);

/* The Gear categories menu as the browser's filter row has it, in a row as wide as the window: it is the last control, so the open menu is
   wider than the room on its right. `counts` is {box key: pieces} or null (not known yet). */
export const Default = ({
  exclude = DEFAULT_LEFT_OUT,
  market = true,
  counts = /** @type {Record<string, number> | null} */ (null),
} = {}) => html`
  <div style="display: flex; gap: 24px; align-items: flex-start; justify-content: flex-end">
    <button type="button">Before</button>
    <gsa-gear-categories
      class="f multi"
      style="width: 200px"
      id-prefix="b"
      .exclude=${exclude}
      .market=${market}
      .counts=${counts}
      @categories-change=${recordEvents('events')}></gsa-gear-categories>
    <button type="button">After</button>
  </div>
  <output data-testid="events" hidden></output>
`;
