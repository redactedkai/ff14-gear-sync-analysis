/* Runs one Zag machine (through @zag-js/vanilla, the only adapter used here) for a Lit element, as a reactive controller.
   The element creates it in its constructor, draws its markup from `controller.api`, and marks the parts Zag styles with
   `data-zag-part="<name>"` (for example the trigger, the positioner and the content of a popover). The controller:
   - starts the machine when the element connects and stops it when it disconnects, so an element that Alpine's `x-if` adds
     and removes leaves no machine, listener or effect behind (a new connection starts a new machine);
   - asks the element to draw again when the machine changes, and puts the attributes and handlers of every part on it after
     each draw (`updated()`), because Lit may have made the part's node new;
   - finds the parts under its own `data-zag-host` element only, so a machine inside another machine's content (a menu in a
     dialog) never takes the outer one's attributes;
   - names the machine `zg-<name>-<number>`: the prefix keeps its element ids away from the page's own (`#tab-sheets`).
   The element is a local interface, so this file imports no Lit and its tests run in Node with a fake element; a LitElement
   fits the interface as it is. */
import type { Machine, MachineSchema, Service } from '@zag-js/core';
import { type Attrs, VanillaMachine, normalizeProps, spreadProps } from '@zag-js/vanilla';

/* The prefix of every machine id. */
export const ZAG_ID_PREFIX = 'zg-';
/* The attribute the controller sets on its element; a part belongs to its nearest ancestor that has it. */
export const HOST_ATTRIBUTE = 'data-zag-host';
/* The attribute that names a part in the markup: `data-zag-part="trigger"`. */
export const PART_ATTRIBUTE = 'data-zag-part';

/* The part of Lit's reactive controller protocol the controller implements. */
export interface ZagLifecycle {
  hostConnected?(): void;
  hostDisconnected?(): void;
  hostUpdate?(): void;
  hostUpdated?(): void;
}

/* What the controller needs of its element: a subset of what a LitElement has. */
export interface ZagHost {
  addController(controller: ZagLifecycle): void;
  requestUpdate(): void;
  setAttribute(name: string, value: string): void;
  querySelectorAll(selectors: string): Iterable<Element>;
}

/* What an element tells the controller about its machine:
   - `name`: the kind of widget, for the id (`popover` gives `zg-popover-1`);
   - `machine` and `connect`: the two exports of a Zag package of that name (`popover.machine`, `popover.connect`);
   - `getProps`: the machine's props, read again at each draw (`open`, `positioning`, callbacks); never the `id`;
   - `parts`: from the api, the attributes of each part by its name; an array gives its entries to the parts of that name in
     document order (the items of a menu). */
export interface ZagOptions<Schema extends MachineSchema, Api> {
  name: string;
  machine: Machine<Schema>;
  connect: (service: Service<Schema>, normalize: typeof normalizeProps) => Api;
  getProps?: () => Partial<Schema['props']>;
  parts: (api: Api) => Record<string, Attrs | Attrs[]>;
}

// the number in the next machine id
let machineCount = 0;

/* The attributes of a part without the style keys whose value is undefined. Zag's `spreadProps` removes the style property of a
   key whose value is undefined, and the style Zag gives a positioner names `zIndex` as undefined (the popper writes the
   z-index itself once it has placed the layer), so each redraw would strip the layer's z-index and a menu would drop behind
   the page's sticky headers. A key that was defined at the last redraw and is undefined now is still removed: `spreadProps`
   compares with the attributes of the last redraw. */
function withoutUndefinedStyles(attrs: Attrs): Attrs {
  const style = attrs.style;
  if (typeof style !== 'object' || style === null) return attrs;
  return { ...attrs, style: Object.fromEntries(Object.entries(style).filter(([, value]) => value != null)) };
}

/* A reactive controller that owns the Zag machine of one element; see the file header. `api` is the machine's api for the
   current state (after a disconnect, its last one), and `machine` is null while the element is disconnected. */
