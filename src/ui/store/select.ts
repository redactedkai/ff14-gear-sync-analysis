/* How an element reads the store: `Select` re-renders its host only when the value it selected changes. The host is a local
   interface, so this file imports no Lit and its tests run in Node with a fake host; a LitElement fits it as it is. */
import type { Store } from './store.ts';

/* What `Select` needs of the element that owns it, and of Lit's controller protocol: the subset of Lit's
   ReactiveControllerHost and ReactiveController that a LitElement already has. */
export interface SelectController {
  hostConnected?(): void;
  hostDisconnected?(): void;
}
export interface SelectHost {
  addController(controller: SelectController): void;
  requestUpdate(): void;
}

/* Whether two values are the same by `Object.is` (the default way `Select` and `watch` compare). */
export const sameValue = Object.is;

/* Whether `a` and `b` are equal one level deep: the same keys (or array items) holding values that are the same by
   `Object.is`. For a selector that builds a small object or array each time it runs (`panelOf` does). */
export function shallowEq<Value>(a: Value, b: Value): boolean {
  if (Object.is(a, b)) {
    return true;
  }
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    return false;
  }
  if (Array.isArray(a) !== Array.isArray(b)) {
    return false;
  }
  const keysOfA = Object.keys(a);
  if (keysOfA.length !== Object.keys(b).length) {
    return false;
  }
  return keysOfA.every(key => Object.hasOwn(b, key) && Object.is((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
}

/* A reactive controller that keeps `value`, what `select(state)` returned the last time the store changed, and asks the host
   to render again when a change gives a value `equals` calls different. It subscribes while the host is connected and
   unsubscribes when it is disconnected, so an element removed from the page leaves nothing behind. A selector builds its
   value from the state alone (no element fields), and a value it builds anew each time needs `shallowEq`. */
export class Select<State extends Record<string, object>, Value> {
  readonly #host: SelectHost;
  readonly #store: Store<State>;
  readonly #select: (state: State) => Value;
  readonly #equals: (a: Value, b: Value) => boolean;
  #connected = false;
  #hasBeenConnected = false;
  #value: Value | undefined;
  #unsubscribe: (() => void) | undefined;

  /* A controller on `host` for what `select` reads from `store`'s state; `equals` says two values are the same (default:
     `Object.is`). It adds itself to the host. */
  constructor(host: SelectHost, store: Store<State>, select: (state: State) => Value, equals: (a: Value, b: Value) => boolean = sameValue) {
    this.#host = host;
    this.#store = store;
    this.#select = select;
    this.#equals = equals;
    host.addController(this);
  }

  /* The selected value: the one kept since the last change while connected, or a fresh read while the host is not connected
     (an element reads it before it is on the page, in a test or in its first render). */
  get value(): Value {
    return this.#connected ? (this.#value as Value) : this.#select(this.#store.state);
  }

  /* Lit calls it when the host is connected: read the value and follow the store. A host that was disconnected while the
     value changed renders again at once, since nothing told it. */
  hostConnected(): void {
    if (this.#connected) {
      return;
    }
    const before = this.#value as Value;
    this.#value = this.#select(this.#store.state);
    this.#unsubscribe = this.#store.subscribe(() => this.#follow());
    const changedWhileAway = this.#hasBeenConnected && !this.#equals(before, this.#value);
    this.#connected = true;
    this.#hasBeenConnected = true;
    if (changedWhileAway) {
      this.#host.requestUpdate();
    }
  }

  /* Lit calls it when the host is removed: stop following the store. */
  hostDisconnected(): void {
    this.#unsubscribe?.();
    this.#unsubscribe = undefined;
    this.#connected = false;
  }

  /* After a store change: keep the new value and render the host again when it differs from the one kept. */
  #follow(): void {
    const next = this.#select(this.#store.state);
    if (this.#equals(next, this.#value as Value)) {
      return;
    }
    this.#value = next;
    this.#host.requestUpdate();
  }
}
