/* Ranked stat dropdowns: the optimizer's Maximize, Tiebreak 1 and Tiebreak 2, and Piece stats' 1st and 2nd substat.
   A stat holds at most one rank (owner): a dropdown hides the stats picked above it, and picking a stat a
   later rank holds swaps the two, so a reorder takes one change and nothing is cleared. Pure: no Alpine import, so
   Node can load and test it. */

/* The stats rank i's dropdown offers: `choices` (stat keys, in order) less those picked in the ranks above it.
   `ranks`: [stat key, or '' or null for none], first rank first. */
export function rankChoices(ranks, i, choices) {
  const above = ranks.slice(0, i);
  return choices.filter(s => !above.includes(s));
}

/* The ranks after choosing `value` (a stat key, or '' for none) at rank i: [key or null], as long as `ranks`. A
   stat another rank holds swaps with rank i's old one. The first rank is never empty: when a swap would empty it, it
   takes the first of `choices` no rank holds. */
export function withRank(ranks, i, value, choices) {
  const out = ranks.map(r => r || null);
  const picked = value || null;
  const j = picked == null ? -1 : out.indexOf(picked);
  if (j >= 0 && j !== i) out[j] = out[i];
  out[i] = picked;
  if (out[0] == null) out[0] = choices.find(s => !out.includes(s)) ?? null;
  return out;
}

/* The names of the three goal ranks, in order. */
const RANK_NAMES = ['Maximize', 'Tiebreak 1', 'Tiebreak 2'];

/* The note after withRank moved another rank: "Tiebreak 1 changed to Mind (a stat holds one rank).", or '' when no other rank
   changed. `ranks`: the three ranks before the pick; `i`: the rank picked; `value`: the stat picked ('' for none);
   `after`: withRank's result; `labelOf(stat)`: a stat key's name. Wording as the prototype's. */
export function rankSwapNote(ranks, i, value, after, labelOf) {
  const j = value ? ranks.map(r => r || null).indexOf(value) : -1;
  if (j < 0 || j === i) return '';
  return `${RANK_NAMES[j]} changed to ${after[j] ? labelOf(after[j]) : 'none'} (a stat holds one rank).`;
}

/* `ranks` with every repeat of a rank above cleared to null: repairs a goal saved before the rule. */
export function uniqueRanks(ranks) {
  return ranks.map((r, i) => (r && ranks.indexOf(r) === i ? r : null));
}
