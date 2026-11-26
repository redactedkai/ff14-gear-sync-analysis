/* The Expansion filter's menu as a Lit element in light DOM: a button that says which expansions are on and a Zag popover of
   native checkboxes (filter-popover.ts has the keys, the focus and the place). It sits inside the Gear browser and
   Auto-fill settings (docs/engineering/architecture.md section 3): its parent gives it `off` and nothing else;
   the element sends `expansion-change` with the new list of switched-off expansions as `detail`. It reads no store. */
import { LitElement, html } from 'lit';
import { live } from 'lit/directives/live.js';
import { EXPANSIONS } from '../../../core/constants.ts';
import { EXPANSION_CHANGE_EVENT, EXPANSION_LABEL, expOffAfterToggle, expansionSummary } from './filter-menu-model.ts';
import { createFilterPopover } from './filter-popover.ts';

/* The `gsa-expansion-menu` element (registered below). Properties: `idPrefix` (attribute `id-prefix`: 'b' the Gear browser, 's' the
   Auto-fill settings; it makes the ids of the button `<prefix>-exp`, the panel `<prefix>-exp-menu` and the label) and `off` (the
   EXPANSIONS short names switched off). */
export class GsaExpansionMenu extends LitElement {
  static properties = { idPrefix: { type: String, attribute: 'id-prefix' }, off: { attribute: false } };

  declare idPrefix: string;
  declare off: readonly string[];
  readonly layer: ReturnType<typeof createFilterPopover>;

  constructor() {
    super();
    this.idPrefix = 'b';
    this.off = [];
    this.layer = createFilterPopover({
      element: this,
      triggerId: () => `${this.idPrefix}-exp`,
      contentId: () => `${this.idPrefix}-exp-menu`,
      labelId: () => `${this.idPrefix}-exp-label`,
      placement: 'bottom-start',
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

  /* A box was ticked or unticked: tells the page the new list of switched-off expansions. */
  private toggle(short: string, on: boolean): void {
    const detail = expOffAfterToggle(this.off, short, on);
    this.dispatchEvent(new CustomEvent(EXPANSION_CHANGE_EVENT, { detail, bubbles: true, composed: true }));
  }

  protected override render() {
    const prefix = this.idPrefix;
    return html`
      <span id="${prefix}-exp-label">${EXPANSION_LABEL}</span>
      <button type="button" class="multi-btn" data-zag-part="trigger" aria-labelledby="${prefix}-exp-label ${prefix}-exp">${expansionSummary(this.off)}</button>
      <div data-zag-part="positioner">
        <div class="multi-menu" data-zag-part="content">
          ${EXPANSIONS.map(
            (expansion: { short: string; name: string }) => html`<label class="multi-opt"><input
              type="checkbox"
              data-exp=${expansion.short}
              .checked=${live(!this.off.includes(expansion.short))}
              @change=${(event: Event) => this.toggle(expansion.short, (event.target as HTMLInputElement).checked)}><span>${expansion.name}</span></label>`,
          )}
        </div>
      </div>
    `;
  }
}

customElements.define('gsa-expansion-menu', GsaExpansionMenu);
