/* How the math works: what sync does to one piece and to a full set's GCD (views/sync-explainer.js), the step-by-step
   table for the same piece (views/piece.js), and the "How sync works" popup. */
import Alpine from 'alpinejs';
import { explainerItemLevel, explainerView } from '../views/sync-explainer.js';
import { pieceView, withSub } from '../views/piece.js';
import { capOutOfRange, capRangeMessage } from '../state.js';

export function syncExplainer() {
  return {
    view: null,
    calc: null,
    range: [1, 1],
    il: 1,
    rangeNote: '',
    helpOpen: false,
    // a cap no duty pairs with the synced level: the tab shows the message instead of its panels
    capOutOfRange,
    capRangeMessage,
    // the charts' container widths (px): each chart is drawn at its own width, so its text keeps the page's size
    widths: { piece: 0, gcd: 0 },
    init() {
      const observer = new ResizeObserver(entries => {
        for (const e of entries) {
          const key = e.target.id === 'g-chart' ? 'gcd' : 'piece';
          const w = Math.round(e.contentRect.width);
          if (w && w !== this.widths[key]) this.widths[key] = w;
        }
      });
      Alpine.effect(() => {
        const app = this.$store.app;
        const pick = explainerItemLevel(app);
        this.range = pick.range;
        this.il = pick.il;
        this.rangeNote = pick.note;
        this.view = explainerView(app, { piece: this.widths.piece, gcd: this.widths.gcd });
        this.calc = pieceView(app, pick.il);
        // the chart boxes exist only while a view is shown: watch whichever are there after this render
        this.$nextTick(() =>
          this.$root.querySelectorAll('.chartbox').forEach(el => {
            observer.observe(el);
          }),
        );
      });
    },
    setSub(i, value) {
      const p = this.$store.app.piece;
      p.subs = withSub(p.subs, i, value, this.job.substats);
    },
    setIlvl(value) {
      const v = Math.round(Number(value));
      if (Number.isFinite(v)) this.$store.app.piece.ilvl = Math.max(this.range[0], Math.min(this.range[1], v));
    },
    resetIlvl() {
      this.$store.app.piece.ilvl = null;
    },
  };
}
