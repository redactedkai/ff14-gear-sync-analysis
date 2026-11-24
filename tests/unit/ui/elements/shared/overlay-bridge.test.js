/* The overlay bridge (src/ui/elements/shared/overlay-bridge.ts) with the real overlay manager on a fake document: one Escape
   closes one layer, whichever stack the layer is in, and the manager still keeps its "one layer at a time" and closeAll. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOverlayBridge } from '../../../../../src/ui/elements/shared/overlay-bridge.ts';
import { createOverlays } from '../../../../../src/ui/overlays.js';

/* A fake document that keeps the manager's listeners and sends them an event. */
function fakeDocument() {
  const listeners = {};
  return {
    addEventListener: (type, fn) => {
      listeners[type] = fn;
    },
    send: (type, event) => listeners[type]?.({ defaultPrevented: false, ...event }),
  };
}

/* A Zag layer's api: it is open or not, and `quietCloses` counts the closes the bridge asked for without the focus moving. */
function fakeLayerApi() {
  const api = {
    open: false,
    quietCloses: 0,
    closeWithoutFocus: () => {
      api.open = false;
      api.quietCloses += 1;
    },
  };
  return api;
}

/* A bridge over a fake api and a manager on a fake document. */
function setup(options = {}) {
  const doc = fakeDocument();
  const manager = createOverlays(() => doc);
  const api = fakeLayerApi();
  const bridge = createOverlayBridge({
    id: 'zag-layer',
    api: () => api,
    closeWithoutFocus: api.closeWithoutFocus,
    root: () => null,
    opener: () => null,
    manager,
    ...options,
  });
  return { doc, manager, api, bridge };
}

/* An app layer (one the manager closes itself) with a counter of its closes. */
function appLayer(id, extra = {}) {
  const layer = { id, root: () => null, opener: () => null, closed: 0, close: () => (layer.closed += 1), ...extra };
  return layer;
}

/* What a Zag layer does on an Escape: its capturing listener runs first, calls the guard, and closes the layer unless the
   guard prevented the event; then the page's manager listener sees the same event. */
function pressEscape({ doc, api, bridge }) {
  const event = { key: 'Escape', defaultPrevented: false, preventDefault: () => (event.defaultPrevented = true) };
  bridge.guardEscape(event);
  if (!event.defaultPrevented && api.open) {
    event.preventDefault();
    api.open = false; // the machine closes itself, and moves the focus on its own
    bridge.sync();
  }
  doc.send('keydown', event);
}

test('overlay bridge: an open Zag layer is registered with the manager, and a closed one is dropped', () => {
  const { manager, api, bridge } = setup();
  bridge.sync();
  assert.deepEqual(manager.openIds, []);
  api.open = true;
  bridge.sync();
  bridge.sync();
  assert.deepEqual(manager.openIds, ['zag-layer'], 'registered once');
  api.open = false;
  bridge.sync();
  assert.deepEqual(manager.openIds, []);
  assert.equal(api.quietCloses, 0, 'the machine closed itself: nothing to ask of it');
});

test('overlay bridge: the manager closing the layer (a change of screen, another layer) closes the machine without moving the focus', () => {
  const { manager, api, bridge } = setup();
  api.open = true;
  bridge.sync();
  manager.closeAll();
  assert.deepEqual([api.open, api.quietCloses, manager.openIds], [false, 1, []]);

  api.open = true;
  bridge.sync();
  manager.open(appLayer('other'));
  assert.equal(api.open, false, 'opening an unrelated layer closes the Zag layer: one layer at a time');
  assert.deepEqual(manager.openIds, ['other']);
});

test('overlay bridge: one Escape closes the Zag layer only when a manager layer it belongs to stays open', () => {
  const parts = setup({ parent: 'settings' });
  const settings = appLayer('settings');
  parts.manager.open(settings);
  parts.api.open = true;
  parts.bridge.sync();
  assert.deepEqual(parts.manager.openIds, ['settings', 'zag-layer'], 'its parent stays open');

  pressEscape(parts);
  assert.deepEqual([parts.api.open, settings.closed, parts.manager.openIds], [false, 0, ['settings']], 'one Escape, one layer');
  pressEscape(parts);
  assert.deepEqual([settings.closed, parts.manager.openIds], [1, []], 'the second Escape closes the parent');
});

test('overlay bridge: a manager layer above the Zag layer takes the Escape first', () => {
  const parts = setup();
  parts.api.open = true;
  parts.bridge.sync();
  const menu = appLayer('menu-in-zag', { parent: 'zag-layer' });
  parts.manager.open(menu);
  assert.deepEqual(parts.manager.openIds, ['zag-layer', 'menu-in-zag']);

  pressEscape(parts);
  assert.deepEqual([menu.closed, parts.api.open], [1, true], 'the menu closed and the Zag layer stayed');
  pressEscape(parts);
  assert.deepEqual([parts.api.open, parts.manager.openIds], [false, []]);
});

test('overlay bridge: the manager alone never closes a Zag layer on Escape', () => {
  const parts = setup();
  parts.api.open = true;
  parts.bridge.sync();
  parts.doc.send('keydown', { key: 'Escape' });
  assert.deepEqual([parts.api.open, parts.manager.openIds], [true, ['zag-layer']], "Escape is the machine's");
});

test('overlay bridge: release drops the layer when the element leaves the page', () => {
  const { manager, api, bridge } = setup();
  api.open = true;
  bridge.sync();
  bridge.release();
  assert.deepEqual(manager.openIds, []);
  bridge.release();
});
