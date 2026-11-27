/* The Zag controller (src/ui/elements/shared/zag-controller.ts) with a fake element and a tiny machine, so no browser and no
   Lit are needed. The machine counts its live effects: an effect starts when the machine starts and its cleanup runs when the
   machine stops, so the counter is what a leaked machine would leave above zero. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HOST_ATTRIBUTE, PART_ATTRIBUTE, ZAG_ID_PREFIX, ZagController } from '../../../../../src/ui/elements/shared/zag-controller.ts';
import { createMachine } from '@zag-js/core';
import type { VanillaMachine } from '@zag-js/vanilla';
import type { MachineSchema, Service } from '@zag-js/core';
import { standsFor } from '../../../helpers/dom-fakes.ts';
import { withLitHost } from '../../../helpers/fakes.ts';
import type { FakeLitHost } from '../../../helpers/fakes.ts';

// how many effects of the tiny machine are running
let liveEffects = 0;
// the `restoreFocus` of the last CLOSE event the tiny machine took
let lastCloseRestoresFocus: boolean | undefined;

/* The schema of the tiny machine: two states, an OPEN and a CLOSE event, one action and one effect. */
interface TinySchema extends MachineSchema {
  props: { id?: string; label?: string };
  state: 'closed' | 'open';
  event: { type: 'OPEN' } | { type: 'CLOSE'; restoreFocus?: boolean };
  action: 'noteClose';
  effect: 'live';
}

/* A machine with two states; its machine-level effect runs from start to stop. */
const tinyMachine = createMachine<TinySchema>({
  props: ({ props }) => props,
  initialState: () => 'closed',
  effects: ['live'],
  states: { closed: { on: { OPEN: { target: 'open' } } }, open: { on: { CLOSE: { target: 'closed', actions: ['noteClose'] } } } },
  implementations: {
    actions: {
      noteClose: ({ event }) => {
        lastCloseRestoresFocus = event.type === 'CLOSE' ? event.restoreFocus : undefined;
      },
    },
    effects: {
      live: () => {
        liveEffects += 1;
        return () => {
          liveEffects -= 1;
        };
      },
    },
  },
});

/* The api of the tiny machine: whether it is open, and the attributes of the parts "trigger" and "item". */
function connect(service: Service<TinySchema>) {
  const open = service.state.matches('open');
  return {
    open,
    send: (event: TinySchema['event']) => service.send(event),
    triggerProps: { 'data-state': open ? 'open' : 'closed', onclick: () => service.send({ type: open ? 'CLOSE' : 'OPEN' }) },
    itemProps: (index: number) => ({ 'data-item': String(index) }),
  };
}
type TinyApi = ReturnType<typeof connect>;

/* The attributes of the parts: one trigger, and one entry per item. */
const parts = (api: TinyApi) => ({ trigger: api.triggerProps, item: [api.itemProps(0), api.itemProps(1)] });

/* The attribute a selector like "[data-zag-part]" asks for. */
const attributeOf = (selector: string): string => {
  const match = /^\[(.+)\]$/.exec(selector);
  assert.ok(match, selector);
  return match[1];
};

/* A fake style object that keeps the properties set on it, like an element's `style`. */
interface FakeStyle {
  readonly properties: Map<string, string>;
  setProperty(name: string, value: string): void;
  removeProperty(name: string): string;
}
function fakeStyle(): FakeStyle {
  const properties = new Map<string, string>();
  return {
    properties,
    setProperty: (name, value) => void properties.set(name, value),
    removeProperty: name => {
      properties.delete(name);
      return '';
    },
  };
}

/* A fake DOM element: attributes, a parent (for `closest`), the listeners it was given, and the part of an Element the controller
   and Zag's spreadProps read. It stands for an Element (dom-fakes.ts standsFor): the controller and the library take it as one. */
interface FakeNode {
  parent: FakeNode | null;
  attributes: Record<string, string>;
  listeners: Map<string, () => void>;
  children: FakeNode[];
  className: string;
  style: FakeStyle;
  setAttribute(name: string, value: string): void;
  getAttribute(name: string): string | null;
  removeAttribute(name: string): void;
  toggleAttribute(name: string, on: boolean): void;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string): void;
  closest(selector: string): FakeNode | null;
  querySelectorAll(selector: string): Element[];
}

/* `node` as the Element the controller and Zag's spreadProps take (dom-fakes.ts standsFor). */
function domOf(node: FakeNode): Element {
  standsFor<Element>(node);
  return node;
}
function fakeElement(parent: FakeNode | null = null, attributes: Record<string, string> = {}): FakeNode {
  const element: FakeNode = {
    parent,
    attributes: { ...attributes },
    listeners: new Map(),
    children: [],
    className: '',
    style: fakeStyle(),
    setAttribute: (name, value) => {
      element.attributes[name] = String(value);
    },
    getAttribute: name => element.attributes[name] ?? null,
    removeAttribute: name => {
      delete element.attributes[name];
    },
    toggleAttribute: (name, on) => (on ? element.setAttribute(name, '') : element.removeAttribute(name)),
    addEventListener: (type, fn) => void element.listeners.set(type, fn),
    removeEventListener: type => void element.listeners.delete(type),
    closest: selector => {
      for (let node: FakeNode | null = element; node; node = node.parent) {
        if (attributeOf(selector) in node.attributes) {
          return node;
        }
      }
      return null;
    },
    // every descendant that has the attribute, which is what a real querySelectorAll finds
    querySelectorAll: selector => {
      const all = element.children.flatMap(child => [domOf(child), ...child.querySelectorAll(selector)]);
      return all.filter(node => node.getAttribute(attributeOf(selector)) !== null);
    },
  };
  parent?.children.push(element);
  return element;
}

