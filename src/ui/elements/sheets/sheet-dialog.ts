/* The Sheets tab's dialogs as one Lit element in light DOM: New sheet, Copy sheet (with its "?" panel), Edit sheet, Edit gear set and
   the Delete question, each a `<gsa-dialog>` (a Zag dialog) drawn only while one is open, with the form as its content.
   It sits inside the Sheets screen (sheets-screen.ts):
   - the screen gives it `view` (sheet-dialogs-model.ts SheetDialogView: what the open dialog shows, null while none is open, so the
     element draws nothing); the element never reads a store;
   - it tells the page what the user did with one `dialog-action` event whose `detail` is a DialogAction (a key typed, a job picked,
     the main button, the X, Escape); the model (sheet-dialogs-model.ts) changes its fields and gives a new `view`;
   - it sends `dialog-closed` once the closed dialog's box has been removed, when the page may give the focus back to the control that
     opened it (the page's focus trap is gone by then);
   - the Zag dialog traps Tab, hides and blocks the page behind, and answers a press outside and the X (`dialog-close`) and Escape
     (`dialog-escape`) through the same `dialog-action` event; Enter in a one-line box presses the main button (the box's own number
     commit comes first, so a number typed just before Create counts); a change of page closes the dialog (the page's job).
   The ids of the parts (`sh-dialog`, `sh-dlg-*`) are the page's smoke steps' and styles'. The level and item level are the shared
   fields `<gsa-level-field>` and `<gsa-cap-field>` (elements/app/). */
import { LitElement, type PropertyValues, html, nothing } from 'lit';
import { classMap } from 'lit/directives/class-map.js';
import { live } from 'lit/directives/live.js';
import { JOB_ROWS, jobById } from '../../../core/constants.js';
import { JOB_ICONS } from '../../../data/job-icons.js';
import { ERROR_ICON } from '../app/cap-flag.ts';
import '../app/cap-field.ts';
import '../app/level-field.ts';
import { closeIcon } from '../shared/button-icons.ts';
import '../shared/collapsible.ts';
import '../shared/dialog.ts';
import type { Counter, DialogAction, FormView, SheetDialogView } from './sheet-dialogs-model.ts';

/* The events the element sends. */
export const DIALOG_ACTION_EVENT = 'dialog-action';
export const DIALOG_CLOSED_EVENT = 'dialog-closed';

/* The framed job icons by job id (src/data/job-icons.js). */
const ICONS: Record<string, string> = JOB_ICONS;

/* The job picker of the New sheet form: rows by role, each job with its name and icon (the Job and sync panel's). */
const JOB_PICKER = (JOB_ROWS as readonly (readonly [string, readonly string[]])[]).map(([label, ids]) => ({
  label,
  jobs: ids.map(id => ({ id, name: jobById(id)?.name ?? id, icon: ICONS[id] })),
}));

/* The kinds whose box is wider than a form's (the job and the fields share a row). */
const WIDE_KINDS = ['new', 'copy'];

/* The `gsa-sheet-dialog` element (registered below); see the file header. */
export class GsaSheetDialog extends LitElement {
  static properties = {
    view: { attribute: false },
  };

  declare view: SheetDialogView | null;

  constructor() {
    super();
    this.view = null;
  }

  /* Light DOM: draw into the element itself, so the page's CSS reaches the markup. */
  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  /* After a draw that took the box away: tells the page, which gives the focus back to the control that opened the dialog. */
  protected override updated(changed: PropertyValues<this>): void {
    if (changed.has('view') && changed.get('view') && !this.view) {
      this.dispatchEvent(new CustomEvent(DIALOG_CLOSED_EVENT, { bubbles: true }));
    }
  }

  /* Tells the page what the user did. */
  private send(action: DialogAction): void {
    this.dispatchEvent(new CustomEvent<DialogAction>(DIALOG_ACTION_EVENT, { detail: action, bubbles: true }));
  }

