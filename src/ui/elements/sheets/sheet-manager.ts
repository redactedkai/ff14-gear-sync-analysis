/* The sheet manager (the Sheets tab's first level) as one Lit element in light DOM: every saved sheet as a row, the records that
   could not be read, the empty card, and the "not found" screen for an address that names a sheet or gear set that is not saved.
   It sits inside the Sheets screen (sheets-screen.ts):
   - the screen gives it properties (`view`, `notFound`, `busy`, `dialogOpen`) and listens for `sheet-action` (sheet-action.ts); the
     element never reads a store;
   - it draws nothing while `view` and `notFound` are both null (another screen is open);
   - a click anywhere on a row opens it (open-row.ts); the name link is the keyboard and screen-reader way in and a real link
     (a Ctrl or Cmd click opens it in a new tab);
   - a row is dragged by its handle, or moved with Up and Down on the focused handle (row-reorder.ts). */
import { LitElement, html, nothing } from 'lit';
import { classMap } from 'lit/directives/class-map.js';
import { repeat } from 'lit/directives/repeat.js';
import { JOB_ICONS } from '../../../data/job-icons.js';
import { followInPage } from '../../router/plain-click.ts';
import { dragHandle } from './drag-handle.ts';
import { opensRow } from './open-row.ts';
import { RowReorder } from './row-reorder.ts';
import { type SheetAction, sendSheetAction } from './sheet-action.ts';

/* The framed job icons by job id (src/data/job-icons.js). */
const ICONS: Record<string, string> = JOB_ICONS;

/* One row of the manager (views/sheet-manager.js): what the template shows of a sheet. */
export interface ManagerRow {
  id: string;
  href: string;
  name: string;
  descriptionLine: string;
  jobId: string;
  jobName: string;
  settingsText: string;
  setCount: number;
  created: string;
  changed: string;
  patch: string;
  patchTitle: string;
}

/* The manager's view (views/sheet-manager.js sheetManagerView). */
export interface ManagerView {
  title: string;
  empty: boolean;
  showNewButton: boolean;
  emptyCard: { title: string; text: string; buttonText: string };
  columns: readonly string[];
  rows: readonly ManagerRow[];
  unreadableTitle: string;
  unreadable: readonly { id: string; key: string; text: string }[];
}

/* The "not found" screen (views/sheet-text.js notFoundView). */
export interface NotFoundView {
  title: string;
  text: string;
  buttonText: string;
}

/* The index of the manager's last numeric column, "Sets" (right-aligned). */
const SET_COUNT_COLUMN = 3;

/* The `gsa-sheet-manager` element (registered below); see the file header. */
export class GsaSheetManager extends LitElement {
  static properties = {
    view: { attribute: false },
    notFound: { attribute: false },
    busy: { type: Boolean },
    dialogOpen: { type: Boolean },
  };

  declare view: ManagerView | null;
  declare notFound: NotFoundView | null;
  declare busy: boolean;
  declare dialogOpen: boolean;
  readonly reorder: RowReorder;

