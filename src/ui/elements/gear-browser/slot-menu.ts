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
import { ANY_SLOT_KEY, ANY_SLOT_LABEL, SLOT_CHANGE_EVENT, SLOT_MENU_NAME, slotButtonName } from './slot-menu-names.ts';

/* The ids of the button and of the menu: the page's tests and its labels name them. */
const BUTTON_ID = 'b-slot';
const MENU_ID = 'b-slots';
/* The gap between the button and the open menu, in px. */
const MENU_GAP_PX = 4;
/* The attribute on the element that says what the last input of the page was: `key` (a key press anywhere on the page), `press`
   (a mouse or touch press inside the element) or `move` (the pointer moved over the element). The browser decides whether the
   button shows its focus ring from the input before the focus is given back to it by script, and its answer depends on timing
   and on the engine, so the CSS does not leave it to the browser where the element knows: after `press` the ring is hidden
   (a press on a row, which Zag cancels, does not count as one for the browser), after `key` it is always drawn. The lit row's
   ring (for the keys) is hidden while the pointer lights rows (`press`, `move`). */
const INPUT_ATTRIBUTE = 'data-input';
const INPUT_KEY = 'key';
const INPUT_PRESS = 'press';
const INPUT_MOVE = 'move';
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

/* Whether a row cannot be picked: a slot with no match, unless it is the chosen one. */
function isDisabled(choice: SlotChoice, chosenKey: string): boolean {
  return choice.count === 0 && choice.key !== chosenKey;
}

/* The trigger's attributes with Zag's `pointerdown` handler kept for the mouse only. Zag cancels every `pointerdown` on its
   trigger, so that the press does not move the focus; WebKit then sends no `click` for a touch tap and the menu would never
   open by touch. A tap's `click` is what opens it. (The vanilla adapter names handlers in lower case: `onpointerdown`.) */
function touchFriendly(trigger: Record<string, unknown>): Record<string, unknown> {
  const zagOnPointerDown = trigger.onpointerdown as ((event: PointerEvent) => void) | undefined;
  return {
    ...trigger,
    onpointerdown(event: PointerEvent) {
      if (event.pointerType === 'mouse') zagOnPointerDown?.(event);
    },
  };
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
      'aria-label': SLOT_MENU_NAME,
      // below the button, or above it when that side has more room; the list is no taller than the room on its side (the CSS reads
      // Zag's `--available-height`) and scrolls inside
      positioning: { placement: 'bottom-start' as const, gutter: MENU_GAP_PX },
      onOpenChange: ({ open }) => {
        if (open) host.lightChosenSlotAfterOpening();
      },
      // the focus moved to another control by a script (not by Tab or a press, which have their own ways out): the menu closes and
      // the focus stays where it went
      onFocusOutside: event => {
        event.preventDefault();
        host.zag.closeWithoutFocus();
      },
      onSelect: ({ value }) => host.dispatchEvent(new CustomEvent(SLOT_CHANGE_EVENT, { detail: value, bubbles: true, composed: true })),
      onEscapeKeyDown: event => host.bridge.guardEscape(event),
    }),
    parts: api => ({
      trigger: touchFriendly(api.getTriggerProps()),
      positioner: api.getPositionerProps(),
      content: api.getContentProps(),
      item: host.choices.map(choice =>
        api.getOptionItemProps({
          type: 'radio',
          value: choice.key,
          checked: choice.key === host.value,
          disabled: isDisabled(choice, host.value),
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
    this.addEventListener('keydown', event => this.onKeyDown(event), { capture: true });
    // what the last input in this element was: the button shows its focus ring after a key and not after a press (see INPUT_ATTRIBUTE)
    this.addEventListener('pointerdown', () => this.setAttribute(INPUT_ATTRIBUTE, INPUT_PRESS), { capture: true });
    this.addEventListener('pointermove', event => this.markPointerMove(event), { capture: true });
  }

  /* A key press anywhere on the page: the last input is a key now, wherever the focus is going. */
  private readonly onDocumentKeyDown = (): void => {
    this.setAttribute(INPUT_ATTRIBUTE, INPUT_KEY);
  };

  override connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener('keydown', this.onDocumentKeyDown, { capture: true });
  }

  /* Light DOM: draw into the element itself, so the page's CSS reaches the markup. */
  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this.onDocumentKeyDown, { capture: true });
    this.bridge.release();
  }

  /* After each draw (the controller has put Zag's attributes on the parts by now) the layer is registered with the page's
     manager, or dropped from it. */
  protected override updated(): void {
    this.bridge.sync();
  }

  /* Records that the pointer moved over the element, unless a press is the last input (it says more). A move event that moved
     nothing (the browser sends one after the layout changed under a resting pointer) is not an input. */
  private markPointerMove(event: PointerEvent): void {
    const moved = event.movementX !== 0 || event.movementY !== 0;
    if (moved && this.getAttribute(INPUT_ATTRIBUTE) !== INPUT_PRESS) {
      this.setAttribute(INPUT_ATTRIBUTE, INPUT_MOVE);
    }
  }

  /* Handles Tab: it closes the menu and the focus moves on from where it is, as it does
     out of the page's other menus. Zag's menu would stop the Tab (it holds the focus in the menu), so the key is handled before
     Zag sees it. Shift+Tab from the list first puts the focus on the button, so that it goes on to the control before the button
     and not just to the button. Nothing happens to a Tab while the menu is closed. */
  private onKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Tab' || !this.zag.api.open) {
      return;
    }
    event.stopPropagation();
    if (event.shiftKey) {
      this.querySelector<HTMLElement>('[data-zag-part="trigger"]')?.focus({ preventScroll: true });
    }
    this.zag.closeWithoutFocus();
  }

  /* When a key has opened the menu, Zag lights the first slot (the last for ArrowUp); the chosen slot is lit instead, so that the
     arrows start from where the choice is. A press that opens it lights nothing, and stays so. Zag lights its row in a task it queues
     when the menu opens, before this callback runs, so the change waits a microtask to come after it. */
  lightChosenSlotAfterOpening(): void {
    queueMicrotask(() => {
      const firstPickable = this.choices.find(choice => !isDisabled(choice, this.value));
      const api = this.zag.machine ? this.zag.api : null;
      if (api && firstPickable && api.highlightedValue === firstPickable.key && this.value !== firstPickable.key) {
        api.setHighlightedValue(this.value);
      }
    });
  }

  protected override render() {
    const label = this.label || ANY_SLOT_LABEL;
    return html`
      <button type="button" class="multi-btn slot-btn" data-zag-part="trigger" aria-label=${slotButtonName(label)}>${label}</button>
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
