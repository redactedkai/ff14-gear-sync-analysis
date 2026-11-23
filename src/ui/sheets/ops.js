/* Making and changing saved sheets and gear sets as plain data: a new sheet, a new or copied gear set, Copy sheet with
   the pieces the new job cannot wear cleared, names (trimmed, never empty, "<name> (1)" for a copy), and moving a row
   of a list. The shapes and the rules are docs/engineering/sheets.md.
   Every function returns new data and changes nothing it is handed. Ids and times come in from the caller (the sheet
   store), so the tests can fix them. Pure: no Alpine, no storage, no document. */
import { clamp } from '../../core/clamp.js';
import { jobById } from '../../core/constants.js';
import { piecesJobCannotWear } from '../../core/gear-groups.js';
import { makeJobContext } from '../../core/job-context.js';
import { remapStatKey } from '../../core/stat-keys.js';
import { DATA_SOURCE, MAX_REAL } from '../../core/tables.js';
import { clone } from '../text.js';
import { limitCapToLevel } from '../level-cap.js';
import { SET_ROW_SLOTS, SHEET_VERSION } from './storage.js';

/* The most characters the name box of a sheet or a gear set takes (its `maxlength`; the owner accepted 60). Only the text boxes limit the
   text: the saved data has no limit, so a longer name or description (from another build, say) is read and kept as it is. */
export const NAME_MAX_LENGTH = 60;
/* The most characters the description box takes, for a sheet and for a gear set alike (its `maxlength`; the owner accepted 400). */
export const DESCRIPTION_MAX_LENGTH = 400;

/* The fields of a sheet dialog a refusal can be about (`field` of a refused store call, `errorField` of the open dialog): the
   dialog marks that field and shows the reason in its label row. A refusal with none (the sheet is gone) shows in the title row. */
export const FORM_FIELD = Object.freeze({ name: 'name', job: 'job', ack: 'ack' });

/* A name as it is stored: trimmed. '' means the name is refused (an empty name is not allowed; the caller keeps the old
   one or says so). */
export function cleanName(text) {
  return String(text ?? '').trim();
}

/* A description as it is stored: line ends kept, trimmed at both ends. */
export function cleanDescription(text) {
  return String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .trim();
}

/* The default name of a new sheet: "Sage Lv 100", with the item level cap when its sync is on ("Sage Lv 100 ilvl 123");
   '' with no job chosen. `fields`: {job, level, sync: {on, cap}}. */
export function defaultSheetName({ job, level, sync }) {
  const known = jobById(job);
  if (!known) return '';
  return `${known.name} Lv ${level}${sync?.on ? ` ilvl ${sync.cap}` : ''}`;
}

/* The name of a copy among siblings named `names`: "<name> (1)", then "(2)", the first number not used; a name that
   already ends in " (n)" is numbered again from its base, so a copy of "X (1)" is "X (2)", not "X (1) (1)". The base is
   cut, and trimmed, only as far as the whole copy name needs to fit NAME_MAX_LENGTH (the name box takes no more). */
export function copyName(name, names) {
  const base = name.replace(/ \(\d+\)$/, '');
  for (let n = 1; ; n++) {
    const tail = ` (${n})`;
    const candidate = base.slice(0, Math.max(1, NAME_MAX_LENGTH - tail.length)).trimEnd() + tail;
    if (!names.includes(candidate)) return candidate;
  }
}

/* A new gear set's default name: the smallest "Set N" no set of `sheet` uses. */
export function defaultSetName(sheet) {
  for (let n = 1; ; n++) if (!sheet.sets.some(set => set.name === `Set ${n}`)) return `Set ${n}`;
}

/* A number as typed, rounded to a whole number; `fallback` for no number. */
function wholeNumber(value, fallback) {
  const number = Math.round(Number(value));
  return value === '' || value == null || !Number.isFinite(number) ? fallback : number;
}

/* A level for job `jobId` as typed: a whole number held to 1..the job's level cap; `fallback` for no number. */
export function levelFor(jobId, value, fallback) {
  const number = wholeNumber(value, null);
  return number == null ? fallback : clamp(number, 1, makeJobContext(jobId).maxLevel);
}

/* The first item level cap a new sheet's form offers, and the highest a sheet takes: the highest real item level. */
export const NEW_SHEET_CAP = MAX_REAL;

