/* A drop-down choice of one option, as a Lit element in light DOM with a Zag select machine: a button that shows the chosen
   option and a list of options. It stands in for the page's native `<select>`s (the Slot, substat, Materia slots, Haste, Goal,
   Race / Clan and Party bonus boxes), whose list the browser draws and the page cannot place, size or test the same in every
   engine. It sits in the Alpine-run page as an island (docs/engineering/architecture.md section 3): a wrapper's `x-effect` gives it
   properties and the wrapper listens for `change`; the element reads no store.
   Properties:
   - `options`: the choices in order, `{ value, label, group? }` (the page's `[value, label]` lists made into objects); a run of
     options with the same `group` sits under that heading; `value` may be '' (an option that means none);
   - `value`: the chosen option's value; the element never changes it: a pick sends `change` (`detail`: the value) and the page
     sets `value` (or does not: a refused edit leaves the old choice shown);
   - `buttonId` (attribute `button-id`): the id of the button (the page's `<label for>`, its tests and its focus calls name it); the
     list is `<id>-list`;
   - `label`: the accessible name of the button and of the list (the words of the page's own `<label>`, which still focuses the
     button when it is pressed, since a button is a labelable element);
   - `disabled`.
   Keys: ArrowDown, ArrowUp, Enter and Space on the button open the list on the chosen option; typing letters on the closed
   button picks the next option that starts with them, and in the open list lights it; the arrows, Home and End move; Enter or a
   click picks and closes with the focus back on the button; Escape closes and keeps the value; a press outside closes; Tab
   closes and the focus moves on (Zag's select would hold it: `closeOnTab`). The button's focus ring follows the last input
   (`trackLastInput`). The open list is a layer of the page's overlay manager (the bridge), so opening a menu closes it and a
   change of screen closes it; inside the Auto-fill settings popover or the math bar's Substats & materia popover it is a
   child of that popover's layer (it stays open under it), and in the settings popover it is `fixed` to the window, so the popover's
   scroll box does not cut it. */
import * as select from '@zag-js/select';
import { LitElement, html, nothing } from 'lit';
import { ifDefined } from 'lit/directives/if-defined.js';
import { closeOnTab, trackLastInput } from './key-focus.ts';
import { createOverlayBridge } from './overlay-bridge.ts';
import { SELECT_CHANGE_EVENT, SELECT_LIST_SUFFIX } from './select-names.ts';
import { NESTED_LAYER_LISTENERS, ZagController } from './zag-controller.ts';

/* The gap between the button and the open list, in px. */
const LIST_GAP_PX = 4;
/* The attribute of an element that is a layer of the overlay manager, holding the layer's id (the Auto-fill settings popover). */
const LAYER_ATTRIBUTE = 'data-overlay-layer';
/* The attribute that names a Zag element and its machine's id; the math bar's popover's layer id in the manager is that id. */
const ZAG_HOST_ATTRIBUTE = 'data-zag-host';
/* The layer whose scroll box cuts what is absolute inside it (the Auto-fill settings popover): a list in it is placed against the
   window. */
const FIXED_LAYER_ID = 'settings';

/* One option of the list: the value the page works with, the words, and the group it belongs to (none: no heading). */
export interface SelectOption {
  value: string;
  label: string;
  group?: string;
}

/* A run of options under one heading (`heading` is undefined for options with no group). */
interface Section {
  heading?: string;
  options: SelectOption[];
}

/* The id of the overlay layer `element` sits in: the nearest layer the page marks (`data-overlay-layer`), else the nearest Zag element
   around it (the math bar's popover), else null for the page. */
function parentLayerOf(element: Element): string | null {
  const marked = element.closest(`[${LAYER_ATTRIBUTE}]`)?.getAttribute(LAYER_ATTRIBUTE);
  if (marked) {
    return marked;
  }
  return element.parentElement?.closest(`[${ZAG_HOST_ATTRIBUTE}]`)?.getAttribute(ZAG_HOST_ATTRIBUTE) ?? null;
}

/* The collection Zag's select reads for `options`: a value and its words. */
function collectionOf(options: readonly SelectOption[]) {
  return select.collection({
    items: [...options],
    itemToValue: option => option.value,
    itemToString: option => option.label,
  });
}

/* The options cut into runs of the same group, in order. */
function sectionsOf(options: readonly SelectOption[]): Section[] {
  const sections: Section[] = [];
  for (const option of options) {
    const last = sections.at(-1);
    if (last && last.heading === option.group) {
      last.options.push(option);
    } else {
      sections.push({ heading: option.group, options: [option] });
    }
  }
  return sections;
}

/* The Zag select of `host`: its props, the attributes of each part (the button, the positioner, the list, the rows, the group
   headings) and the tie to the page's overlay manager. */
