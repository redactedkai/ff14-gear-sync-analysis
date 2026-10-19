/* How the math works: what sync does to one piece (views/sync-explainer.js), the step-by-step
   table for the same piece (views/piece.js), and the "How sync works" popup. */
import Alpine from 'alpinejs';
import { explainerItemLevel, explainerView } from '../views/sync-explainer.js';
import { pieceView, withSub } from '../views/piece.js';
import { rankChoices } from '../views/ranks.js';
import { SLOT_LABEL } from '../../core/constants.js';

export function syncExplainer() {
  return {
    view: null,
    calc: null,
    range: [1, 1],
    il: 1,
    rangeNote: '',
    helpOpen: false,
    /* the chosen job's JobContext ($store.app.jobCtx; $store.app.job is its id) */
    get jobCtx() {
      return this.$store.app.jobCtx;
    },
    /* the math bar's Slot, 1st substat and 2nd substat menus: [value, label] */
    get slotOptions() {
      return this.jobCtx.activeSlotTypes.map(t => [t, SLOT_LABEL[t]]);
    },
    get substatOptions() {
      return this.jobCtx.substats.map(s => [s, this.jobCtx.label[s]]);
    },
    /* the 2nd substat's options: none, then every substat but the 1st (views/ranks.js) */
    get substat2Options() {
      const subs = this.$store.app.piece.subs;
      return [['', 'none']].concat(rankChoices(subs, 1, this.jobCtx.substats).map(s => [s, this.jobCtx.label[s]]));
    },
    // the chart's container width (px): the chart is drawn at its own width, so its text keeps the page's size
    widths: { piece: 0 },
    init() {
      const observer = new ResizeObserver(entries => {
        for (const e of entries) {
          const w = Math.round(e.contentRect.width);
          if (w && w !== this.widths.piece) this.widths.piece = w;
        }
      });
      Alpine.effect(() => {
        const app = this.$store.app;
        const pick = explainerItemLevel(app);
        this.range = pick.range;
        this.il = pick.il;
        this.rangeNote = pick.note;
        this.view = explainerView(app, { piece: this.widths.piece });
        this.calc = pieceView(app, pick.il);
        // the chart boxes exist only while a view is shown: watch whichever are there after this render
        this.$nextTick(() =>
          this.$root.querySelectorAll('#tab-piece .chartbox').forEach(el => {
            observer.observe(el);
          }),
        );
      });
    },
    setSub(i, value) {
      const p = this.$store.app.piece;
      p.subs = withSub(p.subs, i, value, this.jobCtx.substats);
    },
    setIlvl(value) {
      const v = Math.round(Number(value));
      if (Number.isFinite(v)) this.$store.app.piece.ilvl = Math.max(this.range[0], Math.min(this.range[1], v));
    },
    /* how far along its range the slider's thumb is (percent): the track is drawn filled up to it */
    get rangeFill() {
      const [lo, hi] = this.range;
      return hi > lo ? ((this.il - lo) / (hi - lo)) * 100 : 0;
    },
    resetIlvl() {
      this.$store.app.piece.ilvl = null;
    },
  };
}
