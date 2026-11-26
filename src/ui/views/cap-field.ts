/* What an item level field and a level field show: the error, the note after the page lowered the cap, and the flag in the label line
   (the elements <gsa-cap-field> and <gsa-level-field>). Pure view builders: no DOM, so Node can load and test them. The rules
   and texts are level-cap.ts's. */
import { CAP_MISSING_TEXT, CAP_TYPED_BAD_TEXT, LEVEL_TEXT, capFlag, capLoweredText, rangeText } from '../level-cap.ts';
import type { LoweredCap } from '../level-cap.ts';

/* What the item level field shows. `syncOn`: item level sync is on (nothing is asked of the field while it is off); `value`: the stored
   cap (null: none); `typedBad`: the box holds text that is no whole item level (the store keeps its last cap); `lowered`: the cap the
   page last lowered, {from, to, level} (limitCapToLevel), or null; `max`: the highest real item level (the range runs from 1 to it).
   Returns {range ("1–795"), error (the whole sentence while sync is on and the box holds a bad text or no cap, else ''), note
   (capLoweredText after a lowering; '' while sync is off or an error takes its place), flag (capFlag of both, for the label line)}. */
export function capFieldView({
  syncOn,
  value,
  typedBad,
  lowered,
  max,
}: {
  syncOn: boolean;
  value: number | null;
  typedBad: boolean;
  lowered: LoweredCap | null;
  max: number;
}) {
  const range = rangeText(max);
  const missing = syncOn && !typedBad && value == null;
  let error = '';
  if (syncOn && typedBad) {
    error = CAP_TYPED_BAD_TEXT;
  } else if (missing) {
    error = CAP_MISSING_TEXT;
  }
  const note = syncOn && !error ? capLoweredText(lowered) : '';
  return { range, error, note, flag: capFlag({ error, missing, note, lowered, range }) };
}

/* What the level field shows. `typedBad`: the box holds text that is no whole level; `max`: the job's level cap.
   Returns {range ("1–100"), error (LEVEL_TEXT.typedBad while the text is bad, else ''), flag (capFlag of it)}. */
export function levelFieldView({ typedBad, max }: { typedBad: boolean; max: number }) {
  const range = LEVEL_TEXT.range(max);
  const error = typedBad ? LEVEL_TEXT.typedBad(max) : '';
  return { range, error, flag: capFlag({ error, range }) };
}
