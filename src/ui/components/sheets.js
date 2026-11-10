/* The Sheets tab: the sheet manager, a sheet's page with its breadcrumb menu of sheets, and the frame of a set page (the
   set page itself is components/set-page.js, nested inside this one), with the dialogs (New sheet, Copy sheet, "Name and description", Delete) and reordering rows by drag or by the keyboard. The
   sheets and the screen live in Alpine.store('sheets') (ui/sheet-store.js); this component builds the views from it
   (views/sheet-manager.js, sheet-sets.js, sheet-forms.js) and keeps only what is on screen: the open dialog's fields, a
   row being dragged. Rules: docs/engineering/sheets.md. */
import { JOB_ROWS, jobById } from '../../core/constants.js';
import { JOB_ICONS } from '../../data/job-icons.js';
import { deepFreeze, flashLowered, numberField, viewCache } from '../helpers.js';
import { shownName, submitDialog } from '../sheet-dialogs.js';
import { NEW_SHEET_CAP, copyName, levelFor, ranges, sheetSettings } from '../sheet-ops.js';
import { CAP_TYPED_BAD_TEXT, capLoweredText, capTextBad } from '../state.js';
import { copySheetFormView, deleteQuestionView, editFormView, newSheetFormView } from '../views/sheet-forms.js';
import { sheetManagerView } from '../views/sheet-manager.js';
import { setHeaderView, sheetPageView } from '../views/sheet-sets.js';

/* How long a note after an action ("Deleted “UwU” sheet.") stays (ms). */
export const NOTE_MS = 6000;

/* The job picker of the New sheet form: rows by role, each job with its name and icon (the Job and sync panel's). */
const JOB_PICKER = JOB_ROWS.map(([label, ids]) => ({ label, jobs: ids.map(id => ({ id, name: jobById(id).name, icon: JOB_ICONS[id] })) }));

