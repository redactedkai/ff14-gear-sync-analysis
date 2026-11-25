/* The Gear browser screen as a Lit element in light DOM: the title line (the Slot menu and the name search in one bar, the match
   count, Reset filters), the filters (Expansion, equip level, item level range, Gear categories), the page line and the table.
   It sits in the Alpine-run page as an island (docs/engineering/architecture.md section 3): the page gives it properties from
   a wrapper's `x-effect` and takes the changes of the filters from `browse-edit` (the store's `editBrowse` action). The element
   reads no store.
   - `panel`: the Job and sync panel of the browser's tab ({job, jobCtx, cap, sync, level}: job-sync-panel.js panelOf);
   - `browse`: the browser's filters and sort (the store's frozen `browse`);
   - `active`: the Gear browser is the open tab. The list is built, and the page drawn, only while it is: hidden, the element keeps
     what it shows and does no work.
   The list (views/gear.js gearView) is built by `GearBrowserModel` (gear-browser-model.ts), kept in a field and not in reactive
   state, and frozen: a row is the 50 `tr` of the page, drawn by place with `map` (never `repeat`), so a sort, a page, a slot, a
   filter or a job change keeps the 50 rows and only rebinds their cells. A kept row must show nothing that follows the place and
   not the item: every part of a row comes from the same item in one draw (the smoke step `checkBrowserRowsMatchView` compares
   every row with `view.shown` before each drawn frame). The cells carry `data-was` (the CSS draws the muted line under a synced
   value from it) and the table carries `data-hot` and `data-sorted`, which the column tint's rules (set-page.css) pair with the
   cells, so no cell has a class or a binding for the tint. */
import { LitElement, html, nothing } from 'lit';
import { classMap } from 'lit/directives/class-map.js';
import { guard } from 'lit/directives/guard.js';
import { ifDefined } from 'lit/directives/if-defined.js';
import { live } from 'lit/directives/live.js';
import { repeat } from 'lit/directives/repeat.js';
import { MAX_REAL } from '../../../core/tables.js';
import { TYPING_DEBOUNCE_MS, numberBox } from '../../number-field.js';
import { shownNumber } from '../shared/number-box.ts';
import { SEARCH_MAX_LENGTH } from '../../state.js';
import type { GearList } from './gear-browser-model.ts';
import { BROWSE_EDIT_EVENT, GearBrowserModel, resetPatch, sortPatch, sortState, wantsSearchFocus } from './gear-browser-model.ts';
import type { GearBrowse, GearCell, GearPanel, PageButton } from './gear-browser-model.ts';
import './expansion-menu.ts';
import './gear-categories.ts';
import './slot-menu.ts';
import { CATEGORIES_CHANGE_EVENT, EXPANSION_CHANGE_EVENT } from './filter-menu-model.ts';
import { ANY_SLOT_LABEL, SLOT_CHANGE_EVENT } from './slot-menu-names.ts';

/* The Slot menu's choices before the first list. */
const NO_CHOICES: readonly never[] = Object.freeze([]);

/* A number box of the filters: the key of its setting in `browse`, and the bounds it keeps. */
type BoxKey = 'lvl' | 'min' | 'max';

/* The `gsa-gear-browser` element (registered below): see the file header. */
export class GsaGearBrowser extends LitElement {
  static properties = {
    panel: { attribute: false },
    browse: { attribute: false },
    active: { type: Boolean },
    hotCol: { state: true },
  };

  declare panel: GearPanel | null;
  declare browse: GearBrowse | null;
  declare active: boolean;
  /* the column under the pointer (its data-col key, '' for none or for the Item and Slot columns): its cells are tinted */
  declare hotCol: string;
  /* The list the table shows (null until the tab is first opened). Read by the smoke step that compares the rows with it. */
  view: GearList | null = null;
  private readonly model = new GearBrowserModel();
  private filtered = false;
  // the text of the name search box, and the filter's text it was last given (a change of the filter's text from elsewhere, Clear or
  // Reset filters, sets the box's text)
  private searchText = '';
  private seenQ = '';
  private searchTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly boxes: Record<BoxKey, ReturnType<typeof numberBox>>;

