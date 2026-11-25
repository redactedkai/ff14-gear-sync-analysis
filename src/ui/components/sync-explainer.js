/* How the math works: what sync does to one piece (views/sync-explainer.js), the step-by-step
   table for the same piece (views/piece.js), and the sync help popup. */
import { MAX_LEVEL } from '../../core/tables.js';
import {
  IL_BOX_SIZER,
  IL_CONTROL_TEXT,
  NO_SUBSTAT_LABEL,
  PIECE_CHIP_SIZERS,
  PIECE_CHIP_TEXT,
  SUBSTAT_SIZER,
  SYNC_CHIP_SIZERS,
  SYNC_CHIP_TEXT,
  capGuessText,
  explainerItemLevel,
  explainerOffText,
  explainerView,
  pieceChipView,
  syncChipView,
  widestNumber,
} from '../views/sync-explainer.js';
import { SLOT_SIZER, pieceView, slotGroups, withSub } from '../views/piece.js';
import { rankChoices } from '../ranks.js';
import { levelSyncCap, mathJobOwner, meldSlotChoices, meldSlotsOf, syncSettings } from '../job-sync-panel.js';
import { numberField } from '../number-field.js';
import { viewCache } from '../view-cache.ts';
import { capControls, levelControls } from './cap-controls.js';
import { LEVEL_TEXT, rangeOnly, rangeText } from '../level-cap.js';
import { compose } from './compose.js';

/* The math tab's component (x-data on the whole tab): Piece stats' views, and the bar's Job menu and Stat Allocation's
   controls (its two chips and the item level slider). */
export function syncExplainer() {
  // Piece stats' views and the settings they were built for (view-cache.ts viewCache), and the observer of the chart's
  // width, made when the chart first shows
  const views = viewCache();
  let observer = null;
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
      // the Gear item level control's label and the number box's widest text
      ilText: IL_CONTROL_TEXT,
      ilBoxSizer: IL_BOX_SIZER,
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
      /* Piece stats' views for the settings now, built again only when they change: {pick (the slider's range and item
         level, explainerItemLevel), explainer, steps}. Read through the getters below. */
      get pieceViews() {
        const app = this.$store.app;
        const panel = app.panel('math'),
          job = panel.jobCtx,
          sync = syncSettings(panel),
          piece = app.piece,
          width = this.widths.piece;
        const key = JSON.stringify([job.jobId, sync, piece.ilvl, piece.slot, piece.subs, meldSlotsOf(piece), width]);
        return views.get(key, () => {
          const pick = explainerItemLevel(job, sync, piece);
          return { pick, explainer: explainerView(job, sync, piece, { piece: width }), steps: pieceView(job, sync, piece, pick.il) };
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
      /* the job chosen in the math tab's own Job and sync panel (JobContext) */
      get jobCtx() {
        return this.$store.app.panel('math').jobCtx;
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
      /* what Piece stats says while no sync applies (views explainerOffText) */
      get offText() {
        return explainerOffText(this.$store.app.panel('math').sync);
      },
      /* the math bar's Slot menu: one choice per group of slots that share a budget share ({value, label, slots}), and the
         1st substat and 2nd substat menus: [value, label] */
      slotSizer: SLOT_SIZER, // every text of the Slot menu, one per line: its width (views SLOT_SIZER)
      get slotOptions() {
        return slotGroups(this.jobCtx);
      },
      /* the value of the Slot menu's choice: the group the open piece's slot is in */
      get slotValue() {
        const slot = this.$store.app.piece.slot;
        return this.slotOptions.find(option => option.slots.includes(slot))?.value ?? '';
      },
      /* the Materia slots menu: the totals the chosen slot's pieces have, the one shown, and a change of slot (a choice the
         new slot's pieces do not have goes back to the slot's usual total) */
      get slotCounts() {
        return meldSlotChoices(this.$store.app.piece.slot);
      },
      get slotsShown() {
        return meldSlotsOf(this.$store.app.piece);
      },
      setSlot(slotType) {
        const app = this.$store.app;
        app.editPiece(meldSlotChoices(slotType).includes(app.piece.slots) ? { slot: slotType } : { slot: slotType, slots: null });
      },
      /* The Substats & materia chip: one control in the bar that says the 1st and 2nd substat and the Materia slots in a few
         words (views pieceChipView) and opens a popover under the chip with the three menus. The texts, and the widest of its
         words for the hidden copies that give the chip one width (views PIECE_CHIP_TEXT, PIECE_CHIP_SIZERS). The popover is
         a <gsa-bar-popover> (elements/math-page/bar-popover.ts): opening puts the focus on the 1st substat menu; Escape and the
         chip close it with the focus back on the chip; a click outside or Tab out of it closes it where the focus went. */
      pieceText: PIECE_CHIP_TEXT,
      pieceChipSizers: PIECE_CHIP_SIZERS,
      get pieceChip() {
        return pieceChipView(this.jobCtx, this.$store.app.piece);
      },
      /* The Sync settings chip: one control in the bar that says the synced level, the synced item level and whether IL Sync
         is on, in a few words (views syncChipView), and opens a popover under the chip with Level, Synced IL and the IL Sync
         switch (the store's level, cap and sync, as the Gear browser's strip edits them). A <gsa-bar-popover> too: opening puts
         the focus on the Level box (closing it drops text that is no level or cap: clearTypedErrors); Escape and the chip close it with the focus back on the chip; a click outside or Tab out
         of it closes it where the focus went. */
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
      /* every text of the two substat menus, one per line: their width (views SUBSTAT_SIZER) */
      substatSizer: SUBSTAT_SIZER,
      get substatOptions() {
        return this.jobCtx.substats.map(s => ({ value: s, label: this.jobCtx.label[s] }));
      },
      /* the 2nd substat's options: none, then every substat but the 1st (ui/ranks.js); the menus' options are {value, label} */
      get substat2Options() {
        const subs = this.$store.app.piece.subs;
        return [{ value: '', label: NO_SUBSTAT_LABEL }].concat(
          rankChoices(subs, 1, this.jobCtx.substats).map(s => ({ value: s, label: this.jobCtx.label[s] })),
        );
      },
      // the chart's container width (px): the chart is drawn at its own width, so its text keeps the page's size
      widths: { piece: 0 },
      /* The chart's box, each time it is drawn (x-init: it exists only while a view is shown): its width is followed. */
      observeChart(el) {
        observer ??= new ResizeObserver(entries => {
          for (const e of entries) {
            const w = Math.round(e.contentRect.width);
            if (w && w !== this.widths.piece) {
              this.widths.piece = w;
            }
          }
        });
        observer.observe(el);
      },
      setSub(i, value) {
        const app = this.$store.app;
        app.editPiece({ subs: withSub(app.piece.subs, i, value, this.jobCtx.substats) });
      },
      setIlvl(value) {
        const v = Math.round(Number(value));
        if (Number.isFinite(v)) {
          this.$store.app.editPiece({ ilvl: Math.max(this.ilvlRange[0], Math.min(this.ilvlRange[1], v)) });
        }
      },
      /* how far along its range the slider's thumb is (percent): the track is drawn filled up to it */
      get ilvlFill() {
        const [lo, hi] = this.ilvlRange;
        return hi > lo ? ((this.il - lo) / (hi - lo)) * 100 : 0;
      },
      resetIlvl() {
        this.$store.app.editPiece({ ilvl: null });
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
    },
  );
}
