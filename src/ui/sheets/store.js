/* Alpine.store('sheets'): the Sheets tab's saved sheets and the screen it shows, with the actions that change them. The
   rules and the saved shapes are docs/engineering/sheets.md.

   Screens: 'sheets' (the sheet manager), 'sheet' (one sheet's page: sheetId) and 'set' (one gear set's page: sheetId and
   setId). Which sheet or set is open is screen state, never saved; the page always opens at the manager.

   The sheets themselves stay out of reactive state (CLAUDE.md): they are kept in this module's closure as plain data,
   and the store's `rev` counts the changes. Every reader (list, sheet, currentSheet, currentSet) reads `rev` first, so a
   template or getter that shows a sheet tracks it, and every edit bumps it. A reader hands out the plain data: a view
   builder may read it, nothing may change it; changes go through the actions.

   Saving: each edit writes the one sheet record it changed (and the index when the order changes) through
   sheets/storage.js, which never throws. A failed save keeps the edit in memory and puts the storage's message in
   `saveMessage`; such a sheet (or the order, when the index could not be written) is kept from memory when the list is
   read again, until a later save of it works. With storage unavailable nothing is written and the page says so once
   (the manager's unavailableText).

   The edit lock: while `busy` is true (an Auto-fill runs: sheets.md, "The edit lock"; set by the set page) every edit action is
   refused and returns {ok: false, error: LOCKED_TEXT}. Opening and closing screens stays allowed.

   Leaving a set page: the set page puts a function in `leaveGuard` while it is open. Every way off the set page that
   goes through the store (openManager, openSheet, closeSet, openSet of another set) asks it first, handing it the move
   as a function: when the page has something to settle (a manual draft, a running Auto-fill, an Auto-fill result waiting) the
   guard returns true, asks the player, and calls the move again once that is settled; otherwise it returns false and
   the move goes ahead. */
import { isClan, partyRoles } from '../../core/clan-bonus.js';
import { makeJobContext } from '../../core/job-context.js';
import { formatRoute } from '../router/routes.js';
import { defaultStorage, deleteSheet as removeRecord, loadSheets, saveOrder, saveSheet } from './storage.js';
import {
  cleanDescription,
  FORM_FIELD,
  cleanName,
  copyGearSet,
  copyName,
  copySheet,
  defaultSetName,
  moveItem,
  newGearSet,
  newSheet,
  piecesToClear,
  randomId,
  repairSheet,
  sheetSettings,
} from './ops.js';

/* Why an edit is refused while an Auto-fill runs. */
export const LOCKED_TEXT = 'Nothing can be edited while Auto-fill is running.';
/* Why a name is refused (a New sheet, Copy sheet, Edit sheet or Edit gear set form; the box stays as it is). */
export const EMPTY_NAME_TEXT = 'Name cannot be empty.';
/* Why a New sheet form is refused with no job picked. */
export const JOB_REQUIRED_TEXT = 'Choose a job.';
/* Why a Copy sheet form is refused while the pieces the new job cannot wear are not accepted as cleared. */
export const ACK_REQUIRED_TEXT = 'Tick the box to clear the pieces the job cannot wear.';
/* Why an action on a sheet is refused when the sheet no longer exists (deleted in another tab). */
export const SHEET_GONE_TEXT = 'The sheet is gone.';

/* A refusal: {ok: false, error (the reason, for the user)} and, when the reason is about one field of a form, `field` (a
   FORM_FIELD value: the dialog marks that field and shows the reason in its label row). */
function refuse(error, field) {
  return field ? { ok: false, error, field } : { ok: false, error };
}

/* The note after a sheet or a gear set is copied: `name` is the copy's name. */
export function copiedNote(name) {
  return `Copied as “${name}”.`;
}

/* loadSheets(storage) with each sheet's level and cap repaired (sheets/ops.js repairSheet): a saved cap above what its level
   allows is lowered as the page lowers a typed one. The repair is written with the sheet's next edit. */
