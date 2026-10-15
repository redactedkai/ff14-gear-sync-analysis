/* Small presentation helpers shared by the components. */
import { EXPANSIONS, SOURCES } from '../core/constants.js';

export const fmtInt = n => n.toLocaleString();
export const pct0 = (part, whole) => ((100 * part) / whole).toFixed(0) + '%';

/* A table cell for a stat: "raw→synced" in the clamp colour when sync cuts it, dimmed when zero. */
export function statCell(raw, synced) {
  raw = raw || 0;
  synced = synced || 0;
  return synced < raw ? { text: `${raw}→${synced}`, cls: 'n clamp' } : { text: String(raw), cls: raw ? 'n' : 'n dim' };
}

/* How long a typed number waits before it is committed: typing "123" commits once, not 1, 12 and 123, so the views
   (and the optimizer) do not recompute for the numbers on the way. */
export const TYPING_DEBOUNCE_MS = 300;

/* x-bind object for a number input that only commits whole, in-range values (out-of-range typing is ignored,
   not corrected). Typing commits TYPING_DEBOUNCE_MS after the last keystroke; Enter or leaving the field (change)
   commits at once. While the field has focus and already shows the stored value, the typed text is left alone. A bound
   may be a function, read at each input, for a limit that changes while the field is bound (the job's level cap). */
const bound = b => (typeof b === 'function' ? b() : b);
export function numberField(get, set, lo, hi) {
  let timer = null;
  const commit = raw => {
    clearTimeout(timer);
    const v = +raw;
    if (raw !== '' && v >= bound(lo) && v <= bound(hi) && Math.round(v) !== get()) set(Math.round(v));
  };
  return {
    ':value'() {
      const v = get(),
        el = this.$el;
      return el === document.activeElement && Math.round(+el.value) === v ? el.value : v;
    },
    '@input'(e) {
      const raw = e.target.value;
      clearTimeout(timer);
      timer = setTimeout(() => commit(raw), TYPING_DEBOUNCE_MS);
    },
    '@change'(e) {
      commit(e.target.value);
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

/* numberField bound to a dotted path in the store, e.g. storeNumberField(store, 'piece.ilvl', 1, 795).
   Registered as the $num magic in main.js. */
export function storeNumberField(store, path, lo, hi) {
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
  );
}

/* The gear groups as checkboxes, ticked = searched or listed: {key, label}, in SOURCES order. Current Savage names its
   patch series ("Current Savage (7.x)"): it is the newest expansion's Savage gear, and the expansions' patch series
   start at 2.x (A Realm Reborn). */
export const GEAR_GROUPS = SOURCES.map(s => ({
  key: s.key,
  label: s.key === 'savage' ? `${s.label} (${EXPANSIONS.length + 1}.x)` : s.label,
}));

/* Component methods for one gear-group list, `$store.app[part].exclude` (SOURCES keys left out, in SOURCES order). */
export function gearGroupToggles(part) {
  return {
    gearGroups: GEAR_GROUPS,
    groupOn(key) {
      return !this.$store.app[part].exclude.includes(key);
    },
    setGroup(key, on) {
      const ex = this.$store.app[part].exclude;
      this.$store.app[part].exclude = SOURCES.map(s => s.key).filter(k => (k === key ? !on : ex.includes(k)));
    },
  };
}
