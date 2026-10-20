/* How the math works: what sync does to one piece (views/sync-explainer.js), the step-by-step
   table for the same piece (views/piece.js), and the "How sync works" popup. */
import { explainerItemLevel, explainerOffText, explainerView } from '../views/sync-explainer.js';
import { pieceView, withSub } from '../views/piece.js';
import { rankChoices } from '../ranks.js';
import { syncSettings } from '../settings.js';
import { viewCache } from '../helpers.js';
import { SLOT_LABEL } from '../../core/constants.js';

/* The math tab's component (x-data on the whole tab): Piece stats' views and its controls in the math bar. */
export function syncExplainer() {
  // Piece stats' views and the settings they were built for (helpers.js viewCache), and the observer of the chart's
  // width, made when the chart first shows
  const views = viewCache();
  let observer = null;
  return {
    /* Piece stats' views for the settings now, built again only when they change: {pick (the slider's range and item
       level, explainerItemLevel), explainer, steps}. Read through the getters below. */
    get pieceViews() {
      const app = this.$store.app;
      const job = app.jobCtx,
        sync = syncSettings(app),
        piece = app.piece,
        goal = [app.opt.target, app.opt.tb, app.opt.tb2],
        width = this.widths.piece;
      const key = JSON.stringify([job.jobId, sync, piece.ilvl, piece.slot, piece.subs, goal, width]);
      return views.get(key, () => {
        const pick = explainerItemLevel(job, sync, piece);
        return { pick, explainer: explainerView(job, sync, piece, goal, { piece: width }), steps: pieceView(job, sync, piece, pick.il) };
      });
    },
    /* Piece stats' two panels (explainerView), or null while no sync applies; and its step-by-step section (pieceView).
       Named apart from the GCD and tiers sub-tabs' `view`, which sit inside this component's scope. */
    get explainer() {
      return this.pieceViews.explainer;
    },
    get steps() {
      return this.pieceViews.steps;
    },
    /* the Gear item level slider: its [lowest, highest] item level, the item level shown, and the slider's hover text */
    get ilvlRange() {
      return this.pieceViews.pick.range;
    },
    get il() {
      return this.pieceViews.pick.il;
    },
    get ilvlNote() {
      return this.pieceViews.pick.note;
    },
    helpOpen: false,
    /* the chosen job's JobContext ($store.app.jobCtx; $store.app.job is its id) */
    get jobCtx() {
      return this.$store.app.jobCtx;
    },
    /* what Piece stats says while no sync applies (views explainerOffText) */
    get offText() {
      return explainerOffText(this.$store.app.sync);
    },
    /* the math bar's Slot, 1st substat and 2nd substat menus: [value, label] */
    get slotOptions() {
      return this.jobCtx.activeSlotTypes.map(t => [t, SLOT_LABEL[t]]);
    },
    get substatOptions() {
      return this.jobCtx.substats.map(s => [s, this.jobCtx.label[s]]);
    },
    /* the 2nd substat's options: none, then every substat but the 1st (ui/ranks.js) */
    get substat2Options() {
      const subs = this.$store.app.piece.subs;
      return [['', 'none']].concat(rankChoices(subs, 1, this.jobCtx.substats).map(s => [s, this.jobCtx.label[s]]));
    },
    // the chart's container width (px): the chart is drawn at its own width, so its text keeps the page's size
    widths: { piece: 0 },
    /* The chart's box, each time it is drawn (x-init: it exists only while a view is shown): its width is followed. */
    observeChart(el) {
      observer ??= new ResizeObserver(entries => {
        for (const e of entries) {
          const w = Math.round(e.contentRect.width);
          if (w && w !== this.widths.piece) this.widths.piece = w;
        }
      });
      observer.observe(el);
    },
    setSub(i, value) {
      const p = this.$store.app.piece;
      p.subs = withSub(p.subs, i, value, this.jobCtx.substats);
    },
    setIlvl(value) {
      const v = Math.round(Number(value));
      if (Number.isFinite(v)) this.$store.app.piece.ilvl = Math.max(this.ilvlRange[0], Math.min(this.ilvlRange[1], v));
    },
    /* how far along its range the slider's thumb is (percent): the track is drawn filled up to it */
    get ilvlFill() {
      const [lo, hi] = this.ilvlRange;
      return hi > lo ? ((this.il - lo) / (hi - lo)) * 100 : 0;
    },
    resetIlvl() {
      this.$store.app.piece.ilvl = null;
    },
  };
}
