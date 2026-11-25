/* The id and the event of the Substat tiers "?" note that the element, the page's template and the tests all use: each is
   written here once. A `.ts` module with no import, so Node tests can read it. */

/* The id of the open note (`#t-pop`): the "?" buttons name it in `aria-controls`, and the page's tests look for it. */
export const STAT_NOTE_ID = 't-pop';

/* The `note-close` event: the note closed by itself (Escape, a press outside, another layer). The page's template listens
   with `@note-close`, which cannot import this constant. */
export const NOTE_CLOSE_EVENT = 'note-close';
