/* The two facades as the page registers them (`sealFacade`, main.js): reading and calling them works, and nothing can be assigned,
   defined, deleted or added from outside, so a console command cannot shadow or remove what a screen reads. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPageStore, sealFacade } from '../../../../src/ui/store/page-store.ts';
import type { RestoredState } from '../../../../src/ui/store/app-state.ts';
import { restoreOpen } from '../../helpers/common.js';

/* The page's two facades, sealed as main.js does, over a store with no saved sheets. */
function sealedFacades() {
  const stores = createPageStore({ restored: restoreOpen({ tab: 'browse' }) as unknown as RestoredState, storage: null });
  return { app: sealFacade(stores.app), sheets: sealFacade(stores.sheets), store: stores.store };
}

/* Run `change` in strict mode as the page's own modules do, and return whether it threw (a refusal) or not. */
const refused = (change: () => unknown) => {
  try {
    change();
    return false;
  } catch (error) {
    return error instanceof TypeError;
  }
};

for (const name of ['app', 'sheets'] as const) {
  test(`the ${name} facade refuses a property being defined, deleted or added, and a new prototype`, () => {
    const facade = sealedFacades()[name] as unknown as Record<string, unknown>;
    const members = Object.keys(facade);
    const first = members[0];
    assert.ok(members.length > 5, 'the facade has its members');
    assert.ok(
      refused(() => Object.defineProperty(facade, 'added', { value: 1 })),
      'defineProperty adds a member',
    );
    assert.ok(
      refused(() => Object.defineProperty(facade, first, { value: 1 })),
      'defineProperty shadows a member',
    );
    assert.ok(
      refused(() => delete facade[first]),
      'delete removes a member',
    );
    assert.ok(
      refused(() => (facade.added = 1)),
      'a plain assignment adds a member',
    );
    assert.ok(
      refused(() => (facade[first] = 1)),
      'a plain assignment replaces a member',
    );
    assert.ok(
      refused(() => Object.setPrototypeOf(facade, null)),
      'setPrototypeOf changes the prototype',
    );
    assert.deepEqual(Object.keys(facade), members, 'the members are the same');
    assert.ok(Object.isFrozen(facade));
  });
}

test('a sealed facade still reads and runs its actions', () => {
  const { app, sheets, store } = sealedFacades();
  assert.equal(app.tab, 'browse');
  const before = store.log.length;
  app.setField('browse.min', 700); // an action of the facade writes through the store
  assert.equal(app.browse.min, 700);
  assert.ok(store.log.length > before);
  assert.equal(sheets.screen, 'sheets');
  // a getter reads the store through `this` on the facade itself
  assert.equal(Object.isExtensible(app), false);
  assert.equal(Object.isExtensible(sheets), false);
});
