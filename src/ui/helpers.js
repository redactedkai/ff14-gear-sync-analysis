/* Small presentation helpers shared by the components. */
import { ACTIVITIES, EXPANSIONS } from '../core/constants.js';
import { CURRENT_TOMES, MAX_LEVEL } from '../core/tables.js';
import { DEFAULT_EXCLUDE } from './settings.js';

/* A whole number with en-US thousands separators ("1,234"), whatever the browser's locale: in a German browser
   "1.234" would read like a decimal next to GCDs such as "2.48s". The Defense row formats the same way. */
export const fmtInt = n => n.toLocaleString('en-US');

/* "3 slots", "1 change", "2 matches": a count and its word (a word ending in s or ch takes "es"). */
export function plural(count, word) {
  return `${count} ${word}${count === 1 ? '' : /(s|ch)$/.test(word) ? 'es' : 's'}`;
}

/* `one` for a count of 1, else `many`: the hand-written pair of a sentence ("it"/"them", "its slot is"/"their slots are"). */
export function oneOrMany(count, one, many) {
  return count === 1 ? one : many;
}

/* A deep copy of plain data (a saved sheet, a gear set, Fill settings): the JSON round trip, which also drops Alpine's
   reactive wrappers. Only for JSON-safe data: no functions, no undefined kept, no Map. */
export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

/* How long a typed number waits before it is committed: typing "123" commits once, not 1, 12 and 123, so the views
   (and the optimizer) do not recompute for the numbers on the way. */
export const TYPING_DEBOUNCE_MS = 300;

/* Flash a cap field the page just lowered (its `lowered` class, styles.css): the flash restarts on each lowering, by
   dropping the class, letting the browser see it gone, and adding it back. Used by the Job and sync panel (page.js
   lowerCap) and a sheet's page (components/sheets.js). `field`: the input, or nothing (no flash). */
export function flashLowered(field) {
  if (!field?.classList) return;
  field.classList.remove('flash');
  void field.offsetWidth;
  field.classList.add('flash');
}

/* A bound of numberField: a number, or a function read at each input. */
const bound = b => (typeof b === 'function' ? b() : b);

/* x-bind object for a number input bound to a setting: the page's one pattern for number boxes (as $num,
   storeNumberField). A step (mouse wheel, arrow keys) commits at once; typing commits TYPING_DEBOUNCE_MS after the last
   keystroke, and only an in-range value, so a value on the way ("9" of "90") is held back. Enter or leaving the field
   (change) commits at once, and an out-of-range value is moved to the nearest bound and shown in the box, so the box
   and the setting always agree (owner: "-5" in a filter becomes its lowest value, not "no limit"). While
   the field has focus and already shows the stored value, the typed text is left alone ("2.40" stays as typed). A bound
   may be a function, read at each input, for a limit that changes while the field is bound (the job's level cap).
   Options:
   - snap: false keeps an out-of-range value out on change too, for a box that explains it (the sync cap's error).
   - live: commit each valid value as it is typed, with no wait (the synced level: owner); typing "90" then
     shows level 9 for a moment, which is cheap, and the optimizer has its own wait.
   - decimals: the digits kept after the point (0, whole numbers, by default; the Target GCD keeps 2).
   - empty: the value an emptied box commits, as it is typed (a filter's '' for no limit); left out, an empty box
     commits nothing.
   - onEmpty(input): called when an empty box is left or entered (change), for a field that then goes back to a value
     it follows (the tiers' level).
   The box's `min` and `max` attributes (where the arrow keys stop) come from `lo` and `hi`, so the markup does not
   write them again. A bound of Infinity sets no attribute: a filter that takes any number as typed keeps the `max`
   its markup gives it, the end of the real range, for the arrow keys only.
   Boxes with another rule keep their own handlers: the GCD tab's level and speed correct what is typed and say so,
   and Piece stats' item level and the tiers' substat boxes commit only on change, since a value on the way would be
   held to its range while typing. */
