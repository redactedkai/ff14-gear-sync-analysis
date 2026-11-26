/* The page's root as one Lit element in light DOM, `<gsa-app class="wrap">`: the title (with the DEV badge of a test build), the tab bar
   with its loading line, the Job and sync strip of the Gear browser, the three tabs' sections (Sheets: `<gsa-sheets-screen>`, How the
   math works: `<gsa-math-screen>`, Gear browser: `<gsa-gear-browser>`), the notes (`<gsa-notes>`) and the footer. Nothing above it
   is a framework: it is the first element of the page, and what it shows and does is the model's (app-root-model.ts).
   - main.js gives it `ports` (the store, the two facades and what a set page needs, AppRootPorts) once, and reaches for no global store;
   - it follows the parts of the store it is made from (`appRootSelection`, app-root-model.ts) and draws again when one changes: a
     change of the Gear browser's filters, of a panel or of a note reaches it, a change inside a screen (a sheet edited) does not;
   - each screen's element is given its own `ports` (made once by the model) and follows the store itself; the Gear browser is given
     its panel, filters and whether its tab is open, and its `browse-edit` events edit the store;
   - the three tabs' sections show by their `hidden` (the open tab's, from the store), so every screen keeps what it drew while another
     tab is open. `.wrap` (the page's column) and `.tab-loading` (a tab is opening) are classes of this element itself;
   - main.js sets `data-started` on <html> once the element's first draw and its screens' first draws are done (startup-failure.js reads
     it), so a draw that throws is a failed start: the error is not caught here (main.js reports it). */
import { LitElement, type TemplateResult, html, nothing } from 'lit';
import { ifDefined } from 'lit/directives/if-defined.js';
import { styleMap } from 'lit/directives/style-map.js';
import { BUILD_MARKS } from '../../build-marks.ts';
import type { AppState } from '../../store/app-state.ts';
import { Select, shallowEq } from '../../store/select.ts';
import './job-strip.ts';
import './notes.ts';
import '../gear-browser/gear-browser.ts';
import '../math-page/math-screen.ts';
import '../sheets/sheets-screen.ts';
import { AppRootModel, type AppRootPorts, appRootSelection, type TabName } from './app-root-model.ts';

/* The style of an element the page hides by `display` (a rule of the stylesheet sets its own display, which `hidden` would not beat). */
const HIDDEN_STYLE = { display: 'none' };

/* The `gsa-app` element (registered below): see the file header. */
export class GsaApp extends LitElement {
  static properties = {
    ports: { attribute: false },
  };

  declare ports: AppRootPorts | null;
  // made once the element has its ports
  private model: AppRootModel | null = null;
  // follows the store once the element has its ports
  private selection: Select<AppState, ReturnType<ReturnType<typeof appRootSelection>>> | null = null;

  constructor() {
    super();
    this.ports = null;
  }

  /* Light DOM: draw into the element itself, so the page's CSS reaches the markup. */
  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  /* Before each draw: once the element has its ports, make the model and start following the store parts the page is made from; then
     mark the page as opening a tab or not. */
  protected override willUpdate(): void {
    const { ports } = this;
    if (ports && !this.model) {
      this.model = new AppRootModel(ports);
      this.selection = new Select(this, ports.store, appRootSelection(ports.store), shallowEq);
    }
    this.classList.toggle('tab-loading', Boolean(this.model?.app.pendingTab));
  }

  /* A tab link of the tab bar: its address (so Open in new tab and Copy link work), `aria-current` and its click. */
  private tabLink(model: AppRootModel, tab: TabName, label: string, className?: string): TemplateResult {
    return html`<a
      id="tablink-${tab}"
      data-tab=${tab}
      href=${model.tabHref(tab)}
      class=${ifDefined(className)}
      aria-current=${ifDefined(model.isCurrent(tab) ? 'page' : undefined)}
      @click=${(event: MouseEvent) => model.goTab(tab, event)}
      >${label}</a
    >`;
  }

