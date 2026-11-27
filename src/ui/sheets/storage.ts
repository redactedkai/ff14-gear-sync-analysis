/* The saved sheets: one record per sheet plus an index, in the browser's local storage (docs/engineering/sheets.md,
   "Saved data"; architecture.md section 4).

     STORE_KEY:sheets       {v: 1, order: [sheet id, ...]}   the user's order, first is top
     STORE_KEY:sheet:<id>   a Sheet, its gear sets inside    one whole sheet

   Every function takes the storage to use (default: the browser's localStorage) so Node can test it with a stand-in.
   Every storage access is in a try/catch: localStorage may be missing, blocked or full. Nothing here throws, and
   nothing here changes a sheet it was handed: a save that fails (a full storage) leaves the caller's sheet as it is,
   so the edit stays in memory and the page can show the message of the result.

   Rules (sheets.md, "Reading and writing"):
   - a save writes its own record, plus the index when the sheet is new (it goes to the top);
   - a record that is not valid JSON, has an unknown job, a newer `v` or a damaged field (sheetProblem) is skipped and
     listed with its cause; it is never deleted or rewritten, except by deleteSheet (the Delete button next to it);
   - an id in the index with no record is skipped; a record not in the index is added at the end (sorted by id), so a
     lost index can be rebuilt;
   - no migrations (roadmap A17): `v` is 1, and any other value is unreadable;
   - a tolerant reader (withCurrentStatKeys): a record written before stat keys were the game's own names its goal and
     stones by position (`main`, `spd`, `spec`); the sheet read from it has the game's keys. `v` stays 1: the old names
     never equal a game key, so one record can hold either kind. The record is rewritten only by the next save;
   - a tolerant reader (withKnownClan): a record with no `clan` or `partyRoles` (saved before the clan and party bonus)
     means no clan and no party bonus, and is read as it was written; a clan name this build does not know reads as no
     clan; a field of the wrong type is damaged (sheetProblem), a name that is merely unknown is not.

   Pure of the DOM: no document. */
import { SLOT_TYPES, jobById } from '../../core/constants.ts';
import { PARTY_ROLES_MAX, isClan } from '../../core/clan-bonus.ts';
import { makeJobContext } from '../../core/job-context.ts';
import { currentStatKey } from '../../core/stat-keys.ts';
import { STORE_KEY } from '../store-key.ts';
import type { SlotType, StatKey } from '../../core/types.ts';
import type { SheetsData } from '../store/app-state.ts';
import type { SavedSheet } from './saved-types.ts';

/* A save that failed: why (a full storage, or no usable storage) and the line the page shows. */
export interface SaveFailure {
  ok: false;
  reason: 'quota' | 'unavailable';
  message: string;
}

/* What a save or a delete returns: {ok: true}, or the failure. */
export type SaveResult = { ok: true } | SaveFailure;

/* What parseSheet returns: the sheet, or why the record cannot be read. */
export type ParsedSheet = { sheet: SavedSheet; cause?: undefined } | { sheet?: undefined; cause: string };

/* A storage error as browsers report it: a name, or an old numeric code. */
type StorageError = { name?: string; code?: number } | null | undefined;

/* Saved JSON that is not checked yet: every field is tested before it is used. */
type Raw = Record<string, unknown>;

/* The index's key, and the prefix of a sheet record's key (the sheet's id follows it). */
export const SHEETS_KEY = `${STORE_KEY}:sheets`;
const SHEET_KEY_PREFIX = `${STORE_KEY}:sheet:`;

/* The only record version this build reads and writes. */
export const SHEET_VERSION = 1;

/* The lines the page shows when a save fails (a result's `message`): the edit is still in the page, not in storage. */
export const QUOTA_MESSAGE =
  'Local storage is full. Changes since the last save will be lost when the page closes. Delete a sheet / gear set you no longer need.';
export const UNAVAILABLE_MESSAGE =
  'Local storage is disabled or turned off. Any sheets / gear sets you create will be wiped when the page closes.';

