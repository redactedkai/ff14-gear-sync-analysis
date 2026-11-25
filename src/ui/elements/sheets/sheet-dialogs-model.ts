/* The Sheets tab's five dialogs as plain code that runs in Node: New sheet, Copy sheet, Edit sheet, Edit gear set and Delete. The
   model keeps the open dialog's fields and the control that gets the focus back, answers what the dialog element sends
   (`act`, one DialogAction at a time) and builds the view the element draws (`view`). The element (sheet-dialog.ts) reads nothing
   else; the page that hosts it calls the openers and `close`, and calls `afterClosed` once the element has removed its box.
   Rules: docs/engineering/sheets.md; the fields' checks and what the main button does are views/sheet-forms.js and
   sheets/dialogs.js. */
import { shownName, submitDialog } from '../../sheets/dialogs.js';
import { NEW_SHEET_CAP, copyName, levelFor, ranges, sheetSettings } from '../../sheets/ops.js';
import type { SheetsFacade } from '../../store/sheets-facade.ts';
import { deepFreeze } from '../../view-cache.ts';
import { copySheetFormView, deleteQuestionView, editFormView, newSheetFormView } from '../../views/sheet-forms.js';

/* The control of a dialog that takes the focus when it opens (a selector for `<gsa-dialog initial-focus>`): the first box of a form
   or its main button; a delete question puts it on Cancel, so a stray Enter cancels instead of deleting. */
const FORM_FIRST_FOCUS = 'input:not([disabled]), textarea, button.primary';
const QUESTION_FIRST_FOCUS = '#sh-dlg-cancel';

/* A text box shows how many characters are left once it is this full (a fraction of its limit). */
const COUNTER_SHOWS_AT = 0.85;

/* What the model needs of a control it gives the focus back to: the opener of a dialog. */
export interface FocusTarget {
  isConnected: boolean;
  focus(): void;
}

/* The cap the form lowered (level-cap.js limitCapToLevel): {from, to, level}. */
export interface LoweredCap {
  from: number;
  to: number;
  level: number | null;
}

/* The pieces of the sheets store the dialogs use (the page's sheets facade, or a unit test's). */
export type SheetsPort = SheetsFacade;
type SavedSheet = NonNullable<ReturnType<SheetsPort['sheet']>>;
type SavedSet = NonNullable<ReturnType<SheetsPort['set']>>;
type UnreadableSheet = ReturnType<SheetsPort['list']>['unreadable'][number];

/* What a Delete is about: a saved sheet, a gear set, or a saved record that could not be read. */
export type DeleteWhat = 'sheet' | 'set' | 'unreadable';
type DeleteTarget = SavedSheet | SavedSet | UnreadableSheet;

/* The sheet's job, level and sync as a form holds them. */
interface SyncFields {
  on: boolean;
  cap: number;
}

/* The reason a refused main button left (`error` the text, '' for none; `errorField` the form field it is about, '' for none). */
interface Refusal {
  error: string;
  errorField: string;
}

interface NewForm extends Refusal {
  kind: 'new';
  name: string;
  // the user typed a name: it no longer follows the job, level and sync
  nameTyped: boolean;
  description: string;
  // '' for no job chosen
  job: string;
  level: number;
  sync: SyncFields;
  // what limitFormCap last lowered, for the note under the cap field
  capLowered: LoweredCap | null;
}

interface CopyForm extends Refusal {
  kind: 'copy';
  id: string;
  name: string;
  job: string;
  level: number;
  sync: SyncFields;
  capLowered: LoweredCap | null;
  // the box that accepts clearing the pieces the new job cannot wear is ticked
  ack: boolean;
  // the "?" panel is open
  helpOpen: boolean;
}

interface EditForm extends Refusal {
  kind: 'edit-sheet' | 'edit-set';
  id: string;
  name: string;
  description: string;
}

interface DeleteForm extends Refusal {
  kind: 'delete';
  what: DeleteWhat;
  id: string;
  target: DeleteTarget;
}

/* The open dialog's fields. */
type DialogForm = NewForm | CopyForm | EditForm | DeleteForm;
/* The forms that choose a job, a level and a sync. */
type SettingsForm = NewForm | CopyForm;

/* The kinds of dialog. */
export type DialogKind = DialogForm['kind'];