  constructor() {
    super();
    this.panel = null;
    this.browse = null;
    this.active = false;
    this.hotCol = '';
    // a box writes by the page's action; its stored value is `browse`'s
    const box = (key: BoxKey, hi: number) =>
      numberBox(
        () => this.browse?.[key],
        value => this.edit({ [key]: value }),
        1,
        hi,
        { empty: '' },
      );
    this.boxes = { lvl: box('lvl', Infinity), min: box('min', MAX_REAL), max: box('max', MAX_REAL) };
    // the menus inside tell their changes by events that bubble up here; each carries the patch for the filters (a slot's key for the Slot menu)
    this.addEventListener(SLOT_CHANGE_EVENT, event => this.edit({ type: (event as CustomEvent<string>).detail }));
    this.addEventListener(EXPANSION_CHANGE_EVENT, event => this.edit({ expOff: (event as CustomEvent<string[]>).detail }));
    this.addEventListener(CATEGORIES_CHANGE_EVENT, event => this.edit((event as CustomEvent<Record<string, unknown>>).detail));
  }

  /* Light DOM: draw into the element itself, so the page's CSS reaches the markup. */
  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener('keydown', this.onKeydown);
    // the pointer's column is tracked on the element (a pointer-only aid: the tint has no keyboard form), not in the template
    this.addEventListener('mouseover', this.pointAt);
    this.addEventListener('mouseleave', this.pointAway);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener('keydown', this.onKeydown);
    this.removeEventListener('mouseover', this.pointAt);
    this.removeEventListener('mouseleave', this.pointAway);
    clearTimeout(this.searchTimer);
  }

  /* A hidden tab keeps what it shows: no list built, no row drawn (the first draw always is). */
  protected override shouldUpdate(): boolean {
    return this.active || !this.hasUpdated;
  }

  /* Before each draw: the list for the settings now, whether Reset filters shows, the name box's text. */
  protected override willUpdate(): void {
    const { panel, browse } = this;
    if (!panel || !browse) {
      return;
    }
    this.view = this.model.view(panel, browse, this.active);
    this.filtered = GearBrowserModel.filtered(panel, browse);
    if (browse.q !== this.seenQ) {
      this.seenQ = browse.q;
      this.searchText = browse.q;
    }
  }

  /* Tells the page a change of the filters or the sort: `patch` is a part of `browse`. */
  private edit(patch: Record<string, unknown>): void {
    this.dispatchEvent(new CustomEvent(BROWSE_EDIT_EVENT, { detail: patch, bubbles: true, composed: true }));
  }

  /* "/" anywhere on the open tab but in a box jumps to the name search. */
  private readonly onKeydown = (event: KeyboardEvent): void => {
    if (!wantsSearchFocus({ key: event.key, target: event.target as Element }, this.active)) {
      return;
    }
    event.preventDefault();
    this.querySelector<HTMLInputElement>('#b-q')?.focus();
  };

  /* Text was typed in the name search: the filter takes it after the typing wait (TYPING_DEBOUNCE_MS). */
  private typeSearch(event: Event): void {
    this.searchText = (event.target as HTMLInputElement).value;
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.edit({ q: this.searchText }), TYPING_DEBOUNCE_MS);
  }

  /* The × of the name search: the filter's text goes empty at once and the box takes the focus. */
  private clearSearch(): void {
    clearTimeout(this.searchTimer);
    this.edit({ q: '' });
    this.querySelector<HTMLInputElement>('#b-q')?.focus();
  }

  /* A heading was clicked: the table sorts by it (sortPatch). */
  private sortBy(key: string): void {
    if (this.browse) {
      this.edit(sortPatch(this.browse, key));
    }
  }

  /* Reset filters: every filter back to its default (the sort stays). */
  private resetFilters(): void {
    if (this.panel) {
      this.edit(resetPatch(this.panel.jobCtx));
    }
  }

  /* A page button was pressed: shows page `page` and scrolls the table's box back to its first row. */
  private goPage(page: number): void {
    this.model.goPage(page);
    this.requestUpdate();
    const box = this.querySelector('.tablewrap');
    if (box) {
      box.scrollTop = 0;
    }
  }

  /* The pointer is over a cell or a heading: its column's key (data-col) is the hot column; over anything else, '' (the Item and
     Slot columns have none). */
  private readonly pointAt = (event: MouseEvent): void => {
    const cell = (event.target as Element).closest<HTMLElement>('th[data-col], td[data-col]');
    this.hotCol = cell?.dataset.col ?? '';
  };

  /* The pointer left the element: no hot column. */
  private readonly pointAway = (): void => {
    this.hotCol = '';
  };

  private renderBox(key: BoxKey, attributes: { id: string; placeholder?: string; label?: string; max: number }) {
    const box = this.boxes[key];
    return html`<input
      type="number"
      id=${attributes.id}
      min="1"
      max=${attributes.max}
      inputmode="numeric"
      placeholder=${ifDefined(attributes.placeholder)}
      aria-label=${ifDefined(attributes.label)}
      .value=${shownNumber(box)}
      @input=${box.onInput}
      @change=${box.onChange}>`;
  }

  /* The title line: the heading, the search bar, the count and Reset filters. */
  private renderTitleLine(browse: GearBrowse, view: GearList | null) {
    return html`<div class="titleline">
      <h2 id="b-heading">Gear browser</h2>
      <div class="searchbar">
        <gsa-slot-menu
          .choices=${view ? view.slots : NO_CHOICES}
          .label=${view?.slotLabel ?? ANY_SLOT_LABEL}
          .value=${browse.type}></gsa-slot-menu>
        <span class="menu-search big-search"><input
          type="text"
          id="b-q"
          placeholder="Search gear by name"
          autocomplete="off"
          maxlength=${SEARCH_MAX_LENGTH}
          aria-label="Search gear by name"
          .value=${live(this.searchText)}
          @input=${this.typeSearch}><span class="kbd" ?hidden=${Boolean(browse.q)}>/</span><button
          type="button"
          class="clear"
          ?hidden=${!browse.q}
          aria-label="Clear the search"
          @click=${this.clearSearch}>×</button></span>
      </div>
      <span class="count" id="b-count">${view ? view.countText : ''}</span>
      <button
        type="button"
        class=${classMap({ resetbtn: true, off: !this.filtered })}
        id="b-reset"
        ?disabled=${!this.filtered}
        aria-hidden=${String(!this.filtered)}
        title="Reset filters"
        aria-label="Reset filters"
        @click=${this.resetFilters}>Reset</button>
    </div>`;
  }

  /* The filters: Expansion, equip level, item level range, Gear categories. */
  private renderFilters(panel: GearPanel, browse: GearBrowse, view: GearList | null) {
    return html`<div class="grid browse-filters">
      <gsa-expansion-menu
        class="f multi"
        id-prefix="b"
        .off=${browse.expOff}></gsa-expansion-menu>
      <label class="f"><span>Equip level <span class="f-range">1–${panel.jobCtx.maxLevel}</span></span>${this.renderBox('lvl', {
        id: 'b-lvl',
        max: panel.jobCtx.maxLevel,
      })}</label>
      <div class="f field ilvl-field"><span id="b-ilvl-label">Item level <span class="f-range">1–${MAX_REAL}</span></span><div class="pair" role="group" aria-labelledby="b-ilvl-label">${this.renderBox(
        'min',
        { id: 'b-min', placeholder: 'min', label: 'Item level min', max: MAX_REAL },
      )}<span aria-hidden="true">–</span>${this.renderBox('max', {
        id: 'b-max',
        placeholder: 'max',
        label: 'Item level max',
        max: MAX_REAL,
      })}</div></div>
      <gsa-gear-categories
        class="f multi"
        id-prefix="b"
        .exclude=${browse.exclude}
        .market=${Boolean(browse.market)}
        .counts=${view?.fromCounts ?? null}></gsa-gear-categories>
    </div>`;
  }

  /* The page line: the page buttons and the key of the cap bar. */
  private renderPageLine(view: GearList) {
    return html`<div class="tablekey pageline">
      <nav class="pager" id="b-pages" aria-label="Pages"><button type="button" class="step" aria-label="Previous page" ?disabled=${!view.prevPage} @click=${() => this.goPage(view.prevPage ?? 1)}>‹</button>${repeat(
        view.pageButtons as readonly PageButton[],
        button => button.key,
        button =>
          button.page
            ? html`<button
                type="button"
                aria-current=${ifDefined(button.current ? 'page' : undefined)}
                aria-label=${`Page ${button.page}`}
                @click=${() => this.goPage(button.page as number)}>${button.page}</button>`
            : html`<span class="gap" aria-hidden="true">…</span>`,
      )}<button type="button" class="step" aria-label="Next page" ?disabled=${!view.nextPage} @click=${() => this.goPage(view.nextPage ?? 1)}>›</button></nav>
      <p class="small dim" id="b-key" ?hidden=${!view.anySynced}><b class="atcap">48</b> max while synced</p>
    </div>`;
  }

  /* The table's headings: Slot, Item, the two levels and one column for each of the job's stats. */
  private renderHead(panel: GearPanel, browse: GearBrowse) {
    const heading = (key: string, label: string, className?: string) =>
      html`<th class=${ifDefined(className)} data-col=${ifDefined(
        key === 'name' ? undefined : key,
      )} aria-sort=${sortState(browse, key)}><button type="button" class="sortbtn" data-sort=${key} @click=${() => this.sortBy(key)}>${label}</button></th>`;
    return html`<thead><tr><th class="c-slot">Slot</th>${heading('name', 'Item')}${heading('lvl', 'Lv', 'n')}${heading('ilvl', 'ilvl', 'n')}${repeat(
      panel.jobCtx.stats as string[],
      stat => stat,
      stat => heading(stat, panel.jobCtx.short[stat], 'n'),
    )}</tr></thead>`;
  }

  /* The table's rows, by place: row 0 is the first piece of the page whatever it is. Drawn again only when the list changes (a
     pointer moving over the table changes `data-hot` and nothing here). */
  private renderRows(view: GearList) {
    return guard([view], () =>
      view.shown.map(
        x => html`<tr data-key=${x.key} class=${x.rowCls}>
          <td title=${x.slot}><span class="slotname">${x.slotText}</span><span class="x2" ?hidden=${!x.twice}> ×2</span></td><td title=${x.name}>${x.nameParts.map(
            part => html`<span class=${part.cls}>${part.text}</span>`,
          )}<span class="hqg" role="img" aria-label="High quality" ?hidden=${!x.hq}></span></td><td class="n dim" data-col="lvl">${x.lvl}</td><td class="n" data-col="ilvl">${x.ilvl}</td>
          ${(x.cells as GearCell[]).map(cell => html`<td class=${cell.cls} data-col=${cell.col} data-was=${ifDefined(cell.was ?? undefined)}><span>${cell.text}</span></td>`)}
        </tr>`,
      ),
    );
  }

  protected override render() {
    const { panel, browse, view } = this;
    if (!panel || !browse) {
      return nothing;
    }
    const hasRows = view !== null && view.shown.length > 0;
    return html`${this.renderTitleLine(browse, view)}${this.renderFilters(panel, browse, view)}${view ? this.renderPageLine(view) : nothing}
      <div class="tablewrap tall"><table
        id="gear-table"
        data-hot=${this.hotCol}
        data-sorted=${browse.sort}
>
        ${
          view && !hasRows
            ? html`<tbody><tr><td class="empty">No gear matches these filters. ${
                this.filtered ? html`<button type="button" class="linkbtn" @click=${this.resetFilters}>Reset filters</button>` : nothing
              }</td></tr></tbody>`
            : nothing
        }
        ${hasRows ? this.renderHead(panel, browse) : nothing}
        ${hasRows ? html`<tbody>${this.renderRows(view)}</tbody>` : nothing}
      </table></div>`;
  }
}

customElements.define('gsa-gear-browser', GsaGearBrowser);
