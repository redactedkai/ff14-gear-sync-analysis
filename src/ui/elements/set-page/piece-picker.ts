/* The piece picker of a set page's gear table (the menu a row's piece button opens: a search box over the job's pieces for that slot,
   grouped by expansion) as one Lit element in light DOM, with a Zag popover for the Escape key, the press outside, the close when the
   focus leaves it, the focus back on the button and the placement. One element serves every row: it sits inside the table's box
   (docs/engineering/architecture.md section 3), as the materia menu does:
   - the set page gives it properties: `menu` (the picker, see `PiecePicker`, or null), `anchor` (the row's
     button it hangs under, or null) and `query` (the search text), and listens for its events (piece-picker-names.ts); the element
     never reads a store. The page builds the picker and cuts its list to the rows drawn so far: a long list is drawn in steps (a
     window of rows first, then more each frame while the menu stays open: views/limit-rows.ts, ui/draw-in-steps.ts), so the menu
     appears at once and no task is long;
   - an `anchor` opens the menu under that button (another button moves it); no anchor closes it. The buttons are not part of the
     element, so the popover has no trigger of its own: it is placed by `getAnchorElement`, and a press on the anchor itself is not
     "outside" (the page's click on the button toggles the menu);
   - the search box takes the focus once the menu is drawn and placed; Escape and a press outside close it, and the focus returns to
     the button after Escape and a pick. The menu is always under the button: the page scrolls it into the window (`picker-shown`);
   - the open layer is registered with the page's overlay manager (the bridge), so opening another menu closes it, a change of screen
     closes it, and one Escape closes one layer. */
import * as popover from '@zag-js/popover';
import { LitElement, html, nothing } from 'lit';
import { live } from 'lit/directives/live.js';
import { repeat } from 'lit/directives/repeat.js';
import { createOverlayBridge } from '../shared/overlay-bridge.ts';
import { ZagController } from '../shared/zag-controller.ts';
import {
  PICKER_CLOSE_EVENT,
  PICKER_EMPTY_LABEL,
  PICKER_MENU_NAME,
  PICKER_QUERY_EVENT,
  PICKER_SEARCH_LABEL,
  PICKER_SHOWN_EVENT,
  PIECE_PICK_EVENT,
  type PiecePicker,
  type PickerPiece,
  pieceKeyOfClick,
} from './piece-picker-names.ts';

/* The gap between the button and the menu, in px. */
const MENU_GAP_PX = 4;
/* The picker's search box, where the focus goes when the menu opens. */
const SEARCH_SELECTOR = '.menu-search input';

/* The "x" of the Empty button, as the page's other icon buttons draw it. */
const EMPTY_ICON = html`<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M12 10.5858L16.9497 5.63604L18.364 7.05025L13.4142 12L18.364 16.9497L16.9497 18.364L12 13.4142L7.05025 18.364L5.63604 16.9497L10.5858 12L5.63604 7.05025L7.05025 5.63604L12 10.5858Z"/></svg>`;

