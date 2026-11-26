/* The caret menus of the Sheets screens as one Lit element in light DOM, with a Zag popover for the focus, Escape, the press
   outside and the placement: the sheet switcher (after the sheet's name) and the gear set switcher (after the set's name).
   It sits inside the Sheets screen (docs/engineering/architecture.md section 3):
   - the screen gives it properties (`items`, `allLabel`, `allHref`, `newLabel`, `newDisabled`, `disabled`)
     and listens for `switch-pick`; the element never reads a store;
   - the list is plain links (no `role=menu`): the first row goes to the parent screen, one row per sheet or set (the current one
     marked), and a button at the end makes a new one. A plain click on a link is a pick; any other click is left to the browser
     (a new tab);
   - the current row takes the focus when the list opens; Tab and Shift+Tab walk the rows (as in any list of links), and the list
     closes when the focus leaves it and its caret (Zag's focus-outside dismissal), the focus staying where the Tab put it;
     Escape and a press outside close it with the focus back on the caret;
   - the open layer is registered with the page's overlay manager (the bridge), so another layer opening closes it and a change
     of screen closes it. */
import * as popover from '@zag-js/popover';
import { LitElement, html, nothing } from 'lit';
import { plainClick } from '../../router/plain-click.ts';
import { createOverlayBridge } from '../shared/overlay-bridge.ts';
import { ZagController } from '../shared/zag-controller.ts';

/* The event of a pick: `detail` is a SwitchPick. */
export const SWITCH_PICK_EVENT = 'switch-pick';
/* The gap between the caret and the open list, in px. */
const LIST_GAP_PX = 4;

/* One row of the list: `id` the sheet's or set's id, `name` its name, `href` its address and `current` whether it is the open one. */
export interface SwitchItem {
  id: string;
  name: string;
  href: string;
  current: boolean;
}

/* What a pick tells the page: `kind` is 'all' (the parent screen), 'item' (the row with `id`) or 'new'; `opener` is the caret, for
   a dialog that returns the focus to it. */
export interface SwitchPick {
  kind: 'all' | 'item' | 'new';
  id: string | null;
  opener: HTMLElement | null;
}

/* The Zag popover of `host`: its props, the attributes of the caret, the positioner and the list, and the tie to the overlay manager. */
function makeZag(host: GsaSwitchMenu) {
  return new ZagController(host, {
    name: 'popover',
    machine: popover.machine,
    connect: (service, normalize) => popover.connect(service, normalize),
    getProps: () => ({
      ids: { trigger: host.buttonId, content: host.menuId },
      portalled: false,
      positioning: { placement: 'bottom-start' as const, gutter: LIST_GAP_PX },
      initialFocusEl: () => host.querySelector<HTMLElement>('.setitem.cur') ?? host.querySelector<HTMLElement>('.setitem'),
      onEscapeKeyDown: event => host.bridge.guardEscape(event),
    }),
    parts: api => ({
      trigger: api.getTriggerProps(),
      positioner: api.getPositionerProps(),
      content: { ...api.getContentProps(), 'aria-label': host.menuLabel },
    }),
  });
}

/* The `gsa-switch-menu` element (registered below); see the file header. Attributes: `button-id` and `menu-id` (the ids the page's
   tests and labels name), `button-label` (the caret's name) and `menu-label` (the list's name). */
export class GsaSwitchMenu extends LitElement {
  static properties = {
    items: { attribute: false },
    allLabel: { type: String },
    allHref: { type: String },
    newLabel: { type: String },
    newDisabled: { type: Boolean },
    disabled: { type: Boolean },
    buttonId: { type: String, attribute: 'button-id' },
    menuId: { type: String, attribute: 'menu-id' },
    buttonLabel: { type: String, attribute: 'button-label' },
    menuLabel: { type: String, attribute: 'menu-label' },
  };

