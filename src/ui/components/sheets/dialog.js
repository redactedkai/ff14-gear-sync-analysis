/* The Sheets tab's dialogs (New sheet, Copy sheet, "Edit sheet", "Edit gear set", Delete): opening one with the focus
   remembered, its form fields and number boxes, its main button (sheets/dialogs.js) and its keys. The set page opens
   Edit gear set and Delete through this part.
   A part of the sheetsTab component (components/sheets.js composes the parts). Borrows: sheets and afterDraw (frame.js). */
import { JOB_ROWS, jobById } from '../../../core/constants.js';
import { JOB_ICONS } from '../../../data/job-icons.js';
import { flashLowered, numberField } from '../../number-field.js';
import { shownName, submitDialog } from '../../sheets/dialogs.js';
import { NEW_SHEET_CAP, copyName, levelFor, ranges, sheetSettings } from '../../sheets/ops.js';
import { capFlag, capLoweredText } from '../../level-cap.js';
import { copySheetFormView, deleteQuestionView, editFormView, newSheetFormView } from '../../views/sheet-forms.js';

/* The job picker of the New sheet form: rows by role, each job with its name and icon (the Job and sync panel's). */
const JOB_PICKER = JOB_ROWS.map(([label, ids]) => ({ label, jobs: ids.map(id => ({ id, name: jobById(id).name, icon: JOB_ICONS[id] })) }));

