/* What the math screen (`<gsa-math-screen>`, math-screen.ts) gives its child elements, and what it does with their edits, as plain
   functions of the app facade (the object of store/app-facade.ts) and no DOM, so Node tests run them. `mathSelection` says
   which parts of the store the inputs are made from: the screen renders again when it changes. */
import { levelSyncCap, mathJobOwner, syncSettings } from '../../job-sync-panel.js';
import type { AppFacade } from '../../store/app-facade.ts';
import type { AppState } from '../../store/app-state.ts';
import type { ExamplePiece, GcdState, SyncPanel, SyncSettings, TiersState } from './math-bar-names.ts';

/* What `<gsa-math-bar>` shows (its properties): the open sub-tab, the Job menu's job, the settings of the three sub-tabs' controls
   and the panel the Sync settings popover edits. */
export interface BarInput {
  tab: string;
  jobId: string;
  pieceJob: string;
  sync: SyncSettings;
  syncPanel: SyncPanel;
  openTab: string;
  levelScope: string;
  maxReal: number;
  piece: ExamplePiece;
  gcd: GcdState;
  tiers: TiersState;
}

/* What `<gsa-piece-stats>` shows (its properties). */
export interface PieceInput {
  job: string;
  sync: SyncSettings;
  piece: ExamplePiece;
  switchOn: boolean;
}

/* The example piece as a plain object for an element (a new one each time, so the element sees a change): `piece` is the store's. */
export function examplePiece(piece: {
  ilvl: number | null;
  slot: string;
  subs: readonly (string | null)[];
  slots: number | null;
}): ExamplePiece {
  return { ilvl: piece.ilvl, slot: piece.slot, subs: [...piece.subs], slots: piece.slots };
}

/* The id of the job the open sub-tab edits (Stat Allocation's or Substat tiers'): what the Job menu element shows. */
export function mathJobOf(app: AppFacade): string {
  return app.panel(mathJobOwner(app.mathTab)).job;
}

/* A pick in the Job menu: switch that job (job-specific settings reset: resetForJob; nothing else is lost, so no confirmation). */
export function setMathJob(app: AppFacade, id: string): void {
  app.setJob(id, mathJobOwner(app.mathTab));
}

/* The IL Sync switch of this tab was changed by the user (the element's `sync-change` event; never a watcher on `sync`, which
   also fires when a tab change swaps the panel and would break the tabs' isolation). Switched off: the stored cap becomes the
   item level level sync gives at the open level, or no cap where no level sync applies. Switched on: nothing is copied; the box
   shows the stored cap. */
export function setMathSync(app: AppFacade, on: boolean): void {
  app.editPanel({ sync: on });
  if (!on) {
    app.editPanel({ cap: levelSyncCap(app.jobCtx, app.level) });
  }
}

/* What the math bar element shows (`<gsa-math-bar>`'s properties), each object new so the element sees a change. */
export function barInput(app: AppFacade): BarInput {
  const panel = app.panel('math');
  return {
    tab: app.mathTab,
    jobId: mathJobOf(app),
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
}

/* What Stat Allocation's element shows (`<gsa-piece-stats>`'s properties). */
export function pieceInput(app: AppFacade): PieceInput {
  const panel = app.panel('math');
  return { job: panel.job, sync: syncSettings(panel), piece: examplePiece(app.piece), switchOn: Boolean(panel.sync) };
}

/* The parts of the store the inputs above are made from, as one flat object of values (compare with `shallowEq`): the open tab and
   sub-tab, the jobs, Stat Allocation's panel and example piece, the GCD settings and Substat tiers' typed level. A change of anything
   else (the Gear browser's filters, the sheets) leaves it equal, so the screen does not draw again. `barInput` and `pieceInput` read
   exactly this: a field added to either needs a field here (math-inputs.test.ts checks it against real edits). */
export function mathSelection(state: AppState) {
  const { screen, settings, math } = state;
  const { piece, panels } = settings;
  const openPanel = screen.tab === 'math' ? panels.math : panels.browse;
  return {
    tab: screen.tab,
    mathTab: screen.mathTab,
    openJob: openPanel.job,
    job: panels.math.job,
    cap: panels.math.cap,
    sync: panels.math.sync,
    level: panels.math.level,
    tiersJob: settings.tiers.job,
    tiersLevel: math.tiersLevel,
    pieceIlvl: piece.ilvl,
    pieceSlot: piece.slot,
    pieceSubs: piece.subs,
    pieceSlots: piece.slots,
    gcdLevel: math.gcd.level,
    gcdHaste: math.gcd.haste,
    gcdSpeed: math.gcd.speed,
  };
}
