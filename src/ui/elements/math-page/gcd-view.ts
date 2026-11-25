/* The GCD Scaling sub-tab as a Lit element in light DOM: the facts for a speed, the chart of the speed one 0.01 s step takes at
   every level, and the table of GCD steps. A child of <gsa-math-screen> (docs/engineering/architecture.md section 3):
   - its parent gives it the tab's settings: `level` (the level typed into the tab's box, or null),
     `syncedLevel` (Stat Allocation's), `haste` (a haste job id, or '') and `speed` (the speed asked for, or null); the element
     reads no store;
   - a click on a bar of the chart or on a row of the table sends `gcd-edit` (`detail`: `{level}` or `{speed}`); the page then
     edits its settings and gives them back (a row past the most any job can have does nothing);
   - the chart is drawn at its box's width (an `ElementWidthController`), so its text keeps the page's size; the markup comes from
     `speedStepChartSvg` (sync-charts.js), whose texts are escaped there (`escapeXml`), and is drawn with `unsafeSVG`;
   - the view is built again only when a setting or the chart's width changes (`viewCache`). */
import { LitElement, html } from 'lit';
import { classMap } from 'lit/directives/class-map.js';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { gcdTabLevel, gcdView } from '../../views/gcd.js';
import { viewCache } from '../../view-cache.ts';
import { ElementWidthController } from '../shared/element-width.ts';
import { GCD_EDIT_EVENT } from './gcd-names.ts';

/* What the tab shows (the shape `gcdView` in views/gcd.js builds). */
interface GcdTabView {
  facts: { value: string; label: string }[];
  steps: { speed: number; gcd: string; cut: string; cur: boolean; out: boolean }[];
  chartSvg: string;
}

/* The `gsa-gcd-view` element (registered below): see the file header. */
export class GsaGcdView extends LitElement {
  static properties = {
    level: { attribute: false },
    syncedLevel: { attribute: false },
    haste: { attribute: false },
    speed: { attribute: false },
  };

  declare level: number | null;
  declare syncedLevel: number;
  declare haste: string;
  declare speed: number | null;
  private readonly views = viewCache<GcdTabView>();
  // follows the chart's box width in px (0 until it has a width: the page's tab is hidden until opened)
  private readonly chartWidth = new ElementWidthController(this, () => this.querySelector('#g-chart'));

  constructor() {
    super();
    this.level = null;
    this.syncedLevel = 1;
    this.haste = '';
    this.speed = null;
  }

  /* Light DOM: draw into the element itself, so the page's CSS reaches the markup. */
  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  /* After the first draw the chart's box exists: a click on a bar of the chart picks its level. */
  protected override firstUpdated(): void {
    // a pointer shortcut only: the Level box beside the chart is the keyboard way to the same setting, so the box has no key handler
    this.querySelector('#g-chart')?.addEventListener('click', event => this.pickLevel(event));
  }

  /* The tab's view (views/gcd.js gcdView) for the settings and the chart's width. */
  private get view(): GcdTabView {
    const level = gcdTabLevel(this.level, this.syncedLevel);
    const width = this.chartWidth.width;
    const key = [level, this.haste, this.speed, width].join('|');
    return this.views.get(key, () => gcdView(level, this.haste, this.speed, width));
  }

  private edit(patch: { level: number } | { speed: number }): void {
    this.dispatchEvent(new CustomEvent(GCD_EDIT_EVENT, { detail: patch, bubbles: true }));
  }

  /* A bar of the chart: its level. */
  private pickLevel(event: Event): void {
    const bar = (event.target as Element).closest<HTMLElement>('[data-level]');
    if (bar) {
      this.edit({ level: Number(bar.dataset.level) });
    }
  }

  /* A step of the table: its speed (none past the most any job can have). */
  private pickSpeed(row: { speed: number; out: boolean }): void {
    if (!row.out) {
      this.edit({ speed: row.speed });
    }
  }

  protected override render() {
    const view = this.view;
    return html`
      <div class="gcdgrid">
        <div class="panel" id="g-facts"><div class="gfacts">${view.facts.map(fact => html`<div><b>${fact.value}</b><span>${fact.label}</span></div>`)}</div></div>
        <div class="panel" id="g-curve">
          <h2>Speed per 0.01 s, by level</h2>
          <p class="small dim">How much speed it takes to shorten the GCD by 0.01 s at each level. Click a bar to see that level.</p>
          <div class="chartbox" id="g-chart">${unsafeSVG(view.chartSvg)}</div>
        </div>
        <div class="panel" id="g-steps">
          <h2>GCD steps</h2>
          <table class="compact gsteps" id="g-table">
            <thead><tr><th class="n">Speed</th><th class="n">GCD</th><th class="n">Reduction</th></tr></thead>
            <tbody>${view.steps.map(
              row =>
                html`<tr class=${classMap({ cur: row.cur, out: row.out })} @click=${() => this.pickSpeed(row)}><td class="n">${row.speed}</td><td class="n">${row.gcd}</td><td class="n">${row.cut}</td></tr>`,
            )}</tbody>
          </table>
        </div>
      </div>
    `;
  }
}

customElements.define('gsa-gcd-view', GsaGcdView);
