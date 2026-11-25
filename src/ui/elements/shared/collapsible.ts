/* A panel that a button shows and hides, as a Lit element in light DOM, with a Zag collapsible for `aria-expanded`,
   `aria-controls` and the hidden state. The page's template puts its own markup inside, so the element renders
   nothing of its own; it marks the parts the machine styles:
     <gsa-collapsible trigger-id="help" content-id="help-panel" ?open=${helpOpen} @open-change=${onOpenChange}>
       <button data-zag-part="trigger">?</button>
       <div data-zag-part="content">...</div>
     </gsa-collapsible>
   The page owns the state (so that it can close the panel on an Escape that belongs to it): the `open` attribute (a boolean one)
   says whether the panel is shown, and the `open-change` event (`detail` true or false) asks the page to change it when the
   button is pressed. Attributes `trigger-id` and `content-id` name the two parts for the page's tests and its `aria-controls`. */
import * as collapsible from '@zag-js/collapsible';
import { LitElement } from 'lit';
import { ZagController } from './zag-controller.ts';

/* The event the element sends: `detail` is whether the panel should be open. */
export const OPEN_CHANGE_EVENT = 'open-change';

/* The Zag collapsible of `host`: its props and the attributes of the two parts. */
function makeZag(host: GsaCollapsible) {
  return new ZagController(host, {
    name: 'collapsible',
    machine: collapsible.machine,
    connect: (service, normalize) => collapsible.connect(service, normalize),
    getProps: () => ({
      ids: { trigger: host.triggerId || undefined, content: host.contentId || undefined },
      open: host.open,
      onOpenChange: ({ open }) => host.dispatchEvent(new CustomEvent(OPEN_CHANGE_EVENT, { detail: open, bubbles: true })),
    }),
    parts: api => ({ trigger: api.getTriggerProps(), content: api.getContentProps() }),
  });
}

/* The `gsa-collapsible` element (registered below); see the file header. */
export class GsaCollapsible extends LitElement {
  static properties = {
    open: { type: Boolean },
    triggerId: { type: String, attribute: 'trigger-id' },
    contentId: { type: String, attribute: 'content-id' },
  };

  declare open: boolean;
  declare triggerId: string;
  declare contentId: string;
  readonly zag: ReturnType<typeof makeZag>;

  constructor() {
    super();
    this.open = false;
    this.triggerId = '';
    this.contentId = '';
    this.zag = makeZag(this);
  }

  /* Light DOM: the page's markup is the element's own children. */
  protected override createRenderRoot(): HTMLElement {
    return this;
  }
}

customElements.define('gsa-collapsible', GsaCollapsible);