/* What the dialog element tells the model, one object per event (`action` names it). */
export type DialogAction =
  // the X, a press outside, Cancel
  | { action: 'close' }
  // Escape: the "?" panel closes first, then the dialog
  | { action: 'escape' }
  // the main button, or Enter in a one-line box
  | { action: 'submit' }
  | { action: 'name'; value: string }
  | { action: 'description'; value: string }
  | { action: 'job'; id: string }
  | { action: 'sync'; on: boolean }
  | { action: 'level'; value: number }
  | { action: 'cap'; value: number | null }
  | { action: 'ack'; checked: boolean }
  | { action: 'help'; open: boolean };

/* The places a refused form's reason shows (views/sheet-forms.js errorPlaces): the text under the place that shows it, '' elsewhere. */
export interface ErrorPlaces {
  name: string;
  job: string;
  ack: string;
  title: string;
}

/* A text box's "N left" note: shown near the limit, `full` at it. */
export interface Counter {
  text: string;
  full: boolean;
}

/* The "?" panel of Copy sheet (views/sheet-forms.js copyHelpView). */
export interface CopyHelpView {
  title: string;
  outcomes: readonly { label: string; text: string }[];
  groupsTitle: string;
  groups: readonly { label: string | null; jobs: string; own: boolean }[];
  footText: string;
}

/* The pieces the chosen job cannot wear (views/sheet-forms.js copySheetFormView). */
export interface ClearWarning {
  title: string;
  text: string;
  items: readonly { key: string; setName: string; slotLabel: string; name: string }[];
  ackText: string;
}

/* The level and item level fields of a New sheet or Copy sheet form. */
export interface SettingsView {
  level: { value: number; max: number };
  cap: { value: number; max: number; syncOn: boolean; lowered: LoweredCap | null };
}

/* What a Delete question shows. */
export interface DeleteView {
  kind: 'delete';
  firstFocus: string;
  question: string;
  buttonText: string;
  error: string;
}

/* What a form dialog shows (New sheet, Copy sheet, Edit sheet, Edit gear set). `description` is null where the form has no description
   box (Copy sheet); `settings` null where it has no level, item level and sync (the edit forms); `jobs`, `help`, `warning`, `ack` and
   `helpOpen` are Copy sheet's (`jobs` empty, `help` and `warning` null, the flags false elsewhere). */
export interface FormView {
  kind: Exclude<DialogKind, 'delete'>;
  firstFocus: string;
  title: string;
  // Copy sheet's title shows the sheet's name clipped inside its quotes; '' elsewhere
  sheetName: string;
  name: string;
  nameMax: number;
  namePlaceholder: string;
  nameLeft: Counter | null;
  description: string | null;
  descriptionMax: number;
  descriptionLeft: Counter | null;
  // the chosen job's id ('' for none)
  job: string;
  jobs: readonly { id: string; name: string; checked: boolean }[];
  help: CopyHelpView | null;
  helpOpen: boolean;
  warning: ClearWarning | null;
  ack: boolean;
  settings: SettingsView | null;
  // the main button waits (Copy sheet's warning is not ticked)
  disabled: boolean;
  buttonText: string;
  error: string;
  errors: ErrorPlaces;
}

/* What the dialog element draws: a form, or a delete question. */
export type SheetDialogView = FormView | DeleteView;

/* What the model needs from the page: the sheets store and a call for every change of the dialog's state (the page draws it again). */
export interface SheetDialogsOptions {
  sheets: SheetsPort;
  onChange: () => void;
}

/* The selector of the control that takes the focus when a dialog of `kind` opens (`<gsa-dialog initial-focus>`). */
function firstFocus(kind: DialogKind): string {
  return kind === 'delete' ? QUESTION_FIRST_FOCUS : FORM_FIRST_FOCUS;
}

/* The "N left" note of a text box holding `length` characters of at most `max`, or null while it is far from full. */
function counter(length: number, max: number): Counter | null {
  if (length < max * COUNTER_SHOWS_AT) {
    return null;
  }
  return { text: `${max - length} left`, full: length >= max };
}

/* The control focused now, or null (no page in a unit test). */
function activeControl(): FocusTarget | null {
  const active = globalThis.document?.activeElement;
  return active && 'focus' in active ? (active as unknown as FocusTarget) : null;
}