/* The key of the record of the sheet with `id`. */
export function sheetKey(id: string): string {
  return SHEET_KEY_PREFIX + id;
}

/* The browser's localStorage, or null where touching it throws (blocked storage). */
export function defaultStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/* Whether `error` is a full-storage error (the names and codes browsers use). */
function isQuotaError(error: unknown): boolean {
  return (
    (error as StorageError)?.name === 'QuotaExceededError' ||
    (error as StorageError)?.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    (error as StorageError)?.code === 22 ||
    (error as StorageError)?.code === 1014
  );
}

/* A failed save as a result: {ok: false, reason: 'quota' | 'unavailable', message} for the page to show. */
function failure(error: unknown): SaveFailure {
  return isQuotaError(error)
    ? { ok: false, reason: 'quota', message: QUOTA_MESSAGE }
    : { ok: false, reason: 'unavailable', message: UNAVAILABLE_MESSAGE };
}

const isObject = (v: unknown): v is Raw => v !== null && typeof v === 'object' && !Array.isArray(v);
/* The latest time, in ms since 1970, a JavaScript Date holds (8.64e15, either side of 1970): beyond it
   Intl.DateTimeFormat.format throws a RangeError, as the Sheets tab's date columns would. */
const MAX_TIME_MS = 8.64e15;
const isTime = (v: unknown): boolean => Number.isFinite(v) && Math.abs(v as number) <= MAX_TIME_MS;
/* `value` is missing, or passes `test` */
const optional = (value: unknown, test: (value: unknown) => boolean): boolean => value === undefined || test(value);

/* The rows of every gear set: SLOT_TYPES with the ring twice, for every job and level (sheets.md, "Saved data"). */
export const SET_ROW_SLOTS = Object.freeze<SlotType[]>([...SLOT_TYPES, 'ring']);

/* A saved stone: {stat (a stat key), grade (1 to 12)}; null is an empty materia slot. */
const isStone = (stone: unknown): boolean =>
  stone === null ||
  (isObject(stone) &&
    typeof stone.stat === 'string' &&
    Number.isInteger(stone.grade) &&
    (stone.grade as number) >= 1 &&
    (stone.grade as number) <= 12);

/* Why row `index` of a gear set's pieces is damaged, or null: it must be {slot} with the slot of SET_ROW_SLOTS there,
   and, holding a piece, a whole-number game id and a list of stones. */
function rowProblem(row: unknown, index: number): string | null {
  if (!isObject(row) || row.slot !== SET_ROW_SLOTS[index]) {
    return `row ${index + 1} is not a ${SET_ROW_SLOTS[index]} row`;
  }
  if (row.gameId == null) {
    return null;
  }
  if (!Number.isInteger(row.gameId)) {
    return `row ${index + 1} has a damaged game id`;
  }
  if (!optional(row.stones, stones => Array.isArray(stones) && stones.every(isStone))) {
    return `row ${index + 1} has damaged stones`;
  }
  return null;
}

/* Auto-fill settings ({goal, searchCriteria}, each optional, each field optional) with every field of the type the page
   reads; null and missing are none. */
function fillSettingsOk(settings: unknown): boolean {
  if (settings == null) {
    return true;
  }
  if (!isObject(settings)) {
    return false;
  }
  const { goal, searchCriteria } = settings as { goal?: Raw; searchCriteria?: Raw };
  const text = (v: unknown) => typeof v === 'string';
  const flag = (v: unknown) => typeof v === 'boolean';
  const limit = (v: unknown) => v === '' || Number.isFinite(v);
  const texts = (v: unknown) => Array.isArray(v) && v.every(text);
  const goalOk =
    optional(goal, isObject) &&
    ['target', 'tb', 'tb2', 'gcdMode'].every(k => optional(goal?.[k], text)) &&
    optional(goal?.gcd, v => text(v) || Number.isFinite(v)) &&
    ['byTier', 'melds', 'food'].every(k => optional(goal?.[k], flag));
  const criteriaOk =
    optional(searchCriteria, isObject) &&
    ['expOff', 'exclude'].every(k => optional(searchCriteria?.[k], texts)) &&
    optional(searchCriteria?.market, flag) &&
    ['min', 'max', 'lvl'].every(k => optional(searchCriteria?.[k], limit));
  return goalOk && criteriaOk;
}