/* The level and item level cap fields for job `jobId` (null: the default job's range), the one copy of their limits and
   range texts: {level: {max (the job's level cap), rangeText "1–100"}, cap: {max (the highest real item level),
   rangeText "1–795"}}. */
export function ranges(jobId) {
  const levelMax = makeJobContext(jobId).maxLevel;
  return { level: { max: levelMax, rangeText: `1–${levelMax}` }, cap: { max: MAX_REAL, rangeText: `1–${MAX_REAL}` } };
}

/* An item level cap as typed: a whole number held to 1..the highest real item level; `fallback` for no number. */
export function capFor(value, fallback) {
  const number = wholeNumber(value, null);
  return number == null ? fallback : clamp(number, 1, MAX_REAL);
}

/* A sheet's level and item level sync for job `jobId` as the page keeps them, from `fields` ({level, sync: {on, cap}},
   as typed or as saved): the level held to 1..the job's level cap (levelFor), then the cap a whole number from 1,
   lowered to what that level allows while sync is on, by the Job and sync panel's rule (level-cap.js limitCapToLevel, the
   one copy of it), and held to the highest real item level. `fallback` ({level, cap}) stands in for a field with no
   number: by default the job's level cap and NEW_SHEET_CAP. Returns {level, sync: {on, cap}, lowered: limitCapToLevel's
   {from, to, level} when it lowered the cap (the note: level-cap.js capLoweredText), else null}. */
export function sheetSettings(jobId, { level, sync }, fallback = {}) {
  const jobCtx = makeJobContext(jobId);
  const settings = {
    jobCtx,
    level: levelFor(jobId, level, fallback.level ?? jobCtx.maxLevel),
    sync: !!sync?.on,
    cap: Math.max(1, wholeNumber(sync?.cap, fallback.cap ?? NEW_SHEET_CAP)),
  };
  const lowered = limitCapToLevel(settings);
  return { level: settings.level, sync: { on: settings.sync, cap: capFor(settings.cap) }, lowered };
}

/* Whether `value` is a gear set's `bestMeals` as saved: a list of meal keys, or null. */
const isBestMeals = value => value === null || (Array.isArray(value) && value.every(key => typeof key === 'string'));

/* `sheet` (a saved Sheet) with its level and cap repaired by sheetSettings (a record saved before the cap followed the
   level, or edited by hand) and a damaged `bestMeals` of a gear set dropped (a hint, not worth refusing the sheet); the
   same object when nothing changes. */
export function repairSheet(sheet) {
  const { level, sync } = sheetSettings(sheet.job, sheet, { level: sheet.level, cap: sheet.sync.cap });
  const sets = sheet.sets.map(gearSet =>
    gearSet.bestMeals === undefined || isBestMeals(gearSet.bestMeals) ? gearSet : { ...gearSet, bestMeals: null },
  );
  const setsChanged = sets.some((gearSet, index) => gearSet !== sheet.sets[index]);
  if (level === sheet.level && sync.on === sheet.sync.on && sync.cap === sheet.sync.cap && !setsChanged) return sheet;
  return { ...sheet, level, sync: { ...sheet.sync, ...sync }, sets };
}

/* The game data a new sheet is stamped with: the data source commit (short) and its date, {commit, date}; empty texts
   when the data names no source. */
export function gameDataStamp(source = DATA_SOURCE) {
  return { commit: source?.commit?.slice(0, 7) ?? '', date: /^\d{4}-\d{2}-\d{2}/.exec(source?.date ?? '')?.[0] ?? '' };
}

/* A new sheet with no gear sets. `fields`: {name, description, job, level, sync: {on, cap}} (already checked); `id` its
   id; `at` the time in ms (created and changed). It has no clan and no party bonus (the sheet page sets them). */
export function newSheet(fields, id, at) {
  return {
    v: SHEET_VERSION,
    id,
    name: fields.name,
    description: fields.description ?? '',
    job: fields.job,
    level: fields.level,
    sync: { on: !!fields.sync.on, cap: fields.sync.cap },
    clan: null,
    partyRoles: 0,
    sets: [],
    gameData: gameDataStamp(),
    createdAt: at,
    updatedAt: at,
  };
}

/* A new, empty gear set: 12 empty rows, no meal, no tagged meals, no pins, no Auto-fill settings, named `name`. */
export function newGearSet(name, id, at) {
  return {
    id,
    name,
    description: '',
    pieces: SET_ROW_SLOTS.map(slot => ({ slot })),
    meal: null,
    bestMeals: null,
    pinned: { pieces: [], meal: false },
    fillSettings: null,
    createdAt: at,
    updatedAt: at,
  };
}

