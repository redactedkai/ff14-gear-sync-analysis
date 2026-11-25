/* One overlay as a part of a component (compose.js): `overlay('filterMenu', {...})` gives the members `filterMenuOpen`,
   `openFilterMenu(...)`, `closeFilterMenu(restoreFocus)` and `toggleFilterMenu(...)`, and registers the layer with the page's
   manager (ui/overlays.js), which does Escape, a press outside, Tab out and "one at a time". The template only reads
   `filterMenuOpen` and calls the three actions; it never sets the flag itself. */
import { overlays } from '../overlays.js';
import { compose } from './compose.js';

/* "pieceMenu" -> "PieceMenu" */
const capital = name => name[0].toUpperCase() + name.slice(1);

/* Runs `run` once the overlay is drawn: an `x-show` panel is shown in the next animation frame, after $nextTick, so the
   focus moved any sooner would find it still hidden (WebKit then leaves the focus on the page). */
function afterDrawn(component, run) {
  component.$nextTick(() => {
    if (globalThis.requestAnimationFrame) {
      globalThis.requestAnimationFrame(run);
    } else {
      run();
    }
  });
}

/* The members of one overlay.
   `root`, `opener`, `focusIn`, `ignoreEscape`, `onOpen` and `onClose` are functions of the component (called with it as
   `this`):
   - `root()`: the element holding the overlay and its button (Tab out of it closes it, a press inside leaves it open);
   - `opener()`: the button that opens it, where the focus returns after Escape or a second press on the button;
   - `focusIn()`: the element that takes the focus when it opens (none: the focus stays on the button);
   - `ignoreEscape(event)`: true to leave this Escape to something else;
   - `onOpen()` and `onClose()`: the overlay's own work, such as placing it or dropping a note's subject.
   `tabOut`: Tab out closes it (default yes). `parent`: the id of the overlay this one is part of, which stays open.
   `id`: the layer's id in the manager (default: `name`; give one of your own where more than one instance of the component has the same `name`). `manager`: the manager (the page's unless a test gives its own). */
export function overlay(
  name,
  { root, opener, focusIn, ignoreEscape, onOpen, onClose, tabOut = true, parent = null, id = name, manager = overlays },
) {
  const Name = capital(name);
  const flag = `${name}Open`;
  return {
    [flag]: false,
    [`open${Name}`](...args) {
      if (this[flag]) {
        return;
      }
      manager.open({
        id,
        root: () => root.call(this),
        opener: () => opener?.call(this) ?? null,
        tabOut,
        parent,
        ignoreEscape: event => ignoreEscape?.call(this, event) ?? false,
        close: () => {
          this[flag] = false;
          onClose?.call(this);
        },
      });
      this[flag] = true;
      onOpen?.call(this, ...args);
      // not when it was closed before it was drawn (a quick Escape): the focus would land on a hidden element and be lost
      if (focusIn) {
        afterDrawn(this, () => {
          if (this[flag]) {
            focusIn.call(this)?.focus();
          }
        });
      }
    },
    [`close${Name}`](restoreFocus = false) {
      if (manager.close(id, { restoreFocus }) || !this[flag]) {
        return;
      }
      // the flag was set without opening (the manager holds no layer): clear it and its state all the same
      this[flag] = false;
      onClose?.call(this);
    },
    [`toggle${Name}`](...args) {
      if (this[flag]) {
        this[`close${Name}`](true);
      } else {
        this[`open${Name}`](...args);
      }
    },
  };
}

/* A menu in a template of its own (the partials of the Gear browser's and the Auto-fill settings' filters), as `x-data` of the
   menu's wrapper: `x-data="menuScope('b-exp', 'expBtn', null)"`. It has `filterMenuOpen`, `openFilterMenu()`, `closeFilterMenu(restoreFocus)` and
   `toggleFilterMenu()` (overlay above), and the members of `extra` (such as a selected tab).
   `id`: the layer's id (one per menu on the page); `button`: the name of the `x-ref` button that opens it; `parent`: the id of
   the overlay the menu is inside (the Auto-fill settings' 'settings'), or null; `extra`: more members. */
export function menuScope(id, button, parent = null, extra = {}) {
  return compose(
    { ...extra },
    overlay('filterMenu', {
      id,
      parent,
      root() {
        return this.$root;
      },
      opener() {
        return this.$refs[button];
      },
    }),
  );
}
