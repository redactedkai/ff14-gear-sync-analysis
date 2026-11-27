// The page's two stores (the app and sheets facades, shown as window.gsaDebug.app and .sheets) cannot be changed from outside.

import { check, expect } from '../../lib/expect.ts';
import { showTab } from '../../lib/nav.ts';
import type { Page } from 'playwright';

/** A console command that defines, deletes or adds a member of a store is refused and leaves the page working: the open tab's
 * screens still draw, and a tab opens as before. (The page's own use of the stores, in every other step, shows the screens accept them.) */
export async function checkStoresSealed(pg: Page) {
  const results = await pg.evaluate(() => {
    // Reflect says true when the change was made, whatever the strictness of the code that asks
    const tries: Record<string, boolean[]> = {};
    for (const name of ['app', 'sheets'] as const) {
      const store = window.gsaDebug[name];
      const member = Object.keys(store)[0];
      tries[name] = [
        Reflect.defineProperty(store, member, { value: 1 }),
        Reflect.defineProperty(store, 'added', { value: 1 }),
        Reflect.deleteProperty(store, member),
        Reflect.set(store, 'added', 1),
        Reflect.setPrototypeOf(store, null),
      ];
    }
    return tries;
  });
  for (const [name, list] of Object.entries(results)) {
    check(
      list.every(done => done === false),
      `the ${name} store accepted a console change (define, define, delete, add, prototype): ${list}`,
    );
  }
  await showTab(pg, 'browse');
  await expect(pg.locator('#b-q')).toBeVisible();
  await showTab(pg, 'sheets');
  await expect(pg.locator('#sh-manager')).toBeVisible();
}