/* Why gear set `set` is damaged, or null. Checks every field a view reads (sheets.md, "Saved data"): its id and name, an
   optional description, 12 rows in SET_ROW_SLOTS order (rowProblem), the meal (a key or null), the tagged best meals
   (not checked), the pins (row numbers 0
   to 11 and a boolean), the Auto-fill settings and the times. */
function setProblem(set: unknown): string | null {
  if (!isObject(set) || typeof set.id !== 'string' || typeof set.name !== 'string' || !Array.isArray(set.pieces)) {
    return 'a damaged gear set';
  }
  if (!optional(set.description, d => typeof d === 'string')) {
    return 'a gear set with a damaged description';
  }
  if (set.pieces.length !== SET_ROW_SLOTS.length) {
    return `a gear set with ${set.pieces.length} of its ${SET_ROW_SLOTS.length} rows`;
  }
  for (const [index, row] of set.pieces.entries()) {
    const problem = rowProblem(row, index);
    if (problem) {
      return `a gear set whose ${problem}`;
    }
  }
  if (!optional(set.meal, meal => meal === null || typeof meal === 'string')) {
    return 'a gear set with a damaged meal';
  }
  // `bestMeals` (the meals tagged "best for goal") is a hint: a damaged one does not make the set unreadable; the reader
  // ignores it and sheets/ops.ts repairSheet drops it
  const pinsOk = (pinned: unknown) =>
    isObject(pinned) &&
    optional(pinned.pieces, rows => Array.isArray(rows) && rows.every(i => Number.isInteger(i) && i >= 0 && i < SET_ROW_SLOTS.length)) &&
    optional(pinned.meal, meal => typeof meal === 'boolean');
  if (!optional(set.pinned, pinsOk)) {
    return 'a gear set with damaged pins';
  }
  if (!fillSettingsOk(set.fillSettings)) {
    return 'a gear set with damaged Auto-fill settings';
  }
  if (!optional(set.createdAt, isTime) || !optional(set.updatedAt, isTime)) {
    return 'a gear set with a damaged time';
  }
  return null;
}

/* Why a parsed record cannot be read as the sheet with id `id`, or null when it can. Checks the shape the page relies on
   (the version, the job, the settings, the times, and every gear set: setProblem), so a damaged record is listed as
   unreadable rather than breaking a view; it repairs nothing and does not look at the game data, so a game id the
   database lacks is shown later as "missing item <id>". */
function sheetProblem(value: unknown, id: string): string | null {
  if (!isObject(value)) {
    return 'not a sheet';
  }
  if (value.v !== SHEET_VERSION) {
    return typeof value.v === 'number' && value.v > SHEET_VERSION
      ? `written by a newer version of the page (v${value.v})`
      : 'unknown version';
  }
  if (value.id !== id) {
    return 'its id does not match its key';
  }
  if (typeof value.name !== 'string') {
    return 'no name';
  }
  if (!optional(value.description, d => typeof d === 'string')) {
    return 'a damaged description';
  }
  if (!jobById(value.job as string)) {
    return `unknown job ${JSON.stringify(value.job)}`;
  }
  if (!optional(value.clan, clan => clan === null || typeof clan === 'string')) {
    return 'a damaged clan';
  }
  if (!optional(value.partyRoles, roles => Number.isInteger(roles) && (roles as number) >= 0 && (roles as number) <= PARTY_ROLES_MAX)) {
    return 'a damaged party bonus';
  }
  if (!Number.isInteger(value.level)) {
    return 'no level';
  }
  if (!isObject(value.sync) || typeof value.sync.on !== 'boolean' || !Number.isFinite(value.sync.cap)) {
    return 'no IL Sync';
  }
  if (!isTime(value.createdAt) || !isTime(value.updatedAt)) {
    return 'no dates';
  }
  if (!Array.isArray(value.sets)) {
    return 'no list of sets';
  }
  for (const set of value.sets as unknown[]) {
    const problem = setProblem(set);
    if (problem) {
      return problem;
    }
  }
  return null;
}