/* The five dialogs' state and logic; see the file header. */
export class SheetDialogs {
  private readonly sheets: SheetsPort;
  private readonly onChange: () => void;
  // the open dialog's fields: null while none is open
  private form: DialogForm | null = null;
  // the control that had the focus when the dialog opened, to focus again when it closes
  private opener: FocusTarget | null = null;
  // the control to focus once the element has removed the closed dialog's box
  private focusAfterClose: FocusTarget | null = null;

  constructor({ sheets, onChange }: SheetDialogsOptions) {
    this.sheets = sheets;
    this.onChange = onChange;
  }

  /* Whether a dialog is open. */
  get isOpen(): boolean {
    return this.form !== null;
  }

  /* The open dialog's kind, or null. */
  get kind(): DialogKind | null {
    return this.form?.kind ?? null;
  }

  /* ---- opening and closing ---- */

  /* Opens `form` and remembers `opener`, the button that asked, to focus again on close (the active element is only the fallback:
     Safari does not focus a clicked button). Nothing opens while an Auto-fill runs. */
  private open(form: DialogForm, opener: FocusTarget | null): void {
    if (this.sheets.busy) {
      return;
    }
    this.opener = opener ?? activeControl();
    this.form = form;
    this.onChange();
  }

  /* New sheet: no job chosen; the name follows the job, level and sync until one is typed. */
  openNewSheet(opener: FocusTarget | null = null): void {
    this.open(
      {
        kind: 'new',
        error: '',
        errorField: '',
        name: '',
        nameTyped: false,
        description: '',
        job: '',
        level: 100,
        sync: { on: false, cap: NEW_SHEET_CAP },
        capLowered: null,
      },
      opener,
    );
  }

  /* Copy sheet for the saved sheet `id`: the form starts from that sheet. */
  openCopy(id: string, opener: FocusTarget | null = null): void {
    const sheet = this.sheets.sheet(id);
    if (!sheet) {
      return;
    }
    const names = this.sheets.list().sheets.map(saved => saved.name);
    this.open(
      {
        kind: 'copy',
        error: '',
        errorField: '',
        id,
        name: copyName(sheet.name, names),
        job: sheet.job,
        level: sheet.level,
        sync: { ...sheet.sync },
        capLowered: null,
        ack: false,
        helpOpen: false,
      },
      opener,
    );
  }

  /* Edit sheet: the name and description of the saved sheet `id`. */
  openEditSheet(id: string, opener: FocusTarget | null = null): void {
    const sheet = this.sheets.sheet(id);
    if (sheet) {
      this.open({ kind: 'edit-sheet', error: '', errorField: '', id, name: sheet.name, description: sheet.description ?? '' }, opener);
    }
  }

  /* Edit gear set: the name and description of the open sheet's gear set `id`. */
  openEditSet(id: string, opener: FocusTarget | null = null): void {
    const gearSet = this.sheets.set(id);
    if (gearSet) {
      this.open(
        { kind: 'edit-set', error: '', errorField: '', id, name: gearSet.name, description: String(gearSet.description ?? '') },
        opener,
      );
    }
  }

  /* Delete asks first: `what` is 'sheet', 'set' or 'unreadable', `id` the thing's id. */
  askDelete(what: DeleteWhat, id: string, opener: FocusTarget | null = null): void {
    let target: DeleteTarget | null | undefined;
    if (what === 'sheet') {
      target = this.sheets.sheet(id);
    } else if (what === 'set') {
      target = this.sheets.set(id);
    } else {
      target = this.sheets.list().unreadable.find(record => record.id === id);
    }
    if (target) {
      this.open({ kind: 'delete', error: '', errorField: '', what, id, target }, opener);
    }
  }

  /* Closes the dialog (the element removes its box) and, unless `refocus` is false (a change of page: the router owns the focus
     then), keeps the opener to focus again once the box is gone (afterClosed). Every way out comes here: Cancel, the X, a press
     outside, Escape, a change of page and a successful main button. Nothing happens while no dialog is open. */
  close(refocus = true): void {
    if (!this.form) {
      return;
    }
    this.form = null;
    this.focusAfterClose = refocus ? this.opener : null;
    this.opener = null;
    this.onChange();
  }

