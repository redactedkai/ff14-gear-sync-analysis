/* The Stat Allocation sub-tab as a Lit element in light DOM: one example piece before and after sync (bars, materia, the two rows of
   the table), the chart of the same slot at every item level, and the step-by-step table; while no sync applies, the sentence that
   says so in place of the two panels. A child of <gsa-math-screen> (docs/engineering/architecture.md section 3):
   - its parent gives it the tab's settings: `job` (Stat Allocation's job id), `sync` (the sync settings,
     job-sync-panel.ts syncSettings), `piece` (the example piece) and `switchOn` (the IL Sync switch); the element reads no store
     and sends no event (the controls that edit the piece are the math bar's);
   - the chart is drawn at its box's width (an `ElementWidthController`), so its text keeps the page's size; the markup comes from
     `overgearChartSvg` (sync-charts.js), whose texts are escaped there (`escapeXml`), and is drawn with `unsafeSVG`;
   - the view is built again only when a setting or the chart's width changes (`viewCache`), by `pieceStatsView`
     (views/piece-stats.js). */
import { LitElement, html, nothing } from 'lit';
import { classMap } from 'lit/directives/class-map.js';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import { makeJobContext } from '../../../core/job-context.ts';
import { meldSlotsOf } from '../../job-sync-panel.ts';
import { pieceStatsView } from '../../views/piece-stats.js';
import { viewCache } from '../../view-cache.ts';
import { ElementWidthController } from '../shared/element-width.ts';
import type { ExamplePiece, SyncSettings } from './math-bar-names.ts';

/* What the screen shows (the shape `pieceStatsView` in views/piece-stats.js builds). The explainer's rows are typed by the parts the
   template reads. */
interface PieceStatsView {
  offText: string;
  explainer: {
    title: string;
    lead: string;
    bars: {
      label: string;
      raw: number;
      total: number;
      extra: number;
      melds: number;
      extraText: string;
      meldText: string;
      keep: string;
      rise: string;
      riseLeft: string;
      cut: string;
      cutLeft: string;
      meldLeft: string;
      meldWidth: string;
      capAt: string;
    }[];
    stoneChips: string[];
    meldNote: string;
    emptyNote: string;
    anyMelds: boolean;
    aboveCapLegend: string;
    capLegend: string;
    solo: boolean;
    vsRows: { il: number; kind: string; tag: string; materia: string; materiaNote: string; points: number }[];
    verdict: string;
    curveBands: { label: string; fill: string; opacity: number }[];
    curveChartSvg: string;
    curveNote: string;
  } | null;
  steps: {
    summary: string;
    byLevel: boolean;
    byLevelText: string;
    shareText: string;
    healerNote: boolean;
    slices: { label: string; share: string; width: number; on: boolean }[];
    status: string;
    ruleText: string;
    ownHead: string;
    capHead: string;
    rows: {
      stat: string;
      label: string;
      weightText: string;
      raw: number;
      ownKept: boolean;
      ownText: string;
      ownFormula: string;
      cap: number | null;
      capText: string;
      capFormula: string;
      lost: number;
      lostText: string;
      syn: number;
    }[];
  };
}

/* The `gsa-piece-stats` element (registered below): see the file header. */
export class GsaPieceStats extends LitElement {
  static properties = {
    job: { attribute: false },
    sync: { attribute: false },
    piece: { attribute: false },
    switchOn: { attribute: false },
  };

  declare job: string;
  declare sync: SyncSettings;
  declare piece: ExamplePiece;
  declare switchOn: boolean;
  private readonly views = viewCache<PieceStatsView>();
  // follows the chart's box (it exists only while a sync applies)
  private readonly chartWidth = new ElementWidthController(this, () => this.querySelector('#p-curve-chart'));

  constructor() {
    super();
    this.job = '';
    this.sync = { cap: null, sync: false, level: null };
    this.piece = { ilvl: null, slot: 'weapon', subs: [], slots: null };
    this.switchOn = false;
  }

