/* The words and events of <gsa-job-strip> that the page's template and the element share, written once (a template listens with
   `@sync-change`, which cannot import this). A `.ts` module with no import, so Node tests can read it. */

/* What the Reset button asks before it resets the open tab's settings (the other tabs keep theirs). */
export const RESET_QUESTION = "Reset this tab's settings to their defaults?";
/* The IL Sync switch changed: `detail` is the switch's state (a boolean). */
export const SYNC_CHANGE_EVENT = 'sync-change';
/* Reset was confirmed. */
export const STRIP_RESET_EVENT = 'strip-reset';
