/* Gear browser: look up the item database with filters (see views/gear.js). Recomputed only while its tab is open.
   Layout (owner): the title's line holds one round search bar (the Slot menu, with each slot's count, then the name search), the
   match count and, while a filter is changed, Reset (its place kept while hidden); one row of filters; sorting from the
   table's headings. */
import { SEARCH_MAX_LENGTH, defaultBrowse } from '../state.js';
import { syncSettings } from '../job-sync-panel.js';
import { browseFiltered, gearView } from '../views/gear.js';
import { viewCache } from '../view-cache.js';
import { expansionToggles, gearFromToggles } from './filter-menus.js';

/* The browser's component: its view (gearView, rebuilt while the tab is open), its page, its two filter menus, the sort
   and Reset filters. */
export function gear() {
  // the list and the settings it was built for (view-cache.js viewCache)
  const views = viewCache();
  return {
    /* the page picked on the page line (1 first), and the list it was picked for (listKey): any change to the list
       goes back to page 1. Not saved: a reload starts at page 1 (owner's pick P1 a). */
    page: 1,
    pageFor: '',
    /* the column under the pointer (its data-col key, '' for none or for the Item and Slot columns): its cells are tinted */
    hotCol: '',
    /* what the list depends on: the job, the sync settings, and the browser's filters and sort */
    get listKey() {
      const app = this.$store.app;
      const panel = app.panel('browse');
      return JSON.stringify([panel.job, syncSettings(panel), app.browse]);
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
      const panel = app.panel('browse'),
        job = panel.jobCtx,
        sync = syncSettings(panel),
        browse = app.browse,
        page = this.livePage;
      return views.get(JSON.stringify([job.jobId, sync, browse, page]), () => gearView(job, sync, browse, page));
    },
    /* A page button pressed: shows page `page` (gearView holds it to the pages there are) and scrolls the table's box
       back to its first row. */
    goPage(page) {
      this.page = page;
      this.pageFor = this.listKey;
      if (this.$refs.rows) this.$refs.rows.scrollTop = 0;
    },
    /* the name search box's maxlength (state.js SEARCH_MAX_LENGTH) */
    searchMaxLength: SEARCH_MAX_LENGTH,
    /* the job chosen in the browser's own Job and sync panel (JobContext) */
    get jobCtx() {
      return this.$store.app.panel('browse').jobCtx;
    },
    /* the Expansion filter, browse.expOff (the optimizer has its own, opt.expOff) */
    ...expansionToggles('browse'),
    /* the "Gear categories" filter: the browser's own boxes and market board switch (browse.exclude, browse.market) */
    ...gearFromToggles('browse'),
    /* how many pieces each "Gear categories" box holds for the list now ({box key: count}), or null before the list is built */
    get fromCounts() {
      return this.view?.fromCounts ?? null;
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