  /* Light DOM: draw into the element itself, so the page's CSS reaches the markup. */
  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  /* The screen's view for the settings and the chart's width. */
  private get view(): PieceStatsView {
    const width = this.chartWidth.width;
    const key = JSON.stringify([
      this.job,
      this.sync,
      this.piece.ilvl,
      this.piece.slot,
      this.piece.subs,
      meldSlotsOf(this.piece),
      width,
      this.switchOn,
    ]);
    return this.views.get(key, () => pieceStatsView(makeJobContext(this.job), this.sync, this.piece, { width, switchOn: this.switchOn }));
  }

  /* One stat's bar and its numbers. */
  private renderBar(bar: NonNullable<PieceStatsView['explainer']>['bars'][number]) {
    return html`
      <div class="small">${bar.label}</div>
      <div class="bar"><div class="keep" style=${`width:${bar.keep}`}></div><div class="rise" style=${`left:${bar.riseLeft};width:${bar.rise}`}></div><div class="cut" style=${`left:${bar.cutLeft};width:${bar.cut}`}></div>${
        bar.melds ? html`<div class="meld" style=${`left:${bar.meldLeft};width:${bar.meldWidth}`}></div>` : nothing
      }<div class="capmark" style=${`left:${bar.capAt}`}></div></div>
      <div class="num"><span>${bar.raw}</span> → <b>${bar.total}</b>${
        bar.extra ? html`<span class="gold">${bar.extraText}</span>` : nothing
      }${bar.melds ? html`<span class="meldtxt">${bar.meldText}</span>` : nothing}</div>`;
  }

  /* The panel of one piece before and after sync: bars, materia, legend, and the table against the same slot at the cap. */
  private renderPiecePanel(explainer: NonNullable<PieceStatsView['explainer']>) {
    const first = explainer.vsRows[0];
    return html`
      <div class="panel" id="p-piece">
        <h2>${explainer.title}</h2>
        <p class="small" id="p-lead">${explainer.lead}</p>
        <div class="bars" id="p-bars">
          ${explainer.bars.map(bar => this.renderBar(bar))}
          <div class="small">Materia</div>
          <div class="chips" id="p-materia">
            ${explainer.stoneChips.map(chip => html`<span class="meldchip on">${chip}</span>`)}
            ${explainer.stoneChips.length ? nothing : html`<span class="meldchip" style="visibility: hidden" aria-hidden="true">+0</span>`}
            <span class="small dim meldnote"><span>${explainer.meldNote}</span> ${
              explainer.emptyNote ? html`<span class="emptynote">${explainer.emptyNote}</span>` : nothing
            }</span>
          </div>
        </div>
        <div class="legend">
          <span><i class="box" style="background:var(--accent)"></i>Kept</span>
          ${explainer.anyMelds ? html`<span><i class="box meldbox"></i>Materia</span>` : nothing}
          <span><i class="hatch"></i>Cut by sync</span>
          <span><i class="box" style="background:var(--gold)"></i><span>${explainer.aboveCapLegend}</span></span>
        </div>
        <div class="versus flat" id="p-vs">
          <div class="tablewrap"><table class="compact">
            <colgroup><col class="c-il"><col><col class="c-pts"></colgroup>
            <thead><tr><th>Item level</th><th>Materia</th><th class="n">In the duty</th></tr></thead>
            <tbody>
              ${explainer.vsRows.map(
                row =>
                  html`<tr class=${classMap({ solo: explainer.solo })} data-kind=${row.kind}><td><span>${row.il}</span><div class="dim small">${row.tag}</div></td><td><span>${row.materia}</span><div class="dim small">${row.materiaNote}</div></td><td class="n">${row.points}</td></tr>`,
              )}
              <tr class="spacer" aria-hidden="true" ?hidden=${!explainer.solo}><td>&nbsp;<div class="small">&nbsp;</div></td><td><span>${first.materia}</span><div class="small">${first.materiaNote}</div></td><td></td></tr>
            </tbody>
          </table></div>
          <p class="small"><b>${explainer.verdict}</b></p>
        </div>
      </div>`;
  }

