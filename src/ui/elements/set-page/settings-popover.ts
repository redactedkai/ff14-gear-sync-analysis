/* The Auto-fill settings popover of a set page (the gear button and the box under the bar) as a Lit element in light DOM, with a Zag
   popover for the open and close, Escape, a press outside, the focus and the place. It wraps the page's own Alpine-run markup, so
   the element renders nothing of its own (as `gsa-dialog` does); it marks the parts the machine styles:
     <gsa-settings-popover trigger-id="sh-settings" content-id="sh-settings-dialog" @settings-open="...">
       <button data-zag-part="trigger">...</button>
       <div data-zag-part="positioner"><div data-overlay-layer="settings" data-zag-part="content" aria-label="...">
         <button data-zag-part="close-trigger">...</button> ... </div></div>
     </gsa-settings-popover>
   - The popover is not modal: no backdrop, no `aria-modal`, no focus trap, and it stays open when the focus leaves it (Tab goes on
     into the page); a press outside it, the gear button again, the X and Escape close it. The focus goes into the first select when
     it opens, and back to the gear button after the gear button, the X or Escape (not after a press outside, which leaves the focus
     where the press put it).
   - It is the parent layer of the menus inside it (the Expansion and Gear categories menus, the Spare points note): the content
     carries `data-overlay-layer` with this layer's id (SETTINGS_LAYER), which filter-popover.ts reads, so a press or the focus inside a
     child menu does not close it, and Escape closes the child first.
   - It is placed under the set bar (the closest `.tbar`), left edge on the bar's, as wide as the bar up to the page's own limit.
   - The closed popover stays in the page, hidden; the machine tells the page by the `settings-open` event (`detail`: whether it is
     open now). The open layer is registered with the page's overlay manager (the bridge), so opening another menu closes it. */
import * as popover from '@zag-js/popover';
import { LitElement } from 'lit';
import { createOverlayBridge } from '../shared/overlay-bridge.ts';
import { ZagController } from '../shared/zag-controller.ts';

/* The event the element sends: `detail` is whether the popover is open. */
export const SETTINGS_OPEN_EVENT = 'settings-open';
/* The id of the popover's layer in the overlay manager; the markup's `data-overlay-layer` holds the same string. */
export const SETTINGS_LAYER = 'settings';
/* What the X says (the machine's own word is "close"). */
const CLOSE_LABEL = 'Close settings';
/* The gap between the bar and the popover, in px. */
const POPOVER_GAP_PX = 6;
/* The box the focus goes to when the popover opens. */
const FIRST_BOX_SELECTOR = 'gsa-select button';
/* The part of the page the popover hangs under. */
const BAR_SELECTOR = '.tbar';

/* The Zag popover of `host`: its props and the attributes of each part. */
function makeZag(host: GsaSettingsPopover) {
  return new ZagController(host, {
    name: 'popover',
    machine: popover.machine,
    connect: (service, normalize) => popover.connect(service, normalize),
    getProps: () => ({
      ids: { trigger: host.triggerId || undefined, content: host.contentId || undefined },
      modal: false,
      portalled: false,
      autoFocus: true,
      initialFocusEl: () => host.querySelector<HTMLElement>(`[data-zag-part="content"] ${FIRST_BOX_SELECTOR}`),
      translations: { closeTriggerLabel: CLOSE_LABEL },
      positioning: {
        placement: 'bottom-start' as const,
        gutter: POPOVER_GAP_PX,
        // always under the bar, as the popover was
        flip: false,
        strategy: 'absolute' as const,
        getAnchorElement: () => host.closest<HTMLElement>(BAR_SELECTOR) ?? host,
      },
      onOpenChange: ({ open }) => host.dispatchEvent(new CustomEvent(SETTINGS_OPEN_EVENT, { detail: open, bubbles: true, composed: true })),
      // the popover stays open when the focus goes elsewhere (Tab out of it): only a press outside, Escape, the X or the gear close it
      onFocusOutside: event => event.preventDefault(),
      onEscapeKeyDown: event => host.bridge.guardEscape(event),
    }),
    parts: api => ({
      trigger: api.getTriggerProps(),
      positioner: api.getPositionerProps(),
      content: api.getContentProps(),
      'close-trigger': api.getCloseTriggerProps(),
    }),
  });
}

/* The `gsa-settings-popover` element (registered below); see the file header. Attributes: `trigger-id` and `content-id` (the ids of
   the gear button and of the box, which the page's tests and labels name). */
export class GsaSettingsPopover extends LitElement {
  static properties = {
    triggerId: { type: String, attribute: 'trigger-id' },
    contentId: { type: String, attribute: 'content-id' },
  };

  declare triggerId: string;
  declare contentId: string;
  readonly zag: ReturnType<typeof makeZag>;
  readonly bridge: ReturnType<typeof createOverlayBridge>;

  constructor() {
    super();
    this.triggerId = '';
    this.contentId = '';
    this.zag = makeZag(this);
    this.bridge = createOverlayBridge({
      id: SETTINGS_LAYER,
      api: () => this.zag.api,
      closeWithoutFocus: () => this.zag.closeWithoutFocus(),
      root: () => this.querySelector('[data-zag-part="content"]'),
      opener: () => this.querySelector('[data-zag-part="trigger"]'),
    });
  }

  /* Light DOM: the page's markup is the element's own children. */
  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.bridge.release();
  }

  /* After each draw (Zag's attributes are on the parts by now): the layer is registered with the page's manager, or dropped; a closed
     popover forgets where it was placed, so the next opening is not taken for a placed one a frame early. */
  protected override updated(): void {
    this.bridge.sync();
    if (this.zag.machine && !this.zag.api.open) {
      this.zag.clearPlacement();
    }
  }
}

customElements.define('gsa-settings-popover', GsaSettingsPopover);