export class ZagController<Schema extends MachineSchema, Api> implements ZagLifecycle {
  /** The id of the machine (`zg-<name>-<number>`). */
  readonly id: string;
  readonly #host: ZagHost;
  readonly #options: ZagOptions<Schema, Api>;
  #machine: VanillaMachine<Schema> | null = null;
  #api: Api | null = null;
  #unsubscribe: (() => void) | null = null;
  // true while the controller itself tells the machine about new props, so that the machine's answer does not draw again
  #syncing = false;
  readonly #spreads = new Map<Element, () => void>();

  /* Adds the controller to `host`; `options` is described at ZagOptions. */
  constructor(host: ZagHost, options: ZagOptions<Schema, Api>) {
    this.#host = host;
    this.#options = options;
    this.id = `${ZAG_ID_PREFIX}${options.name}-${++machineCount}`;
    host.addController(this);
  }

  /* The running machine, or null while the element is disconnected. */
  get machine(): VanillaMachine<Schema> | null {
    return this.#machine;
  }

  /* The api of the machine for its current state; throws before the element has ever connected. */
  get api(): Api {
    if (this.#machine && this.#api === null) this.#api = this.#options.connect(this.#machine.service, normalizeProps);
    if (this.#api === null) throw new Error(`${this.id}: the api is read before the element connected`);
    return this.#api;
  }

  /* Closes an overlay machine (popover, menu, dialog, select, combobox) without it moving the focus: the `CLOSE` event with
     `restoreFocus: false`, which each of those machines honours. For a close the page asked for (another layer opened, a change
     of screen), where the focus belongs to whatever the user went to. */
  closeWithoutFocus(): void {
    this.#machine?.send({ type: 'CLOSE', restoreFocus: false });
  }

  /* Starts a new machine. */
  hostConnected(): void {
    const props = () => ({ ...this.#options.getProps?.(), id: this.id }) as Partial<Schema['props']>;
    this.#machine = new VanillaMachine(this.#options.machine, props);
    this.#host.setAttribute(HOST_ATTRIBUTE, this.id);
    this.#unsubscribe = this.#machine.subscribe(() => {
      this.#api = null;
      if (!this.#syncing) this.#host.requestUpdate();
    });
    this.#machine.start();
    this.#api = null;
    this.#host.requestUpdate();
  }

  /* Stops the machine and lets go of the parts. */
  hostDisconnected(): void {
    this.#unsubscribe?.();
    this.#machine?.stop();
    this.#machine = null;
    for (const cleanUp of this.#spreads.values()) cleanUp();
    this.#spreads.clear();
  }

  /* Before a draw: the machine reads the element's props again (its own answer is not a reason to draw again). */
  hostUpdate(): void {
    this.#syncing = true;
    this.#machine?.updateProps({});
    this.#syncing = false;
  }

  /* After a draw: puts the attributes and handlers of each part of this element on its node. */
  hostUpdated(): void {
    if (!this.#machine) return;
    const wanted = this.#options.parts(this.api);
    const seen = new Map<string, number>();
    const spreadNow = new Set<Element>();
    for (const node of this.#host.querySelectorAll(`[${PART_ATTRIBUTE}]`)) {
      if (!Object.is(node.closest(`[${HOST_ATTRIBUTE}]`), this.#host)) continue; // a part of a machine nested inside this element
      const name = node.getAttribute(PART_ATTRIBUTE) ?? '';
      const index = seen.get(name) ?? 0;
      seen.set(name, index + 1);
      const attrs = Array.isArray(wanted[name]) ? wanted[name][index] : wanted[name];
      if (!attrs) continue;
      this.#spreads.set(node, spreadProps(node, withoutUndefinedStyles(attrs), this.id));
      spreadNow.add(node);
    }
    // a node Lit took out of the page: let go of its handlers
    for (const [node, cleanUp] of this.#spreads) {
      if (spreadNow.has(node)) continue;
      cleanUp();
      this.#spreads.delete(node);
    }
  }
}
