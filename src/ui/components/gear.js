/* Gear browser: look up the item database with filters (see views/gear.js). Recomputed only while its tab is open.
   Layout (owner, 2026-10-18; mockups B1 with C2's pills): the name search on the title's line, slot pills with their
   counts and, while a filter is changed, Reset at their end (its place kept while hidden); one row of filters; sorting
   from the table's headings. */
import { SEARCH_MAX_LENGTH, defaultBrowse } from '../state.js';
import { syncSettings } from '../settings.js';
import { browseFiltered, gearView } from '../views/gear.js';
import { expansionToggles, gearFromToggles, viewCache } from '../helpers.js';

/* The browser's component: its view (gearView, rebuilt while the tab is open), its page, its two filter menus, the sort
   and Reset filters. */
export function gear() {
  // the list and the settings it was built for (helpers.js viewCache)
  const views = viewCache();
  return {
    /* the page picked on the page line (1 first), and the list it was picked for (listKey): any change to the list
       goes back to page 1. Not saved: a reload starts at page 1 (owner's pick P1 a, 2026-10-20). */
    page: 1,
    pageFor: '',
    /* what the list depends on: the job, the sync settings, and the browser's filters and sort */
    get listKey() {
      const app = this.$store.app;
      return JSON.stringify([app.job, syncSettings(app), app.browse]);
    },
    init() {
      // the list changed: drop the page for good (livePage already shows page 1 for the render in between), so going
      // back to the old filters or sort also starts at page 1
      this.$watch('listKey', () => {
        this.page = 1;
        this.pageFor = '';
      });
    },
    /* the page to show: the one picked while the list is the one it was picked for, else 1 */
    get livePage() {
      return this.pageFor === this.listKey ? this.page : 1;
    },
    /* the list for the settings now (views/gear.js gearView), built again only when the job, the sync settings, the
       browser's filters or sort, or the page change, and only while the tab is open: hidden, it keeps the last one
       (null until the tab is first opened) */
    get view() {
      const app = this.$store.app;
      if (app.tab !== 'browse') return views.last();
      const job = app.jobCtx,
        sync = syncSettings(app),
        browse = app.browse,
        page = this.livePage;
      return views.get(JSON.stringify([job.jobId, sync, browse, page]), () => gearView(job, sync, browse, page));
    },
    /* A page button pressed: shows page `page` (gearView holds it to the pages there are) and scrolls the table's box
       back to its first row. */
    goPage(page) {
      this.page = page;
      this.pageFor = this.listKey;
      if (this.$refs?.rows) this.$refs.rows.scrollTop = 0;
    },
    /* the name search box's maxlength (state.js SEARCH_MAX_LENGTH) */
    searchMaxLength: SEARCH_MAX_LENGTH,
    /* the chosen job's JobContext ($store.app.jobCtx; $store.app.job is its id) */
    get jobCtx() {
      return this.$store.app.jobCtx;
    },
    /* the Expansion filter, browse.expOff (the optimizer has its own, opt.expOff) */
    ...expansionToggles('browse'),
    /* the "Gear from" filter: the browser's own boxes and market board switch (browse.exclude, browse.market) */
    ...gearFromToggles('browse'),
    get emptyBoxes() {
      return this.view?.emptyBoxes || [];
    },
    /* A heading clicked: the table sorts by it; the same heading again flips the order. A new heading starts high
       first, names A to Z. */
    sortBy(key) {
      const b = this.$store.app.browse;
      if (b.sort === key) b.dir = b.dir === 'desc' ? 'asc' : 'desc';
      else {
        b.sort = key;
        b.dir = key === 'name' ? 'asc' : 'desc';
      }
    },
    /* a heading's aria-sort: 'descending', 'ascending' or 'none' */
    sortState(key) {
      const b = this.$store.app.browse;
      if (b.sort !== key) return 'none';
      return b.dir === 'desc' ? 'descending' : 'ascending';
    },
    /* some filter is off its default: Reset filters shows (views browseFiltered) */
    get filtered() {
      return browseFiltered(this.jobCtx, this.$store.app.browse);
    },
    /* Reset filters: every filter back to its default (defaultBrowse; the sort stays) */
    resetBrowseFilters() {
      const { sort, dir, ...filters } = defaultBrowse(this.jobCtx);
      Object.assign(this.$store.app.browse, filters);
    },
    /* "/" anywhere on the tab but in a box jumps to the name search, as on many sites */
    slashToSearch(event) {
      if (event.key !== '/' || this.$store.app.tab !== 'browse') return;
      if (event.target.closest('input, select, textarea, [contenteditable]')) return;
      event.preventDefault();
      this.$refs.search?.focus();
    },
  };
}