  /* Enter in a one-line box presses the main button; the box commits what it holds first (a number typed in the level or item level
     box). Escape is the Zag dialog's event and Tab is kept inside by the dialog. */
  private onKeydown(event: KeyboardEvent): void {
    const target = event.target;
    if (event.key === 'Enter' && target instanceof HTMLElement && target.matches('input[type=text], input[type=number]')) {
      event.preventDefault();
      target.dispatchEvent(new Event('change', { bubbles: true }));
      this.send({ action: 'submit' });
    }
  }

  /* The reason a refused dialog shows, in the label row of the field it is about (Name, Job, the tick box) or in the title row (a
     reason about no field): an icon and the text, a live region. `text` is '' where another place shows the reason. */
  private reason(id: string, text: string) {
    if (!text) {
      return nothing;
    }
    return html`<span class="dlgmsg" id=${id} role="alert">${ERROR_ICON}<span>${text}</span></span>`;
  }

  /* A text box's "N left" note. */
  private counter(note: Counter | null) {
    return note ? html`<span class=${classMap({ 'f-left': true, full: note.full })}>${note.text}</span>` : nothing;
  }

  /* The aria attributes that tie a field to the reason shown for it. */
  private ties(text: string, id: string) {
    return { invalid: text ? 'true' : nothing, describedBy: text ? id : nothing };
  }

  /* The Delete question and its buttons (Cancel has the focus). */
  private renderQuestion(view: Extract<SheetDialogView, { kind: 'delete' }>) {
    return html`<p class="question" id="sh-dlg-title">${view.question}</p>
      <div class="dlgbtns">${view.error ? html`<p class="dlgerr" role="alert">${view.error}</p>` : nothing}<button type="button" class="danger" id="sh-dlg-ok" @click=${() => this.send({ action: 'submit' })}>${view.buttonText}</button><button type="button" id="sh-dlg-cancel" @click=${() => this.send({ action: 'close' })}>Cancel</button></div>`;
  }

  /* Copy sheet's "?" button after the title, and the panel it opens under it. (A line of text with a value in the middle is one value
     here: Lit would split it into two text nodes, and Chromium then places the words after the split a sub-pixel off.) */
  private renderHelp(view: FormView) {
    const help = view.help;
    if (!help) {
      return nothing;
    }
    return html`<gsa-collapsible
      class="helpspan"
      trigger-id="sh-dlg-help"
      content-id="sh-dlg-help-panel"
      .open=${view.helpOpen}
      @open-change=${(event: CustomEvent<boolean>) => this.send({ action: 'help', open: event.detail })}><button
      type="button"
      class="help"
      data-zag-part="trigger"
      aria-label="How copying works">?</button>
      <div class="copyhelp" data-zag-part="content">
        <h4>${help.title}</h4>
        <dl class="outcomes">${help.outcomes.map(outcome => html`<div><dt>${outcome.label}</dt><dd>${outcome.text}</dd></div>`)}</dl>
        <h5>${help.groupsTitle}</h5>
        <ul class="facts">${help.groups.map(group => html`<li class=${classMap({ own: group.own })}>${group.label ? html`<b>${`${group.label}: `}</b>` : nothing}<span>${group.jobs}</span></li>`)}</ul>
        <p class="foot">${help.footText}</p>
      </div></gsa-collapsible>`;
  }

  /* The title line: the title (Copy sheet's clips the sheet's name inside its quotes), the "?" and the reason about no field. */
  private renderTitle(view: FormView) {
    const title =
      view.kind === 'copy'
        ? html`<h3 id="sh-dlg-title" class="clipped"><span>Copy “</span><span class="clipname">${view.sheetName}</span><span>” sheet</span></h3>${this.renderHelp(view)}`
        : html`<h3 id="sh-dlg-title">${view.title}</h3>`;
    return html`<div class="dlgtitle">${title}${this.reason('sh-dlg-title-err', view.errors.title)}</div>`;
  }

