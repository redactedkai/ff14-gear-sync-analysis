/* The math tab's Alpine component: what the page still runs by Alpine of How the math works. It gives the three elements of the tab
   their settings (the math bar, elements/math-page/math-bar.ts, with its Sync settings chip and popover; Stat Allocation,
   elements/math-page/piece-stats.ts) and takes the edits they send. */
import { levelSyncCap, mathJobOwner, syncSettings } from '../job-sync-panel.js';

/* The example piece as a plain object for an element (a new one each time, so the element sees a change): `piece` is the store's. */
function examplePiece(piece) {
  return { ilvl: piece.ilvl, slot: piece.slot, subs: [...piece.subs], slots: piece.slots };
}

/* The math tab's component (x-data on the whole tab). */
export function syncExplainer() {
  return {
    /* the id of the job the open sub-tab edits (Stat Allocation's or Substat tiers'): what the Job menu element shows */
    get mathJob() {
      return this.$store.app.panel(mathJobOwner(this.$store.app.mathTab)).job;
    },
    /* a pick in the Job menu: switch that job (job-specific settings reset: resetForJob; nothing else is lost, so no confirmation) */
    setMathJob(id) {
      this.$store.app.setJob(id, mathJobOwner(this.$store.app.mathTab));
    },
    /* The IL Sync switch of this tab was changed by the user (the element's `sync-change` event; never a watcher on `sync`, which
       also fires when a tab change swaps the panel and would break the tabs' isolation). Switched off: the stored cap becomes the
       item level level sync gives at the open level, or no cap where no level sync applies. Switched on: nothing is copied; the box
       shows the stored cap. */
    setMathSync(on) {
      const app = this.$store.app;
      app.editPanel({ sync: on });
      if (!on) {
        app.editPanel({ cap: levelSyncCap(app.jobCtx, app.level) });
      }
    },
    /* what the math bar element shows (`<gsa-math-bar>`'s properties): the open sub-tab, the Job menu's job, the settings of the
       three sub-tabs' controls, and the panel the Sync settings popover edits */
    get barInput() {
      const app = this.$store.app;
      const panel = app.panel('math');
      return {
        tab: app.mathTab,
        jobId: this.mathJob,
        pieceJob: panel.job,
        sync: syncSettings(panel),
        syncPanel: { cap: panel.cap, level: panel.level, on: Boolean(panel.sync) },
        openTab: app.tab,
        levelScope: `${app.tab} ${app.job}`,
        maxReal: app.maxReal,
        piece: examplePiece(app.piece),
        gcd: { level: app.gcd.level, haste: app.gcd.haste, speed: app.gcd.speed, syncedLevel: panel.level },
        tiers: { job: app.panel('tiers').job, level: app.tiers.level },
      };
    },
    /* what Stat Allocation's element shows (`<gsa-piece-stats>`'s properties) */
    get pieceInput() {
      const app = this.$store.app;
      const panel = app.panel('math');
      return { job: panel.job, sync: syncSettings(panel), piece: examplePiece(app.piece), switchOn: Boolean(panel.sync) };
    },
  };
}