  /* Called once the element has removed the closed dialog's box (the page's focus trap is gone by then): focuses the opener again
     unless it left the page. */
  afterClosed(): void {
    const back = this.focusAfterClose;
    this.focusAfterClose = null;
    if (back?.isConnected) {
      back.focus();
    }
  }

  /* Escape (wherever the focus is): the "?" panel of Copy sheet closes first, then the dialog. */
  cancel(): void {
    if (this.form?.kind === 'copy' && this.form.helpOpen) {
      this.form.helpOpen = false;
      this.onChange();
    } else {
      this.close();
    }
  }

  /* ---- the fields ---- */

  /* An edit in the open dialog (a name typed, a job picked, a number, the switch, the tick box, the description) clears the reason
     a refused press left; pressing the main button again may bring it back. */
  private clearError(form: DialogForm): void {
    form.error = '';
    form.errorField = '';
  }

  /* The open form if it is one that chooses a job, a level and a sync, else null. */
  private settingsForm(): SettingsForm | null {
    const form = this.form;
    return form && (form.kind === 'new' || form.kind === 'copy') ? form : null;
  }

  /* A job picked in the New sheet or Copy sheet form: the level is held to its cap, and the cap follows. */
  chooseJob(id: string): void {
    const form = this.settingsForm();
    if (!form) {
      return;
    }
    form.job = id;
    this.clearError(form);
    form.level = levelFor(id, form.level, ranges(id).level.max);
    this.limitFormCap(form);
    this.onChange();
  }

  /* The form's sync switch: switched on, the cap is lowered to what the level allows. */
  setSync(on: boolean): void {
    const form = this.settingsForm();
    if (!form) {
      return;
    }
    form.sync.on = Boolean(on);
    this.clearError(form);
    this.limitFormCap(form);
    this.onChange();
  }

  /* A level entered in the form's level field: either commit lowers the cap to what the level allows. The dialog may have closed
     (Create pressed) while typed digits waited for their pause: nothing is left to edit then. */
  setLevel(level: number): void {
    const form = this.settingsForm();
    if (!form) {
      return;
    }
    form.level = level;
    this.clearError(form);
    this.limitFormCap(form);
    this.onChange();
  }

  /* A cap entered in the form's item level field (limitFormCap lowers it); null for an emptied box. Not while the dialog is closed
     (see setLevel). */
  setCap(cap: number | null): void {
    const form = this.settingsForm();
    if (!form) {
      return;
    }
    form.sync.cap = cap ?? NEW_SHEET_CAP;
    this.clearError(form);
    this.limitFormCap(form);
    this.onChange();
  }

  /* The form's cap lowered to what its job and level allow, as the sheet page lowers it (sheets/ops.js sheetSettings), keeping what it
     lowered for the cap field's note (a new object each time, so the field flashes); null when nothing was. The store checks the
     fields again on Create or Copy. */
  limitFormCap(form: SettingsForm | null = this.settingsForm()): void {
    if (!form) {
      return;
    }
    const { sync, lowered } = sheetSettings(form.job || null, form, { level: form.level, cap: form.sync.cap });
    form.sync.cap = sync.cap;
    form.capLowered = lowered;
  }

  /* The name box of a form, as typed: in the New sheet form it stops following the default name. */
  typeName(text: string): void {
    const form = this.form;
    if (!form || form.kind === 'delete') {
      return;
    }
    form.name = text;
    if (form.kind === 'new') {
      form.nameTyped = true;
    }
    this.clearError(form);
    this.onChange();
  }

  /* The description box, as typed (the forms that have one). */
  typeDescription(text: string): void {
    const form = this.form;
    if (form?.kind === 'new' || form?.kind === 'edit-sheet' || form?.kind === 'edit-set') {
      form.description = text;
      this.clearError(form);
      this.onChange();
    }
  }

  /* Copy sheet's box that accepts clearing the pieces the new job cannot wear. */
  setAck(checked: boolean): void {
    if (this.form?.kind === 'copy') {
      this.form.ack = checked;
      this.clearError(this.form);
      this.onChange();
    }
  }

  /* Copy sheet's "?" panel opened or closed. */
  setHelpOpen(open: boolean): void {
    if (this.form?.kind === 'copy') {
      this.form.helpOpen = open;
      this.onChange();
    }
  }

  /* ---- the main button ---- */