  /* The Name box. */
  private renderName(view: FormView) {
    const tie = this.ties(view.errors.name, 'sh-dlg-name-err');
    return html`<label class="f"><span class="f-head"><span id="sh-dlg-name-label">Name</span>${this.reason('sh-dlg-name-err', view.errors.name)}${this.counter(view.nameLeft)}</span><input
      type="text"
      id="sh-dlg-name"
      aria-labelledby="sh-dlg-name-label"
      class=${classMap({ invalid: Boolean(view.errors.name) })}
      aria-invalid=${tie.invalid}
      aria-describedby=${tie.describedBy}
      autocomplete="off"
      maxlength=${view.nameMax}
      placeholder=${view.namePlaceholder}
      .value=${live(view.name)}
      @input=${(event: Event) => this.send({ action: 'name', value: (event.target as HTMLInputElement).value })} /></label>`;
  }

  /* The Description box (New sheet and the edit forms). */
  private renderDescription(view: FormView) {
    if (view.description === null) {
      return nothing;
    }
    return html`<label class="f"><span class="f-head"><span>Description <span class="f-range">(optional)</span></span>${this.counter(view.descriptionLeft)}</span><textarea
      id="sh-dlg-description"
      rows="5"
      maxlength=${view.descriptionMax}
      .value=${live(view.description)}
      @input=${(event: Event) => this.send({ action: 'description', value: (event.target as HTMLTextAreaElement).value })}></textarea></label>`;
  }

  /* The job of a New sheet: icons by role, one radio group. */
  private renderJobPicker(view: FormView) {
    const tie = this.ties(view.errors.job, 'sh-dlg-job-err');
    return html`<div class=${classMap({ f: true, jobpick: true, invalid: Boolean(view.errors.job) })}>
      <div class="f-head"><span>Job</span>${this.reason('sh-dlg-job-err', view.errors.job)}</div>
      <div class="jobrows" role="radiogroup" aria-label="Job" aria-invalid=${tie.invalid} aria-describedby=${tie.describedBy}>${JOB_PICKER.map(
        row =>
          html`<div class="jobrow" role="group" aria-label=${row.label}><span class="jobrow-label">${row.label}</span><div class="jobicons">${row.jobs.map(
            job => html`<button
            type="button"
            class="jobbtn"
            role="radio"
            data-job-id=${job.id}
            title=${job.name}
            aria-label=${job.name}
            aria-checked=${String(job.id === view.job)}
            @click=${() => this.send({ action: 'job', id: job.id })}><img src=${job.icon} alt="" width="40" height="40" /></button>`,
          )}</div></div>`,
      )}</div>
    </div>`;
  }

  /* The job of a Copy sheet: the jobs of the sheet's gear group, one radio group. */
  private renderJobChoices(view: FormView) {
    return html`<div class="f jobpick">
      <div class="f-head"><span>Job</span></div>
      <div class="jobchoices" role="radiogroup" aria-label="Job">${view.jobs.map(
        job => html`<button
          type="button"
          class="jobchoice"
          role="radio"
          data-job-id=${job.id}
          aria-checked=${String(job.checked)}
          @click=${() => this.send({ action: 'job', id: job.id })}><img class="jobico" src=${ICONS[job.id]} alt="" width="28" height="28" /><span>${job.name}</span></button>`,
      )}</div>
    </div>`;
  }

  // The IL Sync switch is a native checkbox with role=switch: its state is `checked`, which a screen reader reads (the sheet page's
  // switch is written the same way); the lint rule wants an aria-checked beside it.
  /* eslint-disable lit-a11y/role-has-required-aria-attrs */
  /* The level, item level and IL Sync switch row (New sheet and Copy sheet). */
  private renderSettings(view: FormView) {
    const settings = view.settings;
    if (!settings) {
      return nothing;
    }
    return html`<div class="dlgrow">
      <gsa-level-field
        layout="dialog"
        .value=${settings.level.value}
        .max=${settings.level.max}
        @level-change=${(event: CustomEvent<number>) => this.send({ action: 'level', value: event.detail })}></gsa-level-field>
      <gsa-cap-field
        layout="dialog"
        .value=${settings.cap.value}
        .max=${settings.cap.max}
        .syncOn=${settings.cap.syncOn}
        .disabled=${!settings.cap.syncOn}
        .lowered=${settings.cap.lowered}
        .validate=${false}
        .snap=${true}
        @cap-change=${(event: CustomEvent<number | null>) => this.send({ action: 'cap', value: event.detail })}></gsa-cap-field>
      <label class="f">IL Sync <span class="toggle"><input
        type="checkbox"
        role="switch"
        class="switch"
        id="sh-dlg-sync"
        .checked=${settings.cap.syncOn}
        @change=${(event: Event) => this.send({ action: 'sync', on: (event.target as HTMLInputElement).checked })}
      /><span>${settings.cap.syncOn ? 'On' : 'Off'}</span></span></label>
    </div>`;
  }

