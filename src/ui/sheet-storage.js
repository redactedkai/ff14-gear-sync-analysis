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
     never equal a game key, so one record can hold either kind. The record is rewritten only by the next save.

   Pure of the DOM: no import of Alpine, no document. */
import { SLOT_TYPES, jobById } from '../core/constants.js';
import { makeJobContext } from '../core/job-context.js';
import { currentStatKey } from '../core/stat-keys.js';
import { STORE_KEY } from './store-key.js';

/* The index's key, and the prefix of a sheet record's key (the sheet's id follows it). */
export const SHEETS_KEY = `${STORE_KEY}:sheets`;
export const SHEET_KEY_PREFIX = `${STORE_KEY}:sheet:`;

/* The only record version this build reads and writes. */
export const SHEET_VERSION = 1;

/* The lines the page shows when a save fails (a result's `message`): the edit is still in the page, not in storage. */
export const QUOTA_MESSAGE =
  'The browser has no room left to save sheets. This change is only in this tab and is lost when the page closes. Delete a sheet you no longer need.';
export const UNAVAILABLE_MESSAGE =
  'This browser is not saving sheets (storage is blocked or turned off, as in a private window). Sheets last until the page closes.';

/* The key of the record of the sheet with `id`. */
export function sheetKey(id) {
  return SHEET_KEY_PREFIX + id;
}

/* The browser's localStorage, or null where touching it throws (blocked storage). */
export function defaultStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/* Whether `error` is a full-storage error (the names and codes browsers use). */
function isQuotaError(error) {
  return error?.name === 'QuotaExceededError' || error?.name === 'NS_ERROR_DOM_QUOTA_REACHED' || error?.code === 22 || error?.code === 1014;
}

/* A failed save as a result: {ok: false, reason: 'quota' | 'unavailable', message} for the page to show. */
function failure(error) {
  return isQuotaError(error)
    ? { ok: false, reason: 'quota', message: QUOTA_MESSAGE }
    : { ok: false, reason: 'unavailable', message: UNAVAILABLE_MESSAGE };
}

/* Whether `storage` can be written to and read back (a probe key, removed at once). False for null and for a storage
   that throws. Reading alone is not enough: some private modes read fine and refuse every write. */
export function storageAvailable(storage = defaultStorage()) {
  if (!storage) return false;
  try {
    const probe = `${STORE_KEY}:probe`;
    storage.setItem(probe, '1');
    const back = storage.getItem(probe);
    storage.removeItem(probe);
    return back === '1';
  } catch {
    return false;
  }
}

const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const isTime = v => Number.isFinite(v);
/* `value` is missing, or passes `test` */
const optional = (value, test) => value === undefined || test(value);

/* The rows of every gear set: SLOT_TYPES with the ring twice, for every job and level (sheets.md, "Saved data"). */
export const SET_ROW_SLOTS = Object.freeze([...SLOT_TYPES, 'ring']);

/* A saved stone: {stat (a stat key), grade (1 to 12)}; null is an empty materia slot. */
const isStone = stone =>
  stone === null ||
  (isObject(stone) && typeof stone.stat === 'string' && Number.isInteger(stone.grade) && stone.grade >= 1 && stone.grade <= 12);

/* Why row `index` of a gear set's pieces is damaged, or null: it must be {slot} with the slot of SET_ROW_SLOTS there,
   and, holding a piece, a whole-number game id and a list of stones. */
function rowProblem(row, index) {
  if (!isObject(row) || row.slot !== SET_ROW_SLOTS[index]) return `row ${index + 1} is not a ${SET_ROW_SLOTS[index]} row`;
  if (row.gameId == null) return null;
  if (!Number.isInteger(row.gameId)) return `row ${index + 1} has a damaged game id`;
  if (!optional(row.stones, stones => Array.isArray(stones) && stones.every(isStone))) return `row ${index + 1} has damaged stones`;
  return null;
}

/* Fill settings ({goal, searchCriteria}, each optional, each field optional) with every field of the type the page
   reads; null and missing are none. */
function fillSettingsOk(settings) {
  if (settings == null) return true;
  if (!isObject(settings)) return false;
  const { goal, searchCriteria } = settings;
  const text = v => typeof v === 'string';
  const flag = v => typeof v === 'boolean';
  const limit = v => v === '' || Number.isFinite(v);
  const texts = v => Array.isArray(v) && v.every(text);
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
   to 11 and a boolean), the Fill settings and the times. */
function setProblem(set) {
  if (!isObject(set) || typeof set.id !== 'string' || typeof set.name !== 'string' || !Array.isArray(set.pieces))
    return 'a damaged gear set';
  if (!optional(set.description, d => typeof d === 'string')) return 'a gear set with a damaged description';
  if (set.pieces.length !== SET_ROW_SLOTS.length) return `a gear set with ${set.pieces.length} of its ${SET_ROW_SLOTS.length} rows`;
  for (const [index, row] of set.pieces.entries()) {
    const problem = rowProblem(row, index);
    if (problem) return `a gear set whose ${problem}`;
  }
  if (!optional(set.meal, meal => meal === null || typeof meal === 'string')) return 'a gear set with a damaged meal';
  // `bestMeals` (the meals tagged "best for goal") is a hint: a damaged one does not make the set unreadable; the reader
  // ignores it and sheet-ops.js repairSheet drops it
  const pinsOk = pinned =>
    isObject(pinned) &&
    optional(pinned.pieces, rows => Array.isArray(rows) && rows.every(i => Number.isInteger(i) && i >= 0 && i < SET_ROW_SLOTS.length)) &&
    optional(pinned.meal, meal => typeof meal === 'boolean');
  if (!optional(set.pinned, pinsOk)) return 'a gear set with damaged pins';
  if (!fillSettingsOk(set.fillSettings)) return 'a gear set with damaged Fill settings';
  if (!optional(set.createdAt, isTime) || !optional(set.updatedAt, isTime)) return 'a gear set with a damaged time';
  return null;
}