/* A copy of `gearSet` with id `id`, name `name` and the times `at`; everything else (pieces, stones, meal, the tagged
   best meals, pins, Auto-fill settings, description) is copied. */
export function copyGearSet(gearSet, name, id, at) {
  return { ...clone(gearSet), id, name, createdAt: at, updatedAt: at };
}

/* The pieces of `sheet` a sheet for job `jobId` cannot wear, by the job mask (gear-groups.js piecesJobCannotWear): every
   saved row, the off-hand row of a two-handed job included, since the copy keeps it. Returns [{setId, setName, index (the
   row), slot, name}], set by set in row order; [] when the job is the sheet's own. */
export function piecesToClear(sheet, jobId) {
  if (jobId === sheet.job) return [];
  const job = makeJobContext(jobId);
  return sheet.sets.flatMap(gearSet =>
    piecesJobCannotWear(job, gearSet.pieces).map(({ index, slot, name }) => ({
      setId: gearSet.id,
      setName: gearSet.name,
      index,
      slot,
      name,
    })),
  );
}

/* The stat keys of gear set `set` (a copy, changed in place) from job `from` to job `to`: the goal's target and
   tiebreaks, and each stone's stat (remapStatKey). */
function remapStats(set, from, to) {
  const move = stat => remapStatKey(from, to, stat);
  const goal = set.fillSettings?.goal;
  if (goal) for (const k of ['target', 'tb', 'tb2']) if (typeof goal[k] === 'string') goal[k] = move(goal[k]);
  for (const row of set.pieces) if (row.stones) row.stones = row.stones.map(stone => stone && { ...stone, stat: move(stone.stat) });
}

/* The copy of `sheet` for `fields` ({name, job, level, sync}): a new sheet (its own id, the current game data, times
   `at`) with the description and every gear set copied (new ids from `setId()`), and the pieces the new job cannot wear
   emptied with their pins dropped, and the tagged best meals dropped when the job, level or sync differ (they were found
   for the old ones; sheets.md, "Copy sheet"). A goal and stones of the sheet's job move to the new job by position
   (remapStatKey: the main stat to the main stat, speed to speed, the special substat to the special substat); a stat
   the new job lacks stays as it is and the set's Auto-fill settings put it back to their default (fillSettingsOf). The
   clan and the party bonus are the sheet's own: they belong to the player, not the job, and are copied. */
export function copySheet(sheet, fields, id, at, setId) {
  const copy = newSheet({ ...fields, description: sheet.description }, id, at);
  copy.clan = sheet.clan ?? null;
  copy.partyRoles = sheet.partyRoles ?? 0;
  const cleared = piecesToClear(sheet, fields.job);
  const sameSettings =
    fields.job === sheet.job &&
    fields.level === sheet.level &&
    !!fields.sync?.on === !!sheet.sync.on &&
    fields.sync?.cap === sheet.sync.cap;
  copy.sets = sheet.sets.map(gearSet => {
    const rows = new Set(cleared.filter(c => c.setId === gearSet.id).map(c => c.index));
    const set = copyGearSet(gearSet, gearSet.name, setId(), at);
    set.pieces = set.pieces.map((row, index) => (rows.has(index) ? { slot: row.slot } : row));
    set.pinned = { ...set.pinned, pieces: (set.pinned?.pieces ?? []).filter(index => !rows.has(index)) };
    if (!sameSettings) set.bestMeals = null;
    if (fields.job !== sheet.job) remapStats(set, makeJobContext(sheet.job), makeJobContext(fields.job));
    return set;
  });
  return copy;
}

/* `list` with the item at `from` moved to `to` (both indexes in `list`); a new array. An index out of range returns
   the list as it is (copied). */
export function moveItem(list, from, to) {
  const out = [...list];
  if (from < 0 || from >= out.length || to < 0 || to >= out.length || from === to) return out;
  out.splice(to, 0, out.splice(from, 1)[0]);
  return out;
}

/* A fresh id with prefix `prefix` ("s_" for a sheet, "g_" for a gear set): the time in base 36 and random letters, so
   two tabs making one at the same moment do not collide. */
export function randomId(prefix) {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
