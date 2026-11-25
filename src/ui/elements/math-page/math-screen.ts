/* The Math tab's screen as one Lit element in light DOM: the sticky bar (`<gsa-math-bar>`: the sub-tab links, the "?" help, the Job
   menu and the controls of the open sub-tab) and the three sub-tabs, Stat Allocation (`<gsa-piece-stats>`), GCD Scaling
   (`<gsa-gcd-view>`) and Substat tiers (`<gsa-tiers-view>`). The tab's own section (`#tab-math`, its `hidden`) stays in the page's
   frame, and the element takes no box of its own (math-bar.css), so the bar and the sub-tabs are the section's flex items.
   - the page gives it `ports` (the store, to follow, and the app facade, to read and to act) once, from main.js; it reads no `$store`;
   - it follows the parts of the store that its children's inputs are made from (`mathSelection`, math-inputs.ts) and draws again when
     one changes; the inputs themselves are made by the plain functions of math-inputs.ts, new objects on each draw;
   - it takes the children's events and edits the store: a pick in the Job menu (edits the open sub-tab's job: mathJobOwner), a click on a
     sub-tab link, a change of the example piece, the Level, Synced IL and IL Sync controls of the Sync settings popover, and the GCD and
     Substat tiers controls' own events.
   The controls row is a container for the breakpoints (math-bar.css), in sections (.divided ones have a rule before them that only shows
   when the section is not first on its line). Stat Allocation: Job | Piece (Slot, Substats and materia) and Sync, with no rule between
   them | Item level. Substat tiers: Job | Level. GCD Scaling has one section and no rule. */
import { LitElement, type TemplateResult, html, nothing } from 'lit';
import type { AppFacade } from '../../store/app-facade.ts';
import type { AppState, AppStore } from '../../store/app-state.ts';
import { Select, shallowEq } from '../../store/select.ts';
import './gcd-view.ts';
import './math-bar.ts';
import './piece-stats.ts';
import './tiers-view.ts';
import { barInput, mathSelection, pieceInput, setMathJob, setMathSync } from './math-inputs.ts';

/* What the screen needs of the rest of the page: the store (to follow) and the app facade (to read, and its actions). */
export interface MathScreenPorts {
  store: AppStore;
  app: AppFacade;
}

/* The `gsa-math-screen` element (registered below): see the file header. */
export class GsaMathScreen extends LitElement {
  static properties = {
    ports: { attribute: false },
  };

  declare ports: MathScreenPorts | null;
  // follows the store once the element has its ports
  private selection: Select<AppState, ReturnType<typeof mathSelection>> | null = null;

  constructor() {
    super();
    this.ports = null;
  }

  /* Light DOM: draw into the element itself, so the page's CSS reaches the markup. */
  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  /* Before each draw: once the element has its ports, start following the store parts the inputs are made from. */
  protected override willUpdate(): void {
    if (this.ports && !this.selection) {
      this.selection = new Select(this, this.ports.store, mathSelection, shallowEq);
    }
  }

  protected override render(): TemplateResult | typeof nothing {
    const { ports, selection } = this;
    if (!ports || !selection) {
      return nothing;
    }
    const { app } = ports;
    const { mathTab } = selection.value;
    const bar = barInput(app);
    const piece = pieceInput(app);
    const onGcdEdit = (event: CustomEvent) => app.editGcd(event.detail);
    return html`
      <div
        class="mathbar"
        id="m-bar"
        @job-change=${(event: CustomEvent<string>) => setMathJob(app, event.detail)}
        @math-sub=${(event: CustomEvent<string>) => app.showSub(event.detail)}
        @piece-edit=${(event: CustomEvent) => app.editPiece(event.detail)}
        @gcd-edit=${onGcdEdit}
        @tiers-level=${(event: CustomEvent<{ level: number | null }>) => app.setTiersLevel(event.detail.level)}
        @level-change=${(event: CustomEvent) => {
          app.editPanel({ level: event.detail });
          app.followLevelSync();
        }}
        @cap-change=${(event: CustomEvent) => app.editPanel({ cap: event.detail })}
        @sync-change=${(event: CustomEvent<boolean>) => setMathSync(app, event.detail)}>
        <gsa-math-bar
          .tab=${bar.tab}
          .jobId=${bar.jobId}
          .pieceJob=${bar.pieceJob}
          .sync=${bar.sync}
          .syncPanel=${bar.syncPanel}
          .openTab=${bar.openTab}
          .levelScope=${bar.levelScope}
          .maxReal=${bar.maxReal}
          .piece=${bar.piece}
          .gcd=${bar.gcd}
          .tiers=${bar.tiers}></gsa-math-bar>
      </div>

      <!-- PIECE STATS: one piece before and after sync, and the same slot at every item level (views/piece-stats.js) -->
      <section class="subtab" id="tab-piece" ?hidden=${mathTab !== 'piece'}>
        <gsa-piece-stats .job=${piece.job} .sync=${piece.sync} .piece=${piece.piece} .switchOn=${piece.switchOn}></gsa-piece-stats>
      </section>

      <!-- GCD: how speed becomes the GCD at a level, on its own settings (views/gcd.js) -->
      <section class="subtab" id="tab-gcd" ?hidden=${mathTab !== 'gcd'} @gcd-edit=${onGcdEdit}>
        <gsa-gcd-view .level=${bar.gcd.level} .haste=${bar.gcd.haste} .speed=${bar.gcd.speed} .syncedLevel=${bar.gcd.syncedLevel}></gsa-gcd-view>
      </section>

      <!-- TIERS: every tier of each substat, a card per substat; not about sync, so it shows whatever the sync settings -->
      <section class="subtab" id="tab-tiers" ?hidden=${mathTab !== 'tiers'}>
        <gsa-tiers-view .job=${bar.tiers.job} .typedLevel=${bar.tiers.level} .shown=${mathTab === 'tiers'}></gsa-tiers-view>
      </section>
    `;
  }
}

customElements.define('gsa-math-screen', GsaMathScreen);

declare global {
  interface HTMLElementTagNameMap {
    'gsa-math-screen': GsaMathScreen;
  }
}
