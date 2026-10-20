/* Ranked stat dropdowns: the optimizer's Maximize, Tiebreak 1 and Tiebreak 2, and Piece stats' 1st and 2nd substat.
   A stat holds at most one rank (owner, 2026-10-18): a dropdown hides the stats picked above it, and picking a stat a
   later rank holds swaps the two, so a reorder takes one change and nothing is cleared. Pure: no Alpine import, so
   Node can load and test it. */

/* The stats rank i's dropdown offers: `choices` (neutral keys, in order) less those picked in the ranks above it.
   `ranks`: [neutral key, or '' or null for none], first rank first. */
export function rankChoices(ranks, i, choices) {
  const above = ranks.slice(0, i);
  return choices.filter(s => !above.includes(s));
}

/* The ranks after choosing `value` (a neutral key, or '' for none) at rank i: [key or null], as long as `ranks`. A
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

/* `ranks` with every repeat of a rank above cleared to null: repairs a goal saved before the rule. */
export function uniqueRanks(ranks) {
  return ranks.map((r, i) => (r && ranks.indexOf(r) === i ? r : null));
}
