/* The Gear browser's Slot menu as a Lit element in light DOM, with a Zag menu (radio items) for the keyboard, the focus and
   the placement. It sits inside the Alpine-run Gear browser as an island (docs/engineering/architecture.md section 3):
   - the page gives it properties (`choices`, `value`, `label`) from a wrapper's `x-effect` and listens for `slot-change`; the element
     never reads a store;
   - the button is as wide as the longest row: a hidden copy of the rows (`.slot-sizer`, with the widest count the list can
     show) shares the button's grid cell, so the button, and the open menu, which is as wide as the button (the CSS gives
     the positioner the button's width, so it has it before Zag has placed it), keep one width whatever the choice and the numbers;
   - Zag's menu opens on the arrow keys, moves with the arrows, picks with Enter and Space and closes on Escape or a press
     outside, each time with the focus back on the button. Tab closes it too and the focus moves on (Zag's menu would hold it);
   - the open layer is registered with the page's overlay manager (the bridge), so opening the Expansion or Gear categories menu
     closes it, a change of screen closes it, and one Escape closes one layer. */
import * as menu from '@zag-js/menu';
import { LitElement, html } from 'lit';
import { createOverlayBridge } from '../shared/overlay-bridge.ts';
import { ZagController } from '../shared/zag-controller.ts';

/* The `slot-change` event: `detail` is the key of the slot picked ('any', 'weapon', 'ring', ...). */
export const SLOT_CHANGE_EVENT = 'slot-change';

/* The ids of the button and of the menu: the page's tests and its labels name them. */
const BUTTON_ID = 'b-slot';
const MENU_ID = 'b-slots';
/* The gap between the button and the open menu, in px. */
const MENU_GAP_PX = 4;
/* The button's words before the page has given the list, and the key of the choice that means "no slot filter". */
const ANY_SLOT_LABEL = 'Any slot';
const ANY_SLOT_KEY = 'any';
/* The widest number of matches a slot can show, as text: it sizes the hidden copy of the rows. */
const WIDEST_COUNT_TEXT = '99,999';

/* One choice of the menu (a row of `view.slots`, src/ui/views/gear.js): `key` is the slot's code, `label` its name, `count` how
   many pieces match under the other filters and `countText` that count with thousands separators. */
export interface SlotChoice {
  key: string;
  label: string;
  count: number;
  countText: string;
}

/* The Zag menu of `host`: its props, the attributes of each part (the button, the positioner, the menu, the rows) and the
   tie to the page's overlay manager. */
function makeZag(host: GsaSlotMenu) {
  return new ZagController(host, {
    name: 'menu',
    machine: menu.machine,
    connect: (service, normalize) => menu.connect(service, normalize),
    getProps: () => ({
      ids: { trigger: BUTTON_ID, content: MENU_ID },
      'aria-label': 'Slot',
      positioning: { placement: 'bottom-start' as const, gutter: MENU_GAP_PX },
      onSelect: ({ value }) => host.dispatchEvent(new CustomEvent(SLOT_CHANGE_EVENT, { detail: value, bubbles: true, composed: true })),
      onEscapeKeyDown: event => host.bridge.guardEscape(event),
    }),
    parts: api => ({
      trigger: api.getTriggerProps(),
      positioner: api.getPositionerProps(),
      content: api.getContentProps(),
      item: host.choices.map(choice =>
        api.getOptionItemProps({
          type: 'radio',
          value: choice.key,
          checked: choice.key === host.value,
          // a slot with no match cannot be picked, unless it is the chosen one
          disabled: choice.count === 0 && choice.key !== host.value,
        }),
      ),
    }),
  });
}

/* The `gsa-slot-menu` element (registered below): the Slot button and its menu; see the file header. Properties: `choices`
   (the rows, 'any' first; empty until the page has a view), `value` (the key of the chosen slot) and `label` (the words on the
   button: the chosen slot's name, which the view works out: `view.slotLabel`). The `slot-change` event tells the page a pick;
   the page then sets `value` and `label`. */
export class GsaSlotMenu extends LitElement {
  static properties = { choices: { attribute: false }, value: { type: String }, label: { type: String } };

  declare choices: readonly SlotChoice[];
  declare value: string;
  declare label: string;
  readonly zag: ReturnType<typeof makeZag>;
  readonly bridge: ReturnType<typeof createOverlayBridge>;

  constructor() {
    super();
    this.choices = [];
    this.value = ANY_SLOT_KEY;
    this.label = ANY_SLOT_LABEL;
    this.zag = makeZag(this);
    this.bridge = createOverlayBridge({
      id: this.zag.id,
      api: () => this.zag.api,
      closeWithoutFocus: () => this.zag.closeWithoutFocus(),
      root: () => this.querySelector('[data-zag-part="content"]'),
      opener: () => this.querySelector('[data-zag-part="trigger"]'),
    });
    // capture phase: before Zag's menu sees a Tab in the list (and a Tab on the button, before the list has the focus)
    this.addEventListener('keydown', event => this.closeOnTab(event), { capture: true });
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

  /* Tab closes the menu and the focus moves on from where it is, as it does out of the page's other menus: Zag's menu would
     stop the Tab (it holds the focus in the menu), so the key is handled before Zag sees it. Nothing happens while it is closed. */
  private closeOnTab(event: KeyboardEvent): void {
    if (event.key !== 'Tab' || !this.zag.api.open) return;
    event.stopPropagation();
    this.zag.closeWithoutFocus();
  }

  protected override render() {
    const label = this.label || ANY_SLOT_LABEL;
    return html`
      <button type="button" class="multi-btn slot-btn" data-zag-part="trigger" aria-label="Slot: ${label}">${label}</button>
      <div class="multi-menu slot-sizer" aria-hidden="true">
        ${this.choices.map(
          choice => html`<span class="multi-opt"><span>${choice.label}</span><span class="n">${WIDEST_COUNT_TEXT}</span></span>`,
        )}
      </div>
      <div data-zag-part="positioner">
        <div class="multi-menu slot-menu" data-zag-part="content">
          ${this.choices.map(
            choice =>
              html`<div class="multi-opt" data-zag-part="item" data-slot=${choice.key}><span>${choice.label}</span><span class="n" .textContent=${choice.countText}></span></div>`,
          )}
        </div>
      </div>
    `;
  }
}

customElements.define('gsa-slot-menu', GsaSlotMenu);
