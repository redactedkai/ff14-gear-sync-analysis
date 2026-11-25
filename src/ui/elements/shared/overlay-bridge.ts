/* Lets the page's overlay manager (src/ui/overlays.js) know about a Zag layer (a popover or menu that a Zag machine opens),
   so the two kinds of layer live together while the move from the page's own overlays to Zag's goes on.
   Two stacks listen for Escape on the page: the manager's, and Zag's dismissable layer (a capturing `keydown` listener that
   calls `preventDefault()` once it closes a layer; the manager ignores an Escape that is already prevented). Left alone, an
   Escape would close a layer in each stack. The bridge makes it one:
   - the open Zag layer is registered with the manager (`ignoreEscape` true: the manager never closes it on Escape, Zag does),
     so the manager still opens one layer at a time, still closes it with the other layers on a change of screen, and a
     layer of the manager inside it (`parent`) or around it stays open;
   - a Zag layer with a manager layer above it hands the Escape to the manager (`guardEscape`, passed to the machine as its
     `onEscapeKeyDown`): the topmost layer closes first, whichever stack it is in.
   The manager is a parameter so Node tests can use their own. */
import { overlays } from '../../overlays.js';

/* What the bridge reads of the machine's api: whether the layer is open. A Zag popover's and menu's api have it. */
export interface BridgedLayerApi {
  open: boolean;
}

/* One layer as the manager takes it (see the top of src/ui/overlays.js). */
export interface ManagedLayer {
  id: string;
  root: () => Element | null;
  opener: () => Element | null;
  tabOut: boolean;
  parent: string | null;
  ignoreEscape: () => boolean;
  close: () => void;
}

/* The part of the manager the bridge uses. */
export interface LayerManager {
  open(layer: ManagedLayer): void;
  close(id: string): boolean;
  isOpen(id: string): boolean;
  readonly openIds: string[];
  pressEscape(event: Event): boolean;
}

/* What the bridge needs to know about its layer:
   - `id`: the layer's id in the manager, one per layer on the page;
   - `api`: the machine's current api (a function, since the api is built again after each change);
   - `closeWithoutFocus`: closes the machine without it moving the focus (`ZagController.closeWithoutFocus`). The manager calls
     it when it closes the layer (a press outside, another layer opening, a change of screen) and moves the focus itself where
     it should; a machine that returned the focus to its button after the page had opened another layer would pull it back;
   - `root`: the element that holds the layer's content (a press inside it is not outside the layer);
   - `opener`: the button that opens it;
   - `parent`: the id of the manager layer this one belongs to, or null (a function when the element learns it later; it is
     read when the layer opens);
   - `manager`: the manager (the page's unless a test gives its own). */
export interface OverlayBridgeOptions {
  id: string;
  api: () => BridgedLayerApi;
  closeWithoutFocus: () => void;
  root: () => Element | null;
  opener: () => Element | null;
  parent?: string | null | (() => string | null);
  manager?: LayerManager;
}

/* The two calls an element makes: `sync()` after each draw (and when it disconnects, `release()`), and `guardEscape` as the
   machine's `onEscapeKeyDown`. */
export interface OverlayBridge {
  sync(): void;
  release(): void;
  guardEscape(event: Event): void;
}

/* Returns the bridge of one Zag layer. `sync()` registers the layer with the manager when the machine is open and drops it
   when it is closed; `release()` drops it at once (the element left the page). */
export function createOverlayBridge(options: OverlayBridgeOptions): OverlayBridge {
  const { id, api, closeWithoutFocus, root, opener, parent, manager = overlays as LayerManager } = options;
  return {
    sync() {
      // an update that was already queued when the element left the page runs after `release()`: its layer is not open any more
      const left = root()?.isConnected === false;
      const open = api().open && !left;
      if (open && !manager.isOpen(id)) {
        manager.open({
          id,
          root,
          opener,
          tabOut: false, // Zag closes the layer when the focus leaves it
          parent: (typeof parent === 'function' ? parent() : parent) ?? null,
          ignoreEscape: () => true, // Zag's machine owns this layer's Escape
          close: () => {
            if (api().open) {
              closeWithoutFocus();
            }
          },
        });
      } else if (!open && manager.isOpen(id)) {
        manager.close(id);
      }
    },
    release() {
      manager.close(id);
    },
    guardEscape(event) {
      if (manager.openIds.at(-1) === id) {
        return; // this layer is on top: the machine closes it
      }
      manager.pressEscape(event); // a manager layer is above it: that one closes, and the machine does not
      event.preventDefault();
    },
  };
}