  /* eslint-enable lit-a11y/role-has-required-aria-attrs */

  /* Copy sheet's warning about the pieces the chosen job cannot wear, with the box that accepts clearing them. */
  private renderWarning(view: FormView) {
    const warning = view.warning;
    if (!warning) {
      return nothing;
    }
    const tie = this.ties(view.errors.ack, 'sh-dlg-ack-err');
    return html`<div class=${classMap({ clearwarn: true, invalid: Boolean(view.errors.ack) })} role="group" aria-label="Pieces that will be cleared" id="sh-dlg-clear">
      <p><b>${warning.title}</b> <span>${warning.text}</span></p>
      <ul>${warning.items.map(item => html`<li><span class="dim">${`${item.setName} ·`}</span> <span>${`${item.slotLabel}: ${item.name}`}</span></li>`)}</ul>
      <div class="ackrow">
        <label class="ackline"><input
          type="checkbox"
          id="sh-dlg-ack"
          .checked=${view.ack}
          aria-invalid=${tie.invalid}
          aria-describedby=${tie.describedBy}
          @change=${(event: Event) => this.send({ action: 'ack', checked: (event.target as HTMLInputElement).checked })} /><span>${warning.ackText}</span></label>
        ${this.reason('sh-dlg-ack-err', view.errors.ack)}
      </div>
    </div>`;
  }

  /* A form: the title line, the Name and Description boxes, the job, and the fields row, warning and buttons (on a New sheet and a Copy
     sheet the buttons sit at the right of the fields row). */
  private renderForm(view: FormView) {
    return html`${this.renderTitle(view)}
      ${this.renderName(view)}
      ${this.renderDescription(view)}
      ${view.kind === 'new' ? this.renderJobPicker(view) : nothing}
      ${view.kind === 'copy' ? this.renderJobChoices(view) : nothing}
      <div class="dlgform ${view.kind}">
        ${this.renderSettings(view)}
        ${this.renderWarning(view)}
        <div class="dlgbtns"><button type="button" class="primary" id="sh-dlg-ok" ?disabled=${view.disabled} @click=${() => this.send({ action: 'submit' })}>${view.buttonText}</button><button type="button" @click=${() => this.send({ action: 'close' })}>Cancel</button></div>
      </div>`;
  }

  protected override render() {
    const view = this.view;
    if (!view) {
      return nothing;
    }
    return html`<gsa-dialog
      content-id="sh-dialog"
      title-id="sh-dlg-title"
      initial-focus=${view.firstFocus}
      ?alert=${view.kind === 'delete'}
      @dialog-close=${() => this.send({ action: 'close' })}
      @dialog-escape=${() => this.send({ action: 'escape' })}>
      <div class="dlg-backdrop" data-zag-part="backdrop"></div>
      <div class="dlg-positioner" data-zag-part="positioner">
        <div class=${classMap({ dlg: true, wide: WIDE_KINDS.includes(view.kind) })} data-zag-part="content" @keydown=${(event: KeyboardEvent) => this.onKeydown(event)}>
          ${view.kind === 'delete' ? this.renderQuestion(view) : this.renderForm(view)}
          <button type="button" class="dlgclose" data-zag-part="close-trigger" aria-label="Close">${closeIcon()}</button>
        </div>
      </div>
    </gsa-dialog>`;
  }
}

customElements.define('gsa-sheet-dialog', GsaSheetDialog);