function makeZag(host: GsaSelect) {
  return new ZagController(host, {
    name: 'select',
    machine: select.machine,
    connect: (service, normalize) => select.connect(service, normalize),
    getProps: () => ({
      ids: { trigger: host.buttonId || undefined, content: host.buttonId ? `${host.buttonId}${SELECT_LIST_SUFFIX}` : undefined },
      collection: host.collection(),
      value: [host.value],
      disabled: host.disabled,
      // below the button, or above it when that side has more room; the list is no taller than the room on its side (the CSS reads
      // Zag's `--available-height`) and scrolls inside. The room is the window's: floating-ui would take the math bar (overflow-x: clip)
      // for the box that cuts the list, and find 10 px under the button.
      positioning: {
        placement: 'bottom-start' as const,
        gutter: LIST_GAP_PX,
        boundary: () => ({ x: 0, y: 0, width: innerWidth, height: innerHeight }),
        strategy: parentLayerOf(host) === FIXED_LAYER_ID ? ('fixed' as const) : ('absolute' as const),
        ...(parentLayerOf(host) ? { listeners: NESTED_LAYER_LISTENERS } : {}),
      },
      onValueChange: ({ value }) => {
        host.dispatchEvent(new CustomEvent(SELECT_CHANGE_EVENT, { detail: value[0] ?? '', bubbles: true, composed: true }));
      },
      // the focus moved to another control by a script (not by Tab or a press, which have their own ways out): the list closes and
      // the focus stays where it went
      onFocusOutside: event => {
        event.preventDefault();
        host.zag.closeWithoutFocus();
      },
    }),
    parts: api => {
      const headings = host.sections().filter(section => section.heading !== undefined);
      return {
        trigger: api.getTriggerProps(),
        positioner: api.getPositionerProps(),
        content: api.getContentProps(),
        item: host.options.map(option => api.getItemProps({ item: option })),
        group: headings.map((_, index) => api.getItemGroupProps({ id: String(index) })),
        'group-label': headings.map((_, index) => api.getItemGroupLabelProps({ htmlFor: String(index) })),
      };
    },
  });
}

/* The `gsa-select` element (registered below); see the file header. */
export class GsaSelect extends LitElement {
  static properties = {
    options: { attribute: false },
    value: { type: String },
    buttonId: { type: String, attribute: 'button-id' },
    label: { type: String },
    disabled: { type: Boolean },
  };

  declare options: readonly SelectOption[];
  declare value: string;
  declare buttonId: string;
  declare label: string;
  declare disabled: boolean;
  readonly zag: ReturnType<typeof makeZag>;
  readonly bridge: ReturnType<typeof createOverlayBridge>;
  // the collection of `options`, made again only when the page gives another list
  #collectionFor: readonly SelectOption[] | null = null;
  #collection: ReturnType<typeof collectionOf> | null = null;

  constructor() {
    super();
    this.options = [];
    this.value = '';
    this.buttonId = '';
    this.label = '';
    this.disabled = false;
    this.zag = makeZag(this);
    this.bridge = createOverlayBridge({
      id: this.zag.id,
      api: () => this.zag.api,
      closeWithoutFocus: () => this.zag.closeWithoutFocus(),
      root: () => this.querySelector('[data-zag-part="content"]'),
      opener: () => this.querySelector('[data-zag-part="trigger"]'),
      parent: () => parentLayerOf(this),
    });
    closeOnTab(this, this.zag);
    trackLastInput(this);
  }

  /* The Zag collection of the current `options`. */
  collection() {
    if (this.#collection === null || this.#collectionFor !== this.options) {
      this.#collection = collectionOf(this.options);
      this.#collectionFor = this.options;
    }
    return this.#collection;
  }

  /* The options in runs of the same group, in order. */
  sections(): Section[] {
    return sectionsOf(this.options);
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
     manager, or dropped from it; a closed list forgets where it was placed, so the next opening is not taken for a placed one a
     frame early. */
  protected override updated(): void {
    this.bridge.sync();
    if (this.zag.machine && !this.zag.api.open) {
      this.zag.clearPlacement();
    }
  }

  protected override render() {
    const chosen = this.options.find(option => option.value === this.value);
    const name = this.label || undefined;
    return html`
      <button type="button" class="sel-btn" data-zag-part="trigger" data-value=${this.value} aria-label=${ifDefined(name)}>${chosen?.label ?? nothing}</button>
      <div data-zag-part="positioner">
        <div class="multi-menu sel-menu" data-zag-part="content" aria-label=${ifDefined(name)}>
          ${this.sections().map(section => {
            const rows = section.options.map(option => html`<div class="multi-opt sel-opt" data-zag-part="item">${option.label}</div>`);
            if (section.heading === undefined) {
              return rows;
            }
            return html`<div class="sel-group" data-zag-part="group"><div class="sel-group-label" data-zag-part="group-label">${section.heading}</div>${rows}</div>`;
          })}
        </div>
      </div>
    `;
  }
}

customElements.define('gsa-select', GsaSelect);
