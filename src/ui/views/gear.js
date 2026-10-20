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

/* The rows on one page of the table. */
export const PAGE_SIZE = 100;

/* The places for page numbers and gaps ("…") on the page line once the pages don't all fit (pageList). Always this
   many, so the arrows don't move as the page changes. */
export const PAGE_SLOTS = 7;

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

/* "1 match", "1,939 matches". */
const matchCount = n => `${fmtInt(n)} ${n === 1 ? 'match' : 'matches'}`;

/* The page line's numbers for page `current` of `count` (owner's pick P1 a, 2026-10-20): an array of page numbers,
   with null for a gap ("…"). Every page while there are PAGE_SLOTS or fewer; else always PAGE_SLOTS entries: page 1, the current page with one page each side, the last
   page, and a gap between them where pages are skipped. Near an end, the pages run on from that end instead
   (1 2 3 4 5 … 22), so a gap never stands for a single page. One page gives [1]. */
export function pageList(current, count) {
  if (count <= PAGE_SLOTS) return Array.from({ length: count }, (_, i) => i + 1);

  // the run of pages between the first and the last: the current page and one each side; moved to touch an end
  // (and one longer) when a gap there would stand for one page only
  let from = current - 1;
  let to = current + 1;
  if (from <= 3) {
    from = 2;
    to = PAGE_SLOTS - 2;
  } else if (to >= count - 2) {
    from = count - PAGE_SLOTS + 3;
    to = count - 1;
  }

  // first page, gap, the run, gap, last page (no gap on the side the run touches)
  const list = [1];
  if (from > 2) list.push(null);
  for (let p = from; p <= to; p++) list.push(p);
  if (to < count - 1) list.push(null);
  list.push(count);
  return list;
}

/* The gear browser's list, on page `page` (1 first; held to the pages there are, so a page past the end shows the
   last): {shown, anySynced, countText, page, pageCount, pageButtons, prevPage, nextPage, emptyBoxes, slots}. shown:
   that page's PAGE_SIZE matches, in the heading's order, each with its cells (browseCell: the synced stat on the top
   line, the piece's own under it), its name cut for the search's highlight (nameParts), and `synced` true when sync lowers
   its item level. The item level column shows the piece's own item level (owner, 2026-10-19: the synced one there was
   confusing). slots: the slot pills, [{key, label, count, group, sep}], 'any' first (group 0), then the job's slots by
   group (1 to 3), count the matches in that slot under the other filters. For `job` (a JobContext) under `sync` ({cap,
   sync, level}: ui/settings.js syncSettings), with the browser's settings `browse` (the store's: state.js
   defaultBrowse). The page line: pageButtons, [{key, page, current}] from pageList (page null for a gap; none with one
   page), and prevPage and nextPage, the arrows' pages (null at the ends). */
export function gearView(job, sync, browse, page = 1) {
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

  // the page's rows, with the page held to 1..pageCount
  const pageCount = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
  const pageShown = Math.min(Math.max(1, Math.round(page) || 1), pageCount);
  const firstRow = (pageShown - 1) * PAGE_SIZE;
  const shown = all.slice(firstRow, firstRow + PAGE_SIZE).map(x => ({
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

  // the page line's buttons: none with one page; a page's key is its number, a gap's 'gap' and its place
  const pageButtons =
    pageCount > 1 ? pageList(pageShown, pageCount).map((p, i) => ({ key: p ?? `gap${i}`, page: p, current: p === pageShown })) : [];

  return Object.freeze({
    shown: Object.freeze(shown),
    // some shown row is synced: the key at the right of the page line shows
    anySynced: shown.some(x => x.synced),
    countText: all.length ? matchCount(all.length) : 'No matches',
    page: pageShown,
    pageCount,
    pageButtons: Object.freeze(pageButtons.map(Object.freeze)),
    prevPage: pageShown > 1 ? pageShown - 1 : null,
    nextPage: pageShown < pageCount ? pageShown + 1 : null,
    // "Gear from" boxes with nothing for the job and the other filters: greyed out in the menu
    emptyBoxes: Object.freeze(emptyActivities(rows.filter(inSlot).map(r => r.routes))),
    slots: Object.freeze(slots),
  });
}
