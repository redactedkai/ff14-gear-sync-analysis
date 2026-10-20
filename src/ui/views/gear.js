/* Gear browser: the item database rows the job can wear that match the filters, with their synced stats.
   Gear the browser's "Gear from" filter leaves out (`browse.exclude` and `browse.market`, its own; the optimizer has
   `opt.exclude` and `opt.market`) is not listed.
   Pure view builder: no Alpine import, so Node can load and test it. */
import {
  allowedActivities,
  browseItems,
  copiesOf,
  dbStats,
  emptyActivities,
  gearFilter,
  kindFactors,
  poolKey,
  routesAllow,
  slotLabel,
} from '../../core/items.js';
import { syncStats } from '../../core/formulas.js';
import { syncTarget } from '../../core/sync-target.js';
import { fmtInt } from '../helpers.js';
import { defaultBrowse } from '../state.js';
import { SLOT_LABEL } from '../../core/constants.js';

/* The most rows the table renders; the rest are counted in its last row. */
export const SHOW_LIMIT = 100;

/* The slot pills' groups, in the order they show (owner, 2026-10-18): weapon and shield, armor, accessories. */
const SLOT_GROUPS = [
  ['weapon', 'offhand'],
  ['head', 'body', 'hands', 'legs', 'feet'],
  ['ear', 'neck', 'wrist', 'ring'],
];

/* The orders the table's headings sort by: 'name', 'lvl', 'ilvl' or a neutral stat key (its synced value), each 'desc'
   (high first; Z to A for names) or 'asc'. Ties go to the higher item level, then the name. */
function byOrder(sort, dir) {
  const sign = dir === 'asc' ? -1 : 1;
  return (x, y) => {
    let d = 0;
    if (sort === 'name') d = y.name.localeCompare(x.name);
    else if (sort === 'lvl') d = y.lvl - x.lvl;
    else if (sort !== 'ilvl') d = (y.eff[sort] || 0) - (x.eff[sort] || 0);
    return sign * d || sign * (y.ilvl - x.ilvl) || x.name.localeCompare(y.name);
  };
}

/* A name cut where the search's words are found: [{text, hit}], hit true on a matched part (shown highlighted). Words
   are found ignoring case; overlapping matches merge. */
export function markWords(name, query) {
  const lower = name.toLowerCase(),
    hit = new Array(name.length).fill(false);
  for (const w of query.toLowerCase().split(/\s+/).filter(Boolean))
    for (let i = lower.indexOf(w); i >= 0; i = lower.indexOf(w, i + 1)) hit.fill(true, i, i + w.length);
  const parts = [];
  for (let i = 0; i < name.length; i++) {
    if (parts.length && parts.at(-1).hit === hit[i]) parts.at(-1).text += name[i];
    else parts.push({ text: name[i], hit: hit[i] });
  }
  return parts;
}

/* The same keys, in any order. */
const sameSet = (a, b) => [...a].sort().join() === [...b].sort().join();

/* Whether any of the browser's filters is off its default (defaultBrowse; Reset filters shows only then): the name
   search (spaces aside), the slot, the item level range, the equip level (empty or the job's level cap is no filter), the
   expansions, or Gear from (its boxes in any order, or the market board switch). The sort is not a filter. */
export function browseFiltered(job, b) {
  const d = defaultBrowse(job);
  return (
    b.q.trim() !== d.q ||
    b.type !== d.type ||
    b.min !== d.min ||
    b.max !== d.max ||
    (b.lvl !== '' && b.lvl < d.lvl) ||
    !sameSet(b.expOff, d.expOff) ||
    b.market !== d.market ||
    !sameSet(b.exclude, d.exclude)
  );
}

/* A stat's cell in the browser: {text, cls, was}. Lowered by sync: the synced value, bold with the cap bar (sync takes
   a stat to exactly the piece's cap), and `was` the value before sync for the muted line under it; else the value,
   dimmed when zero, and `was` null. */
export function browseCell(raw, synced) {
  raw = raw || 0;
  synced = synced || 0;
  if (synced < raw) return { text: String(synced), cls: 'n cut', was: String(raw) };
  return { text: String(raw), cls: raw ? 'n' : 'n dim', was: null };
}

