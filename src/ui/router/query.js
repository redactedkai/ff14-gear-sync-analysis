/* The settings an address names after its route (#/gear?sort=det&min=700), in both directions. Pure: no DOM, no Alpine and
   no store, so Node can test it. The router (router.js) hands in the store's settings objects and reads back plain values.

   A view's query names that view's own settings and nothing else:
     gear   (#/gear)          q slot min max equip noexp skip market sort dir      the Gear browser's search, filters and sort
     piece  (#/math/piece)    slot item subs meld                                 Stat Allocation's example piece
     gcd    (#/math/gcd)      gcdlevel haste speed                                GCD Scaling
     tiers  (#/math/tiers)    job tierlevel                                       Substat tiers
   The Gear browser's and Stat Allocation's queries start with their tab's Job and sync panel: `job`, `level` and `il` (the item
   level cap: item level sync is on when `il` is present, off when it is not). Substat tiers has its own job (`job`) and no
   other panel; GCD Scaling has no job and no panel.

   Reading a query is a complete description: a setting it leaves out is the default (never the reader's saved value), and a
   value that is not valid falls back to the default too, checked by the same functions that check a saved setting
   (state.js restoreBrowseFields and restorePieceFields). A name the view does not have is ignored. Writing is the other
   way: only the settings that differ from the defaults, in the order above, as text. */
import { clamp } from '../../core/clamp.js';
import { ACTIVITIES, EXPANSIONS, HASTE } from '../../core/constants.js';
import { DEFAULT_EXCLUDE, meldSlotChoices } from '../job-sync-panel.js';
import { DEFAULT_JOB } from '../../core/constants.js';
import { defaultBrowse, defaultSubs, restoreBrowseFields, restorePanel, restorePieceFields } from '../state.js';
import { MAX_SPEED } from '../../core/tables.js';
import { GCD_LEVELS, gcdLevelInput } from '../views/gcd.js';

/* The most speed any job has at any level: a link's speed is held to it (the tab holds it to the level's range). */
const MOST_SPEED = Math.max(...MAX_SPEED);

/* The view of `route` (a route object, routes.js): 'gear' for the Gear browser, the math view's name ('piece', 'gcd' or
   'tiers') for a math screen, or null for a screen with no query (the Sheets screens). */
export function queryViewOf(route) {
  if (route?.tab === 'browse') {
    return 'gear';
  }
  if (route?.tab === 'math') {
    return route.mathTab;
  }
  return null;
}

/* The names of the Job and sync panel, which the Gear browser's and Stat Allocation's queries start with. */
export const PANEL_NAMES = Object.freeze(['job', 'level', 'il']);

/* The names each view's query has, in the order they are written (the panel's or the job's, then the view's own). */
export const QUERY_NAMES = Object.freeze({
  gear: Object.freeze([...PANEL_NAMES, 'q', 'slot', 'min', 'max', 'equip', 'noexp', 'skip', 'market', 'sort', 'dir']),
  piece: Object.freeze([...PANEL_NAMES, 'slot', 'item', 'subs', 'meld']),
  gcd: Object.freeze(['gcdlevel', 'haste', 'speed']),
  tiers: Object.freeze(['job', 'tierlevel']),
});

/* The items of a list value ('ARR,HW'): the non-empty items, in the order written. */
const listOf = text =>
  String(text ?? '')
    .split(',')
    .filter(item => item !== '');

/* The whole number in `text`, or null for an empty or other text (an item level, a speed, a level). */
function wholeNumberOrNull(text) {
  const number = Number(text);
  return text === undefined || text === '' || !Number.isInteger(number) ? null : number;
}

/* `on` and `off` for a switch's text: true for '1' or 'true', false for '0' or 'false', undefined for anything else. */
function switchOf(text) {
  if (text === '1' || text === 'true') {
    return true;
  }
  if (text === '0' || text === 'false') {
    return false;
  }
  return undefined;
}