function readSheets(storage) {
  const loaded = loadSheets(storage);
  return { ...loaded, sheets: loaded.sheets.map(repairSheet) };
}

/* The store for Alpine.store('sheets'). Options (for tests): `storage` (a Storage, or null for none; the browser's by
   default), `now()` (the time in ms) and `makeId(prefix)` (a fresh id). */
export function createSheetStore({ storage = defaultStorage(), now = () => Date.now(), makeId = randomId } = {}) {
  // the sheets as last read or edited: loadSheets' {available, sheets, unreadable, indexProblem}
  let data = readSheets(storage);
  // ids of sheets whose last save failed: their edit lives only here; ORDER marks the order of the sheets (the index)
  const unsaved = new Set();
  const ORDER = Symbol('order');

  return {
    rev: 0,
    screen: 'sheets',
    sheetId: null,
    setId: null,
    // the sheet or set an address named that is not saved, {sheetId, setId (null: the sheet itself)}, or null: the page shows
    // "not found" while it is set (router.js); any screen change clears it
    missing: null,
    // the message of the last failed save ('' when every edit is saved)
    saveMessage: '',
    // a plain note after an action ("Deleted “UwU” sheet."), cleared by the page after a few seconds
    get note() {
      return this.noteText;
    },
    // each set counts in noteSeq, even a note identical to the one showing: the page restarts its clearing timer on the count
    set note(text) {
      this.noteText = text;
      this.noteSeq++;
    },
    noteText: '',
    noteSeq: 0,
    // an Auto-fill is running: every edit is refused (set by the set page)
    busy: false,
    // the open set page's question before leaving it, or null: guard(move) → true when it took the move over
    leaveGuard: null,

    /* ---- reading ---- */

    /* What the manager lists: {available, sheets, unreadable, indexProblem} (loadSheets' shape), plain data. */
    list() {
      void this.rev;
      return data;
    },
    /* The saved sheet with `id`, or null. */
    sheet(id) {
      void this.rev;
      return data.sheets.find(sheet => sheet.id === id) ?? null;
    },
    /* The open sheet (screens 'sheet' and 'set'), or null. */
    get currentSheet() {
      return this.screen === 'sheets' ? null : this.sheet(this.sheetId);
    },
    /* The open gear set (screen 'set'), or null. */
    get currentSet() {
      if (this.screen !== 'set') return null;
      return this.set(this.setId);
    },
    /* The open sheet's gear set with `id`, or null. */
    set(id) {
      return this.currentSheet?.sets.find(gearSet => gearSet.id === id) ?? null;
    },

    /* Read the sheets from storage again, keeping the ones whose save failed as they are in memory, and the order in
       memory while the order's save failed (sheets read fresh that memory lacks go at the end). With storage
       unavailable the sheets in memory are all there is, so they stay. */
    reload() {
      if (!data.available) return;
      const fresh = readSheets(storage);
      if (!fresh.available) return;
      const kept = data.sheets.filter(sheet => unsaved.has(sheet.id));
      let sheets = fresh.sheets.map(sheet => kept.find(k => k.id === sheet.id) ?? sheet);
      for (const sheet of kept) if (!sheets.some(s => s.id === sheet.id)) sheets.unshift(sheet);
      if (unsaved.has(ORDER)) {
        const place = id => {
          const at = data.sheets.findIndex(sheet => sheet.id === id);
          return at < 0 ? data.sheets.length : at;
        };
        sheets = [...sheets].sort((a, b) => place(a.id) - place(b.id));
      }
      data = { ...fresh, sheets };
      this.rev++;
    },

    /* ---- screens ---- */

    /* Whether the open set page holds the move `move` back to ask first (leaveGuard); false on any other screen. */
    askLeave(move) {
      return this.screen === 'set' && typeof this.leaveGuard === 'function' && this.leaveGuard(move) === true;
    },

    /* The address (a hash) of the Sheets screen of `sheetId` and `setId`: the list with neither, the sheet's page with a sheet, the
       gear set's page with both. For the links of the lists and the breadcrumb, so Open in new tab and Copy link give the screen. */
    href(sheetId = null, setId = null) {
      if (!sheetId) return formatRoute({ tab: 'sheets', screen: 'sheets' });
      return formatRoute(setId ? { tab: 'sheets', screen: 'set', sheetId, setId } : { tab: 'sheets', screen: 'sheet', sheetId });
    },

    /* The sheet manager, read fresh. */
    openManager() {
      if (this.askLeave(() => this.openManager())) return;
      this.reload();
      Object.assign(this, { screen: 'sheets', sheetId: null, setId: null, missing: null });
    },
    /* The page of the sheet with `id`, read fresh; the manager when it is gone. */
    openSheet(id) {
      if (this.askLeave(() => this.openSheet(id))) return;
      this.reload();
      if (!this.sheet(id)) return this.openManager();
      Object.assign(this, { screen: 'sheet', sheetId: id, setId: null, missing: null });
    },
    /* The page of the open sheet's gear set with `id` (the set page; from another set page it asks first). */
    openSet(id) {
      const sheet = this.sheet(this.sheetId);
      if (!sheet?.sets.some(gearSet => gearSet.id === id)) return;
      if (id !== this.setId && this.askLeave(() => this.openSet(id))) return;
      Object.assign(this, { screen: 'set', setId: id, missing: null });
    },
    /* The "not found" screen for the sheet `sheetId` (or its gear set `setId`) an address named that is not saved. It asks
       the leave guard first, like every move off a set page. The sheet and set open are left as they are. */
    showMissing(sheetId, setId = null) {
      if (this.askLeave(() => this.showMissing(sheetId, setId))) return;
      this.missing = { sheetId, setId };
    },
    /* Back from a set page to its sheet's list of gear sets. */
    closeSet() {
      if (this.askLeave(() => this.closeSet())) return;
      if (this.screen === 'set') Object.assign(this, { screen: 'sheet', setId: null, missing: null });
    },

    /* ---- saving ---- */

    /* `sheet` replaced in the list and saved (its updatedAt stamped unless `touch` is false). Returns {ok: true} or the
       failed save ({ok: false, reason, message}); the edit stays in memory either way. */
    commit(sheet, { touch = true } = {}) {
      const next = touch ? { ...sheet, updatedAt: now() } : sheet;
      const at = data.sheets.findIndex(s => s.id === next.id);
      const sheets = at < 0 ? [next, ...data.sheets] : data.sheets.map((s, i) => (i === at ? next : s));
      data = { ...data, sheets };
      this.rev++;
      if (!data.available) return { ok: true };
      const saved = saveSheet(next, storage);
      this.noteSave(next.id, saved);
      return saved;
    },
    /* Keep track of a save's result for `what` (a sheet's id, or ORDER for the order of the sheets): which edits live
       only in memory (reload keeps them), and the message of the last failed save, cleared once every edit is saved. */
    noteSave(what, saved) {
      if (saved.ok) unsaved.delete(what);
      else unsaved.add(what);
      this.saveMessage = saved.ok ? (unsaved.size ? this.saveMessage : '') : saved.message;
    },
    /* The order of the sheets saved (ids, first is top). */
    commitOrder(sheets) {
      data = { ...data, sheets };
      this.rev++;
      if (!data.available) return { ok: true };
      const saved = saveOrder(
        sheets.map(sheet => sheet.id),
        storage,
      );
      this.noteSave(ORDER, saved);
      return saved;
    },
    /* A refusal while an Auto-fill runs, or null. */
    locked() {
      return this.busy ? { ok: false, error: LOCKED_TEXT } : null;
    },

    /* ---- sheets ---- */

    /* A new sheet from the New sheet form's `fields` ({name, description, job, level, sync: {on, cap}}): checked
       (a job, a name that is not empty after trimming), put at the top of the list, saved and opened. Returns {ok, id}
       or {ok: false, error}. */
    createSheet(fields) {
      const refused = this.locked();
      if (refused) return refused;
      if (!fields.job) return refuse(JOB_REQUIRED_TEXT, FORM_FIELD.job);
      const name = cleanName(fields.name);
      if (!name) return refuse(EMPTY_NAME_TEXT, FORM_FIELD.name);
      const job = makeJobContext(fields.job);
      const { level, sync } = sheetSettings(job.jobId, fields);
      const sheet = newSheet({ name, description: cleanDescription(fields.description), job: job.jobId, level, sync }, makeId('s_'), now());
      this.commit(sheet, { touch: false });
      Object.assign(this, { screen: 'sheet', sheetId: sheet.id, setId: null, missing: null });
      return { ok: true, id: sheet.id };
    },

    /* The name and description of the sheet with `id` (the "Edit sheet" dialog). A name empty after trimming is refused
       and the sheet keeps its old one. Returns {ok} or {ok: false, error}. */
    editSheet(id, { name, description }) {
      const refused = this.locked();
      if (refused) return refused;
      const sheet = this.sheet(id);
      if (!sheet) return refuse(SHEET_GONE_TEXT);
      const clean = cleanName(name);
      if (!clean) return refuse(EMPTY_NAME_TEXT, FORM_FIELD.name);
      this.commit({ ...sheet, name: clean, description: cleanDescription(description) });
      return { ok: true };
    },

    /* Copy the sheet with `id` as `fields` ({name, job, level, sync: {on, cap}}; the job one of copy targets or its
       own). The copy goes to the top of the list and the manager shows, with a note naming it (the pieces cleared are not
       counted in the note: the form asked first). `acknowledged` must be true when the new job cannot wear some pieces (piecesToClear): the form asks
       first. Returns {ok, id} or {ok: false, error}. */
    copySheet(id, fields, acknowledged = false) {
      const refused = this.locked();
      if (refused) return refused;
      const sheet = this.sheet(id);
      if (!sheet) return refuse(SHEET_GONE_TEXT);
      const name = cleanName(fields.name);
      if (!name) return refuse(EMPTY_NAME_TEXT, FORM_FIELD.name);
      const cleared = piecesToClear(sheet, fields.job);
      if (cleared.length && !acknowledged) return refuse(ACK_REQUIRED_TEXT, FORM_FIELD.ack);
      const job = makeJobContext(fields.job);
      const { level, sync } = sheetSettings(job.jobId, fields, { level: sheet.level, cap: sheet.sync.cap });
      const copy = copySheet(sheet, { name, job: job.jobId, level, sync }, makeId('s_'), now(), () => makeId('g_'));
      this.commit(copy, { touch: false });
      Object.assign(this, { screen: 'sheets', sheetId: null, setId: null, missing: null });
      this.note = copiedNote(name);
      return { ok: true, id: copy.id };
    },

    /* Delete the sheet with `id` and all its gear sets (the page asked first). From the sheet's own page or one of its
       set pages the manager shows; from the manager it stays (sheets.md, "Where an action lands"). Returns {ok} or
       {ok: false, error}. */
    deleteSheet(id) {
      const refused = this.locked();
      if (refused) return refused;
      const sheet = this.sheet(id);
      if (!sheet) return refuse(SHEET_GONE_TEXT);
      data = { ...data, sheets: data.sheets.filter(s => s.id !== id) };
      unsaved.delete(id);
      this.rev++;
      if (data.available) this.noteSave(id, removeRecord(id, storage));
      if (this.sheetId === id) Object.assign(this, { screen: 'sheets', sheetId: null, setId: null, missing: null });
      this.note = `Deleted “${sheet.name}” sheet.`;
      return { ok: true };
    },

    /* Delete a record the manager could not read (its "Could not be read" list; the page asked first). */
    deleteUnreadable(id) {
      const refused = this.locked();
      if (refused) return refused;
      const saved = removeRecord(id, storage);
      if (!saved.ok) {
        this.saveMessage = saved.message;
        return saved;
      }
      data = { ...data, unreadable: data.unreadable.filter(record => record.id !== id) };
      this.rev++;
      return { ok: true };
    },

    /* Move the sheet at `from` to `to` (indexes in the list; a drop). Returns {ok}. */
    moveSheet(from, to) {
      const refused = this.locked();
      if (refused) return refused;
      if (from === to) return { ok: true };
      return this.commitOrder(moveItem(data.sheets, from, to));
    },

    /* Move the sheet at `from` one place up (`step` -1) or down (+1), from the keyboard. Returns the index it is at now. */
    stepSheet(from, step) {
      return this.stepIn(data.sheets, from, step, (a, b) => this.moveSheet(a, b));
    },

    /* The keyboard reorder of one list: the move. Returns the row's index after it. */
    stepIn(list, from, step, move) {
      if (this.busy) return from;
      const to = from + step;
      if (to < 0 || to >= list.length) return from;
      move(from, to);
      return to;
    },

    /* The open sheet's level (the level sync), as typed: held to 1..the job's level cap; every set is evaluated with
       it, nothing asked (sheets.md, "A sheet's level and sync"). The cap follows it (editSettings). */
    setLevel(value) {
      return this.editSettings(sheet => ({ ...sheet, level: value }));
    },
    /* The open sheet's item level sync switched on or off (its cap is kept, and follows the level once on). */
    setSyncOn(on) {
      return this.editSettings(sheet => ({ ...sheet, sync: { ...sheet.sync, on: !!on } }));
    },
    /* The open sheet's item level cap, as typed: a whole number from 1, lowered to what the level allows (editSettings). */
    setCap(value) {
      return this.editSettings(sheet => ({ ...sheet, sync: { ...sheet.sync, cap: value } }));
    },
    /* The open sheet with the level and sync `change(sheet)` returns ({level, sync: {on, cap}}, as typed), checked by
       sheetSettings: the level held to the job, the cap lowered to what the level allows while sync is on, as on the
       Job and sync panel. Saved when one differs. Returns {ok, lowered} (lowered: sheetSettings', for the note under
       the cap field, also when nothing changed: the same too-high cap typed again), or a refusal. */
    editSettings(change) {
      const refused = this.locked();
      if (refused) return refused;
      const sheet = this.currentSheet;
      if (!sheet) return { ok: false, error: 'No sheet is open.' };
      const { lowered, ...fields } = sheetSettings(sheet.job, change(sheet), { level: sheet.level, cap: sheet.sync.cap });
      if (Object.entries(fields).every(([key, value]) => JSON.stringify(sheet[key]) === JSON.stringify(value)))
        return { ok: true, lowered };
      // the tied best meals of its sets were found for the old level and sync: they go
      const sets = sheet.sets.map(gearSet => (gearSet.bestMeals ? { ...gearSet, bestMeals: null } : gearSet));
      return { ...this.commit({ ...sheet, ...fields, sets }), lowered };
    },

    /* The open sheet's clan, `name` a clan's name ("Midlander"); anything else (null, '') is no clan. Display only: the
       totals of its sets count it, the search does not. Saved when it differs. Returns {ok} or a refusal. */
    setClan(name) {
      return this.editBonus({ clan: isClan(name) ? name : null });
    },
    /* The open sheet's party bonus, `value` unique roles (a whole number held to 0..5; 1% each). Saved when it differs. */
    setPartyRoles(value) {
      return this.editBonus({ partyRoles: partyRoles(value) });
    },
    /* The open sheet with `fields` (clan, partyRoles) replaced and saved, when one differs. Unlike a level or a sync
       change it leaves the sets' tagged best meals alone: the bonuses are not part of the search. */
    editBonus(fields) {
      const refused = this.locked();
      if (refused) return refused;
      const sheet = this.currentSheet;
      if (!sheet) return { ok: false, error: 'No sheet is open.' };
      // a sheet saved before the bonuses has neither field: that is none
      const current = { clan: sheet.clan ?? null, partyRoles: sheet.partyRoles ?? 0 };
      if (Object.entries(fields).every(([key, value]) => current[key] === value)) return { ok: true };
      return this.commit({ ...sheet, ...fields });
    },

    /* ---- gear sets of the open sheet ---- */

    /* A new, empty gear set at the end of the open sheet's list, named "Set N", and its page opened. Returns {ok, id}. */
    newSet() {
      const refused = this.locked();
      if (refused) return refused;
      const sheet = this.currentSheet;
      if (!sheet) return { ok: false, error: 'No sheet is open.' };
      const gearSet = newGearSet(defaultSetName(sheet), this.newSetId(sheet), now());
      this.commit({ ...sheet, sets: [...sheet.sets, gearSet] });
      Object.assign(this, { screen: 'set', setId: gearSet.id, missing: null });
      return { ok: true, id: gearSet.id };
    },
    /* A set id no set of `sheet` has. */
    newSetId(sheet) {
      let id;
      do id = makeId('g_');
      while (sheet.sets.some(gearSet => gearSet.id === id));
      return id;
    },

    /* A copy of the open sheet's gear set `id`, next to it, named "<name> (1)"; the list stays. */
    copySet(id) {
      const refused = this.locked();
      if (refused) return refused;
      const sheet = this.currentSheet;
      const at = sheet?.sets.findIndex(gearSet => gearSet.id === id) ?? -1;
      if (at < 0) return { ok: false, error: 'The gear set is gone.' };
      const original = sheet.sets[at];
      const name = copyName(
        original.name,
        sheet.sets.map(gearSet => gearSet.name),
      );
      const copy = copyGearSet(original, name, this.newSetId(sheet), now());
      this.commit({ ...sheet, sets: [...sheet.sets.slice(0, at + 1), copy, ...sheet.sets.slice(at + 1)] });
      this.note = copiedNote(name);
      return { ok: true, id: copy.id };
    },

    /* Delete the open sheet's gear set `id` (the page asked first). From its own page the sheet's list shows; from the
       list it stays. */
    deleteSet(id) {
      const refused = this.locked();
      if (refused) return refused;
      const sheet = this.currentSheet;
      const gearSet = this.set(id);
      if (!gearSet) return { ok: false, error: 'The gear set is gone.' };
      this.commit({ ...sheet, sets: sheet.sets.filter(s => s.id !== id) });
      if (this.setId === id) Object.assign(this, { screen: 'sheet', setId: null, missing: null });
      this.note = `Deleted “${gearSet.name}” gear set.`;
      return { ok: true };
    },

    /* The name and description of the open sheet's gear set `id` (the "Edit gear set" dialog). */
    editSet(id, { name, description }) {
      const refused = this.locked();
      if (refused) return refused;
      const clean = cleanName(name);
      if (!clean) return refuse(EMPTY_NAME_TEXT, FORM_FIELD.name);
      return this.updateSet(id, { name: clean, description: cleanDescription(description) });
    },

    /* The open sheet's gear set `id` with `fields` replaced (any of name, description, pieces, meal, pinned,
       fillSettings) and saved, its updatedAt and the sheet's stamped: the set page's one way to save a set (Apply). */
    updateSet(id, fields) {
      const refused = this.locked();
      if (refused) return refused;
      const sheet = this.currentSheet;
      if (!sheet?.sets.some(gearSet => gearSet.id === id)) return { ok: false, error: 'The gear set is gone.' };
      const at = now();
      const sets = sheet.sets.map(gearSet => (gearSet.id === id ? { ...gearSet, ...fields, updatedAt: at } : gearSet));
      return this.commit({ ...sheet, sets });
    },

    /* Move the open sheet's gear set at `from` to `to` (a drop). */
    moveSet(from, to) {
      const refused = this.locked();
      if (refused) return refused;
      const sheet = this.currentSheet;
      if (!sheet || from === to) return { ok: true };
      return this.commit({ ...sheet, sets: moveItem(sheet.sets, from, to) });
    },

    /* Move the open sheet's gear set at `from` one place, from the keyboard (as stepSheet). */
    stepSet(from, step) {
      const sheet = this.currentSheet;
      return sheet ? this.stepIn(sheet.sets, from, step, (a, b) => this.moveSet(a, b)) : from;
    },
  };
}
