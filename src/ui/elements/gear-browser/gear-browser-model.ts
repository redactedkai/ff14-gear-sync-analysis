/* What the Gear browser (<gsa-gear-browser>) works out, with no DOM: the list it shows for the settings now (built once per
   change, and only while its tab is open), the page picked on the page line, what a heading click sorts by, whether Reset
   filters shows, and what the "/" key does. The element and the Node tests both import it. The element is given the tab's Job
   and sync panel (`panel`) and the browser's filters and sort (`browse`) by the page; this reads no store. */
import type { makeJobContext } from '../../../core/job-context.ts';
import { defaultBrowse } from '../../state.ts';
import { syncSettings } from '../../job-sync-panel.ts';
import { browseFiltered, gearView } from '../../views/gear.ts';
import { viewCache } from '../../view-cache.ts';

/* The browser's list (views/gear.ts gearView) and its filters and sort (the store's `browse`: state.ts defaultBrowse). */
export type GearList = ReturnType<typeof gearView>;
export type GearBrowse = ReturnType<typeof defaultBrowse>;

/* One stat cell of a row (views/gear.ts browseCell) and one button of the page line (pageButtons). */
export interface GearCell {
  text: string;
  cls: string;
  col: string;
  was: string | null;
}
export interface PageButton {
  key: string;
  page: number | null;
  current: boolean;
}

/* The Job and sync panel of the Gear browser (job-sync-panel.ts panelOf): the job, its context and the sync settings. */
export interface GearPanel {
  job: string | null;
  jobCtx: ReturnType<typeof makeJobContext>;
  cap: number | null;
  sync: boolean;
  level: number | null;
}

/* The `browse-edit` event the element sends for every change of the browser's filters or sort: `detail` is the patch (a part of
   `browse`: {q}, {type}, {lvl}, {sort, dir}, {expOff}, ...), which the page hands to the store's `editBrowse` action. The page's
   root listens with `@browse-edit`, which cannot import this constant: if it is renamed, change the listener in
   src/ui/elements/app/app-root.ts to match (every smoke step of the browser's filters fails otherwise). */
export const BROWSE_EDIT_EVENT = 'browse-edit';

/* The patch for the browser's filters that a heading click on column `key` makes: the same heading again flips the order, a new
   heading starts high first, names A to Z. `browse` holds the current sort and its direction. */
export function sortPatch(browse: Pick<GearBrowse, 'sort' | 'dir'>, key: string): { sort?: string; dir: string } {
  if (browse.sort === key) {
    return { dir: browse.dir === 'desc' ? 'asc' : 'desc' };
  }
  return { sort: key, dir: key === 'name' ? 'asc' : 'desc' };
}

/* A heading's `aria-sort` for column `key`: 'descending', 'ascending' or 'none'. */
export function sortState(browse: Pick<GearBrowse, 'sort' | 'dir'>, key: string): 'descending' | 'ascending' | 'none' {
  if (browse.sort !== key) {
    return 'none';
  }
  return browse.dir === 'desc' ? 'descending' : 'ascending';
}

/* The patch for the filters that Reset filters makes: every filter back to its default for the job; the sort stays. */
export function resetPatch(job: GearPanel['jobCtx']): Omit<GearBrowse, 'sort' | 'dir'> {
  const { sort, dir, ...filters } = defaultBrowse(job);
  return filters;
}

/* Whether a key press should jump to the name search: "/" anywhere on the open tab but in a box, as on many sites.
   `event` is the key event: its `key` and a `target` that knows `closest`. `open`: the Gear browser is the open tab. */
export function wantsSearchFocus(event: { key: string; target: { closest(selector: string): unknown } }, open: boolean): boolean {
  if (event.key !== '/' || !open) {
    return false;
  }
  return !event.target.closest('input, select, textarea, [contenteditable]');
}

/* The browser's list and page. `listKey` is what the list depends on: the job, the sync settings and the browser's filters
   and sort. The page is not saved: a reload starts at page 1 (owner's pick P1 a), and any change to the list goes back to
   page 1, also when the old setting comes back. */
export class GearBrowserModel {
  // the page picked on the page line (1 first), and the list it was picked for (`pageFor`: a listKey)
  private page = 1;
  private pageFor = '';
  // the list the page was last asked about
  private lastKey: string | null = null;
  // the list and the settings it was built for (view-cache.ts viewCache)
  private readonly views = viewCache<GearList>();

  /* What the list depends on, as text. */
  static listKey(panel: GearPanel, browse: GearBrowse): string {
    return JSON.stringify([panel.job, syncSettings(panel), browse]);
  }

  /* The list for the settings now (views/gear.ts gearView), built again only when the job, the sync settings, the browser's
     filters or sort, or the page change, and only while the tab is `open`: hidden, it keeps the last one (null until the tab
     is first opened). A change to the list drops the page for good (the page shown is 1 for the render in between), so going
     back to the old filters or sort also starts at page 1. */
  view(panel: GearPanel, browse: GearBrowse, open: boolean): GearList | null {
    const listKey = GearBrowserModel.listKey(panel, browse);
    if (listKey !== this.lastKey) {
      this.lastKey = listKey;
      this.page = 1;
      this.pageFor = '';
    }
    if (!open) {
      return this.views.last();
    }
    const page = this.pageFor === listKey ? this.page : 1;
    return this.views.get(JSON.stringify([panel.jobCtx.jobId, syncSettings(panel), browse, page]), () =>
      gearView(panel.jobCtx, syncSettings(panel), browse, page),
    );
  }

  /* A page button was pressed: the next `view` shows page `page` (gearView holds it to the pages there are), for the list
     the last `view` call was made for. */
  goPage(page: number): void {
    this.page = page;
    this.pageFor = this.lastKey ?? '';
  }

  /* Whether some filter is off its default, so Reset filters shows (views/gear.ts browseFiltered). */
  static filtered(panel: GearPanel, browse: GearBrowse): boolean {
    return browseFiltered(panel.jobCtx, browse);
  }
}