export function numberField(get, set, lo, hi, { live = false, decimals = 0, empty, onEmpty, snap = true } = {}) {
  let timer = null;
  const scale = 10 ** decimals;
  const round = v => Math.round(v * scale) / scale;
  /* commits `raw`; on the final commit (change) an out-of-range value moves to the nearest bound, and `input` shows it */
  const commit = (raw, input = null) => {
    clearTimeout(timer);
    if (raw === '') {
      if (empty !== undefined && get() !== empty) set(empty);
      return;
    }
    let v = +raw;
    if (Number.isNaN(v)) return;
    const low = bound(lo),
      high = bound(hi);
    if (v < low || v > high) {
      if (!input || !snap) return;
      v = Math.min(Math.max(v, low), high);
      input.value = round(v);
    }
    if (round(v) !== get()) set(round(v));
  };
  // the min and max attributes from the bounds: a function is read at each render, Infinity sets none
  const attribute = (name, b) => (typeof b === 'function' || Number.isFinite(b) ? { [name]: () => bound(b) } : {});
  return {
    ...attribute(':min', lo),
    ...attribute(':max', hi),
    ':value'() {
      const v = get(),
        el = this.$el;
      return el === document.activeElement && round(+el.value) === v ? el.value : v;
    },
    '@input'(e) {
      const raw = e.target.value;
      clearTimeout(timer);
      // a step (mouse wheel, arrow keys, the spinner) is no InputEvent with an inputType: commit it at once, so the
      // page follows the value as it scrolls; typed digits wait, so "9" on the way to "90" is held back
      if (live || !e.inputType) commit(raw);
      else timer = setTimeout(() => commit(raw), TYPING_DEBOUNCE_MS);
    },
    '@change'(e) {
      commit(e.target.value, e.target);
      if (e.target.value === '' && onEmpty) onEmpty(e.target);
    },
  };
}

/* The page's one way for a component to build a view (architecture.md, section 3): a getter reads the view's inputs
   from the store, which makes every binding that shows the view track them, and asks this cache for the view of their
   key. A new key builds the view (a pure view builder in src/ui/views); the same key returns the last one, so a
   template that reads the view many times a render builds it once. Kept in the component's closure, not its reactive
   state. Returns {get(key, build): the view for `key` (a string), last(): the last view built, or null}. */
export function viewCache() {
  let key = null,
    view = null;
  return {
    get(newKey, build) {
      if (newKey !== key) {
        view = build();
        key = newKey;
      }
      return view;
    },
    last: () => view,
  };
}

/* `value` frozen with every object and array inside it, and returned. For a view stored on a component: Alpine leaves a
   frozen object as it is, but freezing only the top would still let x-for wrap each row it hands a template (and each
   object read from a row) in a reactive proxy that tracks every read. An object already frozen is taken as frozen all
   through and not walked again. */
export function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const inner of Object.values(value)) deepFreeze(inner);
  return value;
}

/* numberField bound to a dotted path in the store, e.g. storeNumberField(store, 'piece.ilvl', 1, 795); options as for
   numberField. Registered as the $num magic in main.js. */
export function storeNumberField(store, path, lo, hi, options = {}) {
  const keys = path.split('.'),
    last = keys.pop();
  const target = () => keys.reduce((o, k) => o[k], store);
  return numberField(
    () => target()[last],
    v => {
      target()[last] = v;
    },
    lo,
    hi,
    options,
  );
}

/* The "Gear from" menu's two columns of sections (owner's layout): each {key, sections: [{title, boxes}]},
   boxes being ACTIVITIES entries in their order. */