  declare items: readonly SwitchItem[];
  declare allLabel: string;
  declare allHref: string;
  declare newLabel: string;
  declare newDisabled: boolean;
  declare disabled: boolean;
  declare buttonId: string;
  declare menuId: string;
  declare buttonLabel: string;
  declare menuLabel: string;
  readonly zag: ReturnType<typeof makeZag>;
  readonly bridge: ReturnType<typeof createOverlayBridge>;

  constructor() {
    super();
    this.items = [];
    this.allLabel = '';
    this.allHref = '#/';
    this.newLabel = '';
    this.newDisabled = false;
    this.disabled = false;
    this.buttonId = '';
    this.menuId = '';
    this.buttonLabel = '';
    this.menuLabel = '';
    this.zag = makeZag(this);
    this.bridge = createOverlayBridge({
      id: this.zag.id,
      api: () => this.zag.api,
      closeWithoutFocus: () => this.zag.closeWithoutFocus(),
      root: () => this.querySelector('[data-zag-part="content"]'),
      opener: () => this.querySelector('[data-zag-part="trigger"]'),
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

  /* After each draw (the controller has put Zag's attributes on the parts by now) the layer is registered with the page's
     manager, or dropped from it. */
  protected override updated(): void {
    this.bridge.sync();
  }

  /* A click on a row: a plain click on a link is a pick (the list closes, the focus goes back to the caret, and the page is
     told); any other click on a link is left to the browser. The "new" button is always a pick. `id` is the row's id for a
     sheet or set row. */
  private pick(event: MouseEvent, kind: SwitchPick['kind'], id: string | null): void {
    if (kind !== 'new') {
      if (!plainClick(event)) {
        return;
      }
      event.preventDefault();
    }
    const opener = this.querySelector<HTMLElement>('[data-zag-part="trigger"]');
    this.zag.api.setOpen(false);
    const detail: SwitchPick = { kind, id, opener };
    this.dispatchEvent(new CustomEvent(SWITCH_PICK_EVENT, { detail, bubbles: true, composed: true }));
  }

  /* The rows of the list, drawn only while it is open (so a page's links are not doubled by a hidden list). */
  private renderRows() {
    return html`
      <a class="setitem setall" href=${this.allHref} @click=${(event: MouseEvent) => this.pick(event, 'all', null)}
        ><span>${this.allLabel}</span
        ><svg class="setarrow" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"
          ><path fill="currentColor" d="M13.1717 12.0007L8.22192 7.05093L9.63614 5.63672L16.0001 12.0007L9.63614 18.3646L8.22192 16.9504L13.1717 12.0007Z" /></svg
      ></a>
      ${this.items.map(
        item => html`<a
          class="setitem clipname ${item.current ? 'cur' : ''}"
          href=${item.href}
          title=${item.name}
          aria-current=${item.current ? 'true' : nothing}
          @click=${(event: MouseEvent) => this.pick(event, 'item', item.id)}
          >${item.name}</a
        >`,
      )}
      <button type="button" class="setitem setnew" ?disabled=${this.newDisabled} @click=${(event: MouseEvent) => this.pick(event, 'new', null)}>${this.newLabel}</button>
    `;
  }

  protected override render() {
    const open = this.zag.machine !== null && this.zag.api.open;
    return html`
      <button type="button" class="crumbmenubtn" data-zag-part="trigger" aria-label=${this.buttonLabel} ?disabled=${this.disabled}><svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        aria-hidden="true"
      ><path fill="currentColor" d="M11.9999 13.1714L16.9497 8.22168L18.3639 9.63589L11.9999 15.9999L5.63599 9.63589L7.0502 8.22168L11.9999 13.1714Z" /></svg></button>
      <div data-zag-part="positioner">
        <div class="setmenu" data-zag-part="content">${open ? this.renderRows() : nothing}</div>
      </div>
    `;
  }
}

customElements.define('gsa-switch-menu', GsaSwitchMenu);