/* The component. Reads $store.sheets (the sheets and the screen) and nothing of the Job and sync panel. */
export function sheetsTab() {
  const managerCache = viewCache();
  const pageCache = viewCache();
  const headerCache = viewCache();
  let noteTimer = null;
  // the element that had the focus when a dialog opened, focused again when it closes
  let returnFocus = null;
  // the component's own element, kept at init: `this.$el` is the element a handler ran on, and a click can remove that
  // element (a dialog's button), so after one `this.$el` is no longer in the page
  let tabEl = null;

  return {
    jobPicker: JOB_PICKER,
    jobIcons: JOB_ICONS,
    // the open dialog: null, or {kind: 'new' | 'copy' | 'edit-sheet' | 'edit-set' | 'delete', ...its fields}
    dialog: null,
    // the row being dragged: {kind: 'sheet' | 'set', from}, and where it would drop: {index, after}
    dragging: null,
    dropAt: null,
    // the sheet page's breadcrumb menu of sheets (the caret after the sheet's name) is open
    sheetMenu: false,
    // the cap the sheet page last lowered: {sheetId, from, to, level} (sheet-store editSettings), for the note under the
    // field; null once a change leaves the cap as typed
    capLowered: null,
    // the sheet page's cap field holds text that is no whole item level (the sheet keeps its last cap: capTextBad)
    capTypedBad: false,

    init() {
      tabEl = this.$el;
      // a note after an action clears itself
      this.$watch('$store.sheets.note', note => {
        clearTimeout(noteTimer);
        if (note) noteTimer = setTimeout(() => (this.$store.sheets.note = ''), NOTE_MS);
      });
      // another sheet's page: its cap field starts with no error
      this.$watch('$store.sheets.sheetId', () => (this.capTypedBad = false));
    },

    get sheets() {
      return this.$store.sheets;
    },

    /* ---- views ---- */

    /* The manager (sheetManagerView), built once per change of the sheets. */
    get manager() {
      const store = this.sheets;
      const list = store.list();
      return managerCache.get(String(store.rev), () => deepFreeze(sheetManagerView(list)));
    },
    /* The open sheet's page (sheetPageView), or null. */
    get page() {
      const sheet = this.sheets.currentSheet;
      if (!sheet) return null;
      return pageCache.get(`${this.sheets.rev}:${sheet.id}`, () => deepFreeze(sheetPageView(sheet)));
    },
    /* The set page's line: breadcrumb and the sheet's settings, read-only (setHeaderView), built once per change of the sheets, or null. */
    get setHeader() {
      const sheet = this.sheets.currentSheet;
      const gearSet = this.sheets.currentSet;
      if (!sheet || !gearSet) return null;
      return headerCache.get(`${this.sheets.rev}:${sheet.id}:${gearSet.id}`, () => deepFreeze(setHeaderView(sheet, gearSet)));
    },
    /* The screen to draw: the manager when the open sheet or set is gone (another browser tab deleted it). */
    get screen() {
      const store = this.sheets;
      if (store.screen === 'set' && store.currentSet) return 'set';
      if (store.screen !== 'sheets' && store.currentSheet) return 'sheet';
      return 'sheets';
    },
    /* A breadcrumb link: 'sheets' the manager, 'sheet' the open sheet's page. */
    goCrumb(to) {
      if (to === 'sheets') this.sheets.openManager();
      else this.sheets.closeSet();
    },

    /* Runs `callback` once Alpine has drawn the change just made, unless the component's element is gone by then (as the
       set page's afterDraw). */
    afterDraw(callback) {
      this.$nextTick(() => {
        if (tabEl.isConnected) callback();
      });
    },

    /* The sheet page's caret menu: open or close it; opened, the current sheet takes the focus. Off while a Fill runs. */
    toggleSheetMenu(box) {
      if (this.sheets.busy) return;
      this.sheetMenu = !this.sheetMenu;
      if (this.sheetMenu) this.afterDraw(() => box?.querySelector('.setitem.cur')?.focus());
    },

    /* ---- the sheet page's level and item level sync (applied as typed, no question) ---- */

    /* The level box. Typed digits commit once typing settles (numberField), so the cap follows the level typed, not
       the numbers on the way ("8" of "80"). */
    get levelField() {
      const store = this.sheets;
      return numberField(
        () => store.currentSheet?.level,
        value => this.noteLowered(store.setLevel(value)),
        1,
        () => ranges(store.currentSheet?.job).level.max,
      );
    },
    /* The cap box, as on the Job and sync panel: any whole number from 1 (its max attribute, in the template, stops the
       arrow keys), lowered to what the level allows with a note; other text is an error (capError, onCapInput) and
       the sheet keeps its last cap. */
    get capField() {
      const store = this.sheets;
      return numberField(
        () => store.currentSheet?.sync.cap,
        value => this.noteLowered(store.setCap(value)),
        1,
        Infinity,
        { snap: false },
      );
    },
    /* Text typed in the cap box, at each keystroke: whether it is an error (capTextBad). */
    onCapInput(text) {
      this.capTypedBad = capTextBad(text);
    },
    /* Under the sheet page's cap field while sync is on: CAP_TYPED_BAD_TEXT for text that is no cap, else ''. */
    get capError() {
      return this.capTypedBad && this.sheets.currentSheet?.sync.on ? CAP_TYPED_BAD_TEXT : '';
    },
    /* The sheet page's sync switch: switched on, the cap is lowered to what the level allows. */
    toggleSync(on) {
      this.noteLowered(this.sheets.setSyncOn(on));
    },
    /* Keep what an edit of the open sheet lowered (`result`: the store's {ok, lowered}) for the note, and flash the
       cap field; a refused edit (a Fill runs) leaves the note as it was. A lowered cap is put in the field too: typed
       again over a cap already at the limit (or the up arrow there), the sheet does not change, so its binding does
       not run again and the field would keep the text typed. */
    noteLowered(result) {
      if (!result?.ok) return;
      const lowered = result.lowered;
      this.capLowered = lowered ? { ...lowered, sheetId: this.sheets.sheetId } : null;
      if (!lowered) return;
      const field = this.$refs.sheetCap;
      if (field) field.value = String(lowered.to);
      flashLowered(field);
    },
    /* Under the sheet page's cap field after it was lowered (state.js capLoweredText, the Job and sync panel's
       wording): "Lowered to 405, the highest for level 70."; '' on another sheet, while sync is off, or while the field
       shows an error (it takes the note's place). */
    get capLoweredNote() {
      const lowered = this.capLowered;
      const sheet = this.sheets.currentSheet;
      if (!lowered || !sheet?.sync.on || lowered.sheetId !== sheet.id || this.capError) return '';
      return capLoweredText(lowered);
    },

    /* ---- dialogs ---- */

    /* What the open dialog shows (views/sheet-forms.js), or null. */
    get dialogView() {
      const d = this.dialog;
      if (!d) return null;
      if (d.kind === 'new') return newSheetFormView(d);
      if (d.kind === 'copy') return copySheetFormView(this.sheets.sheet(d.id), d);
      if (d.kind === 'delete') return deleteQuestionView(d.what, d.target);
      return editFormView();
    },
    /* Open `dialog` and remember where the focus was; the first field (or the main button) takes it. A delete question
       puts it on Cancel, so a stray Enter cancels instead of deleting. */
    openDialog(dialog) {
      if (this.sheets.busy) return;
      returnFocus = globalThis.document?.activeElement ?? null;
      this.dialog = { error: '', ...dialog };
      const first = dialog.kind === 'delete' ? '#sh-dlg-cancel' : 'input:not([disabled]), textarea, button.primary';
      this.afterDraw(() => this.$refs.dialog?.querySelector(first)?.focus());
    },
    closeDialog() {
      this.dialog = null;
      const back = returnFocus;
      returnFocus = null;
      this.afterDraw(() => (back?.isConnected ? back.focus() : null));
    },
    /* New sheet: no job chosen; the name follows the job, level and sync until one is typed. */
    openNewSheet() {
      this.openDialog({
        kind: 'new',
        name: '',
        nameTyped: false,
        description: '',
        job: '',
        level: 100,
        sync: { on: false, cap: NEW_SHEET_CAP },
        capLowered: null, // what limitFormCap last lowered, for the note under the cap field
      });
    },
    /* A job picked in the New sheet or Copy sheet form: the level is held to its cap, and the cap follows. */
    chooseJob(id) {
      const d = this.dialog;
      d.job = id;
      d.level = levelFor(id, d.level, ranges(id).level.max);
      this.limitFormCap();
    },
    /* The form's sync switch: switched on, the cap is lowered to what the level allows. */
    setFormSync(on) {
      this.dialog.sync.on = !!on;
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
    /* Under the form's cap field after it was lowered (state.js capLoweredText); '' while sync is off. */
    get formCapNote() {
      const d = this.dialog;
      return d?.sync?.on ? capLoweredText(d.capLowered) : '';
    },
    /* The name box of a form, as typed: in the New sheet form it stops following the default name. */
    typeName(text) {
      this.dialog.name = text;
      this.dialog.nameTyped = true;
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
          this.limitFormCap();
        },
        1,
        key === 'level' ? () => ranges(this.dialog?.job || null).level.max : Infinity,
      );
    },
    openCopy(id) {
      const sheet = this.sheets.sheet(id);
      if (!sheet) return;
      const names = this.sheets.list().sheets.map(s => s.name);
      this.openDialog({
        kind: 'copy',
        id,
        name: copyName(sheet.name, names),
        job: sheet.job,
        level: sheet.level,
        sync: { ...sheet.sync },
        capLowered: null,
        ack: false,
      });
    },
    openEditSheet(id) {
      const sheet = this.sheets.sheet(id);
      if (sheet) this.openDialog({ kind: 'edit-sheet', id, name: sheet.name, description: sheet.description ?? '' });
    },
    openEditSet(id) {
      const gearSet = this.sheets.set(id);
      if (gearSet) this.openDialog({ kind: 'edit-set', id, name: gearSet.name, description: gearSet.description ?? '' });
    },
    /* Delete asks first: `what` 'sheet', 'set' or 'unreadable', `id` the thing's id. */
    askDelete(what, id) {
      const store = this.sheets;
      const target = what === 'sheet' ? store.sheet(id) : what === 'set' ? store.set(id) : store.list().unreadable.find(r => r.id === id);
      if (target) this.openDialog({ kind: 'delete', what, id, target });
    },

    /* The dialog's main button (sheet-dialogs.js): a refused form stays open with the reason. */
    submitDialog() {
      const d = this.dialog;
      if (!d) return;
      const { ok, error } = submitDialog(this.sheets, d);
      if (ok) this.closeDialog();
      else d.error = error;
    },
    /* Keys inside a dialog: Escape cancels, Enter in a one-line box presses the main button, Tab stays inside. */
    dialogKey(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.closeDialog();
      } else if (event.key === 'Enter' && event.target.matches?.('input[type=text], input[type=number]')) {
        event.preventDefault();
        event.target.dispatchEvent(new Event('change', { bubbles: true }));
        this.submitDialog();
      } else if (event.key === 'Tab') {
        const stops = [...this.$refs.dialog.querySelectorAll('button:not(:disabled), input:not(:disabled), textarea')];
        const at = stops.indexOf(event.target);
        if (event.shiftKey ? at <= 0 : at === stops.length - 1) {
          event.preventDefault();
          stops[event.shiftKey ? stops.length - 1 : 0]?.focus();
        }
      }
    },

    /* ---- reordering: drag by the handle, or Up and Down arrow on a focused handle ---- */

    dragStart(kind, index, event) {
      if (this.sheets.busy || this.dialog) return event.preventDefault();
      this.dragging = { kind, from: index };
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(index));
      const row = event.target.closest('tr');
      if (row) event.dataTransfer.setDragImage(row, 16, 16);
    },
    /* Over a row of the same list: mark the drop above or below it (by the pointer's half of the row). */
    dragOver(kind, index, event) {
      if (this.dragging?.kind !== kind) return;
      event.preventDefault();
      const box = event.currentTarget.getBoundingClientRect();
      const after = event.clientY > box.top + box.height / 2;
      if (this.dropAt?.index !== index || this.dropAt?.after !== after) this.dropAt = { index, after };
    },
    drop(kind, index, event) {
      if (this.dragging?.kind !== kind) return;
      event.preventDefault();
      const box = event.currentTarget.getBoundingClientRect();
      const from = this.dragging.from;
      let to = index + (event.clientY > box.top + box.height / 2 ? 1 : 0);
      if (from < to) to--; // the dragged row leaves its place first
      if (kind === 'sheet') this.sheets.moveSheet(from, to);
      else this.sheets.moveSet(from, to);
      this.dragEnd();
    },
    dragEnd() {
      this.dragging = null;
      this.dropAt = null;
    },
    /* The drop mark on row `index` of list `kind`: 'before', 'after' or ''. */
    dropMark(kind, index) {
      if (this.dragging?.kind !== kind || this.dropAt?.index !== index) return '';
      return this.dropAt.after ? 'after' : 'before';
    },
    /* Up or Down arrow on a row's handle: the row moves one place, the handle keeps the focus, and the live region says
       where it went. */
    handleKey(kind, index, event) {
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
      event.preventDefault();
      if (this.dialog) return;
      const step = event.key === 'ArrowUp' ? -1 : 1;
      const to = kind === 'sheet' ? this.sheets.stepSheet(index, step) : this.sheets.stepSet(index, step);
      const list = event.target.closest('tbody');
      this.afterDraw(() => list?.querySelectorAll('.draghandle')[to]?.focus());
    },
  };
}