/* The Job and sync panel `params` ({name: text}) names, checked like a saved one (state.js restorePanel): {job, cap, sync,
   level, jobCtx}. Complete: a job it leaves out is the default job, a level the default level (the job's cap at most), and
   item level sync is on when `il` is a whole number (the cap) or empty (sync on, no cap yet), else off. A cap held while sync is off is no setting
   of the link's: it stays the reader's (`heldCap`, null for none), so the page's own address, opened again by a reload, keeps
   the cap the reader had set before turning sync off. */
export function readPanelQuery(params, heldCap = null) {
  const cap = wholeNumberOrNull(params.il);
  const sync = cap !== null || params.il === '';
  return restorePanel({ job: params.job, level: wholeNumberOrNull(params.level), sync, cap: cap ?? heldCap });
}

/* The job `params` names (the `job` of Substat tiers), checked like a saved one: a JobContext; the default job when it names
   none or an unknown one. */
export function readJobQuery(params) {
  return restorePanel({ job: params.job }).jobCtx;
}

/* The query of the Job and sync panel `panel` ({job, cap, sync, level, jobCtx}): {name: text} for what differs from the
   defaults. The item level cap is written only while item level sync is on (empty when no cap is set yet): with sync off the
   cap is not a setting. */
export function writePanelQuery(panel) {
  const defaults = restorePanel({ job: panel.job });
  const query = {};
  if (panel.job !== DEFAULT_JOB) {
    query.job = panel.job;
  }
  if (panel.level !== defaults.level) {
    query.level = String(panel.level);
  }
  if (panel.sync) {
    query.il = panel.cap == null ? '' : String(panel.cap);
  }
  return query;
}

/* The settings of `view` that the query `params` ({name: text}) names, checked for `job` (a JobContext: the tab's, or for
   Substat tiers the job the link names, readJobQuery) and complete: the fields of that view's settings object (the store's
   `browse`, `piece`, `gcd` or `tiers`, without the Job and sync panel's own; `tiers` holds its job), every one set.
   `syncedLevel`: the level the page is synced to (for Substat tiers the job's level cap); a level typed into GCD Scaling or
   Substat tiers that is the synced level is kept as null (follow the synced level), as the boxes do. null for a view with no
   query. */
export function readQuery(view, params, job, syncedLevel) {
  if (view === 'gear') {
    return readGear(params, job);
  }
  if (view === 'piece') {
    return readPiece(params, job);
  }
  if (view === 'gcd') {
    return readGcd(params, syncedLevel);
  }
  if (view === 'tiers') {
    return readTiers(params, job, syncedLevel);
  }
  return null;
}

/* The Gear browser's settings {q, type, expOff, min, max, lvl, exclude, market, sort, dir} for `params`. */
function readGear(params, job) {
  return restoreBrowseFields(
    {
      q: params.q ?? '',
      type: params.slot,
      min: params.min ?? '',
      max: params.max ?? '',
      lvl: params.equip,
      expOff: listOf(params.noexp),
      exclude: params.skip === undefined ? undefined : listOf(params.skip),
      market: switchOf(params.market),
      sort: params.sort,
      dir: params.dir,
    },
    job,
    defaultBrowse(job),
  );
}

/* Stat Allocation's settings {ilvl, slot, subs, slots} for `params`. */
function readPiece(params, job) {
  return restorePieceFields(
    {
      ilvl: wholeNumberOrNull(params.item),
      slot: params.slot,
      subs: params.subs === undefined ? undefined : listOf(params.subs),
      slots: wholeNumberOrNull(params.meld),
    },
    job,
    { ilvl: null, slot: 'head' },
  );
}

/* GCD Scaling's settings {level, haste, speed} for `params`: the level held to the levels the tab covers, a haste only a job
   with one has, a speed a whole number from 0 (the tab holds it to the level's range). */
