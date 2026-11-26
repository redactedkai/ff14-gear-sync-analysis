/* The page's one pattern for number boxes (numberBox) and the flash of a lowered cap field: DOM code,
   used by the elements only. */
import { commit, roundTo } from './number-commit.ts';

/* How long a typed number waits before it is committed: typing "123" commits once, not 1, 12 and 123, so the views
   (and the optimizer) do not recompute for the numbers on the way. */
export const TYPING_DEBOUNCE_MS = 300;

/* Flash a cap field the page just lowered (its `lowered` class, src/styles/gear-browser.css): the flash restarts on each lowering, by
   dropping the class, letting the browser see it gone, and adding it back. Used by the Job and sync panel's cap field and a sheet's page (elements/sheets/sheet-page.ts). `field`: the input, or nothing (no flash). */
export function flashLowered(field: HTMLElement | null | undefined): void {
  if (!field?.classList) {
    return;
  }
  field.classList.remove('flash');
  void field.offsetWidth;
  field.classList.add('flash');
}

/* A bound of numberBox: a number, or a function read at each input. */
type Bound = number | (() => number);

/* What a box shows or holds: a number, text (an emptied box) or nothing. */
type Shown = string | number | null | undefined;

/* What numberBox returns (below): a box's handlers, for the template. */
export interface NumberBox {
  onInput(event: Event): void;
  onChange(event: Event): void;
  shownValue(input: HTMLInputElement): Shown;
}

/* The options of numberBox (below). `Empty` is the type of the value an emptied box commits (`empty`). */
export interface NumberBoxOptions<Empty extends number | string> {
  live?: boolean;
  decimals?: number;
  empty?: Empty;
  onEmpty?: (input: HTMLInputElement) => void;
  snap?: boolean;
}
const bound = (b: Bound): number => (typeof b === 'function' ? b() : b);

/** The behaviour of one number box bound to a setting: the page's one pattern for number boxes. A Lit element uses it
   as it is (the `shownNumber` directive of elements/shared/number-box.ts shows `shownValue`, the template gives `onInput` and
   `onChange`). Boxes with another rule keep their own handlers: the GCD tab's level and speed correct what is typed and say so,
   and Piece stats' item level and the tiers' substat boxes commit only on change, since a value on the way would be held to its
   range while typing. Returns {onInput, onChange, shownValue, justWrote}:
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
     it follows (the tiers' level). */
export function numberBox<Empty extends number | string = never>(
  get: () => Shown,
  set: (value: number | Empty) => void,
  lo: Bound,
  hi: Bound,
  { live = false, decimals = 0, empty, onEmpty, snap = true }: NumberBoxOptions<Empty> = {},
): NumberBox {
  let timer = null as ReturnType<typeof setTimeout> | null;
  // the stored value the binding last showed (`has`: it has run), and whether the box has just written a value (until the page has
  // updated: the setting may end as it was, a typed 500 lowered to the old 135, and the box then shows that, not the typed text)
  let shown: { has: boolean; value: Shown } = { has: false, value: undefined };
  let justWrote = false;
  // the value the box last committed: until the page has updated, the stored value is still the old one, and a draw made in between
  // (the element's own, for the flag of the text typed) shows the typed text for it ("60.7" for the 61 on its way)
  let written: number | Empty | undefined;
  /* commits `raw`; on the final commit (change) an out-of-range value moves to the nearest bound, and `input` shows it */
  const commitText = (raw: string, input: HTMLInputElement | null = null) => {
    clearTimeout(timer as ReturnType<typeof setTimeout>);
    const result = commit(raw, { min: bound(lo), max: bound(hi), decimals, snap, exact: !snap, empty, final: input !== null });
    if (!result) {
      return;
    }
    if (result.clamped) {
      (input as HTMLInputElement).value = result.value as unknown as string; // the box turns the number into its text
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
    shownValue(input: HTMLInputElement) {
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
    onInput(e: Event) {
      const raw = (e.target as HTMLInputElement).value;
      clearTimeout(timer as ReturnType<typeof setTimeout>);
      // a step (mouse wheel, arrow keys, the spinner) is no InputEvent with an inputType: commit it at once, so the
      // page follows the value as it scrolls; typed digits wait, so "9" on the way to "90" is held back
      if (live || !(e as InputEvent).inputType) {
        commitText(raw);
      } else {
        timer = setTimeout(() => commitText(raw), TYPING_DEBOUNCE_MS);
      }
    },
    onChange(e: Event) {
      commitText((e.target as HTMLInputElement).value, e.target as HTMLInputElement);
      if ((e.target as HTMLInputElement).value === '' && onEmpty) {
        onEmpty(e.target as HTMLInputElement);
      }
    },
  };
}
