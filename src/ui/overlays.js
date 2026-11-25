/* The open overlays (menus, popovers and notes opened by a button): one stack and one listener each for Escape, a press
   outside and the focus moving away, instead of each overlay wiring its own. The modal dialogs are not here: they are
   <gsa-dialog> elements (elements/shared/dialog.ts).
   An overlay registers a layer when it opens (components/overlay.js does it for a component) and the manager closes it:
   - Escape closes the topmost layer and puts the focus back on its opener;
   - a press outside a layer and its opener closes it, the focus staying where the press put it;
   - the focus moving outside a layer (Tab out) closes it when the layer has `tabOut`; the focus stays where it went;
   - opening a layer closes every other one, except the layers it belongs to (`parent`: the Auto-fill settings' menus);
   - `closeAll()` closes every layer for a change of screen, and never moves the focus (the router owns it then).
   A layer is {id, root (the element of the layer: a function returning it), opener (a function returning the button that
   opens it, or null), tabOut (does Tab out close it), parent (the id of the layer it is part of, or null), ignoreEscape
   (a function of the event: true leaves this Escape to something else, e.g. a native menu's open list), close (a function
   that clears the layer's own state)}. */

/* Whether `element` holds `target` (an element or null). */
function holds(element, target) {
  return Boolean(element && target && element.contains(target));
}

/* A manager of open layers. `getDocument` is a function returning the document the listeners go on (none in Node: the
   manager then only keeps the stack, which is what its unit tests use). */
export function createOverlays(getDocument = () => globalThis.document) {
  const stack = []; // the open layers, the oldest first
  let listening = false;

  /* The layer `id` and the ones it is part of (by `parent`), as a set of ids. */
  function familyOf(id) {
    const family = new Set();
    for (let next = id; next && !family.has(next); next = stack.find(layer => layer.id === next)?.parent) {
      family.add(next);
    }
    return family;
  }

  /* Whether `target` is in the layer or on its opener. */
  function reaches(layer, target) {
    return holds(layer.root(), target) || holds(layer.opener?.(), target);
  }

  /* Takes `layer` off the stack and clears its state; the focus goes to its opener when `restoreFocus`. */
  function closeLayer(layer, restoreFocus = false) {
    const at = stack.indexOf(layer);
    if (at >= 0) {
      stack.splice(at, 1);
    }
    layer.close();
    if (restoreFocus) {
      layer.opener?.()?.focus?.();
    }
  }

  /* An Escape (`event`: the key event): closes the topmost layer with the focus back on its opener, unless the layer leaves
     this Escape to something else. Returns whether it closed one. */
  function pressEscape(event) {
    const layer = stack.at(-1);
    if (!layer || layer.ignoreEscape?.(event)) {
      return false;
    }
    closeLayer(layer, true);
    return true;
  }

  function onKeydown(event) {
    if (event.key === 'Escape' && !event.defaultPrevented) {
      pressEscape(event);
    }
  }

  function onPointerdown(event) {
    for (const layer of [...stack].reverse()) {
      if (reaches(layer, event.target)) {
        return; // a press inside a layer leaves the layers under it open
      }
      closeLayer(layer);
    }
  }

  function onFocusin(event) {
    for (const layer of [...stack].reverse()) {
      if (layer.tabOut && !reaches(layer, event.target)) {
        closeLayer(layer);
      }
    }
  }

  /* The listeners go on the document once, with the first layer. */
  function listen() {
    const doc = getDocument();
    if (listening || !doc) {
      return;
    }
    doc.addEventListener('keydown', onKeydown);
    doc.addEventListener('pointerdown', onPointerdown);
    doc.addEventListener('focusin', onFocusin);
    listening = true;
  }

  return {
    /* Opens `layer` (see the top): every layer that is not part of its family closes first. */
    open(layer) {
      const family = familyOf(layer.parent);
      for (const other of [...stack]) {
        if (other.id === layer.id || !family.has(other.id)) {
          closeLayer(other);
        }
      }
      stack.push({ parent: null, tabOut: false, ...layer });
      listen();
    },
    /* Closes the layer `id` if it is open; the focus goes to its opener when `restoreFocus`. Returns whether it was open. */
    close(id, { restoreFocus = false } = {}) {
      const layer = stack.find(entry => entry.id === id);
      if (layer) {
        closeLayer(layer, restoreFocus);
      }
      return Boolean(layer);
    },
    /* Closes every layer, without moving the focus: for a change of screen. */
    closeAll() {
      for (const layer of [...stack].reverse()) {
        closeLayer(layer);
      }
    },
    pressEscape,
    isOpen: id => stack.some(layer => layer.id === id),
    /* the ids of the open layers, the oldest first */
    get openIds() {
      return stack.map(layer => layer.id);
    },
  };
}

/* The page's manager. */
export const overlays = createOverlays();
