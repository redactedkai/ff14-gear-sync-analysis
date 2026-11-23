/* The page's one pattern for number boxes (numberField, storeNumberField) and the flash of a lowered cap field: DOM code,
   used by the components only. */
import { clamp } from '../core/clamp.js';

/* How long a typed number waits before it is committed: typing "123" commits once, not 1, 12 and 123, so the views
   (and the optimizer) do not recompute for the numbers on the way. */
export const TYPING_DEBOUNCE_MS = 300;

/* Flash a cap field the page just lowered (its `lowered` class, src/styles/gear-browser.css): the flash restarts on each lowering, by
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
   - snap: false keeps an out-of-range value out on change too, and a value with more digits than the box takes (1.5 in a
     whole-number box: not rounded to 2), for a box that explains it (the sync cap's error).
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
    if (!snap && round(v) !== v) return; // more digits than the box takes: kept out, not rounded
    const low = bound(lo),
      high = bound(hi);
    if (v < low || v > high) {
      if (!input || !snap) return;
      v = clamp(v, low, high);
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
