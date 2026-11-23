/* The job menu, shared by the places that have one: the Job and sync strip of the Gear browser and the controls row of
   How the math works (its Stat Allocation and Substat tiers sub-tabs, each with its own job). The menu is one line of icons
   per role (partials/job-menu.html); each place shows it under its Job button and switches the job it edits (`owner`: see
   below) through the store's `setJob`, so everything that depends on the job updates as it always did. A component puts
   `jobMenu()` together with its own members by compose (compose.js) and has `x-ref="jobButton"` on the Job button and
   `x-ref="jobMenu"` on the menu. */
import { JOB_ROWS, JOBS, jobById } from '../../core/constants.js';
import { JOB_ICONS } from '../../data/job-icons.js';
import { compose } from './compose.js';
import { overlay } from './overlay.js';

/* The Job control's label in the math bar. */
const JOB_MENU_TEXT = { label: 'Job' };

/* Every job's "Name (CODE)", one per line: the hidden copy that gives the math bar's Job button the width of the widest job
   (Dark Knight (DRK), Astrologian (AST), Pictomancer (PCT)), so no pick changes it. */
const JOB_SIZER = JOBS.map(job => `${job.name} (${job.id})`).join('\n');

/* The job menu's members: the overlay's (`jobMenuOpen`, `openJobMenu`, `closeJobMenu(restoreFocus)`, `toggleJobMenu`:
   components/overlay.js), the rows ({label, jobs: [{id, name, icon}]}), the job it edits (`menuJobId`, `menuJobCtx`,
   `jobIcon`), and the actions.
   `focusOnOpen`: opening puts the keyboard focus on the chosen job's tile (the math bar, where the menu is opened from the
   keyboard too); the strip leaves it on its button.
   `owner`: which job the menu edits, 'browse' (the Gear browser's), 'math' (Stat Allocation's) or 'tiers' (Substat tiers'), as
   a name or a function of the component (called with it as `this`; the math bar's changes with its sub-tab). */
export function jobMenu({ focusOnOpen = false, owner = 'browse' } = {}) {
  return compose(
    {
      jobMenuText: JOB_MENU_TEXT,
      jobSizer: JOB_SIZER,
      jobRows: JOB_ROWS.map(([label, ids]) => ({
        label,
        jobs: ids.map(id => ({ id, name: jobById(id).name, icon: JOB_ICONS[id] })),
      })),
      /* the job this menu edits now: its owner's panel (store.panel) */
      get jobOwner() {
        return typeof owner === 'function' ? owner.call(this) : owner;
      },
      get menuJobCtx() {
        return this.$store.app.panel(this.jobOwner).jobCtx;
      },
      get menuJobId() {
        return this.$store.app.panel(this.jobOwner).job;
      },
      /* that job's icon, in the Job button */
      get jobIcon() {
        return JOB_ICONS[this.menuJobId];
      },
      /* a tile of the menu: switch the menu's own job, close the menu and keep the keyboard focus on the Job button */
      requestJob(id) {
        this.$store.app.setJob(id, this.jobOwner); // job-specific settings reset (resetForJob); nothing else is lost, so no confirmation
        this.closeJobMenu(true);
      },
    },
    // the menu is an overlay (overlays.js); its element is the wrapper of the Job button and the menu (x-ref="jobWrap")
    overlay('jobMenu', {
      root() {
        return this.$refs.jobWrap;
      },
      opener() {
        return this.$refs.jobButton;
      },
      focusIn() {
        return focusOnOpen ? this.$refs.jobMenu?.querySelector('[aria-checked="true"]') : null;
      },
    }),
  );
}
