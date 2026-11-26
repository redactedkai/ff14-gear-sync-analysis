/* The materia menu of a set page's gear table (the menu a stone chip opens): the grades by stat, with the room left under
   each cap and the odds of an overmeld slot. Takes plain data and returns plain data; the template only displays it.
   Pure: no store. */
import { meldInfo, poolItemById } from '../../core/items.ts';
import { ROMAN, materiaFit, meldSlots, overmeldChance, overmeldNumber, slotGrades, usesNqOvermeldRates } from '../../core/meld.ts';
import { meldCaps } from '../../core/piece.ts';
import { rowLabel } from '../sheets/saved-set.js';
import { lastStone, paddedStones } from '../sheets/set-edits.js';

/* How many grades the materia menu shows before "Show all grades": the most valuable ones the slot takes. */
const BEST_GRADES = 4;
/* Grade columns in one band of the all-grades menu (XII to VII, then VI to I). */
const BAND_COLUMNS = 6;
const NO_ODDS_TEXT = '–'; // the odds cell of a grade the slot cannot take: it has no odds, which is not a 0% chance

/* The odds cell of grade column `g` of `item` in overmeld slot number `overNo` ('' in a guaranteed slot, which has none). */
function oddsText(item, g, overNo) {
  if (!overNo) {
    return '';
  }
  return g.ok ? `${overmeldChance(item, g.grade, overNo)}%` : NO_ODDS_TEXT;
}

/* The materia menu of materia slot `slot` of row `index` of `gearSet` `all` true for "Show all grades".
   Returns {title ("Head · slot 1 of 2", "Head · overmeld slot 2"), bands: [{key, columns: [{grade, roman, ok, odds ("10%"
   in an overmeld slot, "–" for a grade the slot cannot take (the item level is too low, or a high grade in a small slot), '' in a guaranteed slot)}], rows:
   [{stat, short, cells: [{grade, value, text ("+54"), ok, on, fit ('none' the stat is already at the piece's cap,
   'part' only part of it fits, '')}]}]}], columns (grade columns per band), hasStone (the slot holds a stone: the footer shows a Remove button, else an empty
   place), canRemove (the stone in this slot is the last one), removeNote ("Remove the last stone (slot 3 of 3) first." while a later slot holds one, else ''), allText
   ("Show all grades", "Best grades only"), highNote (all grades on a small overmeld slot: why the high ones are off),
   showOdds (an overmeld slot: the menu has an "odds" row), nqNote (the piece cannot be high quality, so the odds are
   the NQ ones: said under the grades, else '')}.
   The odds are display only: every meld counts as a success, in the search too (docs/mechanics/materia.md).
   The best grades are the BEST_GRADES most valuable ones the slot takes, highest grade first; all grades are the twelve
   in fixed places, a grade the slot cannot take shown off. */
export function materiaMenuView(job, gearSet, index, slot, all) {
  const row = gearSet.pieces[index];
  const item = poolItemById(job, row.gameId);
  const stones = paddedStones(item, row.stones);
  const { big } = meldSlots(item);
  const guaranteed = meldInfo(item)?.slots ?? 0;
  const grades = slotGrades(item, slot);
  const shown = all
    ? [...grades].reverse()
    : grades
        .filter(g => g.ok)
        .sort((a, b) => b.value - a.value)
        .slice(0, BEST_GRADES)
        .sort((a, b) => b.grade - a.grade);

  // room under each stat's cap for this slot's stone: the cap less the piece's own points and the other stones'
  const caps = meldCaps(job, item);
  const room = stat => {
    const others = stones.reduce((sum, s, i) => (s && i !== slot && s.stat === stat ? sum + grades[s.grade - 1].value : sum), 0);
    return Math.max(0, caps[stat] - (item.stats[stat] || 0) - others);
  };
  const here = stones[slot];
  const overNo = overmeldNumber(item, slot); // 0 in a guaranteed slot: no odds row
  const bands = [];
  for (let i = 0; i < shown.length; i += BAND_COLUMNS) {
    const columns = shown.slice(i, i + BAND_COLUMNS);
    bands.push({
      key: i,
      columns: columns.map(g => ({
        grade: g.grade,
        roman: ROMAN[g.grade - 1],
        ok: g.ok,
        odds: oddsText(item, g, overNo),
      })),
      rows: job.substats.map(stat => ({
        stat,
        short: job.short[stat],
        cells: columns.map(g => {
          const left = room(stat);
          return {
            grade: g.grade,
            value: g.value,
            text: `+${g.value}`,
            ok: g.ok,
            on: Boolean(here) && here.stat === stat && here.grade === g.grade,
            fit: g.ok ? materiaFit(left, g.value) : '',
          };
        }),
      })),
    });
  }
  const last = lastStone(stones);
  const place = k => (k >= guaranteed ? `overmeld slot ${k - guaranteed + 1}` : `slot ${k + 1} of ${guaranteed}`);
  return {
    title: `${rowLabel(gearSet, index)} · ${place(slot)}`,
    bands,
    columns: bands.length > 1 ? BAND_COLUMNS : shown.length,
    hasStone: Boolean(here),
    canRemove: Boolean(here) && slot === last,
    removeNote: here && slot !== last ? `Remove the last stone (${place(last)}) first.` : '',
    allText: all ? 'Best grades only' : 'Show all grades',
    // a slot past the big ones takes no high grade: said under the grades when all of them show
    highNote: all && slot >= big ? 'This slot takes no grade VI, VIII, X or XII.' : '',
    showOdds: overNo > 0,
    nqNote: overNo > 0 && usesNqOvermeldRates(item) ? "Odds for a piece that can't be high quality." : '',
  };
}
