/* The saved scroll positions (src/ui/router/scroll-storage.ts): only finite numbers come back, and no stored text can stop
   the page from starting. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCROLL_KEY, readScrollPositions, tabStorage, writeScrollPositions } from '../../../../src/ui/router/scroll-storage.ts';
import { fakeStorage } from '../../helpers/sheet-fixtures.ts';

/* A storage that holds `text` under the scroll key. */
function storageWith(text: string) {
  const storage = fakeStorage();
  storage.setItem(SCROLL_KEY, text);
  return storage;
}

test('scroll positions: what was written is read back; nothing saved reads as none', () => {
  const storage = fakeStorage();
  assert.deepEqual(readScrollPositions(storage), {});
  writeScrollPositions(storage, { a1: 400, b2: 0, c3: 12.5 });
  assert.deepEqual(readScrollPositions(storage), { a1: 400, b2: 0, c3: 12.5 });
});

test('scroll positions: a value that is not a finite number is dropped, the good entries stay', () => {
  const deep = `${'['.repeat(5000)}${']'.repeat(5000)}`;
  const text = `{"ok":300,"deep":${deep},"text":"400","nul":null,"obj":{"y":1},"arr":[5],"bool":true,"big":1e999,"zero":0}`;
  assert.deepEqual(readScrollPositions(storageWith(text)), { ok: 300, zero: 0 });
});

test('scroll positions: text that is not an object, broken text or a failing storage reads as none and never throws', () => {
  for (const text of ['', 'not json', 'null', '7', '"text"', '[1,2]', '[]', `${'['.repeat(5000)}${']'.repeat(5000)}`, '{"a":', '{']) {
    assert.deepEqual(readScrollPositions(storageWith(text)), {}, text.slice(0, 20));
  }
  const throwing = {
    getItem() {
      throw new Error('storage blocked');
    },
  };
  assert.deepEqual(readScrollPositions(throwing), {});
  assert.deepEqual(readScrollPositions(null), {});
});

test('scroll positions: a refusing or missing storage is ignored on write; a sessionStorage that throws on access reads as null', () => {
  writeScrollPositions(fakeStorage({ failWith: new Error('full') }), { a: 1 });
  writeScrollPositions(null, { a: 1 });

  const original = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    get() {
      throw new Error('blocked');
    },
  });
  try {
    assert.equal(tabStorage(), null);
  } finally {
    if (original) {
      Object.defineProperty(globalThis, 'sessionStorage', original);
    } else {
      Reflect.deleteProperty(globalThis, 'sessionStorage');
    }
  }
});