/* The Zag popover of `host`: its props and the attributes of each part, and the tie to the page's overlay manager. */
function makeZag(host: GsaPiecePicker) {
  return new ZagController(host, {
    name: 'popover',
    machine: popover.machine,
    connect: (service, normalize) => popover.connect(service, normalize),
    getProps: () => ({
      autoFocus: false,
      portalled: false,
      finalFocusEl: () => host.anchor ?? host.returnFocusTo,
      // always under the button, as the menu was: the page scrolls to bring the menu into the window (`picker-shown`)
      positioning: {
        placement: 'bottom-start' as const,
        gutter: MENU_GAP_PX,
        flip: false,
        getAnchorElement: () => host.anchor,
      },
      onOpenChange: ({ open }) => {
        if (!open) {
          host.dispatchEvent(new CustomEvent(PICKER_CLOSE_EVENT, { bubbles: true, composed: true }));
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
    }),
  });
}

/* The `gsa-piece-picker` element (registered below): see the file header. */
export class GsaPiecePicker extends LitElement {
  static properties = { menu: { attribute: false }, anchor: { attribute: false }, query: { type: String } };

  declare menu: PiecePicker | null;
  declare anchor: HTMLElement | null;
  declare query: string;
  readonly zag: ReturnType<typeof makeZag>;
  readonly bridge: ReturnType<typeof createOverlayBridge>;
  // the button the focus goes back to: `anchor` as the menu opened (the page lets go of `anchor` the moment the menu closes)
  returnFocusTo: HTMLElement | null = null;
  // true from the menu opening until the focus has moved into it
  private focusPending = false;
  private wasOpen = false;
  // the button the menu was last opened for: a menu that closed by itself does not open again before the page lets go of the button
  private openedFor: HTMLElement | null = null;

  constructor() {
    super();
    this.menu = null;
    this.anchor = null;
    this.query = '';
    this.zag = makeZag(this);
    this.bridge = createOverlayBridge({
      id: this.zag.id,
      api: () => this.zag.api,
      closeWithoutFocus: () => this.zag.closeWithoutFocus(),
      root: () => this.querySelector('[data-zag-part="content"]'),
      opener: () => this.anchor,
    });
    // one handler for the whole list, not one per piece
    this.addEventListener('click', event => this.onListClick(event));
  }

  /* Light DOM: draw into the element itself, so the page's CSS reaches the markup. */
  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.bridge.release();
  }

  /* After each draw (the controller has put Zag's attributes on the parts by now): the machine follows `anchor` (open under a button,
     placed again under another or after the list grew, closed with none), the focus moves into a menu that has just opened and
     placed (settle), then the layer is registered with the page's manager or dropped. */
  protected override updated(): void {
    const { api, machine } = this.zag;
    if (machine) {
      if (api.open && !this.wasOpen) {
        this.focusPending = true;
      }
      this.wasOpen = api.open;
      if (!api.open) {
        this.zag.clearPlacement();
      }
      if (!this.anchor) {
        this.openedFor = null;
        if (api.open) {
          this.zag.closeWithoutFocus();
        }
      } else if (!api.open) {
        if (this.openedFor !== this.anchor) {
          this.openedFor = this.anchor;
          this.returnFocusTo = this.anchor;
          api.setOpen(true);
        }
      } else {
        api.reposition();
        this.settle();
      }
    }
    this.bridge.sync();
  }

  /* Whether Zag's positioner has set the menu's place (it writes `--x` on the positioner when it has; before that the box is off
     the window). */
  private isPlaced(): boolean {
    return this.querySelector<HTMLElement>('[data-zag-part="positioner"]')?.style.getPropertyValue('--x') !== '';
  }

  /* Once the open menu is drawn and placed (and only then: before, its box is off the window): tells the page it is shown, then
     moves the focus into the search box. Called after each draw, and again each frame until the placement is done. */
  settle(): void {
    if (!this.zag.api.open) {
      this.focusPending = false;
    }
    if (!this.focusPending || !this.menu) {
      return;
    }
    if (!this.isPlaced()) {
      // the positioner sets its place a frame after the menu opens: look again next frame
      requestAnimationFrame(() => this.settle());
      return;
    }
    this.focusPending = false;
    this.dispatchEvent(new CustomEvent(PICKER_SHOWN_EVENT, { detail: this.querySelector('.pick-menu'), bubbles: true, composed: true }));
    this.querySelector<HTMLElement>(SEARCH_SELECTOR)?.focus({ preventScroll: true });
  }

  /* Tells the page what the user chose (`piece`: a piece's gameId, or null to empty the slot), then closes the menu with the focus back
     on the button. The page is told first: its handler picks for the row the menu is open for. */
  private choose(piece: number | null): void {
    this.dispatchEvent(new CustomEvent(PIECE_PICK_EVENT, { detail: piece, bubbles: true, composed: true }));
    this.zag.api.setOpen(false);
  }

  /* A click inside the list: a piece row is a pick. */
  private onListClick(event: MouseEvent): void {
    const target = event.target as Element | null;
    if (!target?.closest('.menu-list')) {
      return;
    }
    const piece = pieceKeyOfClick(target);
    if (piece !== undefined) {
      this.choose(piece);
    }
  }

  /* Tells the page the search text is now `text`. */
  private search(text: string): void {
    this.dispatchEvent(new CustomEvent(PICKER_QUERY_EVENT, { detail: text, bubbles: true, composed: true }));
  }

  /* The search row: the search box and, while the row holds a piece, the Empty button. */
  private renderTools(menu: PiecePicker) {
    return html`
      <div class="menu-tools"><span class="menu-search"><input
        type="text"
        autocomplete="off"
        aria-label=${PICKER_SEARCH_LABEL}
        placeholder=${menu.placeholder}
        .value=${live(this.query)}
        @input=${(event: Event) => this.search((event.target as HTMLInputElement).value)}></span>${
          menu.canEmpty
            ? html`<button type="button" class="menu-clear" data-empty-slot aria-label=${PICKER_EMPTY_LABEL} @click=${() => this.choose(null)}>${EMPTY_ICON}Empty</button>`
            : nothing
        }</div>`;
  }

  /* One piece's row: its name (with the HQ mark, the gear category and the Unique note), its stats line and its levels. */
  private renderPiece(piece: PickerPiece) {
    return html`<button type="button" class="same-item ${piece.onClass}" data-game-id=${piece.key} ?disabled=${piece.taken}><span><span>${piece.name}</span>${piece.hq ? html`<span class="hqg" role="img" aria-label="High quality"></span>` : nothing}<span class=${piece.pillClass}>${piece.pillLabel}</span>${piece.unique ? html`<span class="same-lvl">${piece.uniqueText}</span>` : nothing}<span class="pick-subs">${piece.line}</span></span><span class="same-lvl">${piece.levels}</span></button>`;
  }

  /* The list of pieces by expansion, or why there is none (with Clear search while a search is on). */
  private renderList(menu: PiecePicker) {
    return html`
      <div class="menu-list">
        ${repeat(
          menu.groups,
          group => group.label,
          group =>
            html`<div><div class="same-head">${group.label}</div>${repeat(
              group.items,
              piece => piece.key,
              piece => this.renderPiece(piece),
            )}</div>`,
        )}
        ${
          menu.emptyText
            ? html`<div class="menu-empty"><span>${menu.emptyText}</span> ${
                this.query.trim()
                  ? html`<button type="button" class="linkbtn" @click=${() => this.search('')}>Clear search</button>`
                  : nothing
              }</div>`
            : nothing
        }
      </div>`;
  }

  protected override render() {
    const menu = this.menu;
    const open = this.zag.machine !== null && this.zag.api.open;
    return html`
      <div data-zag-part="positioner">
        <div class="same-menu search-menu pick-menu" data-zag-part="content" aria-label=${PICKER_MENU_NAME}>
          ${open && menu ? html`${this.renderTools(menu)}${this.renderList(menu)}<div class="same-foot">${menu.footText}</div>` : nothing}
        </div>
      </div>
    `;
  }
}

customElements.define('gsa-piece-picker', GsaPiecePicker);