  /* The dialog's main button (sheets/dialogs.js submitDialog): a refused form stays open with the reason. */
  submit(): void {
    const form = this.form;
    if (!form) {
      return;
    }
    const { ok, error, field } = submitDialog(this.sheets, form);
    if (ok) {
      this.close();
    } else {
      form.error = error;
      form.errorField = field;
      this.onChange();
    }
  }

  /* One thing the dialog element tells (a DialogAction). */
  act(action: DialogAction): void {
    switch (action.action) {
      case 'close':
        this.close();
        break;
      case 'escape':
        this.cancel();
        break;
      case 'submit':
        this.submit();
        break;
      case 'name':
        this.typeName(action.value);
        break;
      case 'description':
        this.typeDescription(action.value);
        break;
      case 'job':
        this.chooseJob(action.id);
        break;
      case 'sync':
        this.setSync(action.on);
        break;
      case 'level':
        this.setLevel(action.value);
        break;
      case 'cap':
        this.setCap(action.value);
        break;
      case 'ack':
        this.setAck(action.checked);
        break;
      case 'help':
        this.setHelpOpen(action.open);
        break;
    }
  }

  /* ---- what the dialog shows ---- */

  /* The level and item level fields' values, from a form and the ranges of its job (views/sheet-forms.js gives them). */
  private settingsView(form: SettingsForm, limits: { level: { max: number }; cap: { max: number } }): SettingsView {
    return {
      level: { value: form.level, max: limits.level.max },
      cap: { value: form.sync.cap, max: limits.cap.max, syncOn: form.sync.on, lowered: form.sync.on ? form.capLowered : null },
    };
  }

  /* What the element draws for the open dialog (views/sheet-forms.js with the form's own fields), frozen all through; null while
     none is open. Reads the sheets store, so the page that draws it again on a change of the store sees a change of the sheet
     Copy sheet is about. */
  view(): SheetDialogView | null {
    const form = this.form;
    if (!form) {
      return null;
    }
    if (form.kind === 'delete') {
      const { question, buttonText, error } = deleteQuestionView(form.what, form.target, form);
      return deepFreeze({ kind: 'delete', firstFocus: firstFocus('delete'), question, buttonText, error });
    }
    const empty = {
      kind: form.kind,
      firstFocus: firstFocus(form.kind),
      sheetName: '',
      namePlaceholder: '',
      description: null,
      descriptionMax: 0,
      descriptionLeft: null,
      job: '',
      jobs: [],
      help: null,
      helpOpen: false,
      warning: null,
      ack: false,
      settings: null,
      disabled: false,
    };
    if (form.kind === 'new') {
      const view = newSheetFormView(form);
      return deepFreeze({
        ...empty,
        title: view.title,
        name: view.name,
        nameMax: view.nameMax,
        namePlaceholder: view.namePlaceholder,
        nameLeft: counter(shownName(form).length, view.nameMax),
        description: form.description,
        descriptionMax: view.descriptionMax,
        descriptionLeft: counter(form.description.length, view.descriptionMax),
        job: form.job,
        settings: this.settingsView(form, view),
        buttonText: view.buttonText,
        error: view.error,
        errors: view.errors,
      });
    }
    if (form.kind === 'copy') {
      const sheet = this.sheets.sheet(form.id);
      if (!sheet) {
        return null;
      }
      const view = copySheetFormView(sheet, form);
      return deepFreeze({
        ...empty,
        title: view.title,
        sheetName: view.sheetName,
        name: view.name,
        nameMax: view.nameMax,
        nameLeft: counter(form.name.length, view.nameMax),
        job: form.job,
        jobs: view.jobs,
        help: view.help,
        helpOpen: form.helpOpen,
        warning: view.warning,
        ack: form.ack,
        settings: this.settingsView(form, view),
        disabled: view.disabled,
        buttonText: view.buttonText,
        error: view.error,
        errors: view.errors,
      });
    }
    const view = editFormView(form.kind, form);
    return deepFreeze({
      ...empty,
      title: view.title,
      name: form.name,
      nameMax: view.nameMax,
      nameLeft: counter(form.name.length, view.nameMax),
      description: form.description,
      descriptionMax: view.descriptionMax,
      descriptionLeft: counter(form.description.length, view.descriptionMax),
      buttonText: view.buttonText,
      error: view.error,
      errors: view.errors,
    });
  }
}
