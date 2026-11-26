/* The events and shapes of <gsa-cap-field> and <gsa-level-field> that the page's templates and the elements share, written once (a
   template listens with `@cap-change`, which cannot import this). A `.ts` module with no import, so Node tests can read it. */

/* A cap the user entered, or the field lowered itself: `detail` is the cap (a number), or null for an emptied box. */
export const CAP_CHANGE_EVENT = 'cap-change';
/* A level the user entered: `detail` is the level (a number). */
export const LEVEL_CHANGE_EVENT = 'level-change';
/* The item level field lowered its cap to what the level allows (or the note went): `detail` is a `LoweredCap`, or null. */
export const LOWERED_CHANGE_EVENT = 'lowered-change';
/* The box holds text that is no value of the field, or stopped to: `detail` is a boolean. */
export const TYPED_BAD_EVENT = 'typed-bad-change';

/* The cap the page last lowered to what the level allows (level-cap.ts limitCapToLevel): the cap it was, the cap it is, and the level
   (null: no level, the highest real item level). */
export interface LoweredCap {
  from: number;
  to: number;
  level: number | null;
}
