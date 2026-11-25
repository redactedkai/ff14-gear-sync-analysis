/* The materia menu of a set page's gear table (the menu a materia chip opens) as one Lit element in light DOM, with a Zag
   popover for the Escape key, the press outside, the focus back on the chip and the placement. One element serves every chip: it
   sits inside the table's box as an island (docs/engineering/architecture.md section 3):
   - the page gives it properties from a wrapper's `x-effect`: `menu` (the grades by stat, see `MateriaMenu`, or null), `anchor`
     (the chip it hangs under, or null) and `all` (every grade shown), and listens for its events; the element never reads a store;
   - an `anchor` opens the menu under that chip (a second chip moves it); no anchor closes it. The chips are not part of the
     element, so the popover has no trigger of its own: it is placed by `getAnchorElement`, and a press on the anchor itself is not
     "outside" (the page's click on the chip toggles the menu);
   - the focus goes to the stone in the slot, else the first grade the slot takes (the page's `menu` may arrive a frame after the
     anchor, so the element waits for it); Escape and a press outside close it, and the focus returns to the chip after Escape, a
     pick, Remove and Close;
   - events (the page's template listens with the same names, which it cannot import): `materia-shown` (the menu is drawn and
     placed, `detail` its box: the page scrolls it into the window), `materia-close` (the menu closed, by itself or by its own
     buttons), `stone-pick` (`detail`: `{stat, grade}`), `stone-remove` and `grades-toggle` ("Show all
     grades" or "Best grades only"); the element closes itself on a pick and on Remove;
   - the open layer is registered with the page's overlay manager (the bridge), so opening another menu closes it, a change of
     screen closes it, and one Escape closes one layer. */
import * as popover from '@zag-js/popover';
import { LitElement, html, nothing } from 'lit';
import { createOverlayBridge } from '../shared/overlay-bridge.ts';
import { ZagController } from '../shared/zag-controller.ts';

/* The events of the element (see the file header). */
export const MATERIA_CLOSE_EVENT = 'materia-close';
export const STONE_PICK_EVENT = 'stone-pick';
export const STONE_REMOVE_EVENT = 'stone-remove';
export const GRADES_TOGGLE_EVENT = 'grades-toggle';
export const MATERIA_SHOWN_EVENT = 'materia-shown';
/* The gap between the chip and the menu, in px. */
const MENU_GAP_PX = 4;
/* Where the focus goes when the menu opens: the stone in the slot, else the first grade the slot takes. */
const WORN_STONE_SELECTOR = '.matgrid button.on';
const FIRST_GRADE_SELECTOR = '.matgrid button:not(:disabled)';
/* The width of the stat-name column of a grade grid, in px (the grade columns share the rest). */
const STAT_COLUMN_PX = 36;

/* One cell of a grade grid: `ok` false when the slot cannot take the grade, `on` the stone in the slot, `fit` 'none' when the
   stat is at the piece's cap and 'part' when only part of the stone fits. */
export interface MateriaCell {
  grade: number;
  text: string;
  ok: boolean;
  on: boolean;
  fit: string;
}

/* The materia menu's view, as `materiaMenuView` in src/ui/views/stone-menu.js builds it (its comment names every field). */
export interface MateriaMenu {
  title: string;
  bands: {
    key: number;
    columns: { grade: number; roman: string; ok: boolean; odds: string }[];
    rows: { stat: string; short: string; cells: MateriaCell[] }[];
  }[];
  columns: number;
  hasStone: boolean;
  canRemove: boolean;
  removeNote: string;
  allText: string;
  highNote: string;
  showOdds: boolean;
  nqNote: string;
}