/* "1 match", "1,939 matches"; `more` goes between the number and the word ("12 more matches"). */
const matchCount = (n, more = '') => `${fmtInt(n)} ${more}${n === 1 ? 'match' : 'matches'}`;

/* The gear browser's list: {shown, countText, hidden, hiddenText (the last row's line), emptyBoxes, slots}. shown: the first SHOW_LIMIT matches, in the
   heading's order, each with its cells (browseCell: the synced stat on the top line, the piece's own under it), its name
   cut for the search's highlight (nameParts), and `synced` true when sync lowers its item level. The item level column
   shows the piece's own item level (owner, 2026-10-19: the synced one there was confusing). slots: the slot pills,
   [{key, label, count, group, sep}], 'any' first (group 0), then the job's slots by group (1 to 3), count the matches in
   that slot under the other filters. For `job` (a JobContext) under `sync` ({cap, sync, level}: ui/settings.js
   syncSettings), with the browser's settings `browse` (the store's: state.js defaultBrowse). */
export function gearView(job, sync, browse) {
  const b = browse;
  // every slot first, for the pills' counts; the slot filter is applied after
  const rows = browseItems(job, { ...gearFilter(b), q: b.q });
  const allowed = allowedActivities(b.exclude || [], b.market !== false);
  const inSlot = r => b.type === 'any' || r.type === b.type;
  const listed = rows.filter(r => routesAllow(r.routes, allowed));
  const all = listed.filter(inSlot).map(r => {
    const raw = dbStats(job, r.st);
    const target = syncTarget({
      itemLevel: r.ilvl,
      equipLevel: r.lvl,
      scales: r.scales,
      syncOn: sync.sync,
      cap: sync.cap,
      syncedLevel: sync.level,
    });
    return {
      name: r.name,
      type: r.type,
      ilvl: r.ilvl,
      target,
      lvl: r.lvl,
      hq: r.hq,
      copies: copiesOf(r.type, r.unique),
      blocks: r.blocks,
      raw,
      eff: target == null ? raw : syncStats(job, raw, r.type, target, r.ilvl, r.pct, kindFactors(job, r.kind)),
    };
  });
  all.sort(byOrder(b.sort, b.dir));
  const shown = all.slice(0, SHOW_LIMIT).map(x => ({
    ...x,
    key: poolKey(x),
    slot: slotLabel(x.type, x.blocks),
    nameParts: markWords(x.name, b.q),
    synced: x.target != null && x.target < x.ilvl,
    cells: job.stats.map(s => browseCell(x.raw[s], x.eff[s])),
  }));

  // the slot pills: how many matches each slot has under the other filters
  const counts = {};
  for (const r of listed) counts[r.type] = (counts[r.type] || 0) + 1;
  // sep: a gap before the pill, where a new group starts
  const slots = [{ key: 'any', label: 'Any', count: listed.length, group: 0, sep: false }];
  SLOT_GROUPS.forEach((group, g) => {
    for (const t of group)
      if (job.activeSlotTypes.includes(t))
        slots.push({ key: t, label: SLOT_LABEL[t], count: counts[t] || 0, group: g + 1, sep: slots.at(-1).group !== g + 1 });
  });

  const n = all.length;
  return Object.freeze({
    shown: Object.freeze(shown),
    // some shown row is synced: the key above the table shows
    anySynced: shown.some(x => x.synced),
    countText: n ? `${matchCount(n)}${n > SHOW_LIMIT ? `, showing the first ${SHOW_LIMIT}` : ''}` : 'No matches',
    hidden: n > SHOW_LIMIT ? fmtInt(n - SHOW_LIMIT) : '',
    hiddenText: n > SHOW_LIMIT ? `${matchCount(n - SHOW_LIMIT, 'more ')} not shown. Narrow the filters to view them.` : '',
    // "Gear from" boxes with nothing for the job and the other filters: greyed out in the menu
    emptyBoxes: Object.freeze(emptyActivities(rows.filter(inSlot).map(r => r.routes))),
    slots: Object.freeze(slots),
  });
}