/* A fake element that also plays the Lit side (fakes.ts fakeLitHost): it keeps the controllers and runs their update hooks on `update()`. */
type FakeHost = FakeNode & FakeLitHost;
function fakeHost(parent: FakeNode | null = null): FakeHost {
  return withLitHost(fakeElement(parent));
}

/* A controller of the tiny machine on a new fake host (or the given one). */
function makeController(host: FakeHost = fakeHost(), getProps?: () => Partial<TinySchema['props']>) {
  const controller = new ZagController<TinySchema, TinyApi>(host, { name: 'tiny', machine: tinyMachine, connect, parts, getProps });
  return { host, controller };
}

/* The machine a connected controller runs; fails the test when there is none. */
function running(controller: ZagController<TinySchema, TinyApi>): VanillaMachine<TinySchema> {
  assert.ok(controller.machine, 'no machine runs');
  return controller.machine;
}

/* Lets the machine's queued events run. */
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

test('zag controller: the machine runs from connect to disconnect and the api follows its state', async () => {
  const { host, controller } = makeController();
  assert.equal(controller.machine, null, 'nothing runs before the element connects');
  host.connect();
  assert.equal(liveEffects, 1);
  assert.equal(controller.api.open, false);
  controller.api.send({ type: 'OPEN' });
  await settle();
  assert.equal(controller.api.open, true, 'the api is built again after a change');
  host.disconnect();
  assert.equal(liveEffects, 0);
  assert.equal(controller.machine, null);
  assert.equal(controller.api.open, true, 'a disconnected element can still draw its last state');
  host.connect();
  assert.equal(controller.api.open, false, 'a new connection starts a new machine');
  host.disconnect();
});

test('zag controller: an element that leaves the page before anything read the api after a change can still draw its last state', async () => {
  const { host, controller } = makeController();
  host.connect();
  controller.api.send({ type: 'OPEN' });
  await settle(); // the change dropped the api; nothing reads it before the element goes
  host.disconnect();
  assert.equal(controller.api.open, true);
});

test('zag controller: closeWithoutFocus closes the machine with restoreFocus false, and does nothing when disconnected', async () => {
  const { host, controller } = makeController();
  controller.closeWithoutFocus();
  host.connect();
  controller.api.send({ type: 'OPEN' });
  await settle();
  controller.closeWithoutFocus();
  await settle();
  assert.equal(controller.api.open, false);
  assert.equal(lastCloseRestoresFocus, false);
  host.disconnect();
});

test('zag controller: 1,000 connect and disconnect cycles leave no machine running', () => {
  const { host, controller } = makeController();
  const machines: VanillaMachine<TinySchema>[] = [];
  for (let cycle = 0; cycle < 1000; cycle++) {
    host.connect();
    machines.push(running(controller));
    host.disconnect();
  }
  assert.equal(liveEffects, 0, 'every effect was cleaned up');
  assert.equal(new Set(machines).size, 1000, 'each connection made its own machine');
  assert.ok(
    machines.every(machine => machine.service.getStatus() === 'Stopped'),
    'every machine is stopped',
  );
});

test('zag controller: a machine change asks the element to draw, and drawing does not ask again', async () => {
  const { host, controller } = makeController();
  host.connect();
  host.update();
  const requestsAfterConnect = host.updateRequests;
  host.update();
  host.update();
  assert.equal(host.updateRequests, requestsAfterConnect, 'telling the machine its props is not a change to draw');
  controller.api.send({ type: 'OPEN' });
  await settle();
  assert.ok(host.updateRequests > requestsAfterConnect, 'a state change asks for a draw');
  const stoppedMachine = running(controller);
  host.disconnect();
  const requestsAfterDisconnect = host.updateRequests;
  stoppedMachine.send({ type: 'CLOSE' });
  await settle();
  assert.equal(host.updateRequests, requestsAfterDisconnect, 'a disconnected element is not asked');
});

test('zag controller: machine ids start with zg- and differ between machines', () => {
  const first = makeController().controller;
  const second = makeController().controller;
  assert.ok(first.id.startsWith(ZAG_ID_PREFIX) && second.id.startsWith(ZAG_ID_PREFIX));
  assert.notEqual(first.id, second.id);
  assert.ok(!first.id.startsWith('tab-'), 'a machine id never looks like an id of the page itself (tab-sheets)');
});

