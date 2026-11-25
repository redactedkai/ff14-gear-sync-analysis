/* The Substat tiers "?" note as a Lit element in light DOM, with a Zag popover for the Escape key, the press outside and the
   placement. One element serves every card's "?": it sits inside the Alpine-run Substat tiers table as an island
   (docs/engineering/architecture.md section 3):
   - the page gives it properties from a wrapper's `x-effect`: `note` (what the note says, or null) and `anchor` (the "?"
     button it hangs under, or null) and listens for `note-close`; the element never reads a store;
   - an `anchor` opens the note under that button (a second button moves it: the note is placed again); no anchor closes it;
   - the buttons are not part of the element, so the popover has no trigger of its own: it is placed by `getAnchorElement`, and
     a press on the anchor itself is not "outside" (the page's click on the button toggles the note);
   - the focus stays on the button when the note opens (`autoFocus` off: the note holds nothing to press) and goes back to it
     after Escape; a press outside, Tab to another control or a change of screen closes it;
   - the open layer is registered with the page's overlay manager (the bridge), so opening a menu closes it, a change of screen
     closes it, and one Escape closes one layer. */
import * as popover from '@zag-js/popover';
import { LitElement, html, nothing } from 'lit';
import { createOverlayBridge } from '../shared/overlay-bridge.ts';
import { ZagController } from '../shared/zag-controller.ts';
import { NOTE_CLOSE_EVENT, STAT_NOTE_ID } from './stat-note-names.ts';

/* The gap between the button and the note, in px, and how far the note starts to the left of the button's left edge (so the
   button stays in view above the note's start). */
const NOTE_GAP_PX = 8;
const NOTE_SHIFT_PX = 20;

/* What the note says (a card's `help` in src/ui/views/tiers.js): its heading and two paragraphs. */
export interface StatNoteText {
  title: string;
  affects: string;
  size: string;
}

/* The Zag popover of `host`: its props and the attributes of each part, and the tie to the page's overlay manager. */
function makeZag(host: GsaStatNote) {
  return new ZagController(host, {
    name: 'popover',
    machine: popover.machine,
    connect: (service, normalize) => popover.connect(service, normalize),
    getProps: () => ({
      ids: { content: STAT_NOTE_ID },
      autoFocus: false,
      portalled: false,
      finalFocusEl: () => host.anchor ?? host.returnFocusTo,
      // always below the button, as the note was before; the page's panel keeps it inside the window sideways
      positioning: {
        placement: 'bottom-start' as const,
        offset: { mainAxis: NOTE_GAP_PX, crossAxis: -NOTE_SHIFT_PX },
        flip: false,
        getAnchorElement: () => host.anchor,
      },
      onOpenChange: ({ open }) => {
        if (!open) {
          host.dispatchEvent(new CustomEvent(NOTE_CLOSE_EVENT, { bubbles: true, composed: true }));
        }
      },
      // a press on the anchor button is the page's toggle, not a press outside
      onInteractOutside: event => {
        const pressed = event.detail.originalEvent.target;
        if (pressed instanceof Node && host.anchor?.contains(pressed)) {
          event.preventDefault();
        }
      },
      onEscapeKeyDown: event => host.bridge.guardEscape(event),
    }),
    parts: api => ({
      positioner: api.getPositionerProps(),
      content: api.getContentProps(),
      title: api.getTitleProps(),
    }),
  });
}

/* The `gsa-stat-note` element (registered below): see the file header. Properties: `note` (the words, or null for none) and
   `anchor` (the button the note hangs under, or null: closed). The `note-close` event tells the page that the note closed
   by itself (Escape, a press outside, the layer manager); the page then clears `anchor`. */
export class GsaStatNote extends LitElement {
  static properties = { note: { attribute: false }, anchor: { attribute: false } };

  declare note: StatNoteText | null;
  declare anchor: HTMLElement | null;
  // the "?" the focus goes back to: `anchor` as the note opened or moved (the page lets go of `anchor` the moment the note closes, before
  // Zag asks where the focus goes)
  returnFocusTo: HTMLElement | null = null;
  readonly zag: ReturnType<typeof makeZag>;
  readonly bridge: ReturnType<typeof createOverlayBridge>;

  constructor() {
    super();
    this.note = null;
    this.anchor = null;
    this.zag = makeZag(this);
    this.bridge = createOverlayBridge({
      id: this.zag.id,
      api: () => this.zag.api,
      closeWithoutFocus: () => this.zag.closeWithoutFocus(),
      root: () => this.querySelector('[data-zag-part="content"]'),
      opener: () => this.anchor,
    });
  }

  /* Light DOM: draw into the element itself, so the page's CSS reaches the markup. */
  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.bridge.release();
  }

  /* After each draw (the controller has put Zag's attributes on the parts by now): the machine follows `anchor` (open under a
     button, placed again under another, closed with none), then the layer is registered with the page's manager or dropped. */
  protected override updated(): void {
    const { api, machine } = this.zag;
    if (machine) {
      if (this.anchor) {
        this.returnFocusTo = this.anchor;
      }
      if (this.anchor && !api.open) {
        api.setOpen(true);
      } else if (this.anchor) {
        api.reposition();
      } else if (api.open) {
        this.zag.closeWithoutFocus();
      }
    }
    this.bridge.sync();
  }

  protected override render() {
    const note = this.note;
    return html`
      <div data-zag-part="positioner">
        <div class="popover statpop" data-zag-part="content">
          ${
            note
              ? html`<h3 data-zag-part="title">${note.title}</h3>
                <p>${note.affects}</p>
                <p>${note.size}</p>`
              : nothing
          }
        </div>
      </div>
    `;
  }
}

customElements.define('gsa-stat-note', GsaStatNote);