function readGcd(params, syncedLevel) {
  const typed = params.gcdlevel === undefined ? null : gcdLevelInput(params.gcdlevel);
  const speed = wholeNumberOrNull(params.speed);
  return {
    level: !typed || typed.level === syncedLevel ? null : typed.level,
    haste: Object.hasOwn(HASTE, params.haste) ? params.haste : '',
    speed: speed === null ? null : clamp(speed, 0, MOST_SPEED),
  };
}

/* Substat tiers' settings {job (an id), level} for `params`: the level held to 1 and the job's level cap. */
function readTiers(params, job, syncedLevel) {
  const typed = wholeNumberOrNull(params.tierlevel);
  const level = typed === null ? null : clamp(typed, 1, job.maxLevel);
  return { job: job.jobId, level: level === syncedLevel ? null : level };
}

/* The query of `view` for `settings` (the view's settings object, as readQuery returns it) for `job`: {name: text} for the
   settings that differ from the defaults, in QUERY_NAMES order. An object with no entry is the defaults. */
export function writeQuery(view, settings, job) {
  if (view === 'gear') {
    return writeGear(settings, job);
  }
  if (view === 'piece') {
    return writePiece(settings, job);
  }
  if (view === 'gcd') {
    return writeGcd(settings);
  }
  if (view === 'tiers') {
    return writeTiers(settings);
  }
  return {};
}

/* Whether the lists `a` and `b` hold the same items, in any order. */
const sameItems = (a, b) => a.length === b.length && a.every(item => b.includes(item));

function writeGear(browse, job) {
  const defaults = defaultBrowse(job);
  const query = {};
  if (browse.q !== defaults.q) {
    query.q = browse.q;
  }
  if (browse.type !== defaults.type) {
    query.slot = browse.type;
  }
  if (browse.min !== defaults.min) {
    query.min = String(browse.min);
  }
  if (browse.max !== defaults.max) {
    query.max = String(browse.max);
  }
  if (browse.lvl !== defaults.lvl) {
    query.equip = String(browse.lvl);
  }
  if (browse.expOff.length > 0) {
    query.noexp = EXPANSIONS.map(expansion => expansion.short)
      .filter(key => browse.expOff.includes(key))
      .join(',');
  }
  if (!sameItems(browse.exclude, DEFAULT_EXCLUDE)) {
    query.skip = ACTIVITIES.map(activity => activity.key)
      .filter(key => browse.exclude.includes(key))
      .join(',');
  }
  if (browse.market !== defaults.market) {
    query.market = browse.market ? '1' : '0';
  }
  if (browse.sort !== defaults.sort) {
    query.sort = browse.sort;
  }
  if (browse.dir !== defaults.dir) {
    query.dir = browse.dir;
  }
  return query;
}

function writePiece(piece, job) {
  const query = {};
  if (piece.slot !== 'head') {
    query.slot = piece.slot;
  }
  if (piece.ilvl !== null) {
    query.item = String(piece.ilvl);
  }
  const subs = piece.subs.filter(Boolean).join(',');
  if (subs !== defaultSubs(job).filter(Boolean).join(',')) {
    query.subs = subs;
  }
  if (piece.slots !== null && meldSlotChoices(piece.slot).includes(piece.slots)) {
    query.meld = String(piece.slots);
  }
  return query;
}

/* Substat tiers' query: its job when it is not the default one, and the level typed into its box. */
function writeTiers(tiers) {
  const query = {};
  if (tiers.job !== DEFAULT_JOB) {
    query.job = tiers.job;
  }
  if (tiers.level != null) {
    query.tierlevel = String(tiers.level);
  }
  return query;
}

function writeGcd(gcd) {
  const query = {};
  if (gcd.level != null) {
    query.gcdlevel = String(clamp(gcd.level, 1, GCD_LEVELS));
  }
  if (gcd.haste) {
    query.haste = gcd.haste;
  }
  if (gcd.speed != null) {
    query.speed = String(gcd.speed);
  }
  return query;
}
