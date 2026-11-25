/* The words and the event of <gsa-job-menu> that the element, the page's templates and the tests share, written once. A `.ts`
   module with no import, so Node tests can read it. */

/* The name of the menu: its `aria-label`. */
export const JOB_MENU_NAME = 'Job';

/* The `job-change` event: `detail` is the id of the job picked ('SGE'). The page's templates listen with `@job-change`, which
   cannot import this constant. */
export const JOB_CHANGE_EVENT = 'job-change';
