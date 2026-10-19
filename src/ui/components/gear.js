/* Gear browser: look up the item database with filters (see views/gear.js). Recomputed only while its tab is open.
   Layout (owner, 2026-10-18; mockups B1 with C2's pills): the name search on the title's line, slot pills with their
   counts and, while a filter is changed, Reset at their end (its place kept while hidden); one row of filters; sorting from the table's
   headings. */
import Alpine from 'alpinejs';
import { defaultBrowse } from '../state.js';
import { browseFiltered, gearView } from '../views/gear.js';
import { expansionToggles, gearFromToggles } from '../helpers.js';

/* The browser's component: its view (gearView, rebuilt while the tab is open), its two filter menus, the sort and Reset
   filters. */
export function gear() {
  return {
    view: null,
    /* the chosen job's JobContext ($store.app.jobCtx; $store.app.job is its id) */
    get jobCtx() {
      return this.$store.app.jobCtx;
    },
    init() {
      Alpine.effect(() => {
        const app = this.$store.app;
        if (app.tab !== 'browse') return;
        this.view = gearView(app);
      });
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
