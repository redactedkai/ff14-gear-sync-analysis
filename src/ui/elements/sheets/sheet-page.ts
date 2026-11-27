/* A sheet's page (the Sheets tab's second level) as one Lit element in light DOM: the breadcrumb with the sheet switcher, the sheet's
   name, description and buttons, its settings (level, item level, IL Sync, Race / Clan, Party bonus), and the list of its gear sets
   with the Effects / Stat points switch and sortable headings.
   It sits inside the Sheets screen (sheets-screen.ts):
   - the screen gives it properties (`view`, `figures`, `sheetId`, `clan`, `partyRoles`, `switcher`, `busy`, `dialogOpen`) and listens
     for `sheet-action` (sheet-action.ts) and the switcher's `switch-pick`; the element never reads a store;
   - it draws nothing while `view` is null (another screen is open) and keeps its own state while it is: the list's sort (back to
     the saved order when the Effects / Stat points switch or the open sheet changes) and the cap the page last lowered (for the note
     under the item level box);
   - the level and item level boxes are the shared fields `<gsa-level-field>` and `<gsa-cap-field>` (elements/app/): typing commits after
     a pause, a step at once; an edit asks the page and the page answers in the event's `result` (a lowered cap is given to the item
     level field, which shows its note and flashes the box);
   - a click anywhere on a gear set's row opens it (open-row.ts); rows are dragged by their handle or moved with Up and Down on it
     (row-reorder.ts), not while the list is sorted. */
import { LitElement, type PropertyValues, html, nothing } from 'lit';
import { classMap } from 'lit/directives/class-map.js';
import { repeat } from 'lit/directives/repeat.js';
import { JOB_ICONS } from '../../../data/job-icons.ts';
import { followInPage } from '../../router/plain-click.ts';
import { bonusOptions } from '../../sheets/bonus-options.ts';
import { nextListSort, sheetListView } from '../../views/sheet-sets.ts';
import type { ListSort, SheetPageView } from '../../views/sheet-sets.ts';
import '../app/cap-field.ts';
import '../app/level-field.ts';
import { copyIcon, deleteIcon, editIcon } from '../shared/button-icons.ts';
import type { SwitchItem } from './switch-menu.ts';
import { dragHandle } from './drag-handle.ts';
import { opensRow } from './open-row.ts';
import { RowReorder } from './row-reorder.ts';
import { type EditResult, type SheetAction, sendSheetAction } from './sheet-action.ts';
import './switch-menu.ts';

/* The framed job icons by job id (src/data/job-icons.ts). */
const ICONS: Record<string, string> = JOB_ICONS;

/* The entries of the Clan and Party bonus lists (the same for every sheet). */
const BONUS_LISTS = bonusOptions();

/* The sheet page's view (views/sheet-sets.ts sheetPageView): what the template shows of a sheet. */
export type { SheetPageView } from '../../views/sheet-sets.ts';

/* The gear sets list (views/sheet-sets.ts sheetListView). */
type SheetListView = ReturnType<typeof sheetListView>;

/* What the caret menu after the sheet's name shows (views/sheet-sets.ts sheetSwitcherView). */
export interface SheetSwitcher {
  items: readonly SwitchItem[];
  allLabel: string;
  allHref: string;
  newLabel: string;
  disabled: boolean;
}

/* The cap the page last lowered (the store's `lowered`, with the id of the sheet it was on). */
interface LoweredCap {
  from: number;
  to: number;
  level: number | null;
  sheetId: string | null;
}

const NO_SORT: ListSort = { key: '', dir: '' };

/* The `gsa-sheet-page` element (registered below); see the file header. */
export class GsaSheetPage extends LitElement {
  static properties = {
    view: { attribute: false },
    figures: { type: String },
    sheetId: { type: String },
    clan: { type: String },
    partyRoles: { type: Number },
    switcher: { attribute: false },
    busy: { type: Boolean },
    dialogOpen: { type: Boolean },
    sort: { state: true },
    capLowered: { state: true },
  };

  declare view: SheetPageView | null;
  declare figures: 'effects' | 'points';
  declare sheetId: string | null;
  declare clan: string | null;
  declare partyRoles: number;
  declare switcher: SheetSwitcher | null;
  declare busy: boolean;
  declare dialogOpen: boolean;
  declare sort: ListSort;
  declare capLowered: LoweredCap | null;
  // what the gear sets list draws, built when the properties change (views/sheet-sets.ts)
  private list: SheetListView | null = null;
  readonly reorder: RowReorder;

