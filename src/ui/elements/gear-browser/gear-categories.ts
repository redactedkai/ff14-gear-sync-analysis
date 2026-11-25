/* The "Gear categories" filter's menu as a Lit element in light DOM: a button (the count of boxes on and the market board glyph)
   and a Zag popover that holds the market board switch, All / None / Default and <gsa-gear-sections> (the tabs and their boxes);
   filter-popover.ts has the keys, the focus and the place. It sits inside the Gear browser and Auto-fill settings
   (docs/engineering/architecture.md section 3): its parent gives it `exclude`, `market` and `counts`; the element sends
   `categories-change` with `detail` the patch for the filter's settings ({exclude} or {market}). It reads no store.
   The head's buttons come last in the markup, so the Tab order is the switch, the tabs, the boxes, then All / None / Default;
   the CSS puts them in the head. */
import { LitElement, html } from 'lit';
import { live } from 'lit/directives/live.js';
import './gear-sections.ts';
import {
  CATEGORIES_CHANGE_EVENT,
  CATEGORIES_LABEL,
  MARKET_SWITCH_LABEL,
  excludeAfterAll,
  gearFromSummary,
  marketWords,
} from './filter-menu-model.ts';
import { createFilterPopover } from './filter-popover.ts';

/* The market stall glyph's path (24 x 24), drawn in the button: gold when market board gear is searched, red and slashed when not. */
const MARKET_GLYPH_PATH =
  'M21 13.2422V20H22V22H2V20H3V13.2422C1.79401 12.435 1 11.0602 1 9.5C1 8.67286 1.22443 7.87621 1.63322 7.19746L4.3453 2.5C4.52393 2.1906 4.85406 2 5.21132 2H18.7887C19.1459 2 19.4761 2.1906 19.6547 2.5L22.3575 7.18172C22.7756 7.87621 23 8.67286 23 9.5C23 11.0602 22.206 12.435 21 13.2422ZM19 13.9725C18.8358 13.9907 18.669 14 18.5 14C17.2409 14 16.0789 13.478 15.25 12.6132C14.4211 13.478 13.2591 14 12 14C10.7409 14 9.5789 13.478 8.75 12.6132C7.9211 13.478 6.75911 14 5.5 14C5.331 14 5.16417 13.9907 5 13.9725V20H19V13.9725ZM5.78865 4L3.35598 8.21321C3.12409 8.59843 3 9.0389 3 9.5C3 10.8807 4.11929 12 5.5 12C6.53096 12 7.44467 11.3703 7.82179 10.4295C8.1574 9.59223 9.3426 9.59223 9.67821 10.4295C10.0553 11.3703 10.969 12 12 12C13.031 12 13.9447 11.3703 14.3218 10.4295C14.6574 9.59223 15.8426 9.59223 16.1782 10.4295C16.5553 11.3703 17.469 12 18.5 12C19.8807 12 21 10.8807 21 9.5C21 9.0389 20.8759 8.59843 20.6347 8.19746L18.2113 4H5.78865Z';
/* The slash through the glyph, from the lower left to the upper right (the market board left out). */
const MARKET_SLASH_PATH = 'M2 22L22 2';
/* The glyph's side, in px. */
const MARKET_GLYPH_SIZE_PX = 18;

/* The `gsa-gear-categories` element (registered below). Properties: `idPrefix` (attribute `id-prefix`: 'b' the Gear browser, 's'
   the Auto-fill settings; it makes the ids of the button `<prefix>-from`, the panel `<prefix>-from-menu` and the switch
   `<prefix>-market`), `exclude` (the ACTIVITIES keys left out), `market` (whether market board gear is searched) and `counts`
   ({box key: pieces under the current filters}, or null while they are not known). */
export class GsaGearCategories extends LitElement {
  static properties = {
    idPrefix: { type: String, attribute: 'id-prefix' },
    exclude: { attribute: false },
    market: { type: Boolean },
    counts: { attribute: false },
  };

  declare idPrefix: string;
  declare exclude: readonly string[];
  declare market: boolean;
  declare counts: Readonly<Record<string, number>> | null;
  readonly layer: ReturnType<typeof createFilterPopover>;

  constructor() {
    super();
    this.idPrefix = 'b';
    this.exclude = [];
    this.market = true;
    this.counts = null;
    // the panel is wider than the button: its right edge is on the button's, so it stays over the page's card
    this.layer = createFilterPopover({
      element: this,
      triggerId: () => `${this.idPrefix}-from`,
      contentId: () => `${this.idPrefix}-from-menu`,
      labelId: () => `${this.idPrefix}-from-label`,
      placement: 'bottom-end',
    });
  }

  /* Light DOM: draw into the element itself, so the page's CSS reaches the markup. */
  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.layer.bridge.release();
  }

  /* After each draw (Zag's attributes are on the parts by now) the layer is registered with the page's manager, or dropped. */
  protected override updated(): void {
    this.layer.bridge.sync();
  }

  /* Tells the page the patch for the filter's settings. */
  private change(detail: { exclude: string[] } | { market: boolean }): void {
    this.dispatchEvent(new CustomEvent(CATEGORIES_CHANGE_EVENT, { detail, bubbles: true, composed: true }));
  }

  protected override render() {
    const prefix = this.idPrefix;
    const words = marketWords(this.market);
    return html`
      <div class="from-anchor" data-zag-part="anchor">
        <span id="${prefix}-from-label">${CATEGORIES_LABEL}</span>
        <button type="button" class="multi-btn from-btn" data-zag-part="trigger" aria-labelledby="${prefix}-from-label ${prefix}-from" title=${words}>
          <span class="from-text">${gearFromSummary(this.exclude)}</span>
          <svg class="from-market ${this.market ? 'on' : 'off'}" width=${MARKET_GLYPH_SIZE_PX} height=${MARKET_GLYPH_SIZE_PX} viewBox="0 0 24 24" role="img" aria-label=${words}>
            <path fill="currentColor" d=${MARKET_GLYPH_PATH}></path>
            <g><path class="from-slash-gap" d=${MARKET_SLASH_PATH}></path><path class="from-slash" d=${MARKET_SLASH_PATH}></path></g>
          </svg>
        </button>
      </div>
      <div data-zag-part="positioner">
        <div class="multi-menu from-menu" data-zag-part="content">
          <label class="from-switch"><input
            type="checkbox"
            role="switch"
            aria-checked=${String(this.market)}
            id="${prefix}-market"
            .checked=${live(this.market)}
            @change=${(event: Event) => this.change({ market: (event.target as HTMLInputElement).checked })}><span>${MARKET_SWITCH_LABEL}</span></label>
          <gsa-gear-sections id-prefix=${prefix} .exclude=${this.exclude} .counts=${this.counts}></gsa-gear-sections>
          <div class="from-acts">
            <button type="button" class="linkbtn" data-action="all" @click=${() => this.change({ exclude: excludeAfterAll('all') })}>All</button>
            <button type="button" class="linkbtn" data-action="none" @click=${() => this.change({ exclude: excludeAfterAll('none') })}>None</button>
            <button type="button" class="linkbtn" data-action="default" @click=${() => this.change({ exclude: excludeAfterAll('default') })}>Default</button>
          </div>
        </div>
      </div>
    `;
  }
}

customElements.define('gsa-gear-categories', GsaGearCategories);
