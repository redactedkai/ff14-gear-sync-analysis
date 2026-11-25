/* The event the two GCD Scaling elements send, written once. A `.ts` module with no import, so Node tests can read it. */

/* The `gcd-edit` event: the person changed a GCD setting. `detail` is the patch for the page's `editGcd`: any of
   `{level, haste, speed}` (`level` or `speed` null: back to following the synced level or the base). The page's template
   listens with `@gcd-edit`, which cannot import this constant. */
export const GCD_EDIT_EVENT = 'gcd-edit';

/* The settings of the tab, as the page gives them to the elements: the typed level (null: follows `syncedLevel`), the haste job
   ('' for none), the speed asked for (null: the base). */
export interface GcdSettings {
  level: number | null;
  haste: string;
  speed: number | null;
}