/* `sheet` (a record that passed sheetProblem) with every stat key it holds read as the game's own key of its job: the
   goal's target and tiebreaks of each set, and each stone's stat (currentStatKey: an old position key becomes the job's
   key at that position, any other value stays). A new object; `sheet` is not changed. */
function withCurrentStatKeys(sheet: SavedSheet): SavedSheet {
  const job = makeJobContext(sheet.job);
  const key = (stat: string) => currentStatKey(job, stat);
  const sets = sheet.sets.map(set => {
    const goal = set.fillSettings?.goal;
    return {
      ...set,
      pieces: set.pieces.map(row =>
        row.stones ? { ...row, stones: row.stones.map(stone => stone && { ...stone, stat: key(stone.stat) as StatKey }) } : row,
      ),
      ...(set.fillSettings
        ? {
            fillSettings: {
              ...set.fillSettings,
              ...(goal
                ? {
                    goal: {
                      ...goal,
                      ...Object.fromEntries(
                        (['target', 'tb', 'tb2'] as const).filter(k => typeof goal[k] === 'string').map(k => [k, key(goal[k] as string)]),
                      ),
                    },
                  }
                : {}),
            },
          }
        : {}),
    };
  });
  return { ...sheet, sets };
}

/* `sheet` (a record that passed sheetProblem) with every Target GCD read as a number: an older record may hold the typed text
   ("2.40"), which becomes 2.4 (text that is no number becomes '', for any GCD). A number and '' stay. A new object; `sheet` is
   not changed. */
function withNumericGcd(sheet: SavedSheet): SavedSheet {
  const sets = sheet.sets.map(set => {
    const goal = set.fillSettings?.goal;
    if (!goal || typeof goal.gcd !== 'string' || !set.fillSettings) {
      return set;
    }
    const typed = goal.gcd.trim() === '' ? NaN : Number(goal.gcd);
    const gcd: number | '' = Number.isFinite(typed) ? typed : '';
    return { ...set, fillSettings: { ...set.fillSettings, goal: { ...goal, gcd } } };
  });
  return { ...sheet, sets };
}

/* `sheet` (a record that passed sheetProblem) with a clan name this build does not know read as no clan (null). A missing
   `clan` or `partyRoles` stays missing: it means none, and every reader takes it so (`?? null`, `?? 0`), so a record from
   before them is read as it was written. A new object; `sheet` is not changed. */
function withKnownClan(sheet: SavedSheet): SavedSheet {
  return sheet.clan == null || isClan(sheet.clan) ? sheet : { ...sheet, clan: null };
}

/* The sheet in the record text `text` of the sheet with `id`: {sheet}, or {cause} (text for the "Could not be read"
   list) when the text is not valid JSON or is not a sheet this build reads. The sheet has the game's stat keys
   (withCurrentStatKeys), whichever kind the record held, every Target GCD as a number or '' (withNumericGcd), and a clan this build does not know read as none (withKnownClan). */
export function parseSheet(text: string, id: string): ParsedSheet {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { cause: 'not valid JSON' };
  }
  const cause = sheetProblem(value, id);
  return cause ? { cause } : { sheet: withKnownClan(withNumericGcd(withCurrentStatKeys(value as SavedSheet))) };
}

/* The ids in the index, in order and without repeats; [] when there is no index or it cannot be read. `problem` is why
   it could not be read (null when it was read or absent). */
function readIndex(storage: Pick<Storage, 'getItem'>): { order: string[]; problem: string | null } {
  let text: string | null;
  try {
    text = storage.getItem(SHEETS_KEY);
  } catch {
    return { order: [], problem: 'storage unreadable' };
  }
  if (text === null) {
    return { order: [], problem: null };
  }
  try {
    const value = JSON.parse(text);
    if (!isObject(value) || value.v !== SHEET_VERSION || !Array.isArray(value.order)) {
      return { order: [], problem: 'index not readable' };
    }
    return { order: [...new Set<string>(value.order.filter((id: unknown) => typeof id === 'string'))], problem: null };
  } catch {
    return { order: [], problem: 'index not readable' };
  }
}