/* Why a parsed record cannot be read as the sheet with id `id`, or null when it can. Checks the shape the page relies on
   (the version, the job, the settings, the times, and every gear set: setProblem), so a damaged record is listed as
   unreadable rather than breaking a view; it repairs nothing and does not look at the game data, so a game id the
   database lacks is shown later as "missing item <id>". */
function sheetProblem(value, id) {
  if (!isObject(value)) return 'not a sheet';
  if (value.v !== SHEET_VERSION) {
    return typeof value.v === 'number' && value.v > SHEET_VERSION
      ? `written by a newer version of the page (v${value.v})`
      : 'unknown version';
  }
  if (value.id !== id) return 'its id does not match its key';
  if (typeof value.name !== 'string') return 'no name';
  if (!optional(value.description, d => typeof d === 'string')) return 'a damaged description';
  if (!jobById(value.job)) return `unknown job ${JSON.stringify(value.job)}`;
  if (!Number.isInteger(value.level)) return 'no level';
  if (!isObject(value.sync) || typeof value.sync.on !== 'boolean' || !Number.isFinite(value.sync.cap)) return 'no item level sync';
  if (!isTime(value.createdAt) || !isTime(value.updatedAt)) return 'no dates';
  if (!Array.isArray(value.sets)) return 'no list of sets';
  for (const set of value.sets) {
    const problem = setProblem(set);
    if (problem) return problem;
  }
  return null;
}

/* `sheet` (a record that passed sheetProblem) with every stat key it holds read as the game's own key of its job: the
   goal's target and tiebreaks of each set, and each stone's stat (currentStatKey: an old position key becomes the job's
   key at that position, any other value stays). A new object; `sheet` is not changed. */
export function withCurrentStatKeys(sheet) {
  const job = makeJobContext(sheet.job);
  const key = stat => currentStatKey(job, stat);
  const sets = sheet.sets.map(set => {
    const goal = set.fillSettings?.goal;
    return {
      ...set,
      pieces: set.pieces.map(row =>
        row.stones ? { ...row, stones: row.stones.map(stone => stone && { ...stone, stat: key(stone.stat) }) } : row,
      ),
      ...(set.fillSettings
        ? {
            fillSettings: {
              ...set.fillSettings,
              ...(goal
                ? {
                    goal: {
                      ...goal,
                      ...Object.fromEntries(['target', 'tb', 'tb2'].filter(k => typeof goal[k] === 'string').map(k => [k, key(goal[k])])),
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

/* The sheet in the record text `text` of the sheet with `id`: {sheet}, or {cause} (text for the "Could not be read"
   list) when the text is not valid JSON or is not a sheet this build reads. The sheet has the game's stat keys
   (withCurrentStatKeys), whichever kind the record held. */
export function parseSheet(text, id) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    return { cause: 'not valid JSON' };
  }
  const cause = sheetProblem(value, id);
  return cause ? { cause } : { sheet: withCurrentStatKeys(value) };
}

/* The ids in the index, in order and without repeats; [] when there is no index or it cannot be read. `problem` is why
   it could not be read (null when it was read or absent). */
function readIndex(storage) {
  let text;
  try {
    text = storage.getItem(SHEETS_KEY);
  } catch {
    return { order: [], problem: 'storage unreadable' };
  }
  if (text === null) return { order: [], problem: null };
  try {
    const value = JSON.parse(text);
    if (!isObject(value) || value.v !== SHEET_VERSION || !Array.isArray(value.order)) return { order: [], problem: 'index not readable' };
    return { order: [...new Set(value.order.filter(id => typeof id === 'string'))], problem: null };
  } catch {
    return { order: [], problem: 'index not readable' };
  }
}

/* The ids that have a record in `storage`, in key order. */
function recordIds(storage) {
  const ids = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key?.startsWith(SHEET_KEY_PREFIX)) ids.push(key.slice(SHEET_KEY_PREFIX.length));
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
export function loadSheets(storage = defaultStorage()) {
  if (!storage) return { available: false, sheets: [], unreadable: [], indexProblem: null };
  try {
    const { order, problem } = readIndex(storage);
    const stored = new Set(recordIds(storage));
    // 1. the index's ids that have a record, then the records the index lacks
    const ids = [...order.filter(id => stored.has(id)), ...[...stored].filter(id => !order.includes(id))];
    // 2. each record read: a sheet, or the cause it cannot be
    const sheets = [];
    const unreadable = [];
    for (const id of ids) {
      const key = sheetKey(id);
      const read = parseSheet(storage.getItem(key), id);
      if (read.sheet) sheets.push(read.sheet);
      else unreadable.push({ id, key, cause: read.cause });
    }
    return { available: true, sheets, unreadable, indexProblem: problem };
  } catch {
    return { available: false, sheets: [], unreadable: [], indexProblem: null };
  }
}

/* The index written with `order` (ids, first is top). Returns {ok: true}, or a failed result (see saveSheet). */
export function saveOrder(order, storage = defaultStorage()) {
  if (!storage) return failure(null);
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
export function saveSheet(sheet, storage = defaultStorage()) {
  if (!storage) return failure(null);
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
export function deleteSheet(id, storage = defaultStorage()) {
  if (!storage) return failure(null);
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
