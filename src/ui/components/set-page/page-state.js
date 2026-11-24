/* What a set page reads of its state in the store (the `setPages` slice: store/set-page-actions.ts): the draft, the Auto-fill
   result waiting, the status of an Auto-fill, the line about it and the Gear to search answer. Read-only members: every change
   is an action (`this.$store.sheets.pages`), made by the part that decides it (draft.js, fill.js, auto-fill-settings.js, leave.js).
   What the store hands out is frozen all through, so the template engine reads it as it is and no member needs unwrapping.
   A part of the setPage component (components/set-page.js composes the parts). */

/* `page`: {el, refs, setId} (frame.js). Returns the part's members. */
export function pageStatePart(page) {
  return {
    /* The id of the gear set this page shows, kept from the page's start (the store's open set follows the screen, which can
       move on before the page is taken away). */
    get setId() {
      return page.setId ?? this.saved?.id ?? null;
    },
    /* The page's entry in the store; a page not open reads as one at rest. */
    get pageState() {
      return this.$store.sheets.page(this.setId);
    },
    /* The store's actions on this page: each takes the set's id first. */
    get pages() {
      return this.$store.sheets.pages;
    },

    /* The manual draft (a frozen GearSet in memory from the first edit by hand to Apply or Discard), or null. */
    get draft() {
      return this.pageState.draft;
    },
    /* The Auto-fill result waiting for Apply or Discard, {suggested ({pieces, meal}), declined: {rows, meal}}, or null. */
    get suggestion() {
      return this.pageState.suggestion;
    },
    /* This page's Auto-fill is running. */
    get running() {
      return this.pageState.fill === 'running';
    },
    /* The line after an Auto-fill that gave no suggestion (no set found, a pin dropped), '' for none. */
    get fillLine() {
      return this.pageState.fillLine;
    },
    /* The Auto-fill settings' Gear to search, from the solver: "searching 1,939 of 1,999 pieces". */
    get countText() {
      return this.pageState.gearToSearch.countText;
    },
    /* How many pieces Gear to search leaves in the pool (null until the first count lands); 0 turns the Auto-fill button off. */
    get searchedCount() {
      return this.pageState.gearToSearch.searched;
    },
    /* The pieces per "Gear categories" box ({box key: count}), null while they are not known: before the first count has
       landed and after a change of the job or the filters they depend on, until the new ones land. */
    get fromCounts() {
      return this.pageState.gearToSearch.fromCounts;
    },
    /* The Target GCD label's parts (ui/solve.js gcdLabel: name, range, haste, off, full). */
    get gcdLabel() {
      return this.pageState.gearToSearch.gcdLabel;
    },
  };
}
