/* The piece picker of a set page's gear table (the "Choose a piece" menu of a row): a search menu, as the Food menu is.
   Takes plain data and returns plain data; the template only displays it. Pure: no store. */
import { EXPANSIONS, SLOT_LABEL } from '../../core/constants.ts';
import { allocatedRelic, categoryOf, equipLevel, expansionOf, meldInfo, searchMatches } from '../../core/items.ts';
import { meldSlots } from '../../core/meld.ts';
import { plural } from '../text.ts';
import { uniqueTaken } from '../sheets/set-edits.ts';

/* "2 slots" or "2+3 slots" (guaranteed + overmeld), "no materia slots", for a picker line. */
function slotsText(item) {
  const info = meldInfo(item);
  if (!info?.slots) {
    return 'no materia slots';
  }
  const { big, small } = meldSlots(item);
  return info.overmeld ? `${info.slots}+${big + small - info.slots} slots` : plural(info.slots, 'slot');
}

/* What a piece's line in the picker shows apart from the set: the same for every open of the picker. */
function staticFacts(job, item) {
  const lvl = equipLevel(item) ?? 0;
  const subs = job.substats.filter(s => item.stats[s]).map(s => `${job.short[s]} ${item.stats[s]}`);
  let statLine = subs.join(' · ');
  if (!subs.length) {
    statLine = allocatedRelic(job, item) ? 'substats set in game' : 'no substats';
  }
  const category = categoryOf(item);
  return {
    key: item.gameId,
    name: item.name,
    hq: Boolean(item.hq),
    ilvl: item.ilvl,
    lvl,
    category,
    // what the template shows of the category: its pill's classes and text
    pillClass: `pill cat-${category?.key}`,
    pillLabel: category?.label ?? '',
    unique: item.type === 'ring' && item.copies === 1,
    line: `${statLine} · ${slotsText(item)}`,
    levels: `${item.ilvl}, lvl ${lvl}`,
    exp: expansionOf(lvl, item.ilvl),
    search: `${item.name} ${category?.label ?? ''}`,
  };
}

/* The picker's pieces for one slot, built once per `gear` array and slot (the sorting and the lines were most of the
   picker's view work, redone on every read of it): gear array (WeakMap, so a job's list can be dropped) -> slot ->
   {facts: staticFacts of each piece of the slot, by expansion newest first, each newest first}. The facts hold no state
   of the set; piecePickerView adds it. Kept out of the store (big data: CLAUDE.md). */
const slotFactsCache = new WeakMap();
function slotFacts(job, gear, slot) {
  let bySlot = slotFactsCache.get(gear);
  if (!bySlot) {
    bySlot = new Map();
    slotFactsCache.set(gear, bySlot);
  }
  if (!bySlot.has(slot)) {
    const facts = gear
      .filter(item => item.type === slot)
      .map(item => staticFacts(job, item))
      .sort((a, b) => b.lvl - a.lvl || b.ilvl - a.ilvl || a.name.localeCompare(b.name));
    bySlot.set(slot, facts);
  }
  return bySlot.get(slot);
}

/* The note after a piece's name for a Unique piece: '' for one that is not, else whether the other ring row holds it
   (`taken`). */
function uniqueTextOf(fact, taken) {
  if (!fact.unique) {
    return '';
  }
  return taken ? ' Unique, in the other ring' : ' Unique';
}

/* The line under the picker's list when no piece shows: '' while some do, else why none does (the search matches none,
   or the job has no piece for the slot). */
function emptyTextOf(matching, forSlot, query, slotName) {
  if (matching.length) {
    return '';
  }
  if (forSlot.length && query.trim()) {
    return `No piece matches "${query.trim()}".`;
  }
  return `No ${slotName} piece for this job.`;
}

/* The set's part of a piece's line in the picker of row `index`: taken (a Unique ring worn in the other ring row), on (the
   row holds it), and what the template shows of them: onClass (the row's class while it is on), uniqueText (the Unique
   note, '' for a piece that is not), so the template decides nothing per row. */
function setFacts(fact, row, job, gearSet, index) {
  const taken = fact.unique && uniqueTaken(job, gearSet, index, fact.key);
  return {
    taken,
    on: fact.key === row.gameId,
    onClass: fact.key === row.gameId ? 'on' : '',
    uniqueText: uniqueTextOf(fact, taken),
  };
}

/* The piece picker of row `index` of `gearSet` (a search menu, as the Food menu is): every piece of `gear` (the job's wearable pieces: items.ts jobGear) for the row's slot, by
   expansion newest first, each newest first, after the search `query` (name or gear category). Returns {placeholder
   ("Search head pieces"), canEmpty (the row holds a piece: the "Empty this slot" button in the search row), groups [{label, items: [{key
   (gameId), name, hq, category, unique, taken (a Unique ring in the other ring row), line ("CRT 306 · DET 214 · 2
   slots"), levels ("640, lvl 90"), on}]}], count (the pieces the search leaves), emptyText (the
   search leaves nothing, or '' ), footText ("412 pieces")}. */
export function piecePickerView(job, gear, gearSet, index, query) {
  const row = gearSet.pieces[index];
  const forSlot = slotFacts(job, gear, row.slot);
  const matching = forSlot.filter(fact => searchMatches(fact.search, query));
  const groups = [...EXPANSIONS]
    .reverse()
    .map(({ short, name }) => ({ label: name, items: matching.filter(x => x.exp === short) }))
    .filter(g => g.items.length);

  // the set's part of each piece
  const drawn = groups.map(g => ({
    label: g.label,
    items: g.items.map(fact => ({
      ...fact,
      ...setFacts(fact, row, job, gearSet, index),
    })),
  }));
  const slotName = SLOT_LABEL[row.slot].toLowerCase();
  return {
    placeholder: `Search ${slotName} pieces`,
    canEmpty: row.gameId != null,
    groups: drawn,
    count: matching.length,
    emptyText: emptyTextOf(matching, forSlot, query, slotName),
    footText: plural(forSlot.length, 'piece'),
  };
}