test('zag controller: the props of the element reach the machine, and the id is the controllers own', () => {
  let label = 'one';
  const { host, controller } = makeController(fakeHost(), () => ({ label, id: 'not-this-one' }));
  host.connect();
  assert.equal(running(controller).prop('label'), 'one');
  label = 'two';
  host.update();
  assert.equal(running(controller).prop('label'), 'two', 'read again at each draw');
  assert.equal(running(controller).scope.id, controller.id);
  host.disconnect();
});

test('zag controller: attributes and handlers land on the parts of its own element only', async () => {
  const outer = fakeHost();
  const outerTrigger = fakeElement(outer, { [PART_ATTRIBUTE]: 'trigger' });
  const nested = fakeHost(outer);
  const nestedTrigger = fakeElement(nested, { [PART_ATTRIBUTE]: 'trigger' });
  const nestedItem = fakeElement(nested, { [PART_ATTRIBUTE]: 'item' });
  const outerController = makeController(outer).controller;
  const nestedController = makeController(nested).controller;
  outer.connect();
  nested.connect();
  // the outer element draws last, so a part it took wrongly would keep the outer machine's attributes
  nested.update();
  outer.update();

  assert.equal(outer.attributes[HOST_ATTRIBUTE], outerController.id);
  assert.equal(nested.attributes[HOST_ATTRIBUTE], nestedController.id);
  assert.equal(outerTrigger.attributes['data-state'], 'closed');
  assert.equal(nestedTrigger.attributes['data-state'], 'closed');
  assert.equal(nestedItem.attributes['data-item'], '0', 'the outer machine did not take the nested item');

  // pressing the nested trigger opens the nested machine only, and only the nested trigger shows it
  nestedTrigger.listeners.get('click')?.();
  await settle();
  nested.update();
  outer.update();
  assert.equal(nestedController.api.open, true);
  assert.equal(outerController.api.open, false);
  assert.equal(nestedTrigger.attributes['data-state'], 'open');
  assert.equal(outerTrigger.attributes['data-state'], 'closed');
  outer.disconnect();
  nested.disconnect();
});

test('zag controller: parts of one name take the entries of an array in document order', () => {
  const { host } = makeController();
  const first = fakeElement(host, { [PART_ATTRIBUTE]: 'item' });
  const second = fakeElement(host, { [PART_ATTRIBUTE]: 'item' });
  const third = fakeElement(host, { [PART_ATTRIBUTE]: 'item' });
  host.connect();
  host.update();
  assert.deepEqual(
    [first, second, third].map(item => item.attributes['data-item']),
    ['0', '1', undefined],
  );
  host.disconnect();
});

test('zag controller: a part Lit took out is let go, and handlers are removed on disconnect', () => {
  const { host } = makeController();
  const trigger = fakeElement(host, { [PART_ATTRIBUTE]: 'trigger' });
  host.connect();
  host.update();
  assert.ok(trigger.listeners.has('click'));
  host.children.length = 0;
  host.update();
  assert.equal(trigger.listeners.has('click'), false, 'a node that left the element has no handler');
  const second = fakeElement(host, { [PART_ATTRIBUTE]: 'trigger' });
  host.update();
  assert.ok(second.listeners.has('click'));
  host.disconnect();
  assert.equal(second.listeners.has('click'), false);
});

test('zag controller: reading the api before the first connection is an error', () => {
  const { controller } = makeController();
  assert.throws(() => controller.api, /before the element connected/);
});

// Why this test exists: Zag's vanilla spreadProps removes the style property of a key whose value is undefined, and the style
// Zag gives a positioner names zIndex as undefined (the popper writes the z-index itself after placing the layer). Without the
// controller's filter every redraw stripped it and an open menu dropped behind the page's sticky table header. It stays as long
// as a layer's style comes from Zag's positioner props through spreadProps.
test('zag controller: a redraw keeps a style property the library wrote itself, and removes one it gave and then dropped', () => {
  const host = fakeHost();
  const positioner = fakeElement(host, { [PART_ATTRIBUTE]: 'positioner' });
  positioner.style = fakeStyle();
  let placed = false;
  new ZagController(host, {
    name: 'tiny',
    machine: tinyMachine,
    connect,
    // like a positioner's style: a width until the layer is placed, and a z-index that is never given (undefined)
    parts: () => ({ positioner: { style: { minWidth: 'max-content', pointerEvents: placed ? undefined : 'none', zIndex: undefined } } }),
  });
  host.connect();
  host.update();
  assert.equal(positioner.style.properties.get('min-width'), 'max-content');
  assert.equal(positioner.style.properties.get('pointer-events'), 'none');

  // the popper places the layer and writes its z-index; the next redraws give no pointer-events any more
  positioner.style.setProperty('z-index', 'var(--z-index)');
  placed = true;
  host.update();
  host.update();
  assert.equal(positioner.style.properties.get('z-index'), 'var(--z-index)', 'the redraw stripped the z-index the popper wrote');
  assert.equal(positioner.style.properties.has('pointer-events'), false, 'a property given before and not now is removed');
  host.disconnect();
});
