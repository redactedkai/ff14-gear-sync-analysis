/* The tabs of the "Gear categories" menu as a Lit element in light DOM, with a Zag tabs machine: a tab per section with its ticked
   count, and under them each tab's panel of native checkboxes (name, what the box covers, and how many pieces it holds under the
   current filters). All the panels sit in one grid cell and the ones not selected are only invisible, so the menu is as tall as
   the tallest tab and never changes size. The element takes no box of its own (`display: contents`): the tab row and the panels
   are items of the menu's grid. It is the child of <gsa-gear-categories>, which gives it the properties; the element sends
   `categories-change` ({exclude}) when a box is ticked. Zag's tabs select on focus: the arrows, Home and End wrap, and the
   selected tab is the only one in the Tab order. The tab stays selected while the element lives (a closed menu keeps it). */
import * as tabs from '@zag-js/tabs';
import { LitElement, html } from 'lit';
import { live } from 'lit/directives/live.js';
import { ZagController } from '../shared/zag-controller.ts';
import {
  CATEGORIES_CHANGE_EVENT,
  GEAR_FROM_SECTIONS,
  excludeAfterToggle,
  gearFromCountText,
  gearFromCountWords,
  tabCountText,
} from './filter-menu-model.ts';

/* The name of the tab row for a screen reader. */
const TABLIST_NAME = 'Sections of Gear categories';

/* The Zag tabs machine of `host`: one tab per section, the ids the page's tests and labels name, and the panels out of the Tab
   order (the boxes inside them are the stops). */
function makeZag(host: GsaGearSections) {
  return new ZagController(host, {
    name: 'tabs',
    machine: tabs.machine,
    connect: (service, normalize) => tabs.connect(service, normalize),
    getProps: () => ({
      defaultValue: GEAR_FROM_SECTIONS[0].key,
      ids: {
        trigger: (value: string) => `${host.idPrefix}-from-tab-${value}`,
        content: (value: string) => `${host.idPrefix}-from-panel-${value}`,
      },
    }),
    parts: api => ({
      root: api.getRootProps(),
      list: api.getListProps(),
      trigger: GEAR_FROM_SECTIONS.map(tab => api.getTriggerProps({ value: tab.key })),
      content: GEAR_FROM_SECTIONS.map(tab => ({ ...api.getContentProps({ value: tab.key }), tabIndex: -1 })),
    }),
  });
}

/* The `gsa-gear-sections` element (registered below). Properties: `idPrefix` (attribute `id-prefix`: the tabs' ids are
   `<prefix>-from-tab-<section>`, the panels' `<prefix>-from-panel-<section>`), `exclude` (the ACTIVITIES keys left out) and `counts`
   ({box key: pieces}, or null while they are not known). */
export class GsaGearSections extends LitElement {
  static properties = {
    idPrefix: { type: String, attribute: 'id-prefix' },
    exclude: { attribute: false },
    counts: { attribute: false },
  };

  declare idPrefix: string;
  declare exclude: readonly string[];
  declare counts: Readonly<Record<string, number>> | null;
  readonly zag: ReturnType<typeof makeZag>;

  constructor() {
    super();
    this.idPrefix = 'b';
    this.exclude = [];
    this.counts = null;
    this.zag = makeZag(this);
  }

  /* Light DOM: draw into the element itself, so the page's CSS reaches the markup. */
  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  /* A box was ticked or unticked: tells the page the new list of boxes left out. */
  private toggle(key: string, on: boolean): void {
    const detail = { exclude: excludeAfterToggle(this.exclude, key, on) };
    this.dispatchEvent(new CustomEvent(CATEGORIES_CHANGE_EVENT, { detail, bubbles: true, composed: true }));
  }

  protected override render() {
    const prefix = this.idPrefix;
    return html`<div class="from-sections" data-zag-part="root">
      <div class="from-tabs" data-zag-part="list" aria-label=${TABLIST_NAME}>
        ${GEAR_FROM_SECTIONS.map(
          tab =>
            html`<button type="button" data-zag-part="trigger"><span>${tab.title}</span><span class="from-tab-n">${tabCountText(tab, this.exclude)}</span></button>`,
        )}
      </div>
      <div class="from-panels">
        ${GEAR_FROM_SECTIONS.map(
          tab => html`<div class="from-panel ${tab.byRow ? 'by-row' : ''}" style="--rows: ${tab.rows}" data-zag-part="content">
            ${tab.boxes.map(box => {
              const count = this.counts?.[box.key] ?? null;
              const words = gearFromCountWords(count);
              return html`<label class="multi-opt from-opt" title=${words || ''}><input
                  type="checkbox"
                  data-activity=${box.key}
                  aria-describedby="${prefix}-from-hint-${box.key} ${prefix}-from-count-${box.key}"
                  .checked=${live(!this.exclude.includes(box.key))}
                  @change=${(event: Event) => this.toggle(box.key, (event.target as HTMLInputElement).checked)}><span class="from-line"><span class="from-name">${box.label}</span><span class="from-count ${count === 0 ? 'zero' : ''}" aria-hidden="true">${gearFromCountText(count)}</span></span><span class="from-hint" id="${prefix}-from-hint-${box.key}">${box.hint}</span><span hidden id="${prefix}-from-count-${box.key}">${words}</span></label>`;
            })}
          </div>`,
        )}
      </div>
    </div>`;
  }
}

customElements.define('gsa-gear-sections', GsaGearSections);
