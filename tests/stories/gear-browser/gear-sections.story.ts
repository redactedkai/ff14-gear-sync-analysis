/* Story of <gsa-gear-sections>: the tabs of the Gear categories menu on their own, with every box ticked. The page's part is played
   here: the element's `categories-change` is appended to the `events` output as the list of boxes left out. */
import { html } from 'lit';
import '../../../src/ui/elements/gear-browser/gear-sections.ts';
import { recordEvents } from '../gallery/record.ts';

export const Default = () => html`
  <gsa-gear-sections id-prefix="b" .exclude=${[]} .counts=${null} @categories-change=${recordEvents('events')}></gsa-gear-sections>
  <output data-testid="events" hidden></output>
`;
