/* Small presentation helpers shared by the components. */

export const fmtInt = n => n.toLocaleString();
export const pct0 = (part, whole) => ((100 * part) / whole).toFixed(0) + '%';

/* A table cell for a stat: "raw→synced" in the clamp colour when sync cuts it, dimmed when zero. */
export function statCell(raw, synced) {
  raw = raw || 0;
  synced = synced || 0;
  return synced < raw ? { text: `${raw}→${synced}`, cls: 'n clamp' } : { text: String(raw), cls: raw ? 'n' : 'n dim' };
}

/* x-bind object for a number input that only commits whole, in-range values (out-of-range typing is ignored,
   not corrected). While the field has focus and already shows the stored value, the typed text is left alone. */
export function numberField(get, set, lo, hi) {
  return {
    ':value'() {
      const v = get(),
        el = this.$el;
      return el === document.activeElement && Math.round(+el.value) === v ? el.value : v;
    },
    '@input'(e) {
      const raw = e.target.value,
        v = +raw;
      if (raw !== '' && v >= lo && v <= hi) set(Math.round(v));
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
