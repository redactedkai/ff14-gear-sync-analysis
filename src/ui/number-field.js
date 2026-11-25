/* The page's one pattern for number boxes (numberBox, numberField, storeNumberField) and the flash of a lowered cap field: DOM code,
   used by the components only. */
import { commit, roundTo } from './number-commit.js';

/* How long a typed number waits before it is committed: typing "123" commits once, not 1, 12 and 123, so the views
   (and the optimizer) do not recompute for the numbers on the way. */
export const TYPING_DEBOUNCE_MS = 300;

/* Flash a cap field the page just lowered (its `lowered` class, src/styles/gear-browser.css): the flash restarts on each lowering, by
   dropping the class, letting the browser see it gone, and adding it back. Used by the Job and sync panel (page.js
   lowerCap) and a sheet's page (elements/sheets/sheet-page.ts). `field`: the input, or nothing (no flash). */
export function flashLowered(field) {
  if (!field?.classList) {
    return;
  }
  field.classList.remove('flash');
  void field.offsetWidth;
  field.classList.add('flash');
}

/* A bound of numberField: a number, or a function read at each input. */
const bound = b => (typeof b === 'function' ? b() : b);

/** The behaviour of one number box bound to a setting: the page's one pattern for number boxes (as $num, storeNumberField),
   in two shapes. `numberField` (below) puts it in an Alpine x-bind object; a Lit element uses it as it is (the `shownNumber`
   directive of elements/shared/number-box.ts shows `shownValue`, the template gives `onInput` and `onChange`). Returns {onInput,
   onChange, shownValue, justWrote}:
   - onInput(event) and onChange(event): the box's `input` and `change` events (only `event.target` and `event.inputType` are read);
   - shownValue(input): what the box shows, given the input element: the stored value, or the typed text while it still means that value;
   - justWrote(): whether the box has just written a value (until the page has updated).
   A step (mouse wheel, arrow keys) commits at once; typing commits TYPING_DEBOUNCE_MS after the last
   keystroke, and only an in-range value, so a value on the way ("9" of "90") is held back. Enter or leaving the field
   (change) commits at once, and an out-of-range value is moved to the nearest bound and shown in the box, so the box
   and the setting always agree (owner: "-5" in a filter becomes its lowest value, not "no limit"). While
   the field has focus and already shows the stored value, the typed text is left alone ("2.40" stays as typed); so is it when
   the binding runs again with the stored value unchanged ("60.7" typed for 61 stays after the box is left). A bound
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
   @param {() => unknown} get
   @param {(value: any) => void} set
   @param {number | (() => number)} lo
   @param {number | (() => number)} hi
   @param {{ live?: boolean, decimals?: number, empty?: unknown, onEmpty?: (input: any) => void, snap?: boolean }} [options] */
export function numberBox(get, set, lo, hi, { live = false, decimals = 0, empty, onEmpty, snap = true } = {}) {
  let timer = null;
  // the stored value the binding last showed (`has`: it has run), and whether the box has just written a value (until the page has
  // updated: the setting may end as it was, a typed 500 lowered to the old 135, and the box then shows that, not the typed text)
  let shown = { has: false, value: undefined };
  let justWrote = false;
  // the value the box last committed: until the page has updated, the stored value is still the old one, and a draw made in between
  // (the element's own, for the flag of the text typed) shows the typed text for it ("60.7" for the 61 on its way)
  let written;
  /* commits `raw`; on the final commit (change) an out-of-range value moves to the nearest bound, and `input` shows it */
  const commitText = (raw, input = null) => {
    clearTimeout(timer);
    const result = commit(raw, { min: bound(lo), max: bound(hi), decimals, snap, exact: !snap, empty, final: input !== null });
    if (!result) {
      return;
    }
    if (result.clamped) {
      input.value = result.value;
    }
    if (result.value !== get()) {
      set(result.value);
      written = result.value;
      justWrote = true;
      queueMicrotask(() => {
        justWrote = false;
      });
    }
  };
  return {
    shownValue(input) {
      const v = get();
      // the binding also runs when another setting read from the same part of the store changed (a Gear categories box changes
      // the Gear browser's filters): the box then keeps what was typed ("60.7" for the stored 61); it shows the stored value
      // only when that changed
      const unchanged = shown.has && Object.is(v, shown.value) && !justWrote;
      shown = { has: true, value: v };
      if (unchanged) {
        return input.value;
      }
      const typedMeans = roundTo(Number(input.value), decimals);
      const keepsTyped = typedMeans === v || (justWrote && typedMeans === written);
      return input === document.activeElement && keepsTyped ? input.value : v;
    },
    onInput(e) {
      const raw = e.target.value;
      clearTimeout(timer);
      // a step (mouse wheel, arrow keys, the spinner) is no InputEvent with an inputType: commit it at once, so the
      // page follows the value as it scrolls; typed digits wait, so "9" on the way to "90" is held back
      if (live || !e.inputType) {
        commitText(raw);
      } else {
        timer = setTimeout(() => commitText(raw), TYPING_DEBOUNCE_MS);
      }
    },
    onChange(e) {
      commitText(e.target.value, e.target);
      if (e.target.value === '' && onEmpty) {
        onEmpty(e.target);
      }
    },
  };
}

/* x-bind object for a number input bound to a setting (numberBox, for Alpine); options as for numberBox.
   The box's `min` and `max` attributes (where the arrow keys stop) come from `lo` and `hi`, so the markup does not
   write them again. A bound of Infinity sets no attribute: a filter that takes any number as typed keeps the `max`
   its markup gives it, the end of the real range, for the arrow keys only.
   Boxes with another rule keep their own handlers: the GCD tab's level and speed correct what is typed and say so,
   and Piece stats' item level and the tiers' substat boxes commit only on change, since a value on the way would be
   held to its range while typing. */
export function numberField(get, set, lo, hi, options = {}) {
  const box = numberBox(get, set, lo, hi, options);
  // the min and max attributes from the bounds: a function is read at each render, Infinity sets none
  const attribute = (name, b) => (typeof b === 'function' || Number.isFinite(b) ? { [name]: () => bound(b) } : {});
  return {
    ...attribute(':min', lo),
    ...attribute(':max', hi),
    ':value'() {
      return box.shownValue(this.$el);
    },
    '@input': box.onInput,
    '@change': box.onChange,
  };
}

/* numberField bound to a dotted path in the store, e.g. storeNumberField(app, 'piece.ilvl', 1, 795); options as for
   numberField. The value is read from the store along the path and written by `store.setField(path, value)`, the store's one
   action for a number box (ui/store/app-facade.ts). Registered as the $num magic in main.js. */
export function storeNumberField(store, path, lo, hi, options = {}) {
  const keys = path.split('.');
  return numberField(
    () => keys.reduce((holder, key) => holder[key], store),
    value => store.setField(path, value),
    lo,
    hi,
    options,
  );
}