const FROM_COLUMNS = [
  ['Everyday', 'Time-limited'],
  ['Side content', 'Hard content'],
];
/* FROM_COLUMNS with each section's boxes filled in, frozen: what the "Gear from" menu lays out. */
export const GEAR_FROM_COLUMNS = Object.freeze(
  FROM_COLUMNS.map(titles =>
    Object.freeze({
      key: titles.join('|'),
      sections: Object.freeze(titles.map(title => Object.freeze({ title, boxes: ACTIVITIES.filter(a => a.section === title) }))),
    }),
  ),
);
/* The patch series of the level cap ("7.x" at level 100): A Realm Reborn is 2.x, each expansion one more. */
const CAP_PATCH = `${EXPANSIONS.findIndex(e => e.levelCap === MAX_LEVEL) + 2}.x`;

/* What a "Gear from" box covers, for the line under the menu: its hint with the current tomestones and the level cap's
   patch series filled in. */
export function gearFromHint(activity) {
  return activity.hint.replace('{currentTomes}', CURRENT_TOMES.join(' or ')).replace('{capPatch}', CAP_PATCH);
}

/* The "Gear from" button's text: "All", "None", "All but N" (up to 5 left out) or "N of M", plus " · no market board"
   when the switch is off (it is on by default, so only the unusual state is named). off: the ACTIVITIES keys left out. */
export function gearFromSummary(off, market) {
  const on = ACTIVITIES.length - off.length;
  let text = !off.length ? 'All' : !on ? 'None' : off.length <= 5 ? `All but ${off.length}` : `${on} of ${ACTIVITIES.length}`;
  if (!market) text += ' · no market board';
  return text;
}

/* Where a filter's settings live, for gearFromToggles and expansionToggles: `part` a field of $store.app ('browse'),
   changed in place; or an accessor {read(component) → the settings, write(component, patch)} for settings kept
   elsewhere (a gear set's Fill settings, changed through the sheet store). Returns the accessor. */
function filterAccess(part) {
  if (typeof part !== 'string') return part;
  return { read: self => self.$store.app[part], write: (self, patch) => Object.assign(self.$store.app[part], patch) };
}

/* Room kept between a floating menu and the window's edges, and the least height a menu is cut to, in px. */
const MENU_EDGE_PX = 8;
const MENU_MIN_HEIGHT_PX = 160;

/* Members shared by the dropdown menus and notes (Expansion, Gear from, the "Spare points" note): where they open and
   what Escape does. Spread into the components that use the partials (gearFromToggles and expansionToggles do). */
const menuFloat = {
  /* Escape with the menu open: closes that menu only (`state.open` false), keeps the key from the page (a set's Fill
     settings would close with it) and puts the focus back on the menu's button. With no menu open it does nothing,
     so the next Escape reaches the page. Returns whether it closed a menu. `state`: {open}, `event`: the key event. */
  closeMenuOnEscape(state, event, button) {
    if (!state.open) return false;
    state.open = false;
    event.preventDefault();
    event.stopPropagation();
    button?.focus();
    return true;
  },
  /* Put `menu` (shown) under `anchor`, the button that opened it. On a page it is absolutely placed by its CSS and only
     opens leftwards (right edge on the button's) near the window's right edge, so the page does not scroll sideways.
     In a Fill settings dialog (.cfgdlg) it is fixed to the window, so the dialog's own scroll box does not cut it: its
     top is under the button, its height is cut to the window's bottom, its width to the window's, and it opens
     leftwards when it would pass the window's right edge; a note (.popover) always opens leftwards. */
  placeMenu(menu, anchor) {
    if (!menu || !anchor) return;
    const windowWidth = document.documentElement.clientWidth;
    if (!menu.closest('.cfgdlg')) {
      menu.classList.remove('to-left');
      if (menu.getBoundingClientRect().right > windowWidth - MENU_EDGE_PX) menu.classList.add('to-left');
      return;
    }
    menu.classList.remove('to-left');
    const button = anchor.getBoundingClientRect();
    const top = button.bottom + 4;
    const box = menu.style;
    box.top = `${top}px`;
    box.right = 'auto';
    box.bottom = 'auto';
    box.minWidth = `${button.width}px`;
    box.maxWidth = `${windowWidth - 2 * MENU_EDGE_PX}px`;
    box.maxHeight = `${Math.max(MENU_MIN_HEIGHT_PX, window.innerHeight - top - 12)}px`;
    box.left = `${button.left}px`;
    const width = menu.getBoundingClientRect().width;
    // a note (.popover, the "Spare points" one) has its right edge on the button's, as in B17, so it stays inside the dialog;
    // a menu opens rightwards, and leftwards only when it would pass the window's right edge
    const rightEdgeOnButton = menu.classList.contains('popover') || button.left + width > windowWidth - MENU_EDGE_PX;
    if (rightEdgeOnButton) box.left = `${Math.max(MENU_EDGE_PX, button.right - width)}px`;
  },
};

