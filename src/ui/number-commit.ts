/* The page's one rule for text typed into a number box: what value it commits and what the box then shows. Pure (no DOM,
   no timers), so it runs in Node; the boxes' handlers (number-field.ts, the GCD tab, the substat tiers) call it and keep
   only their own timing. The rules are in docs/engineering/architecture.md ("Number inputs"). */
import { clamp } from '../core/clamp.ts';

/* `value` rounded to `decimals` digits after the point (0: a whole number). */
export function roundTo(value: number, decimals = 0): number {
  const scale = 10 ** decimals;
  return Math.round(value * scale) / scale;
}

/* The text a box shows for `value` kept to `decimals` digits: no trailing zeros (2.5 shows "2.5", as the box always has). */
export function formatNumber(value: number, decimals = 0): string {
  return String(roundTo(value, decimals));
}

/* The options of commit (below). `Empty` is the type of the value an emptied box commits (`empty`). */
export interface CommitOptions<Empty extends number | string = never> {
  min?: number;
  max?: number;
  decimals?: number;
  snap?: boolean;
  exact?: boolean;
  empty?: Empty;
  final?: boolean;
}

/* What commit returns for text it commits (below). */
export interface Committed<Value> {
  value: Value;
  shown: string;
  clamped: boolean;
}

/* What typed `text` commits: {value, shown, clamped}, or null for "commit nothing".
   - value: the number to store, rounded to `decimals`; for an emptied box, `empty`.
   - shown: the text the box shows for it (formatNumber; '' for an emptied box). A caller that leaves typed text alone
     (a box with focus that already shows the stored value) writes it only when `clamped`.
   - clamped: the typed number was out of range and moved to the nearest bound.
   Options:
   - min, max: the bounds, numbers (Infinity or -Infinity for none; default none).
   - decimals: digits kept after the point (default 0).
   - snap: true moves an out-of-range number to the nearest bound, but only when `final` (Enter, leaving the box); while
     typing, or with snap false, it is held back (null), since a value on the way ("9" of "90") must not be corrected
     under the cursor. Default true.
   - exact: true holds back a number with more digits than `decimals` (1.5 in a whole-number box) instead of rounding it
     (the sync cap explains it itself; the GCD tab's level takes whole numbers only). Default false.
   - empty: the value an emptied box commits; left out, an emptied box commits nothing (null).
   - final: the box is being left or Enter pressed, not typed into.
   Text that is no finite number commits nothing. */
export function commit<Empty extends number | string = never>(
  text: string,
  { min = -Infinity, max = Infinity, decimals = 0, snap = true, exact = false, empty, final = false }: CommitOptions<Empty> = {},
): Committed<number | Empty> | null {
  if (text === '') {
    return empty === undefined ? null : { value: empty, shown: '', clamped: false };
  }

  const typed = Number(text);
  if (!Number.isFinite(typed)) {
    return null;
  }
  if (exact && roundTo(typed, decimals) !== typed) {
    return null;
  }

  let value = typed,
    clamped = false;
  if (value < min || value > max) {
    if (!final || !snap) {
      return null;
    }
    value = clamp(value, min, max);
    clamped = true;
  }
  value = roundTo(value, decimals);
  return { value, shown: formatNumber(value, decimals), clamped };
}
