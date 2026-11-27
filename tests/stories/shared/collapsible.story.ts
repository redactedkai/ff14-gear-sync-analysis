/* Story of <gsa-collapsible>: a help button with its panel, a control before it and one after it (where Tab goes). The page's part is
   played here: the element asks for a change (`open-change`) and the story sets `open`, as the page does, and appends the answer to the
   `events` output. */
import { html } from 'lit';
import { GsaCollapsible } from '../../../src/ui/elements/shared/collapsible.ts';
import { listenerElement } from '../gallery/dom.ts';
import { recordEvents } from '../gallery/record.ts';

/* The ids of the two parts (the element's `trigger-id` and `content-id`), which the spec uses, and the trigger's name. */
export const TRIGGER_ID = 'story-help';
export const CONTENT_ID = 'story-help-panel';
export const TRIGGER_NAME = 'Help';

export const Default = () => {
  const record = recordEvents('events');
  const onOpenChange = (event: CustomEvent<boolean>) => {
    listenerElement(event, GsaCollapsible).open = event.detail;
    record(event);
  };
  return html`
    <button type="button">Before</button>
    <gsa-collapsible trigger-id=${TRIGGER_ID} content-id=${CONTENT_ID} @open-change=${onOpenChange}>
      <button type="button" data-zag-part="trigger">${TRIGGER_NAME}</button>
      <div data-zag-part="content"><p>The panel's text.</p></div>
    </gsa-collapsible>
    <button type="button">After</button>
    <output data-testid="events" hidden></output>
  `;
};
