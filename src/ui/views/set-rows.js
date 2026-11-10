/* A saved gear set's table on the set page: the column headers with the goal's rank badges, one row per slot the job uses
   (the piece, its materia chips, its stats with the cap marks) and the Food row. The Total, Tier and Defense rows are
   set-totals.js. Takes plain data (a saved GearSet: docs/engineering/sheets.md, "Saved data", evaluated by
   evaluateInSheet) and returns a plain view object; the template only displays it. Pure: no Alpine, no store. */
import { allocatedRelic, meldInfo, poolItemById } from '../../core/items.js';
import { ROMAN, meldSlots } from '../../core/meld.js';
import { meldCaps } from '../../core/piece.js';
import { MATERIA } from '../../core/tables.js';
import { fillPlan } from './fill.js';
import { mealBestNote } from './meal-menu.js';
import { usedRows } from './saved-set.js';

/* The line a row shows where a saved game id has no row in the item data (docs/engineering/sheets.md, "Missing items"). */
export function missingItemText(gameId) {
  return `missing item ${gameId}`;
}

/* The name of the piece a saved row holds: the item data's name, "missing item <id>" for a game id the data lacks, or
   null for an empty row. */
export function pieceName(job, piece) {
  if (piece.gameId == null) return null;
  return poolItemById(job, piece.gameId)?.name ?? missingItemText(piece.gameId);
}

/* The goal's stat ranks, {stat key: 1, 2 or 3} (1 maximize, 2 tiebreak 1, 3 tiebreak 2), for the badges before the column
   names. `goal`: a set's fillSettings.goal ({target, tb, tb2}), or null while the set has no Fill settings (no badges). */
export function rankBadges(job, goal) {
  const ranks = {};
  [goal?.target, goal?.tb, goal?.tb2].forEach((stat, i) => {
    if (stat && job.stats.includes(stat) && !(stat in ranks)) ranks[stat] = i + 1;
  });
  return ranks;
}

/* The stone chips of a worn piece, one per materia slot in slot order: [{index, text ("CRT XII", or "empty"), empty, over
   (an overmeld slot), locked (an empty slot behind another empty one: slots fill in order), removed (applyStones' reason
   the stone does not count, or null; "sync" while the piece is synced), fit ('none' when its stat is already at the
   piece's cap so the stone adds nothing, 'part' when only part of it fits, else '')}]. `stones`: the saved piece's. */
function stoneChips(job, row, stones) {
  const { big, small } = meldSlots(row.item);
  const slots = big + small;
  const guaranteed = meldInfo(row.item)?.slots ?? 0;
  const removedAt = new Map(row.removed.map(removal => [removal.slot, removal.reason]));
  const caps = meldCaps(job, row.item);
  const firstEmpty = stones.findIndex(stone => !stone);
  const fillsAt = firstEmpty < 0 ? stones.length : firstEmpty;
  const added = {};
  return Array.from({ length: slots }, (_, index) => {
    const stone = stones[index] ?? null;
    let fit = '';
    if (stone && !removedAt.has(index)) {
      const room = Math.max(0, caps[stone.stat] - (row.item.stats[stone.stat] || 0) - (added[stone.stat] || 0));
      const value = MATERIA.values[stone.grade - 1];
      fit = room <= 0 ? 'none' : room < value ? 'part' : '';
      added[stone.stat] = (added[stone.stat] || 0) + Math.min(room, value);
    }
    return {
      index,
      text: stone ? `${job.short[stone.stat]} ${ROMAN[stone.grade - 1]}` : 'empty',
      empty: !stone,
      over: index >= guaranteed,
      locked: !stone && index > fillsAt,
      removed: removedAt.get(index) ?? null,
      fit,
    };
  });
}

/* One stat cell of a worn row: {stat, value, text, zero, atCap, beforeCap}. atCap: a substat at the most this piece can
   have (its sync cap, or its own cap with melds) or with stone points lost past the cap; beforeCap: the total before the
   cap ("(412)") when stones were cut, else null. Only substats are marked: the main stat and Vitality are never melded. */
function statCell(job, row, stat) {
  const value = row.stats[stat] || 0;
  const lost = row.lost[stat] || 0;
  const melded = job.substats.includes(stat);
  return {
    stat,
    value,
    text: String(value),
    zero: !value,
    atCap: melded && (lost > 0 || (value > 0 && value >= row.caps[stat])),
    beforeCap: lost > 0 ? value + lost : null,
  };
}

/* The view of one used row of the set. `index` is the saved row's number, `piece` the saved row, `row` its evaluation,
   `pinned` whether Fill must keep it (fill.js fillPlan), `changed` whether a draft or suggestion changes it, `take` the
   row's Take box while a Fill suggestion shows ({taken, text}: set-suggestion.js suggestionView's takes, or null). An
   empty row: {empty: true, emptyText ("Choose a piece", "covered by X Robe", "missing item 123"), blockedBy, missing}; a
   worn one: the piece's facts, chips and cells. */
