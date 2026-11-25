/* The math tab's Alpine component: what the page still runs by Alpine of How the math works. The Sync settings chip with its Level and
   Synced IL boxes (the cap field's rules, shared with the Gear browser's strip until the shared cap and level fields), and the
   settings it gives the two elements of the tab: the math bar (elements/math-page/math-bar.ts) and Stat Allocation
   (elements/math-page/piece-stats.ts). */
import { MAX_LEVEL } from '../../core/tables.js';
import { SYNC_CHIP_SIZERS, SYNC_CHIP_TEXT, capGuessText, syncChipView, widestNumber } from '../views/sync-explainer.js';
import { levelSyncCap, mathJobOwner, syncSettings } from '../job-sync-panel.js';
import { numberField } from '../number-field.js';
import { capControls, levelControls } from './cap-controls.js';
import { LEVEL_TEXT, rangeOnly, rangeText } from '../level-cap.js';
import { compose } from './compose.js';

/* The example piece as a plain object for an element (a new one each time, so the element sees a change): `piece` is the store's. */
function examplePiece(piece) {
  return { ilvl: piece.ilvl, slot: piece.slot, subs: [...piece.subs], slots: piece.slots };
}

/* The math tab's component (x-data on the whole tab). */
export function syncExplainer() {
  return compose(
    {
      init() {
        this.initCap(); // the Synced IL box's rules (cap-controls.js)
        this.initLevel(); // the Level box's validation (cap-controls.js)
        // the Level box: each valid level counts as it is typed (as the Gear browser strip's), and while IL Sync is off the
        // stored cap follows the level (store.followLevelSync): the box's own commit, not a watcher
        const app = this.$store.app;
        this.levelBind = numberField(
          () => app.level,
          level => {
            app.editPanel({ level });
            app.followLevelSync();
          },
          1,
          () => app.jobCtx.maxLevel,
          { live: true, snap: false }, // a bad level stays in the box, flagged, not moved to the nearest one
        );
      },
      levelBind: null,
      // the Level box's range and error texts (level-cap.js), and its widest flag for the hidden label row
      levelText: LEVEL_TEXT,
      get levelFlagSizer() {
        return rangeOnly(LEVEL_TEXT.range(this.widestLevel));
      },
      get capFlagSizer() {
        return rangeOnly(rangeText(this.widestItemLevel));
      },
      /* the highest level of any job: the Level box's hidden label row is written at this limit, so the box does not change
         with the job */
      levelLimitAny: MAX_LEVEL,
      /* the widest numbers the label rows can show, as wide as the limits (views widestNumber) */
      get widestItemLevel() {
        return widestNumber(this.$store.app.maxReal);
      },
      get widestLevel() {
        return widestNumber(this.levelLimitAny);
      },
      /* The IL Sync switch of this tab was changed by the user (its change event; never a watcher on `sync`, which also
         fires when a tab change swaps the panel and would break the tabs' isolation). Switched off: the stored cap becomes
         the item level level sync gives at the open level, or no cap where no level sync applies. Switched on: nothing is
         copied; the box shows the stored cap. Any bad text left in the box is dropped. */
      onSyncSwitch(on) {
        const app = this.$store.app;
        this.capTypedBad = false;
        if (!on) {
          app.editPanel({ cap: levelSyncCap(app.jobCtx, app.level) });
        }
      },
      /* the Synced IL box's guess tooltip while the item level shown is level sync's for a weapon or off-hand (views
         capGuessText), else '' */
      get capGuess() {
        const panel = this.$store.app.panel('math');
        return capGuessText(panel.jobCtx, syncSettings(panel), this.$store.app.piece.slot);
      },
      /* the Synced IL field's tooltip: the flag's sentence (error, lowered), else the guess text; `range` is "1–795" */
      capTitle(range) {
        return this.capFlag(range).full || this.capGuess;
      },
      /* The Sync settings chip: one control in the bar that says the synced level, the synced item level and whether IL Sync
         is on, in a few words (views syncChipView), and opens a popover under the chip with Level, Synced IL and the IL Sync
         switch (the store's level, cap and sync, as the Gear browser's strip edits them). A <gsa-bar-popover>: opening puts
         the focus on the Level box (closing it drops text that is no level or cap: clearTypedErrors); Escape and the chip close
         it with the focus back on the chip; a click outside or Tab out of it closes it where the focus went. */
      syncText: SYNC_CHIP_TEXT,
      syncChipSizers: SYNC_CHIP_SIZERS,
      get syncChip() {
        const panel = this.$store.app.panel('math');
        const loweredFrom = this.capLowered && this.capLowered.to === panel.cap ? this.capLowered.from : null;
        return syncChipView(panel.jobCtx, syncSettings(panel), this.$store.app.piece.slot, {
          switchOn: Boolean(panel.sync),
          loweredFrom,
          capMissing: Boolean(panel.sync) && panel.cap == null,
        });
      },
      /* the Level and Synced IL boxes show the store's values again, dropping what they hold that is no level or cap */
      clearTypedErrors() {
        this.levelTypedBad = false;
        this.capTypedBad = false;
        this.$nextTick(() => {
          const app = this.$store.app;
          if (this.$refs.level) {
            this.$refs.level.value = app.level ?? '';
          }
          if (this.$refs.cap) {
            this.$refs.cap.value = app.cap ?? '';
          }
        });
      },
    },
    capControls('math'),
    levelControls(),
    {
      /* the id of the job the open sub-tab edits (Stat Allocation's or Substat tiers'): what the Job menu element shows */
      get mathJob() {
        return this.$store.app.panel(mathJobOwner(this.$store.app.mathTab)).job;
      },
      /* a pick in the Job menu: switch that job (job-specific settings reset: resetForJob; nothing else is lost, so no confirmation) */
      setMathJob(id) {
        this.$store.app.setJob(id, mathJobOwner(this.$store.app.mathTab));
      },
      /* what the math bar element shows (`<gsa-math-bar>`'s properties): the open sub-tab, the Job menu's job, and the settings of the
         three sub-tabs' controls */
      get barInput() {
        const app = this.$store.app;
        const panel = app.panel('math');
        return {
          tab: app.mathTab,
          jobId: this.mathJob,
          pieceJob: panel.job,
          sync: syncSettings(panel),
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
    },
  );
}
