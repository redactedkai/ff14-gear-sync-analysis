/* The "failed to start" script (src/startup-failure.js), run as the built page runs it, against a small stand-in for the page:
   which of the saved keys count as saved data for its Reset button. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { startupScript } from '../../scripts/build/build.mjs';
import { STORE_KEY } from '../../src/ui/store-key.ts';
import { UNLOAD_GUARD_OFF_KEY } from '../../src/ui/router/unload-guard.ts';

/* A node of the page stand-in: an element (its tag, children and text) or a text node. */
interface StubNode {
  id?: string;
  text?: string;
  children?: StubNode[];
}

/* An element of the page stand-in: it keeps its children and the text it was given. */
interface StubElement extends StubNode {
  tag: string;
  style: { setProperty(): void };
  children: StubNode[];
  appendChild(child: StubNode): StubNode;
  insertBefore(child: StubNode): void;
  setAttribute(): void;
  removeAttribute(): void;
  hasAttribute(): boolean;
  textContent: string;
}

/* A page stand-in: elements are plain objects that keep their children and text. `keys` are the localStorage keys. The script's
   own `error` listener is fed one error, so the check ends with the failure message and its Reset or "none" paragraph. */
function runStartupScript(keys: string[]): string[] {
  const storage = new Map(keys.map(key => [key, '1']));
  const element = (tag: string): StubElement => ({
    tag,
    style: { setProperty() {} },
    children: [],
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    insertBefore(child) {
      this.children.unshift(child);
    },
    setAttribute() {},
    removeAttribute() {},
    hasAttribute: () => false,
    get textContent() {
      return this.text ?? '';
    },
    set textContent(text) {
      this.text = text;
    },
  });
  const onReadyCallbacks: (() => void)[] = [];
  const body = element('body');
  const document = {
    head: element('head'),
    body,
    documentElement: element('html'),
    createElement: element,
    createTextNode: (text: string): StubNode => ({ text }),
    getElementById: () => null,
    querySelector: () => null,
    addEventListener: (type: string, onReady: () => void) => type === 'DOMContentLoaded' && onReadyCallbacks.push(onReady),
  };
  const listeners: Record<string, (event: { error: Error }) => void> = {};
  const sandbox = {
    document,
    location: { hash: '', reload() {} },
    localStorage: {
      get length() {
        return storage.size;
      },
      key: (index: number) => [...storage.keys()][index] ?? null,
      removeItem: (key: string) => storage.delete(key),
    },
    addEventListener: (type: string, listener: (event: { error: Error }) => void) => {
      listeners[type] = listener;
    },
    removeEventListener() {},
    setTimeout: (callback: () => void) => callback(),
    String,
  };
  vm.runInNewContext(startupScript(), sandbox);
  listeners.error({ error: new Error('injected failure') });
  for (const onReady of onReadyCallbacks) {
    onReady();
  }
  const ids: string[] = [];
  const collect = (node: StubNode): void => {
    if (node.id) {
      ids.push(node.id);
    }
    for (const child of node.children ?? []) {
      collect(child);
    }
  };
  collect(body);
  return ids;
}

test('startup failure: the settings key and the sheets keys are saved data; the dev flag of the reload guard is not', () => {
  assert.ok(runStartupScript([STORE_KEY]).includes('startfail-ask'), 'the settings key');
  assert.ok(runStartupScript([`${STORE_KEY}:sheet:s_1`]).includes('startfail-ask'), 'a sheet key');
  assert.ok(runStartupScript([UNLOAD_GUARD_OFF_KEY, `${STORE_KEY}:sheets`]).includes('startfail-ask'), 'the flag with real data');
});

test('startup failure: with only the dev flag or other pages keys, the message says there is nothing to reset', () => {
  for (const keys of [[], [UNLOAD_GUARD_OFF_KEY], [UNLOAD_GUARD_OFF_KEY, `${STORE_KEY}x`, 'other-page:key']]) {
    const ids = runStartupScript(keys);
    assert.ok(ids.includes('startfail-none'), JSON.stringify(keys));
    assert.ok(!ids.includes('startfail-ask'), JSON.stringify(keys));
  }
});