function rowView(job, index, piece, row, pinned, changed, take) {
  const common = { index, slot: piece.slot, label: row.label, pinned, changed, take };
  if (!row.item) {
    const missing = piece.gameId != null ? missingItemText(piece.gameId) : null;
    return {
      ...common,
      empty: true,
      blockedBy: row.blockedBy,
      missing,
      emptyText: row.blockedBy ? `covered by ${row.blockedBy}` : (missing ?? 'Choose a piece'),
    };
  }
  const stones = piece.stones ?? [];
  const chips = stoneChips(job, row, stones);
  return {
    ...common,
    empty: false,
    gameId: row.item.gameId ?? null,
    name: row.item.name,
    // the stats are the high-quality ones: the page draws the HQ glyph after the name
    hq: !!row.item.hq,
    ilvl: row.item.ilvl,
    // the item level the piece is synced to, or null (the column's hover title says it); ilvlText is the number the column
    // shows: the piece's own item level, as in the Gear browser
    target: row.target,
    ilvlText: String(row.item.ilvl),
    category: row.category,
    from: row.from,
    chips,
    noChipsText: chips.length ? '' : allocatedRelic(job, row.item) ? 'substats set in game; no materia slots' : 'no materia slots',
    cells: job.stats.map(stat => statCell(job, row, stat)),
  };
}

/* The Food row: {empty, name, hq, ilvl, pinned, note, best, cells, take}. best: {note} beside the meal (meal-menu.js
   mealBestNote: "best for goal" or ''; `bestKeys` the tagged meals). cells: one per stat in job.stats order, {stat, value,
   text ("+133"), capped} or null for a stat the meal does not touch. `pinned`: the set pins its meal; `take`: the meal's
   Take box while a suggestion shows, or null. */
function foodRow(job, gearSet, evaluated, pinned, changed, take, bestKeys) {
  const meal = evaluated.meal;
  if (!meal) {
    // a saved key no meal has any more is named, as a missing piece is
    const missing = gearSet.meal != null ? `missing meal ${gearSet.meal}` : null;
    return {
      label: 'Food',
      empty: true,
      emptyText: missing ?? 'No food',
      ilvl: null,
      pinned: false,
      changed,
      take,
      best: mealBestNote(null, bestKeys),
      cells: job.stats.map(() => null),
    };
  }
  return {
    label: 'Food',
    empty: false,
    name: meal.name,
    hq: true,
    ilvl: meal.ilvl,
    pinned,
    changed,
    take,
    note: 'HQ',
    best: mealBestNote(meal.key, bestKeys),
    cells: job.stats.map(stat => {
      const bonus = evaluated.bonus[stat];
      return bonus ? { stat, value: bonus.bonus, text: `+${bonus.bonus}`, capped: bonus.capped } : null;
    }),
  };
}

/* The set page's table for a saved set evaluated by evaluateInSheet (`context`), without the Total, Tier and Defense rows
   (setTotalsView). Options: `goal` (the set's fillSettings.goal, or null: rank badges), `changedRows` (saved row numbers
   a draft or suggestion changes, for the highlight), `mealChanged`, and while a Fill suggestion shows `takes` and
   `mealTake` (set-suggestion.js suggestionView's: the Take boxes; `gearSet` is then the suggestion's `shown`), `bestKeys`
   (the meals tagged "best for goal", meal-menu.js mealBestKeys of the saved set; [] for a draft or a suggestion). Returns:
   - headers: the stat columns {stat, text (the job's short name), rank (1 to 3 or null; see rankBadges), rankLabel
     ("goal rank 1")};
   - rows: one view per row the job uses, in the saved order (rowView), each with `pinned`: the set pins the row and it
     holds a piece (fill.js fillPlan, the one rule); a row the job does not use is left out, its piece stays saved;
   - food: the Food row; consumablesLabel: the header row above it;
   - anyAtCap: some cell is marked, so the page shows the cap key; capKeyText: that key's words. */
export function setRowsView(
  context,
  gearSet,
  { goal = null, changedRows = [], mealChanged = false, takes = null, mealTake = null, bestKeys = [] } = {},
) {
  const { job, evaluated } = context;
  const ranks = rankBadges(job, goal);
  const plan = fillPlan(job, gearSet);
  const pinnedRows = new Set(plan.pinnedRows);
  const changed = new Set(changedRows);
  const rows = usedRows(job, gearSet).map(({ index, row: piece }) =>
    rowView(job, index, piece, evaluated.rows[index], pinnedRows.has(index), changed.has(index), takes?.[index] ?? null),
  );
  return {
    headers: job.stats.map(stat => ({
      stat,
      text: job.short[stat],
      rank: ranks[stat] ?? null,
      rankLabel: ranks[stat] ? `goal rank ${ranks[stat]}` : '',
    })),
    rows,
    consumablesLabel: 'Consumables',
    // the meal is pinned only while the set holds one (fillPlan.pins.meal)
    food: foodRow(job, gearSet, evaluated, !!plan.pins?.meal, mealChanged, mealTake, bestKeys),
    anyAtCap: rows.some(row => !row.empty && row.cells.some(cell => cell.atCap)),
    capKeyText: 'a stat at this piece’s cap; (412): the total before the cap',
  };
}