  /* The panel of the same slot at every item level: the legend, the chart and the note under it. */
  private renderCurvePanel(explainer: NonNullable<PieceStatsView['explainer']>) {
    return html`
      <div class="panel" id="p-curve">
        <h2>Overgeared or melded: which has more?</h2>
        <div class="legend" id="p-curve-legend">
          ${explainer.curveBands.map(band => html`<span><i style=${`background:${band.fill};opacity:${band.opacity}`}></i><span>${band.label}</span></span>`)}
          <span><i class="dash"></i><span>${explainer.capLegend}</span></span>
          <span class="ownline"><i style="background:var(--fg);opacity:.12"></i>Overgeared ≥ melded</span>
        </div>
        <div class="chartbox" id="p-curve-chart">${unsafeSVG(explainer.curveChartSvg)}</div>
        ${explainer.curveNote ? html`<p class="callout small" id="p-curve-note">${explainer.curveNote}</p>` : nothing}
      </div>`;
  }

  /* "Stat budget analysis, step by step": the budget's slices and the table of each stat's own value, ceiling and the value in the
     duty. */
  private renderSteps(steps: PieceStatsView['steps']) {
    const synced = steps.status !== 'off';
    return html`
      <details class="panel" id="p-steps">
        <summary>Stat budget analysis, step by step</summary>
        <div id="p-out" class="steps">
          <p class="steps-sum">${steps.summary}</p>
          ${steps.byLevel ? html`<p class="small">${steps.byLevelText}</p>` : nothing}
          <div>
            <p class="small"><b>Where the numbers come from.</b> Every item level has a budget for each stat, and each slot takes a fixed share of it; with both rings the shares add up to the whole budget. <span>${steps.shareText}</span>; its best substat gets all of that (<b>100%</b>), the second <b>70%</b> of it.${
              steps.healerNote
                ? html`<span> Older healer gear (item level 135 and below) also carries a small Direct Hit line at 20%, outside these two.</span>`
                : nothing
            }</p>
            <div class="slices" id="p-slices" role="img" aria-label="Each slot's share of the budget">
              ${steps.slices.map(slice => html`<span class=${classMap({ on: slice.on })} style=${`flex:${slice.width}`}><b>${slice.label}</b><i>${slice.share}</i></span>`)}
            </div>
          </div>
          ${synced ? html`<p class="steps-rule"><b>In the duty, each stat is the lower of two numbers:</b> <span>${steps.ruleText}</span></p>` : nothing}
          <div class="tablewrap"><table class="compact steps-table">
            <thead><tr>
              <th>Stat</th>
              <th>${steps.ownHead}</th>
              ${synced ? html`<th>${steps.capHead}</th><th class="n">In the duty</th>` : nothing}
            </tr></thead>
            <tbody>
              ${steps.rows.map(
                row => html`
                  <tr>
                    <td><b>${row.label}</b><div class="dim small">${row.weightText}</div></td>
                    <td><span class=${classMap({ num: true, big: true, dim: !row.ownKept })}>${row.raw}</span> <span class="small why">${row.ownText}</span><div class="formula">${row.ownFormula}</div></td>
                    ${
                      synced
                        ? html`<td><span class=${classMap({ num: true, big: true, dim: row.ownKept })}>${row.cap}</span> <span class="small why">${row.capText}</span><div class="formula">${row.capFormula}</div></td>
                    <td class="n"><span class=${classMap({ big: true, clamp: Boolean(row.lost) })}>${row.syn}</span>${row.lost ? html`<div class="small clamp">${row.lostText}</div>` : nothing}</td>`
                        : nothing
                    }
                  </tr>`,
              )}
            </tbody>
          </table></div>
        </div>
      </details>`;
  }

  protected override render() {
    if (!this.job) {
      return nothing;
    }
    const view = this.view;
    const explainer = view.explainer;
    return html`
      ${explainer ? nothing : html`<p class="panel empty" id="m-off">${view.offText}</p>`}
      ${explainer ? html`<div class="twopanel">${this.renderPiecePanel(explainer)}${this.renderCurvePanel(explainer)}</div>` : nothing}
      ${this.renderSteps(view.steps)}`;
  }
}

customElements.define('gsa-piece-stats', GsaPieceStats);