/* The ids that have a record in `storage`, in key order. */
function recordIds(storage: Storage): string[] {
  const ids: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key?.startsWith(SHEET_KEY_PREFIX)) {
      ids.push(key.slice(SHEET_KEY_PREFIX.length));
    }
  }
  return ids.sort();
}

/* Everything saved, read fresh (a tab reads again each time it opens a sheet). Returns
   {available, sheets, unreadable, indexProblem}:
   - available: false when storage cannot be used (the page shows UNAVAILABLE_MESSAGE; sheets and unreadable are [])
   - sheets: the readable sheets in the user's order (see the rules above)
   - unreadable: [{id, key, cause}] the records that could not be read, in the same order, for the "Could not be read"
     list; delete one with deleteSheet(id)
   - indexProblem: why the index could not be read, or null (the order then falls back to the ids' order) */
export function loadSheets(storage: Storage | null = defaultStorage()): SheetsData {
  if (!storage) {
    return { available: false, sheets: [], unreadable: [], indexProblem: null };
  }
  try {
    const { order, problem } = readIndex(storage);
    const stored = new Set(recordIds(storage));
    // 1. the index's ids that have a record, then the records the index lacks
    const ids = [...order.filter(id => stored.has(id)), ...[...stored].filter(id => !order.includes(id))];
    // 2. each record read: a sheet, or the cause it cannot be
    const sheets: SavedSheet[] = [];
    const unreadable: SheetsData['unreadable'] = [];
    for (const id of ids) {
      const key = sheetKey(id);
      const read = parseSheet(storage.getItem(key) as string, id); // a record the scan found
      if (read.sheet) {
        sheets.push(read.sheet);
      } else {
        unreadable.push({ id, key, cause: read.cause });
      }
    }
    return { available: true, sheets, unreadable, indexProblem: problem };
  } catch {
    return { available: false, sheets: [], unreadable: [], indexProblem: null };
  }
}

/* The index written with `order` (ids, first is top). Returns {ok: true}, or a failed result (see saveSheet). */
export function saveOrder(order: readonly string[], storage: Storage | null = defaultStorage()): SaveResult {
  if (!storage) {
    return failure(null);
  }
  try {
    storage.setItem(SHEETS_KEY, JSON.stringify({ v: SHEET_VERSION, order: [...new Set(order)] }));
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

/* The sheet `sheet` (a Sheet; its record is written whole) saved. A sheet the index does not list yet goes to the top of
   it. Returns {ok: true}, or {ok: false, reason: 'quota' | 'unavailable', message} for the page to show; `sheet` is not
   changed either way, so a failed save leaves the edit in memory. Storage that throws on the index after the record was
   written is reported as failed too; the record is then added at the end of the order on the next read. */
export function saveSheet(sheet: SavedSheet, storage: Storage | null = defaultStorage()): SaveResult {
  if (!storage) {
    return failure(null);
  }
  try {
    storage.setItem(sheetKey(sheet.id), JSON.stringify(sheet));
  } catch (error) {
    return failure(error);
  }
  const { order } = readIndex(storage);
  return order.includes(sheet.id) ? { ok: true } : saveOrder([sheet.id, ...order], storage);
}

/* The record of the sheet with `id` removed, and its id from the index: a sheet the user deletes, or an unreadable
   record (loadSheets' `unreadable`) deleted from its list. Returns {ok: true}, or a failed result (see saveSheet).
   Deleting an id with no record is not an error. */
export function deleteSheet(id: string, storage: Storage | null = defaultStorage()): SaveResult {
  if (!storage) {
    return failure(null);
  }
  try {
    storage.removeItem(sheetKey(id));
    const { order } = readIndex(storage);
    return order.includes(id)
      ? saveOrder(
          order.filter(other => other !== id),
          storage,
        )
      : { ok: true };
  } catch (error) {
    return failure(error);
  }
}