/* Returns the part's members. */
export function dialogPart() {
  // the element that had the focus when a dialog opened, focused again when it closes
  let returnFocus = null;
  return {
    jobPicker: JOB_PICKER,
    jobIcons: JOB_ICONS,
    // the open dialog: null, or {kind: 'new' | 'copy' | 'edit-sheet' | 'edit-set' | 'delete', ...its fields}
    dialog: null,

    /* What the open dialog shows (views/sheet-forms.js), or null. */
    get dialogView() {
      const d = this.dialog;
      if (!d) return null;
      if (d.kind === 'new') return newSheetFormView(d);
      if (d.kind === 'copy') return copySheetFormView(this.sheets.sheet(d.id), d);
      if (d.kind === 'delete') return deleteQuestionView(d.what, d.target, d);
      return editFormView(d.kind, d);
    },
    /* Open `dialog` (the page draws a native <dialog> for it, opened as a modal by x-modal) and remember `opener`, the
       button that asked, to focus again on close (the active element is only the fallback: Safari does not focus a
       clicked button); the first field (or the main button) takes the focus. A delete question puts it on Cancel, so a stray Enter cancels instead
       of deleting. */
    openDialog(dialog, opener = null) {
      if (this.sheets.busy) return;
      returnFocus = opener ?? globalThis.document?.activeElement ?? null;
      this.dialog = { error: '', errorField: '', ...dialog };
      const first = dialog.kind === 'delete' ? '#sh-dlg-cancel' : 'input:not([disabled]), textarea, button.primary';
      this.afterDraw(() => this.$refs.dialog?.querySelector(first)?.focus());
    },
    /* An edit in the open dialog (a name typed, a job picked, a number, the switch, the tick box, the description) clears the
       reason a refused press left; pressing the main button again may bring it back. */
    clearDialogError() {
      if (!this.dialog) return;
      this.dialog.error = '';
      this.dialog.errorField = '';
    },
    /* Close the dialog (the page removes its <dialog>) and, unless `refocus` is false (a change of page: the router owns the
       focus then), focus the opener again. Every way out comes here: Cancel, the X, the backdrop, Escape (cancelDialog), a
       change of page and a successful main button. */
    closeDialog(refocus = true) {
      this.dialog = null;
      const back = returnFocus;
      returnFocus = null;
      if (refocus) this.afterDraw(() => (back?.isConnected ? back.focus() : null));
    },
    /* Escape (the dialog's cancel event, which the browser would otherwise handle itself, wherever the focus is): the "?"
       panel of Copy sheet closes first, then the dialog. */
    cancelDialog() {
      if (this.dialog?.helpOpen) this.dialog.helpOpen = false;
      else this.closeDialog();
    },
    /* New sheet: no job chosen; the name follows the job, level and sync until one is typed. */
    openNewSheet(opener) {
      this.openDialog(
        {
          kind: 'new',
          name: '',
          nameTyped: false,
          description: '',
          job: '',
          level: 100,
          sync: { on: false, cap: NEW_SHEET_CAP },
          capLowered: null, // what limitFormCap last lowered, for the note under the cap field
        },
        opener,
      );
    },
    openCopy(id, opener) {
      const sheet = this.sheets.sheet(id);
      if (!sheet) return;
      const names = this.sheets.list().sheets.map(s => s.name);
      this.openDialog(
        {
          kind: 'copy',
          id,
          name: copyName(sheet.name, names),
          job: sheet.job,
          level: sheet.level,
          sync: { ...sheet.sync },
          capLowered: null,
          ack: false,
          helpOpen: false, // the "?" panel
        },
        opener,
      );
    },
    openEditSheet(id, opener) {
      const sheet = this.sheets.sheet(id);
      if (sheet) this.openDialog({ kind: 'edit-sheet', id, name: sheet.name, description: sheet.description ?? '' }, opener);
    },
    openEditSet(id, opener) {
      const gearSet = this.sheets.set(id);
      if (gearSet) this.openDialog({ kind: 'edit-set', id, name: gearSet.name, description: gearSet.description ?? '' }, opener);
    },
    /* Delete asks first: `what` 'sheet', 'set' or 'unreadable', `id` the thing's id. */
    askDelete(what, id, opener) {
      const store = this.sheets;
      const target = what === 'sheet' ? store.sheet(id) : what === 'set' ? store.set(id) : store.list().unreadable.find(r => r.id === id);
      if (target) this.openDialog({ kind: 'delete', what, id, target }, opener);
    },

    /* A job picked in the New sheet or Copy sheet form: the level is held to its cap, and the cap follows. */
    chooseJob(id) {
      const d = this.dialog;
      d.job = id;
      this.clearDialogError();
      d.level = levelFor(id, d.level, ranges(id).level.max);
      this.limitFormCap();
    },
    /* The form's sync switch: switched on, the cap is lowered to what the level allows. */
    setFormSync(on) {
      this.dialog.sync.on = !!on;
      this.clearDialogError();
      this.limitFormCap();
    },
    /* The New sheet or Copy sheet form's cap lowered to what its job and level allow, as the sheet page lowers it
       (sheets.js sheetSettings), keeping what it lowered for the note (formCapNote); null when nothing was. The store
       checks the fields again on Create or Copy. */
    limitFormCap() {
      const d = this.dialog;
      const { sync, lowered } = sheetSettings(d.job || null, d, { level: d.level, cap: d.sync.cap });
      d.sync.cap = sync.cap;
      d.capLowered = lowered;
      if (lowered) flashLowered(this.$refs.dialog?.querySelector('#sh-dlg-cap'));
    },
    /* Under the form's cap field after it was lowered (level-cap.js capLoweredText); '' while sync is off. */
    get formCapNote() {
      const d = this.dialog;
      return d?.sync?.on ? capLoweredText(d.capLowered) : '';
    },
    /* The form's cap field's flag in its label line (level-cap.js capFlag; the form shows no error); `range` is "1–795". */
    formCapFlag(range) {
      return capFlag({ error: '', note: this.formCapNote, lowered: this.dialog?.capLowered, range });
    },
    /* The name box of a form, as typed: in the New sheet form it stops following the default name. */
    typeName(text) {
      this.dialog.name = text;
      this.dialog.nameTyped = true;
      this.clearDialogError();
    },
    /* The name box shows: the New sheet form's default name until one is typed. */
    get dialogName() {
      return this.dialog ? shownName(this.dialog) : '';
    },
    /* A number field of a form: `key` 'level' (held to the chosen job's level cap) or 'cap' (any whole number from 1,
       lowered by limitFormCap). Either commit lowers the cap to what the level allows. */
    formField(key) {
      return numberField(
        () => (key === 'level' ? this.dialog?.level : this.dialog?.sync.cap),
        value => {
          // typed digits commit after a pause: the dialog may have closed (Create pressed) in the meantime
          if (!this.dialog) return;
          if (key === 'level') this.dialog.level = value;
          else this.dialog.sync.cap = value;
          this.clearDialogError();
          this.limitFormCap();
        },
        1,
        key === 'level' ? () => ranges(this.dialog?.job || null).level.max : Infinity,
      );
    },

    /* The dialog's main button (sheets/dialogs.js): a refused form stays open with the reason. */
    submitDialog() {
      const d = this.dialog;
      if (!d) return;
      const { ok, error, field } = submitDialog(this.sheets, d);
      if (ok) this.closeDialog();
      else Object.assign(d, { error, errorField: field });
    },
    /* Keys inside a dialog: Enter in a one-line box presses the main button. Escape is the dialog's cancel event
       (cancelDialog) and Tab is kept inside by x-modal. */
    dialogKey(event) {
      if (event.key === 'Enter' && event.target.matches?.('input[type=text], input[type=number]')) {
        event.preventDefault();
        event.target.dispatchEvent(new Event('change', { bubbles: true }));
        this.submitDialog();
      }
    },
  };
}
