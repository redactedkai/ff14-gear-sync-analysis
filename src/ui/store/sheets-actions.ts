/* The Sheets tab's actions on the store: the saved sheets and the screen it shows, with the rules of the old Sheets store
   kept as they were; the rules and the saved shapes are docs/engineering/sheets.md.

   Screens: 'sheets' (the sheet manager), 'sheet' (one sheet's page: sheetId) and 'set' (one gear set's page: sheetId and setId).
   Which sheet or set is open is screen state, never saved; the page always opens at the manager.

   Saving: each edit writes the one sheet record it changed (and the index when the order changes) through sheets/storage.js,
   which never throws. A failed save keeps the edit in memory and puts the storage's message in `saveMessage`; such a sheet (or the
   order, when the index could not be written) is kept from memory when the list is read again, until a later save of it works.
   With storage unavailable nothing is written and the page says so once (the manager's unavailableText).

   The edit lock: while `busy` is true (an Auto-fill runs: sheets.md, "The edit lock"; set by the set page) every edit action is
   refused and returns {ok: false, error: LOCKED_TEXT}. Opening and closing screens stays allowed.

   Leaving a set page: the set page registers a function with `setLeaveGuard` while it is open (what it holds that a move would
   lose is the `setPages` slice: set-page-actions.ts, and the `unsettled` selector). Every way off the set page that goes
   through the actions (openManager, openSheet, closeSet, openSet of another set, showMissing) asks it first, handing it the move as a
   function: when the page has something to settle (a manual draft, a running Auto-fill, an Auto-fill result waiting) the guard
   returns true, asks the player, and calls the move again once that is settled; otherwise it returns false and the move goes ahead.
   The guard is a function, so it is kept here and not in the state.

   An action that is refused or would change nothing returns before `update`: no revision, so no render and no save. The sheets are
   plain data an action replaces, never edits in place. */
import { isClan, partyRoles } from '../../core/clan-bonus.js';
import { makeJobContext } from '../../core/job-context.js';
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
  sheetSettings,
} from '../sheets/ops.js';
import {
  ACK_REQUIRED_TEXT,
  EMPTY_NAME_TEXT,
  JOB_REQUIRED_TEXT,
  LOCKED_TEXT,
  NO_SHEET_OPEN_TEXT,
  SET_GONE_TEXT,
  SHEET_GONE_TEXT,
  copiedNote,
  deletedSetNote,
  deletedSheetNote,
  readSheets,
  refuse,
} from '../sheets/store-shared.js';
import { defaultStorage, deleteSheet as removeRecord, saveOrder, saveSheet } from '../sheets/storage.js';
import { ORDER_MARK, currentSheet, setOf, sheetById } from './app-state.ts';
import type { AppStore, GearSet, Sheet, SheetsState } from './app-state.ts';

/* What an action on a sheet returns: ok, and for a refusal the reason (`error`, for the user) and the form field it is about
   (`field`, a FORM_FIELD value); a save that failed has `reason` and `message` (storage.js); a new sheet or set has its `id`; a
   settings edit has `lowered` (sheetSettings'). */
export interface SheetResult {
  ok: boolean;
  error?: string;
  field?: string;
  reason?: string;
  message?: string;
  id?: string;
  lowered?: { from: number; to: number; level: number | null } | null;
}

/* The fields of the New sheet and Copy sheet forms: name, description, job, level and sync {on, cap}, as typed. */
export interface SheetFormFields {
  name: string;
  description?: string;
  job: string;
  level: unknown;
  sync: { on: boolean; cap: unknown };
}

/* A move the leave guard may hold back: called again once the set page has settled. */
export type LeaveMove = () => void;

/* The set page's question before leaving it: returns true when it took the move over (and will call it later). */
export type LeaveGuard = (move: LeaveMove) => boolean;

/* The browser's Storage, as far as the sheets' storage reads and writes it (a test hands in a stand-in); null: none. */
export type SheetStorage = ReturnType<typeof defaultStorage>;

