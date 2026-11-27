/* The two facades of a page store, rebuilt over its revisions wrapped so that every read of a revision key is reported to `record`.
   The facade getters read the revision of the part of the state they show: a test asks which keys a getter reads and checks
   that a getter whose value changed read a revision that moved. Test glue, not product code. */
import { createAppFacade } from '../../../../src/ui/store/app-facade.ts';
import type { PageStore } from '../../../../src/ui/store/page-store.ts';
import { createSheetsFacade } from '../../../../src/ui/store/sheets-facade.ts';

/* `page` (a createPageStore result) with its `app` and `sheets` facades replaced by ones that call `record(key)` for each revision key
   they read, and the rest as it is. */
export function withRecordedReads(page: PageStore, record: (key: string) => void) {
  const revisions = new Proxy(page.store.revs, {
    get(target, key: string | symbol) {
      if (typeof key === 'string') {
        record(key);
      }
      return Reflect.get(target, key);
    },
  });
  return {
    ...page,
    app: createAppFacade(page.store, page.appActions, revisions),
    sheets: createSheetsFacade(page.store, page.sheetsActions, revisions, page.setPageActions),
  };
}