/* Component members for one "Gear from" filter (`part`: filterAccess): its `exclude` (ACTIVITIES keys left out, in
   ACTIVITIES order) and `market` (the market board switch). The component provides `emptyBoxes`, the keys with
   nothing for the current job and filters (greyed out). `fromPointed` is the box (or 'market') under the pointer or
   keyboard focus, described under the menu. Methods, not getters (see expansionToggles). */
export function gearFromToggles(part) {
  const access = filterAccess(part);
  return {
    ...menuFloat,
    gearFromColumns: GEAR_FROM_COLUMNS,
    fromPointed: null,
    fromSummary() {
      const f = access.read(this);
      return gearFromSummary(f.exclude, f.market);
    },
    fromOn(key) {
      return !access.read(this).exclude.includes(key);
    },
    setFromOn(key, on) {
      const off = access.read(this).exclude;
      access.write(this, { exclude: ACTIVITIES.map(a => a.key).filter(k => (k === key ? !on : off.includes(k))) });
    },
    /* the market board switch */
    marketOn() {
      return !!access.read(this).market;
    },
    setMarket(on) {
      access.write(this, { market: !!on });
    },
    /* "All", "None" or "Default" at the top of the menu */
    setFromAll(which) {
      access.write(this, { exclude: which === 'all' ? [] : which === 'none' ? ACTIVITIES.map(a => a.key) : [...DEFAULT_EXCLUDE] });
    },
    fromEmpty(key) {
      return (this.emptyBoxes || []).includes(key);
    },
    /* {label, text} for the line under the menu, or null with nothing pointed at */
    fromDescription() {
      const key = this.fromPointed;
      if (key === 'market')
        return { label: 'Market board', text: 'Any piece you can buy from another player shows, whatever its boxes say.' };
      const a = ACTIVITIES.find(x => x.key === key);
      if (!a) return null;
      const empty = this.fromEmpty(key) ? ' Nothing from it matches the job, level and item level filters right now.' : '';
      return { label: a.label, text: `${gearFromHint(a)}.${empty}` };
    },
  };
}

/* Component members for one Expansion filter (`part`: filterAccess): its `expOff` (EXPANSIONS short names switched off,
   oldest first): the list, the dropdown button's text ("All expansions", one name, or how many are on) and the toggles.
   Methods, not getters: the components spread this object, which would run a getter before Alpine binds it. */
export function expansionToggles(part) {
  const access = filterAccess(part);
  return {
    ...menuFloat,
    expansions: EXPANSIONS,
    expSummary() {
      const on = EXPANSIONS.filter(e => this.expShown(e.short));
      if (on.length === EXPANSIONS.length) return 'All expansions';
      if (!on.length) return 'None';
      return on.length === 1 ? on[0].name : `${on.length} expansions`;
    },
    expShown(short) {
      return !access.read(this).expOff.includes(short);
    },
    setExpShown(short, on) {
      const off = access.read(this).expOff.filter(k => k !== short);
      access.write(this, { expOff: on ? off : EXPANSIONS.map(e => e.short).filter(k => k === short || off.includes(k)) });
    },
  };
}