/* How the actions reach what is not state. storage: where the sheets are saved (the browser's by default; null for none),
   now(): the time in ms, makeId(prefix): a fresh id. */
export interface SheetsActionOptions {
  storage?: SheetStorage;
  now?: () => number;
  makeId?: (prefix: string) => string;
}

/* A refusal while an Auto-fill runs, or null. */
function lockedRefusal(sheets: SheetsState): SheetResult | null {
  return sheets.busy ? { ok: false, error: LOCKED_TEXT } : null;
}

/* The actions of the Sheets tab on `store`, as an object of functions. */
export function createSheetsActions(store: AppStore, options: SheetsActionOptions = {}) {
  const storage = options.storage === undefined ? defaultStorage() : options.storage;
  const now = options.now ?? (() => Date.now());
  const makeId = options.makeId ?? randomId;
  // the set page's function, kept here because a function is not state: guard(move) asks before leaving
  let leaveGuard: LeaveGuard | null = null;

  /* ---- inside an update: the steps the actions share, on the sheets slice ---- */

  /* Put `text` in the note and count it, even when it is the one showing: the page restarts its clearing timer on the count. */
  function setNoteIn(sheets: SheetsState, text: string): void {
    sheets.noteText = text;
    sheets.noteSeq += 1;
  }

  /* Keep track of a save's result `saved` for `what` (a sheet's id, or ORDER_MARK for the order of the sheets): which edits
     live only in memory (reload keeps them), and the message of the last failed save, cleared once every edit is saved. */
  function noteSaveIn(sheets: SheetsState, what: string, saved: SheetResult): void {
    if (saved.ok) {
      sheets.unsaved.delete(what);
    } else {
      sheets.unsaved.add(what);
    }
    let message = saved.message ?? '';
    if (saved.ok) {
      message = sheets.unsaved.size ? sheets.saveMessage : '';
    }
    sheets.saveMessage = message;
  }

  /* `sheet` replaced in the list (or put on top when new) and saved, its updatedAt stamped unless `touch` is false. Returns
     {ok: true} or the failed save; the edit stays in memory either way. */
  function commitIn(sheets: SheetsState, sheet: Sheet, touch = true): SheetResult {
    const next = touch ? { ...sheet, updatedAt: now() } : sheet;
    const at = sheets.data.sheets.findIndex(existing => existing.id === next.id);
    const list = at < 0 ? [next, ...sheets.data.sheets] : sheets.data.sheets.map((existing, index) => (index === at ? next : existing));
    sheets.data = { ...sheets.data, sheets: list };
    if (!sheets.data.available) {
      return { ok: true };
    }
    const saved = saveSheet(next, storage) as SheetResult;
    noteSaveIn(sheets, next.id, saved);
    return saved;
  }

  /* The order of the sheets, `list` (first is top), saved. */
  function commitOrderIn(sheets: SheetsState, list: Sheet[]): SheetResult {
    sheets.data = { ...sheets.data, sheets: list };
    if (!sheets.data.available) {
      return { ok: true };
    }
    const saved = saveOrder(
      list.map(sheet => sheet.id),
      storage,
    ) as SheetResult;
    noteSaveIn(sheets, ORDER_MARK, saved);
    return saved;
  }

  /* A set id no set of `sheet` has. */
  function newSetId(sheet: Sheet): string {
    let id: string;
    do {
      id = makeId('g_');
    } while (sheet.sets.some(gearSet => gearSet.id === id));
    return id;
  }

  /* ---- reading the guard ---- */

  /* Whether the open set page holds the move `move` back to ask first (the leave guard); false on any other screen. */
  function askLeave(move: LeaveMove): boolean {
    return store.state.sheets.screen === 'set' && typeof leaveGuard === 'function' && leaveGuard(move) === true;
  }

  /* The keyboard reorder of one list: the move. Returns the row's index after it. */
  function stepIn(listLength: number, from: number, step: number, move: (from: number, to: number) => void): number {
    if (store.state.sheets.busy) {
      return from;
    }
    const to = from + step;
    if (to < 0 || to >= listLength) {
      return from;
    }
    move(from, to);
    return to;
  }

  /* The open sheet with the level and sync `change(sheet)` returns ({level, sync: {on, cap}}, as typed), checked by
     sheetSettings: the level held to the job, the cap lowered to what the level allows while sync is on, as on the Job and sync
     panel. Saved when one differs. Returns {ok, lowered} (lowered: sheetSettings', for the note under the cap field, also when
     nothing changed: the same too-high cap typed again), or a refusal. */
  function editSettings(change: (sheet: Sheet) => { level: unknown; sync: { on: boolean; cap: unknown } }): SheetResult {
    const refused = lockedRefusal(store.state.sheets);
    if (refused) {
      return refused;
    }
    const sheet = currentSheet(store.state);
    if (!sheet) {
      return { ok: false, error: NO_SHEET_OPEN_TEXT };
    }
    const { lowered, ...fields } = sheetSettings(sheet.job, change(sheet), { level: sheet.level, cap: sheet.sync.cap });
    if (Object.entries(fields).every(([key, value]) => JSON.stringify(sheet[key]) === JSON.stringify(value))) {
      return { ok: true, lowered };
    }
    // the tied best meals of its sets were found for the old level and sync: they go
    const sets = sheet.sets.map(gearSet => (gearSet.bestMeals ? { ...gearSet, bestMeals: null } : gearSet));
    const saved = store.update('sheets/editSettings', state => commitIn(state.sheets, { ...sheet, ...fields, sets }));
    return { ...saved, lowered };
  }

  /* The open sheet with `fields` (clan, partyRoles) replaced and saved, when one differs. Unlike a level or a sync change it
     leaves the sets' tagged best meals alone: the bonuses are not part of the search. */
  function editBonus(fields: { clan?: string | null; partyRoles?: number }): SheetResult {
    const refused = lockedRefusal(store.state.sheets);
    if (refused) {
      return refused;
    }
    const sheet = currentSheet(store.state);
    if (!sheet) {
      return { ok: false, error: NO_SHEET_OPEN_TEXT };
    }
    // a sheet saved before the bonuses has neither field: that is none
    const current: Record<string, unknown> = { clan: sheet.clan ?? null, partyRoles: sheet.partyRoles ?? 0 };
    if (Object.entries(fields).every(([key, value]) => current[key] === value)) {
      return { ok: true };
    }
    return store.update('sheets/editBonus', state => commitIn(state.sheets, { ...sheet, ...fields }));
  }

  /* The open sheet's gear set `id` with `fields` replaced (any of name, description, pieces, meal, pinned, fillSettings) and
     saved, its updatedAt and the sheet's stamped: the set page's one way to save a set (Apply). */
  function updateSet(id: string, fields: Partial<GearSet>): SheetResult {
    const refused = lockedRefusal(store.state.sheets);
    if (refused) {
      return refused;
    }
    const sheet = currentSheet(store.state);
    if (!sheet?.sets.some(gearSet => gearSet.id === id)) {
      return { ok: false, error: SET_GONE_TEXT };
    }
    const stamp = now();
    const sets = sheet.sets.map(gearSet => (gearSet.id === id ? { ...gearSet, ...fields, updatedAt: stamp } : gearSet));
    return store.update('sheets/updateSet', state => commitIn(state.sheets, { ...sheet, sets }));
  }

  /* The sheet with `id` moved from index `from` to `to` in the list (a drop). Returns {ok}. */
  function moveSheet(from: number, to: number): SheetResult {
    const refused = lockedRefusal(store.state.sheets);
    if (refused) {
      return refused;
    }
    if (from === to) {
      return { ok: true };
    }
    return store.update('sheets/moveSheet', state => commitOrderIn(state.sheets, moveItem(state.sheets.data.sheets, from, to)));
  }

  /* The open sheet's gear set at `from` moved to `to` (a drop). */
  function moveSet(from: number, to: number): SheetResult {
    const refused = lockedRefusal(store.state.sheets);
    if (refused) {
      return refused;
    }
    const sheet = currentSheet(store.state);
    if (!sheet || from === to) {
      return { ok: true };
    }
    return store.update('sheets/moveSet', state => commitIn(state.sheets, { ...sheet, sets: moveItem(sheet.sets, from, to) }));
  }

  /* Read the sheets from storage again, keeping the ones whose save failed as they are in memory, and the order in memory while
     the order's save failed (sheets read fresh that memory lacks go at the end). With storage unavailable the sheets in memory
     are all there is, so they stay. */
  function reload(): void {
    if (!store.state.sheets.data.available) {
      return;
    }
    const fresh = readSheets(storage) as typeof store.state.sheets.data;
    if (!fresh.available) {
      return;
    }
    store.update('sheets/reload', state => {
      const { data, unsaved } = state.sheets;
      const kept = data.sheets.filter(sheet => unsaved.has(sheet.id));
      let sheets = fresh.sheets.map(sheet => kept.find(keptSheet => keptSheet.id === sheet.id) ?? sheet);
      for (const sheet of kept) {
        if (!sheets.some(other => other.id === sheet.id)) {
          sheets.unshift(sheet);
        }
      }
      if (unsaved.has(ORDER_MARK)) {
        const place = (id: string) => {
          const at = data.sheets.findIndex(sheet => sheet.id === id);
          return at < 0 ? data.sheets.length : at;
        };
        sheets = [...sheets].sort((a, b) => place(a.id) - place(b.id));
      }
      state.sheets.data = { ...fresh, sheets };
    });
  }

  /* The sheet manager, read fresh. Asks the leave guard first. */
  function openManager(): void {
    if (askLeave(openManager)) {
      return;
    }
    reload();
    store.update(
      'sheets/openManager',
      state => void Object.assign(state.sheets, { screen: 'sheets', sheetId: null, setId: null, missing: null }),
    );
  }

  /* The page of the sheet with `id`, read fresh; the manager when it is gone. Asks the leave guard first. */
  function openSheet(id: string): void {
    if (askLeave(() => openSheet(id))) {
      return;
    }
    reload();
    if (!sheetById(store.state, id)) {
      openManager();
      return;
    }
    store.update(
      'sheets/openSheet',
      state => void Object.assign(state.sheets, { screen: 'sheet', sheetId: id, setId: null, missing: null }),
    );
  }

  /* The page of the open sheet's gear set with `id` (the set page; from another set page it asks first). */
  function openSet(id: string): void {
    const sheet = sheetById(store.state, store.state.sheets.sheetId);
    if (!sheet?.sets.some(gearSet => gearSet.id === id)) {
      return;
    }
    if (id !== store.state.sheets.setId && askLeave(() => openSet(id))) {
      return;
    }
    store.update('sheets/openSet', state => void Object.assign(state.sheets, { screen: 'set', setId: id, missing: null }));
  }

  /* The "not found" screen for the sheet `sheetId` (or its gear set `setId`) an address named that is not saved. It asks the
     leave guard first, like every move off a set page. The sheet and set open are left as they are. */
  function showMissing(sheetId: string, setId: string | null = null): void {
    if (askLeave(() => showMissing(sheetId, setId))) {
      return;
    }
    store.update('sheets/showMissing', state => {
      state.sheets.missing = { sheetId, setId };
    });
  }

  /* Back from a set page to its sheet's list of gear sets. */
  function closeSet(): void {
    if (askLeave(closeSet)) {
      return;
    }
    if (store.state.sheets.screen !== 'set') {
      return;
    }
    store.update('sheets/closeSet', state => void Object.assign(state.sheets, { screen: 'sheet', setId: null, missing: null }));
  }

  return {
    editSettings,
    editBonus,
    updateSet,
    moveSheet,
    moveSet,
    reload,
    openManager,
    openSheet,
    openSet,
    showMissing,
    closeSet,

    /* `sheet` (a whole saved sheet) put in the list, in place of the one with its id or on top when new, and saved, its updatedAt
       stamped unless `touch` is false. Returns {ok: true} or the failed save. For the example sheets of a DEV build. */
    commitSheet(sheet: Sheet, { touch = true }: { touch?: boolean } = {}): SheetResult {
      return store.update('sheets/commitSheet', state => commitIn(state.sheets, sheet, touch));
    },

    /* The set page's question before leaving it, or null for none: `guard(move)` returns true when it took the move over. */
    setLeaveGuard(guard: LeaveGuard | null): void {
      leaveGuard = guard;
    },

    askLeave,

    /* Whether an Auto-fill runs, so every edit is refused (set by the set page). */
    setBusy(busy: boolean): void {
      if (store.state.sheets.busy === Boolean(busy)) {
        return;
      }
      store.update('sheets/setBusy', state => {
        state.sheets.busy = Boolean(busy);
      });
    },

    /* A plain note after an action ('' clears it); each call counts in noteSeq, even a note identical to the one showing. */
    setNote(text: string): void {
      store.update('sheets/setNote', state => setNoteIn(state.sheets, text));
    },

    /* A refusal while an Auto-fill runs, or null. */
    locked(): SheetResult | null {
      return lockedRefusal(store.state.sheets);
    },

    /* A new sheet from the New sheet form's `fields` ({name, description, job, level, sync: {on, cap}}): checked (a job, a name
       that is not empty after trimming), put at the top of the list, saved and opened. Returns {ok, id} or {ok: false, error}. */
    createSheet(fields: SheetFormFields): SheetResult {
      const refused = lockedRefusal(store.state.sheets);
      if (refused) {
        return refused;
      }
      if (!fields.job) {
        return refuse(JOB_REQUIRED_TEXT, FORM_FIELD.job);
      }
      const name = cleanName(fields.name);
      if (!name) {
        return refuse(EMPTY_NAME_TEXT, FORM_FIELD.name);
      }
      const job = makeJobContext(fields.job);
      const { level, sync } = sheetSettings(job.jobId, fields);
      const sheet = newSheet(
        { name, description: cleanDescription(fields.description), job: job.jobId, level, sync },
        makeId('s_'),
        now(),
      ) as Sheet;
      store.update('sheets/createSheet', state => {
        commitIn(state.sheets, sheet, false);
        Object.assign(state.sheets, { screen: 'sheet', sheetId: sheet.id, setId: null, missing: null });
      });
      return { ok: true, id: sheet.id };
    },

    /* The name and description of the sheet with `id` (the "Edit sheet" dialog). A name empty after trimming is refused and the
       sheet keeps its old one. */
    editSheet(id: string, { name, description }: { name: string; description?: string }): SheetResult {
      const refused = lockedRefusal(store.state.sheets);
      if (refused) {
        return refused;
      }
      const sheet = sheetById(store.state, id);
      if (!sheet) {
        return refuse(SHEET_GONE_TEXT);
      }
      const clean = cleanName(name);
      if (!clean) {
        return refuse(EMPTY_NAME_TEXT, FORM_FIELD.name);
      }
      store.update(
        'sheets/editSheet',
        state => void commitIn(state.sheets, { ...sheet, name: clean, description: cleanDescription(description) }),
      );
      return { ok: true };
    },

    /* Copy the sheet with `id` as `fields` ({name, job, level, sync: {on, cap}}; the job one of copy targets or its own). The
       copy goes to the top of the list and the manager shows, with a note naming it (the pieces cleared are not counted in the
       note: the form asked first). `acknowledged` must be true when the new job cannot wear some pieces (piecesToClear): the
       form asks first. Returns {ok, id} or {ok: false, error}. */
    copySheet(id: string, fields: SheetFormFields, acknowledged = false): SheetResult {
      const refused = lockedRefusal(store.state.sheets);
      if (refused) {
        return refused;
      }
      const sheet = sheetById(store.state, id);
      if (!sheet) {
        return refuse(SHEET_GONE_TEXT);
      }
      const name = cleanName(fields.name);
      if (!name) {
        return refuse(EMPTY_NAME_TEXT, FORM_FIELD.name);
      }
      const cleared = piecesToClear(sheet, fields.job);
      if (cleared.length && !acknowledged) {
        return refuse(ACK_REQUIRED_TEXT, FORM_FIELD.ack);
      }
      const job = makeJobContext(fields.job);
      const { level, sync } = sheetSettings(job.jobId, fields, { level: sheet.level, cap: sheet.sync.cap });
      const copy = copySheet(sheet, { name, job: job.jobId, level, sync }, makeId('s_'), now(), () => makeId('g_')) as Sheet;
      store.update('sheets/copySheet', state => {
        commitIn(state.sheets, copy, false);
        Object.assign(state.sheets, { screen: 'sheets', sheetId: null, setId: null, missing: null });
        setNoteIn(state.sheets, copiedNote(name));
      });
      return { ok: true, id: copy.id };
    },

    /* Delete the sheet with `id` and all its gear sets (the page asked first). From the sheet's own page or one of its set
       pages the manager shows; from the manager it stays (sheets.md, "Where an action lands"). */
    deleteSheet(id: string): SheetResult {
      const refused = lockedRefusal(store.state.sheets);
      if (refused) {
        return refused;
      }
      const sheet = sheetById(store.state, id);
      if (!sheet) {
        return refuse(SHEET_GONE_TEXT);
      }
      store.update('sheets/deleteSheet', state => {
        const { sheets } = state;
        sheets.data = { ...sheets.data, sheets: sheets.data.sheets.filter(other => other.id !== id) };
        sheets.unsaved.delete(id);
        if (sheets.data.available) {
          noteSaveIn(sheets, id, removeRecord(id, storage) as SheetResult);
        }
        if (sheets.sheetId === id) {
          Object.assign(sheets, { screen: 'sheets', sheetId: null, setId: null, missing: null });
        }
        setNoteIn(sheets, deletedSheetNote(sheet.name));
      });
      return { ok: true };
    },

    /* Delete a record the manager could not read (its "Could not be read" list; the page asked first). */
    deleteUnreadable(id: string): SheetResult {
      const refused = lockedRefusal(store.state.sheets);
      if (refused) {
        return refused;
      }
      return store.update('sheets/deleteUnreadable', state => {
        const { sheets } = state;
        const saved = removeRecord(id, storage) as SheetResult;
        if (!saved.ok) {
          sheets.saveMessage = saved.message ?? '';
          return saved;
        }
        sheets.data = { ...sheets.data, unreadable: sheets.data.unreadable.filter(record => record.id !== id) };
        return { ok: true };
      });
    },

    /* The sheet at `from` moved one place up (`step` -1) or down (+1), from the keyboard. Returns the index it is at now. */
    stepSheet(from: number, step: number): number {
      return stepIn(store.state.sheets.data.sheets.length, from, step, moveSheet);
    },

    /* The open sheet's level (the level sync), as typed: held to 1..the job's level cap; every set is evaluated with it,
       nothing asked (sheets.md, "A sheet's level and sync"). The cap follows it (editSettings). */
    setLevel(value: unknown): SheetResult {
      return editSettings(sheet => ({ ...sheet, level: value }));
    },

    /* The open sheet's item level sync switched on or off (its cap is kept, and follows the level once on). */
    setSyncOn(on: boolean): SheetResult {
      return editSettings(sheet => ({ ...sheet, sync: { ...sheet.sync, on: Boolean(on) } }));
    },

    /* The open sheet's item level cap, as typed: a whole number from 1, lowered to what the level allows (editSettings). */
    setCap(value: unknown): SheetResult {
      return editSettings(sheet => ({ ...sheet, sync: { ...sheet.sync, cap: value } }));
    },

    /* The open sheet's clan, `name` a clan's name ("Midlander"); anything else (null, '') is no clan. Display only: the totals
       of its sets count it, the search does not. Saved when it differs. */
    setClan(name: unknown): SheetResult {
      return editBonus({ clan: isClan(name) ? (name as string) : null });
    },

    /* The open sheet's party bonus, `value` unique roles (a whole number held to 0..5; 1% each). Saved when it differs. */
    setPartyRoles(value: unknown): SheetResult {
      return editBonus({ partyRoles: partyRoles(value) });
    },

    /* A new, empty gear set at the end of the open sheet's list, named "Set N", and its page opened. Returns {ok, id}. */
    newSet(): SheetResult {
      const refused = lockedRefusal(store.state.sheets);
      if (refused) {
        return refused;
      }
      const sheet = currentSheet(store.state);
      if (!sheet) {
        return { ok: false, error: NO_SHEET_OPEN_TEXT };
      }
      const gearSet = newGearSet(defaultSetName(sheet), newSetId(sheet), now()) as GearSet;
      store.update('sheets/newSet', state => {
        commitIn(state.sheets, { ...sheet, sets: [...sheet.sets, gearSet] });
        Object.assign(state.sheets, { screen: 'set', setId: gearSet.id, missing: null });
      });
      return { ok: true, id: gearSet.id };
    },

    /* A copy of the open sheet's gear set `id`, next to it, named "<name> (1)"; the list stays. */
    copySet(id: string): SheetResult {
      const refused = lockedRefusal(store.state.sheets);
      if (refused) {
        return refused;
      }
      const sheet = currentSheet(store.state);
      const at = sheet?.sets.findIndex(gearSet => gearSet.id === id) ?? -1;
      if (!sheet || at < 0) {
        return { ok: false, error: SET_GONE_TEXT };
      }
      const original = sheet.sets[at];
      const name = copyName(
        original.name,
        sheet.sets.map(gearSet => gearSet.name),
      );
      const copy = copyGearSet(original, name, newSetId(sheet), now()) as GearSet;
      store.update('sheets/copySet', state => {
        commitIn(state.sheets, { ...sheet, sets: [...sheet.sets.slice(0, at + 1), copy, ...sheet.sets.slice(at + 1)] });
        setNoteIn(state.sheets, copiedNote(name));
      });
      return { ok: true, id: copy.id };
    },

    /* Delete the open sheet's gear set `id` (the page asked first). From its own page the sheet's list shows; from the list it
       stays. */
    deleteSet(id: string): SheetResult {
      const refused = lockedRefusal(store.state.sheets);
      if (refused) {
        return refused;
      }
      const sheet = currentSheet(store.state);
      const gearSet = setOf(store.state, id);
      if (!sheet || !gearSet) {
        return { ok: false, error: SET_GONE_TEXT };
      }
      store.update('sheets/deleteSet', state => {
        commitIn(state.sheets, { ...sheet, sets: sheet.sets.filter(other => other.id !== id) });
        if (state.sheets.setId === id) {
          Object.assign(state.sheets, { screen: 'sheet', setId: null, missing: null });
        }
        setNoteIn(state.sheets, deletedSetNote(gearSet.name));
      });
      return { ok: true };
    },

    /* The name and description of the open sheet's gear set `id` (the "Edit gear set" dialog). */
    editSet(id: string, { name, description }: { name: string; description?: string }): SheetResult {
      const refused = lockedRefusal(store.state.sheets);
      if (refused) {
        return refused;
      }
      const clean = cleanName(name);
      if (!clean) {
        return refuse(EMPTY_NAME_TEXT, FORM_FIELD.name);
      }
      return updateSet(id, { name: clean, description: cleanDescription(description) });
    },

    /* The open sheet's gear set at `from` moved one place, from the keyboard (as stepSheet). */
    stepSet(from: number, step: number): number {
      const sheet = currentSheet(store.state);
      return sheet ? stepIn(sheet.sets.length, from, step, moveSet) : from;
    },
  };
}

/* The actions of the Sheets tab on `store`. */
export type SheetsActions = ReturnType<typeof createSheetsActions>;
