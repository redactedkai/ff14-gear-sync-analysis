/* The math bar's popovers (the "?" help, the Substats & materia chip's and the Sync chip's) as one Lit element in light DOM,
   with a Zag popover for the open state, the Escape key, the press outside, the focus and the placement. The element draws
   nothing: the page's template holds its content, which Alpine still runs (the Level and Synced IL boxes read the store), so
   it wraps markup instead of being an island (docs/engineering/architecture.md section 3). The template marks the parts:
   - `data-zag-part="trigger"`: the button (the "?" or the chip); Zag gives it `aria-expanded`, `aria-controls` and the click;
   - `data-zag-part="positioner"` around `data-zag-part="content"`: the popover, hidden while closed;
   - `data-zag-part="backdrop"` (optional): the dimmed page behind a modal popover, shown while it is open.
   Attributes: `trigger-id` and `content-id` (the ids the page's labels and tests use), `focus-in` (a selector: what takes the
   focus when it opens; none: the popover itself), `placement` (`bottom-start` or `bottom-end`), `gap` (px under the button),
   `modal` (the focus stays inside and the page behind is out of reach: the "?" help) and `align-bar` (a popover that would run
   past the right end of the math bar hangs from the button's right edge instead).
   The element sends `popover-close` when the popover closes by itself (the page then drops text the popover held).
   The open layer is registered with the page's overlay manager (the bridge): opening a menu closes it, a change of screen
   closes it, and one Escape closes one layer. ArrowDown on the button opens it. */
import * as popover from '@zag-js/popover';
import { LitElement, nothing } from 'lit';
import { createOverlayBridge } from '../shared/overlay-bridge.ts';
import { ZagController } from '../shared/zag-controller.ts';
import { POPOVER_CLOSE_EVENT } from './bar-popover-names.ts';

/* The default gap between the button and the popover, in px. */
const DEFAULT_GAP_PX = 4;
/* The two placements the element uses: the popover's left edge on the button's, or its right edge. */
const PLACEMENT_FROM_LEFT = 'bottom-start';
const PLACEMENT_FROM_RIGHT = 'bottom-end';
type Placement = typeof PLACEMENT_FROM_LEFT | typeof PLACEMENT_FROM_RIGHT;
/* The selectors the element looks for in its template. */
const TRIGGER_SELECTOR = '[data-zag-part="trigger"]';
const CONTENT_SELECTOR = '[data-zag-part="content"]';

/* The Zag popover of `host`: its props, the attributes of each part and the tie to the page's overlay manager. */
function makeZag(host: GsaBarPopover) {
  return new ZagController(host, {
    name: 'popover',
    machine: popover.machine,
    connect: (service, normalize) => popover.connect(service, normalize),
    getProps: () => ({
      ids: { trigger: host.triggerId || undefined, content: host.contentId || undefined },
      modal: host.modal,
      portalled: false,
      // the focus goes to the named control, or to the popover itself (the help's text is no control)
      initialFocusEl: () => (host.focusIn ? host.querySelector<HTMLElement>(host.focusIn) : host.content()),
      finalFocusEl: () => host.trigger(),
      positioning: { placement: host.currentPlacement, gutter: host.gap, flip: false },
      onOpenChange: ({ open }) => {
        if (!open) {
          host.dispatchEvent(new CustomEvent(POPOVER_CLOSE_EVENT, { bubbles: true, composed: true }));
        }
      },
      onEscapeKeyDown: event => {
        // TODO: the first Escape of an open list of a native select (Firefox sends it to the page) only closes the list. It goes
        // when the popovers' selects are Zag selects (R33).
        if (event.target instanceof Element && event.target.closest('option')) {
          event.preventDefault();
          return;
        }
        host.bridge.guardEscape(event);
      },
    }),
    parts: api => ({
      trigger: api.getTriggerProps(),
      positioner: api.getPositionerProps(),
      content: api.getContentProps(),
      backdrop: { hidden: !api.open },
    }),
  });
}

/* The `gsa-bar-popover` element (registered below): see the file header. */
export class GsaBarPopover extends LitElement {
  static properties = {
    triggerId: { attribute: 'trigger-id' },
    contentId: { attribute: 'content-id' },
    focusIn: { attribute: 'focus-in' },
    placement: { attribute: 'placement' },
    gap: { type: Number },
    modal: { type: Boolean },
    alignBar: { type: Boolean, attribute: 'align-bar' },
  };

  declare triggerId: string;
  declare contentId: string;
  declare focusIn: string;
  declare placement: Placement;
  declare gap: number;
  declare modal: boolean;
  declare alignBar: boolean;
  readonly zag: ReturnType<typeof makeZag>;
  readonly bridge: ReturnType<typeof createOverlayBridge>;
  // the side the popover hangs from now: `placement`, or the right edge when `align-bar` found no room to the right
  currentPlacement: Placement;

  constructor() {
    super();
    this.triggerId = '';
    this.contentId = '';
    this.focusIn = '';
    this.placement = PLACEMENT_FROM_LEFT;
    this.gap = DEFAULT_GAP_PX;
    this.modal = false;
    this.alignBar = false;
    this.currentPlacement = PLACEMENT_FROM_LEFT;
    this.zag = makeZag(this);
    this.bridge = createOverlayBridge({
      id: this.zag.id,
      api: () => this.zag.api,
      closeWithoutFocus: () => this.zag.closeWithoutFocus(),
      root: () => this.content(),
      opener: () => this.trigger(),
    });
    // ArrowDown on the button opens the popover, as on the page's other menus (the keydown bubbles up from the button)
    this.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown' && event.target === this.trigger() && !this.zag.api.open) {
        event.preventDefault();
        this.zag.api.setOpen(true);
      }
    });
  }

  /* The button that opens the popover, or null. */
  trigger(): HTMLElement | null {
    return this.querySelector<HTMLElement>(TRIGGER_SELECTOR);
  }

  /* The popover's own box, or null. */
  content(): HTMLElement | null {
    return this.querySelector<HTMLElement>(CONTENT_SELECTOR);
  }

  /* Light DOM: the page's template is the element's content, and nothing is drawn over it. */
  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener('resize', this.onResize);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener('resize', this.onResize);
    this.bridge.release();
  }

  private readonly onResize = (): void => {
    this.alignToBar();
  };

  /* With `align-bar`: hangs the popover from the button's right edge when its left edge would put it past the right end of the
     math bar (measured each time it opens and when the window is resized), else from the left edge. */
  private alignToBar(): void {
    const content = this.content();
    const trigger = this.trigger();
    const bar = this.closest('.mathbar');
    if (!this.alignBar || !content || !trigger || !bar || !this.zag.machine || !this.zag.api.open) {
      return;
    }
    const pastBar = trigger.getBoundingClientRect().left + content.offsetWidth > bar.getBoundingClientRect().right;
    const placement = pastBar ? PLACEMENT_FROM_RIGHT : PLACEMENT_FROM_LEFT;
    if (placement !== this.currentPlacement) {
      this.currentPlacement = placement;
      this.zag.api.reposition({ placement });
    }
  }

  /* Before each draw: without `align-bar` the popover hangs from the side the attribute names. */
  protected override willUpdate(): void {
    if (!this.alignBar) {
      this.currentPlacement = this.placement;
    }
  }

  /* After each draw (the controller has put Zag's attributes on the parts by now): places the popover, then registers the
     layer with the page's manager or drops it. */
  protected override updated(): void {
    this.alignToBar();
    this.bridge.sync();
  }

  protected override render() {
    return nothing;
  }
}

customElements.define('gsa-bar-popover', GsaBarPopover);