/* The Zag popover of `host`: its props and the attributes of each part, and the tie to the page's overlay manager. */
function makeZag(host: GsaMateriaMenu) {
  return new ZagController(host, {
    name: 'popover',
    machine: popover.machine,
    connect: (service, normalize) => popover.connect(service, normalize),
    getProps: () => ({
      autoFocus: false,
      portalled: false,
      finalFocusEl: () => host.anchor ?? host.returnFocusTo,
      // always under the chip, as the menu was: the page scrolls to bring the menu into the window (`materia-shown`)
      positioning: {
        placement: 'bottom-start' as const,
        gutter: MENU_GAP_PX,
        flip: false,
        getAnchorElement: () => host.anchor,
      },
      onOpenChange: ({ open }) => {
        if (!open) {
          host.dispatchEvent(new CustomEvent(MATERIA_CLOSE_EVENT, { bubbles: true, composed: true }));
        }
      },
      // a press on the anchor chip is the page's toggle, not a press outside
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

/* The `gsa-materia-menu` element (registered below): see the file header. */
export class GsaMateriaMenu extends LitElement {
  static properties = { menu: { attribute: false }, anchor: { attribute: false }, all: { type: Boolean } };

  declare menu: MateriaMenu | null;
  declare anchor: HTMLElement | null;
  declare all: boolean;
  readonly zag: ReturnType<typeof makeZag>;
  readonly bridge: ReturnType<typeof createOverlayBridge>;
  // true from the menu opening until the focus has moved into it
  // the chip the focus goes back to: `anchor` as the menu opened (the page lets go of `anchor` the moment the menu closes)
  returnFocusTo: HTMLElement | null = null;
  private focusPending = false;
  private wasOpen = false;
  // the chip the menu was last opened for: a menu that closed by itself does not open again before the page lets go of the chip
  private openedFor: HTMLElement | null = null;

  constructor() {
    super();
    this.menu = null;
    this.anchor = null;
    this.all = false;
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
     chip, placed again under another or after the grades changed, closed with none), the focus moves into a menu that has just
     opened and placed (settle), then the layer is registered with the page's manager or dropped. */
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
     moves the focus into it. Called after each draw, and again each frame until the placement is done. */
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
    this.dispatchEvent(new CustomEvent(MATERIA_SHOWN_EVENT, { detail: this.querySelector('.matpop'), bubbles: true, composed: true }));
    (this.querySelector<HTMLElement>(WORN_STONE_SELECTOR) ?? this.querySelector<HTMLElement>(FIRST_GRADE_SELECTOR))?.focus({
      preventScroll: true,
    });
  }

  /* Tells the page what the user chose (`name` with `detail`), then closes the menu with the focus back on the chip. The page is
     told first: its `materia-close` handler forgets the open slot, which the choice is for. */
  private choose(name: string, detail?: object): void {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
    this.zag.api.setOpen(false);
  }

  /* The grade grids (one of six columns, or two with every grade): the grade names, the odds of an overmeld slot and one row of
     stones per stat. */
  private renderGrids(menu: MateriaMenu) {
    return menu.bands.map(
      band => html`<div class="matgrid" style=${`grid-template-columns: ${STAT_COLUMN_PX}px repeat(${menu.columns}, 1fr)`}>
        <span></span>
        ${band.columns.map(col => html`<span class="h ${col.ok ? '' : 'na'}"><span>${col.roman}</span> <i>(${col.grade})</i></span>`)}
        ${
          menu.showOdds
            ? html`<span style="display:contents"
                ><span class="s">odds</span>${band.columns.map(col => html`<span class="pc ${col.ok ? '' : 'na'}">${col.odds}</span>`)}</span
              >`
            : nothing
        }
        ${band.rows.map(
          row => html`<span style="display:contents"
            ><span class="s">${row.short}</span>${row.cells.map(
              cell => html`<button
                type="button"
                class="${cell.on ? 'on' : ''} ${cell.ok ? '' : 'na'} ${cell.fit === 'none' ? 'cap-none' : ''} ${cell.fit === 'part' ? 'cap-part' : ''}"
                data-stone="${row.stat}:${cell.grade}"
                ?disabled=${!cell.ok}
                @click=${() => this.choose(STONE_PICK_EVENT, { stat: row.stat, grade: cell.grade })}
              >${cell.ok ? cell.text : '–'}</button>`,
            )}</span
          >`,
        )}
      </div>`,
    );
  }

  /* The menu's box: its title, the grids, the notes and the footer (Remove, the grades switch and Close). */
  private renderMenu(menu: MateriaMenu) {
    return html`
      <h5><span>${menu.title}</span></h5>
      ${this.renderGrids(menu)}
      ${menu.highNote ? html`<p class="rmnote">${menu.highNote}</p>` : nothing}
      ${menu.nqNote ? html`<p class="rmnote">${menu.nqNote}</p>` : nothing}
      <div class="matfoot">
        <span>${
          menu.hasStone
            ? html`<button type="button" class="linkish" ?disabled=${!menu.canRemove} @click=${() => this.choose(STONE_REMOVE_EVENT)}>Remove</button>`
            : nothing
        }</span>
        <button type="button" class="linkish" @click=${() => this.dispatchEvent(new CustomEvent(GRADES_TOGGLE_EVENT, { bubbles: true, composed: true }))}>${menu.allText}</button>
        <button type="button" class="linkish" @click=${() => this.zag.api.setOpen(false)}>Close</button>
      </div>
      ${menu.removeNote ? html`<p class="rmnote">${menu.removeNote}</p>` : nothing}
    `;
  }

  protected override render() {
    const open = this.zag.machine !== null && this.zag.api.open;
    return html`
      <div data-zag-part="positioner">
        <div class="matpop ${this.all ? 'all' : ''}" data-zag-part="content" aria-label=${this.menu?.title ?? nothing}>
          ${open && this.menu ? this.renderMenu(this.menu) : nothing}
        </div>
      </div>
    `;
  }
}

customElements.define('gsa-materia-menu', GsaMateriaMenu);