  constructor() {
    super();
    this.view = null;
    this.notFound = null;
    this.busy = false;
    this.dialogOpen = false;
    this.reorder = new RowReorder(this, {
      dragLocked: () => this.busy || this.dialogOpen,
      stepLocked: () => this.dialogOpen,
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

  /* Sends an action that needs no result. */
  private send(action: SheetAction): void {
    sendSheetAction(this, action);
  }

  /* A click on a row's `<tr>`: opens the sheet unless the click was on the row's own control or ended a text selection. */
  private onRowClick(event: MouseEvent, id: string): void {
    if (opensRow(event)) {
      this.send({ action: 'open', kind: 'sheet', id });
    }
  }

  /* One row of the table: its drag handle, name link, origin line, row actions and cells. */
  private renderRow(row: ManagerRow, index: number) {
    const mark = this.reorder.dropMark('sheet', index);
    return html`<tr
      data-sheet=${row.id}
      class=${classMap({ dragging: this.reorder.isDragged('sheet', index), dropbefore: mark === 'before', dropafter: mark === 'after' })}
      @click=${(event: MouseEvent) => this.onRowClick(event, row.id)}
      @dragover=${(event: DragEvent) => this.reorder.dragOver('sheet', index, event)}
      @drop=${(event: DragEvent) => this.reorder.drop('sheet', index, event)}
    >
      <td><div class="dragcell">
        ${dragHandle(this.reorder, 'sheet', index, this.busy)}
        <div class="dragbody">
          <a href=${row.href} class="sname clipname" @click=${(event: MouseEvent) => followInPage(event, () => this.send({ action: 'open', kind: 'sheet', id: row.id }))}>${row.name}</a>
          <span class="sorigin clipname">${row.descriptionLine}</span>
          <div class="rowacts">
            <button type="button" class="linkbtn" data-action="open" @click=${() => this.send({ action: 'open', kind: 'sheet', id: row.id })}>Open</button>
            <button type="button" class="linkbtn" data-action="edit" ?disabled=${this.busy} @click=${(event: MouseEvent) => this.send({ action: 'edit', kind: 'sheet', id: row.id, opener: event.currentTarget as HTMLElement })}>Edit details</button>
            <button type="button" class="linkbtn" data-action="copy" ?disabled=${this.busy} @click=${(event: MouseEvent) => this.send({ action: 'copy', kind: 'sheet', id: row.id, opener: event.currentTarget as HTMLElement })}>Copy</button>
            <button type="button" class="linkbtn" data-action="delete" ?disabled=${this.busy} @click=${(event: MouseEvent) => this.send({ action: 'delete', kind: 'sheet', id: row.id, opener: event.currentTarget as HTMLElement })}>Delete</button>
          </div>
        </div>
      </div></td>
      <td><span class="jobcell"><img class="jobico" src=${ICONS[row.jobId]} alt="" width="24" height="24" /><span>${row.jobName}</span></span></td>
      <td>${row.settingsText}</td><td class="n">${row.setCount}</td><td>${row.created}</td><td>${row.changed}</td><td title=${row.patchTitle}>${row.patch}</td>
    </tr>`;
  }

  /* The table of sheets. */
  private renderTable(view: ManagerView) {
    return html`<div class="tablewrap"><table class="sets sheetlist" id="sh-list">
      <thead><tr>${view.columns.map((column, index) => html`<th class=${index === SET_COUNT_COLUMN ? 'n' : nothing}>${column}</th>`)}</tr></thead>
      <tbody>${repeat(
        view.rows,
        row => row.id,
        (row, index) => this.renderRow(row, index),
      )}</tbody>
    </table></div>`;
  }

  /* The records that could not be read, each with a Delete button. */
  private renderUnreadable(view: ManagerView) {
    return html`<div class="panel" id="sh-unreadable">
      <h3>${view.unreadableTitle}</h3>
      ${view.unreadable.map(
        record => html`<div class="row"><span class="small">${record.text}</span><span class="small dim">${record.key}</span><span style="flex:1"></span><button
          type="button"
          class="chip"
          ?disabled=${this.busy}
          @click=${(event: MouseEvent) => this.send({ action: 'delete', kind: 'unreadable', id: record.id, opener: event.currentTarget as HTMLElement })}
        >Delete</button></div>`,
      )}
    </div>`;
  }

  /* The screen for an address that names a sheet or gear set that is not saved in this browser. */
  private renderNotFound(notFound: NotFoundView) {
    return html`<div class="sheetsview" id="sh-missing">
      <div class="listhead"><h2 id="sh-missing-title" tabindex="-1">${notFound.title}</h2></div>
      <div class="startcard" id="sh-missing-card">
        <p>${notFound.text}</p>
        <button type="button" class="primary" id="sh-missing-go" @click=${() => this.send({ action: 'leave-missing' })}>${notFound.buttonText}</button>
      </div>
    </div>`;
  }

  protected override render() {
    if (this.notFound) {
      return this.renderNotFound(this.notFound);
    }
    const view = this.view;
    if (!view) {
      return nothing;
    }
    const newSheet = (event: MouseEvent) => this.send({ action: 'new', kind: 'sheet', opener: event.currentTarget as HTMLElement });
    return html`<div class="sheetsview" id="sh-manager">
      <div class="listhead"><h2>${view.title}</h2><span class="sp"></span>
        ${view.showNewButton ? html`<button type="button" class="primary" id="sh-new" ?disabled=${this.busy} @click=${newSheet}>New sheet</button>` : nothing}
      </div>
      ${
        view.empty
          ? html`<div class="startcard" id="sh-empty">
            <h3>${view.emptyCard.title}</h3><p>${view.emptyCard.text}</p>
            <button type="button" class="primary" id="sh-new-first" ?disabled=${this.busy} @click=${newSheet}>${view.emptyCard.buttonText}</button>
          </div>`
          : this.renderTable(view)
      }
      ${view.unreadable.length ? this.renderUnreadable(view) : nothing}
    </div>`;
  }
}

customElements.define('gsa-sheet-manager', GsaSheetManager);
