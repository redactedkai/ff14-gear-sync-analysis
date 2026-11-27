/* DOM stand-ins for the overlay manager's tests, each complete for the part of the DOM the manager reads (a typed fake, no cast). */
import type { OverlayDocument, OverlayKeyEvent, OverlayOpener, OverlayTargetEvent } from '../../../../src/ui/overlays.ts';

/* What a test says of an event it sends: a key, whether another handler took it, and the target. */
export interface SentEvent {
  key?: string;
  defaultPrevented?: boolean;
  target?: EventTarget | null;
}

/* A fake document: it keeps the listeners the manager adds, and sends them an event. */
export class FakeDocument implements OverlayDocument {
  private readonly listeners = new Map<string, (event: OverlayKeyEvent) => void>();

  addEventListener(type: 'keydown', listener: (event: OverlayKeyEvent) => void): void;
  addEventListener(type: 'pointerdown' | 'focusin', listener: (event: OverlayTargetEvent) => void): void;
  addEventListener(type: string, listener: (event: OverlayKeyEvent) => void): void {
    this.listeners.set(type, listener);
  }

  send(type: 'keydown' | 'pointerdown' | 'focusin', { key = '', defaultPrevented = false, target = null }: SentEvent): void {
    this.listeners.get(type)?.({ key, defaultPrevented, target });
  }
}

/* An element that holds itself and its `children`, and counts how often it took the focus. */
export class FakeElement extends EventTarget implements OverlayOpener {
  focused = 0;
  isConnected = true;
  readonly name: string;
  private readonly children: readonly EventTarget[];

  constructor(name: string, ...children: EventTarget[]) {
    super();
    this.name = name;
    this.children = children;
  }

  contains(target: EventTarget | null): boolean {
    return target === this || (target !== null && this.children.includes(target));
  }

  focus(): void {
    this.focused += 1;
  }
}

/* A new FakeElement. */
export const element = (name: string, ...children: EventTarget[]): FakeElement => new FakeElement(name, ...children);

/* A stand-in for a DOM object that the code under test only keeps and compares (a box a ResizeObserver watches), where a
   complete fake is impossible in Node (an Element has hundreds of members). `Object.create(null)` is typed `any`, so the
   object takes the type asked for, with no cast; never read a member of it. */
export function opaque<T extends object>(): T {
  return Object.create(null);
}

/* A complete ResizeObserverEntry for a box of `width` by `height` px at the top left corner of the page, the way a browser
   reports a box with no padding or border. */
export function resizeEntry(target: Element, width: number, height = 0): ResizeObserverEntry {
  const size: ResizeObserverSize = { inlineSize: width, blockSize: height };
  const rect: DOMRectReadOnly = {
    x: 0,
    y: 0,
    width,
    height,
    top: 0,
    left: 0,
    right: width,
    bottom: height,
    toJSON: () => ({ x: 0, y: 0, width, height, top: 0, left: 0, right: width, bottom: height }),
  };
  return { target, contentRect: rect, borderBoxSize: [size], contentBoxSize: [size], devicePixelContentBoxSize: [size] };
}

/* An <input> as far as a number box reads it: a target with a `value` (its text). */
export class FakeInput extends EventTarget {
  value: string;

  constructor(value = '') {
    super();
    this.value = value;
  }
}

/* The `input` event of a typed edit (an InputEvent with an `inputType`). Node has no InputEvent, so this is an Event with the
   one member the code reads. */
export class FakeInputEvent extends Event {
  readonly inputType: string;

  constructor(inputType: string) {
    super('input');
    this.inputType = inputType;
  }
}

/* Delivers `event` to `handler` with `input` as its target, the way the browser does (the target is set by the dispatch). */
export function dispatchTo(input: EventTarget, handler: (event: Event) => void, event: Event): void {
  input.addEventListener(event.type, handler, { once: true });
  input.dispatchEvent(event);
}

/* Puts `value` on globalThis under `name` (a browser global Node lacks, such as `document`), and returns the function that puts
   back what was there. The value is only what the code under test reads of it. */
export function stubGlobal(name: string, value: unknown): () => void {
  const original = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  return () => {
    if (original) {
      Object.defineProperty(globalThis, name, original);
    } else {
      Reflect.deleteProperty(globalThis, name);
    }
  };
}

/* Declares that `fake` stands for a `T` (a DOM Element, say) for the rest of the scope, where a third-party signature asks for the
   real type and a complete fake is out of reach in Node (an Element has hundreds of members). It is a type-level promise, not a
   cast: the fake must have every member the code under test reads, and the tests that use it show that it does. Use it only where
   the type comes from a library (`spreadProps(node: Element)`); where the code is ours, narrow its parameter type instead. */
export function standsFor<T extends object>(fake: object): asserts fake is T {}

/* A complete DOMRect for a box whose top edge is at `top` px and whose height is `height` px, at the left edge of the window with
   no width. */
export function domRect(top: number, height: number): DOMRect {
  const bottom = top + height;
  return { x: 0, y: top, width: 0, height, top, right: 0, bottom, left: 0, toJSON: () => ({ top, bottom, height }) };
}
