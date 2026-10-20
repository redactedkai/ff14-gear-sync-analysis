/* Small presentation helpers shared by the components. */
import { ACTIVITIES, EXPANSIONS } from '../core/constants.js';
import { CURRENT_TOMES, MAX_LEVEL } from '../core/tables.js';
import { DEFAULT_EXCLUDE } from './state.js';

/* A whole number with en-US thousands separators ("1,234"), whatever the browser's locale: in a German browser
   "1.234" would read like a decimal next to GCDs such as "2.48s". The Defense row formats the same way. */
export const fmtInt = n => n.toLocaleString('en-US');

/* How long a typed number waits before it is committed: typing "123" commits once, not 1, 12 and 123, so the views
   (and the optimizer) do not recompute for the numbers on the way. */
export const TYPING_DEBOUNCE_MS = 300;

/* A bound of numberField: a number, or a function read at each input. */
const bound = b => (typeof b === 'function' ? b() : b);

/* x-bind object for a number input bound to a setting: the page's one pattern for number boxes (as $num,
   storeNumberField). Typing commits TYPING_DEBOUNCE_MS after the last keystroke, and only an in-range value, so a
   value on the way ("9" of "90") is held back. Enter or leaving the field (change) commits at once, and an out-of-range
   value is moved to the nearest bound and shown in the box, so the box and the setting always agree (owner,
   2026-10-19: "-5" in a filter becomes its lowest value, not "no limit"). While the field has focus and already shows
   the stored value, the typed text is left alone ("2.40" stays as typed). A bound may be a function, read at each
   input, for a limit that changes while the field is bound (the job's level cap). Options:
   - snap: false keeps an out-of-range value out on change too, for a box that explains it (the sync cap's error).
   - live: commit each valid value as it is typed, with no wait (the synced level: owner, 2026-10-17); typing "90" then
     shows level 9 for a moment, which is cheap, and the optimizer has its own wait.
   - decimals: the digits kept after the point (0, whole numbers, by default; the Target GCD keeps 2).
   - empty: the value an emptied box commits, as it is typed (a filter's '' for no limit); left out, an empty box
     commits nothing.
   - onEmpty(input): called when an empty box is left or entered (change), for a field that then goes back to a value
     it follows (the tiers' level).
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
  return {
    ':value'() {
      const v = get(),
        el = this.$el;
      return el === document.activeElement && round(+el.value) === v ? el.value : v;
    },
    '@input'(e) {
      const raw = e.target.value;
      clearTimeout(timer);
      if (live) commit(raw);
      else timer = setTimeout(() => commit(raw), TYPING_DEBOUNCE_MS);
    },
    '@change'(e) {
      commit(e.target.value, e.target);
      if (e.target.value === '' && onEmpty) onEmpty(e.target);
    },
  };
}

/* Run `compute` now and whenever the reactive values it reads change, at most once per `ms`. */
export function debouncedEffect(Alpine, compute, ms) {
  let timer = null;
  Alpine.effect(() => {
    const run = compute(); // reads (and so tracks) dependencies synchronously
    clearTimeout(timer);
    timer = setTimeout(run, ms); // the expensive part runs later, untracked
  });
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

/* The "Gear from" menu's two columns of sections (owner's layout, 2026-10-18): each {key, sections: [{title, boxes}]},
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
const CAP_PATCH = `${EXPANSIONS.findIndex(e => e[2] === MAX_LEVEL) + 2}.x`;

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

/* Component members for one "Gear from" filter: `$store.app[part].exclude` (ACTIVITIES keys left out, in ACTIVITIES
   order) and `$store.app[part].market` (the market board switch). The component provides `emptyBoxes`, the keys with
   nothing for the current job and filters (greyed out). `fromPointed` is the box (or 'market') under the pointer or
   keyboard focus, described under the menu. Methods, not getters (see expansionToggles). */
export function gearFromToggles(part) {
  return {
    gearFromColumns: GEAR_FROM_COLUMNS,
    fromPointed: null,
    fromSummary() {
      return gearFromSummary(this.$store.app[part].exclude, this.$store.app[part].market);
    },
    fromOn(key) {
      return !this.$store.app[part].exclude.includes(key);
    },
    setFromOn(key, on) {
      const off = this.$store.app[part].exclude;
      this.$store.app[part].exclude = ACTIVITIES.map(a => a.key).filter(k => (k === key ? !on : off.includes(k)));
    },
    /* Opened near the window's right edge, the menu would make the page scroll sideways: it then opens leftwards, its
       right edge on the button's. */
    fitFromMenu(menu) {
      if (!menu) return;
      menu.classList.remove('to-left');
      if (menu.getBoundingClientRect().right > document.documentElement.clientWidth - 8) menu.classList.add('to-left');
    },
    /* "All", "None" or "Default" at the top of the menu */
    setFromAll(which) {
      this.$store.app[part].exclude = which === 'all' ? [] : which === 'none' ? ACTIVITIES.map(a => a.key) : [...DEFAULT_EXCLUDE];
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

/* Component members for one Expansion filter, `$store.app[part].expOff` (EXPANSIONS short names switched off, oldest
   first): the list, the dropdown button's text ("All expansions", one name, or how many are on) and the toggles.
   Methods, not getters: the components spread this object, which would run a getter before Alpine binds it. */
export function expansionToggles(part) {
  return {
    expansions: EXPANSIONS.map(([short, name]) => [short, name]),
    expSummary() {
      const on = EXPANSIONS.filter(e => this.expShown(e[0]));
      if (on.length === EXPANSIONS.length) return 'All expansions';
      if (!on.length) return 'None';
      return on.length === 1 ? on[0][1] : `${on.length} expansions`;
    },
    expShown(short) {
      return !this.$store.app[part].expOff.includes(short);
    },
    setExpShown(short, on) {
      const off = this.$store.app[part].expOff.filter(k => k !== short);
      this.$store.app[part].expOff = on ? off : EXPANSIONS.map(e => e[0]).filter(k => k === short || off.includes(k));
    },
  };
}