  constructor() {
    super();
    this.view = null;
    this.figures = 'effects';
    this.sheetId = null;
    this.clan = null;
    this.partyRoles = 0;
    this.switcher = null;
    this.busy = false;
    this.dialogOpen = false;
    this.sort = NO_SORT;
    this.capLowered = null;
    this.reorder = new RowReorder(this, {
      dragLocked: () => this.busy || this.dialogOpen,
      stepLocked: kind => this.dialogOpen || (kind === 'set' && Boolean(this.list?.orderLocked)),
      move: (kind, from, to) => {
        sendSheetAction(this, { action: 'move', kind, from, to });
      },
      step: (kind, index, step) => sendSheetAction(this, { action: 'step', kind, index, step, result: index }).result,
      focusHandle: (_kind, index) => {
        this.querySelectorAll<HTMLElement>('.draghandle')[index]?.focus();
      },
    });
  }

  /* Light DOM: draw into the element itself, so the page's CSS reaches the markup. */
  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  /* Before each draw: another sheet or the other figures start the list in the saved order, and the list is built from what the page
     gave. */
  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('figures') || changed.has('sheetId')) {
      this.sort = NO_SORT;
    }
    const view = this.view;
    this.list = !view || view.empty ? null : sheetListView(view, this.sort, this.figures);
  }

  /* Sends an action that needs no result. */
  private send(action: SheetAction): void {
    sendSheetAction(this, action);
  }

  /* Keeps what an edit of the open sheet lowered (`result`: the store's {ok, lowered}) for the item level field, which shows the note
     and flashes; a refused edit (an Auto-fill runs) leaves the note as it was. Each lowering is a new object, so the field shows
     it again: typed again over a cap already at the limit (or the up arrow there), the sheet does not change, so the page gives no
     new value. */
  private noteLowered(result: EditResult | null): void {
    if (!result?.ok) {
      return;
    }
    const lowered = result.lowered;
    this.capLowered = lowered ? { ...lowered, sheetId: this.view?.id ?? null } : null;
  }

  /* A heading of the gear sets list clicked: sort by it, flip it, then back to the saved order. */
  private sortBy(key: string): void {
    if (this.list) {
      this.sort = nextListSort(this.list.sort, key, this.figures);
    }
  }

  /* The caret menu after the sheet's name, which tells its pick (`switch-pick`) to the page directly. */
  private renderSwitcher() {
    const switcher = this.switcher;
    if (!switcher) {
      return nothing;
    }
    return html`<span class="setsw"
      ><gsa-switch-menu
        button-id="sh-sheet-switch"
        menu-id="sh-sheet-menu"
        button-label="Switch sheet"
        menu-label="Sheets"
        .items=${switcher.items}
        .allLabel=${switcher.allLabel}
        .allHref=${switcher.allHref}
        .newLabel=${switcher.newLabel}
        .disabled=${switcher.disabled}
      ></gsa-switch-menu
    ></span>`;
  }

  /* The name, description and the Edit, Copy and Delete buttons. */
  private renderBanner(view: SheetPageView) {
    const asking = (action: 'edit' | 'copy' | 'delete') => (event: MouseEvent) =>
      this.send({ action, kind: 'sheet', id: view.id, opener: event.currentTarget as HTMLElement });
    return html`<div class="sheetbanner"><div class="sheethead">
      <div class="sheettop">
        <span class="sheetident"><img class="sheeticon" src=${ICONS[view.job.id]} alt="" width="44" height="44" /><span class="sheetnames"><span class="sheetjob" id="sh-job">${view.job.name}</span><h2 title=${view.name}>${view.name}</h2></span></span>
        <div class="sheetacts">
          <button type="button" id="sh-edit" ?disabled=${this.busy} @click=${asking('edit')}>${editIcon()}Edit</button>
          <button type="button" id="sh-copy" ?disabled=${this.busy} @click=${asking('copy')}>${copyIcon()}Copy</button>
          <button type="button" class="danger" id="sh-delete" ?disabled=${this.busy} @click=${asking('delete')}>${deleteIcon()}Delete</button>
        </div>
      </div>
      <p class=${classMap({ sheetdesc: true, dim: view.description.empty })} id="sh-description">${view.description.text}</p>
    </div></div>`;
  }

  // The IL Sync switch is a native checkbox with role=switch: its state is `checked`, which a screen reader reads (the page's other switches
  // are written the same way); the lint rule wants an aria-checked beside it.
  /* eslint-disable lit-a11y/role-has-required-aria-attrs */
  /* The settings row: level, item level, IL Sync, and the Clan and Party bonus boxes. */
  private renderFields(view: SheetPageView) {
    const lowered: LoweredCap | null = this.capLowered?.sheetId === view.id ? this.capLowered : null;
    return html`<div class="sheetfields">
      <gsa-level-field
        layout="sheet"
        .value=${view.level.value}
        .max=${view.level.max}
        .disabled=${this.busy}
        .scope=${view.id}
        @level-change=${(event: CustomEvent<number>) => this.noteLowered(sendSheetAction(this, { action: 'level', value: event.detail, result: null }).result)}></gsa-level-field>
      <gsa-cap-field
        layout="sheet"
        .value=${view.sync.cap}
        .max=${view.sync.max}
        .syncOn=${view.sync.on}
        .disabled=${this.busy || !view.sync.on}
        .lowered=${lowered}
        .scope=${view.id}
        @cap-change=${(event: CustomEvent<number | null>) => this.noteLowered(sendSheetAction(this, { action: 'cap', value: event.detail, result: null }).result)}></gsa-cap-field>
      <label class="f">IL Sync <span class="toggle"><input
        type="checkbox"
        role="switch"
        class="switch"
        id="sh-sync"
        ?disabled=${this.busy}
        .checked=${view.sync.on}
        @change=${(event: Event) => this.noteLowered(sendSheetAction(this, { action: 'sync', on: (event.target as HTMLInputElement).checked, result: null }).result)}
      /><span>${view.sync.on ? 'On' : 'Off'}</span></span></label>
      <div class="sheetbonus">
        <div class="f field"><label for="sh-clan">Race / Clan</label><span class="sized"><span class="selhost"><gsa-select
          button-id="sh-clan"
          label="Race and clan"
          .options=${BONUS_LISTS.clanChoices}
          .value=${this.clan ?? ''}
          .disabled=${this.busy}
          @change=${(event: CustomEvent<string>) => this.send({ action: 'clan', name: event.detail })}
        ></gsa-select></span><span class="sizertext" aria-hidden="true">${BONUS_LISTS.clanSizer}</span></span></div>
        <div class="f field"><label for="sh-party">Party bonus</label><span class="sized"><span class="selhost"><gsa-select
          button-id="sh-party"
          label="Party bonus"
          .options=${BONUS_LISTS.partyChoices}
          .value=${String(this.partyRoles)}
          .disabled=${this.busy}
          @change=${(event: CustomEvent<string>) => this.send({ action: 'party', value: event.detail })}
        ></gsa-select></span><span class="sizertext" aria-hidden="true">${BONUS_LISTS.partySizer}</span></span></div>
      </div>
    </div>`;
  }

  /* eslint-enable lit-a11y/role-has-required-aria-attrs */

  /* The Effects / Stat points switch. */
  private renderFigures() {
    const choice = (mode: 'effects' | 'points', label: string) => html`<label class=${this.figures === mode ? 'on' : ''}><input
        type="radio"
        name="sh-figures"
        value=${mode}
        .checked=${this.figures === mode}
        @change=${() => this.send({ action: 'figures', mode })}
      />${label}</label>`;
    return html`<div class="seg quiet" role="radiogroup" aria-label="Figures per gear set" id="sh-figures">${choice('effects', 'Effects')}${choice('points', 'Stat points')}</div>`;
  }

  /* One gear set's row: its drag handle, name link, notes and origin lines, row actions and figures. */
  private renderSetRow(row: SheetListView['rows'][number], index: number, orderLocked: boolean) {
    const mark = this.reorder.dropMark('set', index);
    const asking = (action: 'edit' | 'delete') => (event: MouseEvent) =>
      this.send({ action, kind: 'set', id: row.id, opener: event.currentTarget as HTMLElement });
    const handleOff = this.busy || orderLocked;
    return html`<tr
      data-set=${row.id}
      class=${classMap({ dragging: this.reorder.isDragged('set', index), dropbefore: mark === 'before', dropafter: mark === 'after' })}
      @click=${(event: MouseEvent) => {
        if (opensRow(event)) {
          this.send({ action: 'open', kind: 'set', id: row.id });
        }
      }}
      @dragover=${(event: DragEvent) => this.reorder.dragOver('set', index, event)}
      @drop=${(event: DragEvent) => this.reorder.drop('set', index, event)}
    >
      <td><div class="dragcell">
        ${dragHandle(this.reorder, 'set', index, handleOff)}
        <div class="dragbody">
          <a href=${row.href} class="sname clipname" title=${row.name} @click=${(event: MouseEvent) => followInPage(event, () => this.send({ action: 'open', kind: 'set', id: row.id }))}>${row.name}</a>
          ${row.descriptionLine ? html`<span class="sorigin clipname setnotes" title=${row.description}>${row.descriptionLine}</span>` : nothing}
          <span class="sorigin">${row.originText}</span>
          <div class="rowacts">
            <button type="button" class="linkbtn" data-action="edit" ?disabled=${this.busy} @click=${asking('edit')}>Edit details</button>
            <button type="button" class="linkbtn" data-action="copy" ?disabled=${this.busy} @click=${(event: MouseEvent) => this.send({ action: 'copy', kind: 'set', id: row.id, opener: event.currentTarget as HTMLElement })}>Copy</button>
            <button type="button" class="linkbtn" data-action="delete" ?disabled=${this.busy} @click=${asking('delete')}>Delete</button>
          </div>
        </div>
      </div></td>
      ${row.cells.map(cell => html`<td class="n">${cell.text}</td>`)}
    </tr>`;
  }

  /* The gear sets table, with a sortable heading per column. */
  private renderSetList(list: SheetListView) {
    return html`<div class="tablewrap"><table class=${classMap({ sets: true, setlist: true, points: this.figures === 'points' })} id="sh-sets">
      <thead><tr><th aria-sort=${list.nameAriaSort}><button type="button" class="sortbtn" data-sort="name" @click=${() => this.sortBy('name')}>Set</button></th>${list.columns.map(
        column => html`<th class=${classMap({ n: true, wide: column.wide })} data-fig=${column.key} aria-sort=${column.ariaSort}><button
          type="button"
          class="sortbtn"
          data-sort=${column.key}
          @click=${() => this.sortBy(column.key)}
        >${column.label}</button></th>`,
      )}</tr></thead>
      <tbody>${repeat(
        list.rows,
        row => row.id,
        (row, index) => this.renderSetRow(row, index, list.orderLocked),
      )}</tbody>
    </table></div>`;
  }

  protected override render() {
    const view = this.view;
    if (!view) {
      return nothing;
    }
    const newSet = (event: MouseEvent) => this.send({ action: 'new', kind: 'set', opener: event.currentTarget as HTMLElement });
    return html`<div class="sheetsview" id="sh-sheet">
      <div class="setline"><nav class="setcrumb" aria-label="Breadcrumb"><a href=${view.crumbs[0].href ?? '#/'} @click=${(event: MouseEvent) => followInPage(event, () => this.send({ action: 'to-manager' }))}>Sheets</a><span class="csep" aria-hidden="true">/</span><span class="crumbhere clipname" aria-current="page" title=${view.name}>${view.name}</span>
        ${this.renderSwitcher()}</nav></div>
      <section class="panel sheetpanel" aria-label="Sheet settings">
        ${this.renderBanner(view)}
        ${this.renderFields(view)}
      </section>
      <div class="listhead"><h2>${view.title}</h2>
        ${view.empty ? nothing : this.renderFigures()}
        <span class="sp"></span>
        ${view.empty ? nothing : html`<button type="button" class="primary" id="sh-new-set" ?disabled=${this.busy} @click=${newSet}>New set</button>`}
      </div>
      ${
        view.empty
          ? html`<div class="startcard" id="sh-no-sets">
            <h3>${view.emptyCard.title}</h3><p>${view.emptyCard.text}</p>
            <button type="button" class="primary" id="sh-new-set-first" ?disabled=${this.busy} @click=${newSet}>New set</button>
          </div>`
          : nothing
      }
      ${this.list ? this.renderSetList(this.list) : nothing}
      ${
        view.empty
          ? nothing
          : html`<p class="setsnote" id="sh-bonus-note" aria-hidden=${String(!view.bonusNote)} style=${view.bonusNote ? '' : 'visibility: hidden'}>${view.bonusNote || ' '}</p>`
      }
    </div>`;
  }
}

customElements.define('gsa-sheet-page', GsaSheetPage);