  protected override render(): TemplateResult | typeof nothing {
    const { model, selection } = this;
    if (!model || !selection) {
      return nothing;
    }
    const { app, sheets } = model;
    const { tab } = app;
    const strip = model.stripInput();
    const dataSource = model.dataSource ? `${model.dataSource} · ` : '';
    // a test build's marks: the badge by the title, and the test data button (ui/test-data.ts)
    const badge = BUILD_MARKS
      ? html` <span class="build-badge">${BUILD_MARKS.label}</span>
          <button type="button" class="build-badge build-button" @click=${() => model.loadTestData()}>test data</button>`
      : nothing;
    return html`
      <div class="pagetop">
        <header>
          <h1>Gear Sync Analysis${badge}</h1>
        </header>

        <!-- the Gear browser has a Job and sync strip (below); How the math works has its Job menu in the math bar; the Sheets tab has
             neither: a sheet holds its own job, level and sync -->
        <nav class="tabs" aria-label="Sections">
          ${this.tabLink(model, 'sheets', 'Sheets')} ${this.tabLink(model, 'browse', 'Gear browser')}
          ${this.tabLink(model, 'math', 'How the math works', 'aside')}
        </nav>
      </div>
      <div class="tabload" role="status" style=${styleMap(app.pendingTab ? {} : HIDDEN_STYLE)}>${model.loadingText()}</div>

      <!-- The Job and sync strip of the Gear browser: one row under the tab bar, always the same: the Job box (the job's icon, name and code)
           that opens a menu with one line of icons per role, the synced level, the item level and its switch, and Reset. The job is always one
           (Paladin by default). The row is <gsa-job-strip> (elements/app/job-strip.ts), given the Gear browser's panel; its events edit the
           store (a pick in the Job menu, the level, the cap, the switch, Reset). -->
      <section
        class="panel jobstrip"
        aria-label="Job and sync settings"
        style=${styleMap(tab === 'browse' ? {} : HIDDEN_STYLE)}
        data-job=${app.job || ''}
        @job-change=${(event: CustomEvent<string>) => app.setJob(event.detail, 'browse')}
        @level-change=${(event: CustomEvent) => app.editPanel({ level: event.detail })}
        @cap-change=${(event: CustomEvent) => app.editPanel({ cap: event.detail })}
        @sync-change=${(event: CustomEvent<boolean>) => app.editPanel({ sync: event.detail })}
        @strip-reset=${() => app.resetAll()}>
        <gsa-job-strip
          .job=${strip.job}
          .level=${strip.level}
          .cap=${strip.cap}
          .sync=${strip.sync}
          .maxLevel=${strip.maxLevel}
          .maxReal=${strip.maxReal}
          .tab=${strip.tab}></gsa-job-strip>
      </section>

      <!-- SHEETS: <gsa-sheets-screen> (elements/sheets/sheets-screen.ts) draws the sheet manager, a sheet's page, a gear set's page and the
           dialogs. No Job and sync panel on this tab: each sheet holds its own job, level and sync. -->
      <section class="tab" id="tab-sheets" aria-labelledby="tablink-sheets" ?hidden=${tab !== 'sheets'}>
        <gsa-sheets-screen .ports=${model.sheetsPorts}></gsa-sheets-screen>
      </section>

      <!-- THE MATH: what sync does to one piece (Piece stats) and to a full set's GCD (GCD), and the substats' tiers (Substat tiers);
           controls in a sticky bar, each shown on the sub-tabs it applies to -->
      <section class="tab" id="tab-math" aria-labelledby="tablink-math" ?hidden=${tab !== 'math'}>
        <gsa-math-screen .ports=${model.mathPorts}></gsa-math-screen>
      </section>

      <!-- GEAR BROWSER: the title line (the name search with the Slot menu, the match count, Reset filters), the filters (with the Expansion
           and "Gear categories" menus), the result table and its paging. <gsa-gear-browser> is given the browser's panel and filters
           and whether the tab is open; every change of the filters or the sort comes back as a browse-edit event (the detail is the
           patch for the store's editBrowse). -->
      <section class="tab" id="tab-browse" aria-labelledby="b-heading" ?hidden=${tab !== 'browse'}>
        <div @browse-edit=${(event: CustomEvent) => app.editBrowse(event.detail)}>
          <gsa-gear-browser class="panel" .panel=${model.browsePanel()} .browse=${app.browse} .active=${tab === 'browse'}></gsa-gear-browser>
        </div>
      </section>

      <!-- THE NOTES (<gsa-notes>, elements/app/notes.ts): the note after an action and the message of a failed save, at the window's bottom
           on every tab. Both are always in the page, empty when there is nothing to say, so a screen reader announces the text when it
           arrives. The note is cleared when the element says its time is up. -->
      <div class="notes" @note-expire=${() => model.expireNote()}>
        <gsa-notes .note=${sheets.note} .noteSeq=${sheets.noteSeq} .saveMessage=${sheets.saveMessage}></gsa-notes>
      </div>

      <footer>
        <span
          >${dataSource}Speed formulas: AkhMorning · Icons: Remix Icon (Apache 2.0) · HQ symbol: Lodestone font via the
          ewwwin/ffxiv-symbol-fonts mirror · FINAL FANTASY XIV and its job icons © SQUARE ENIX CO., LTD. Unofficial fan tool. Code © 2026
          redactedkai, MIT.</span
        >
        ${BUILD_MARKS ? html`<span class="build-info">${BUILD_MARKS.label} build: ${BUILD_MARKS.where}</span>` : nothing}
      </footer>
    `;
  }
}

customElements.define('gsa-app', GsaApp);

declare global {
  interface HTMLElementTagNameMap {
    'gsa-app': GsaApp;
  }
}
