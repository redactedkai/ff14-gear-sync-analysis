/* The overlay manager (src/ui/overlays.ts): Escape, a press outside, Tab out, one at a time and a change of screen. A fake
   document records the listeners; elements are plain objects with `contains` and `focus`. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOverlays } from '../../../src/ui/overlays.ts';
import type { OverlayElement, OverlayKeyEvent, OverlayLayer, OverlayOpener } from '../../../src/ui/overlays.ts';
import { FakeDocument, element } from '../helpers/dom-fakes.ts';

/* A layer over `root` and `opener`, counting how often it closed. */
type CountedLayer = OverlayLayer & { closed: number };
function layer(id: string, root: OverlayElement, opener: OverlayOpener | null, extra: Partial<OverlayLayer> = {}): CountedLayer {
  const made: CountedLayer = { id, root: () => root, opener: () => opener, closed: 0, close: () => (made.closed += 1), ...extra };
  return made;
}

test('overlays: Escape closes the topmost layer only, and the focus goes back to its opener', () => {
  const doc = new FakeDocument();
  const manager = createOverlays(() => doc);
  const button = element('button');
  const one = layer('one', element('panel'), button);
  manager.open(one);
  doc.send('keydown', { key: 'Enter' });
  assert.equal(one.closed, 0, 'only Escape');
  doc.send('keydown', { key: 'Escape' });
  assert.deepEqual([one.closed, button.focused, manager.openIds], [1, 1, []]);
  doc.send('keydown', { key: 'Escape' });
  assert.equal(one.closed, 1, 'nothing open: nothing to close');
});

const ESCAPE: OverlayKeyEvent = { key: 'Escape', defaultPrevented: false, target: null };

test('overlays: pressEscape() is the key without the document: it closes the topmost layer and says whether it did', () => {
  const manager = createOverlays(() => null);
  const [button, innerButton] = [element('button'), element('inner button')];
  const [outer, inner] = [layer('outer', element('outer'), button), layer('inner', element('inner'), innerButton, { parent: 'outer' })];
  manager.open(outer);
  manager.open(inner);
  assert.deepEqual([manager.pressEscape(ESCAPE), inner.closed, outer.closed, innerButton.focused], [true, 1, 0, 1]);
  assert.deepEqual([manager.pressEscape(ESCAPE), outer.closed, button.focused], [true, 1, 1]);
  assert.equal(manager.pressEscape(ESCAPE), false);
});

test('overlays: an Escape another handler took, or one the layer leaves to a native list, closes nothing', () => {
  const doc = new FakeDocument();
  const manager = createOverlays(() => doc);
  const nativeList = element('native list');
  const one = layer('one', element('panel'), element('button'), { ignoreEscape: event => event.target === nativeList });
  manager.open(one);
  doc.send('keydown', { key: 'Escape', defaultPrevented: true });
  doc.send('keydown', { key: 'Escape', target: nativeList });
  assert.equal(one.closed, 0);
});

test('overlays: a press outside closes the layer without moving the focus; a press on it or its opener does not', () => {
  const doc = new FakeDocument();
  const manager = createOverlays(() => doc);
  const [inner, button, outside] = [element('inner'), element('button'), element('outside')];
  manager.open(layer('one', element('panel', inner), button));
  doc.send('pointerdown', { target: inner });
  doc.send('pointerdown', { target: button });
  assert.deepEqual(manager.openIds, ['one']);
  doc.send('pointerdown', { target: outside });
  assert.deepEqual([manager.openIds, button.focused], [[], 0]);
});

test('overlays: Tab out closes a layer that has tabOut, not one inside it, and the focus stays where it went', () => {
  const doc = new FakeDocument();
  const manager = createOverlays(() => doc);
  const [inner, away] = [element('inner'), element('away')];
  manager.open(layer('menu', element('panel', inner), element('button'), { tabOut: true }));
  doc.send('focusin', { target: inner });
  assert.deepEqual(manager.openIds, ['menu']);
  doc.send('focusin', { target: away });
  assert.deepEqual([manager.openIds, away.focused], [[], 0]);
});

test('overlays: a layer without tabOut stays open when the focus leaves it', () => {
  const doc = new FakeDocument();
  const manager = createOverlays(() => doc);
  manager.open(layer('settings', element('panel'), element('button')));
  doc.send('focusin', { target: element('away') });
  assert.deepEqual(manager.openIds, ['settings']);
});

test('overlays: opening a layer closes the others, except the one it is part of', () => {
  const manager = createOverlays(() => null);
  const [a, b, child, c] = [
    layer('a', element('a'), null),
    layer('b', element('b'), null),
    layer('child', element('child'), null, { parent: 'b' }),
    layer('c', element('c'), null),
  ];
  manager.open(a);
  manager.open(b);
  assert.deepEqual([a.closed, manager.openIds], [1, ['b']]);
  manager.open(child);
  assert.deepEqual([b.closed, manager.openIds], [0, ['b', 'child']]);
  manager.open(c);
  assert.deepEqual([b.closed, child.closed, manager.openIds], [1, 1, ['c']]);
});

test('overlays: closeAll closes every layer and moves no focus; close(id) tells whether it was open', () => {
  const manager = createOverlays(() => null);
  const button = element('button');
  const a = layer('a', element('a'), button);
  const b = layer('b', element('b'), button, { parent: 'a' });
  manager.open(a);
  manager.open(b);
  manager.closeAll();
  assert.deepEqual([a.closed, b.closed, button.focused, manager.openIds], [1, 1, 0, []]);
  assert.equal(manager.close('a'), false);
});
