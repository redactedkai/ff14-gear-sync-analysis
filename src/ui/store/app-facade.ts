/* The app store as the page's templates and components read it (`$store.app`): the members the old Alpine store had, over the
   store's state. Each getter reads the revision of the slice it shows, so a template or a getter that reads it is run again when an
   action changes that slice, and hands out the state itself (plain data, never a copy); each method calls an action. Nothing here
   can be assigned to: every write is a call (`editPanel`, `editBrowse`, ...), so the store counts it, the page draws it and the
   settings are saved. What the state holds: app-state.ts. */
import { MAX_REAL } from '../../core/tables.js';
import { jobCtxOf, panelOf, persisted, routeOf } from './app-state.ts';
import type { AppActions } from './app-actions.ts';
import type { AppStore } from './app-state.ts';

/* The revision of each slice: what a getter reads so its reader is run again after a change of that slice. The page hands in an
   object its template engine tracks; a test hands in the store's own. */
export type SliceRevisions = Record<string, number>;

/* The tab whose Job and sync panel the top-level job, cap, sync and level show: the open tab's, and the Gear browser's while the
   Sheets tab, which has no panel, is open. */
function panelTabOf(tab: string): 'browse' | 'math' {
  return tab === 'math' ? 'math' : 'browse';
}

/* The facade of `store` and its `actions` (createAppActions); `revisions` as above. */
export function createAppFacade(store: AppStore, actions: AppActions, revisions: SliceRevisions) {
  const { state } = store;
  return {
    /* The highest real item level, the top of every item level box. */
    maxReal: MAX_REAL,

    /* ---- the screen ---- */

    /* The open tab: 'sheets', 'browse' or 'math'. */
    get tab() {
      void revisions.screen;
      return state.screen.tab;
    },
    /* The open math sub-tab: 'piece', 'gcd' or 'tiers'. */
    get mathTab() {
      void revisions.screen;
      return state.screen.mathTab;
    },
    /* The tab a click is opening (shown as selected before it is built), or null. */
    get pendingTab() {
      void revisions.screen;
      return state.screen.pendingTab;
    },

    /* ---- the open tab's Job and sync panel (a tab without one shows the Gear browser's) ---- */

    /* The job's id. */
    get job() {
      void revisions.screen;
      void revisions.settings;
      return panelOf(state, panelTabOf(state.screen.tab)).job;
    },
    /* The job's frozen JobContext. */
    get jobCtx() {
      void revisions.screen;
      void revisions.settings;
      return jobCtxOf(state, panelTabOf(state.screen.tab));
    },
    /* The item level cap (null: none). */
    get cap() {
      void revisions.screen;
      void revisions.settings;
      return state.settings.panels[panelTabOf(state.screen.tab)].cap;
    },
    /* Whether item level sync is on. */
    get sync() {
      void revisions.screen;
      void revisions.settings;
      return state.settings.panels[panelTabOf(state.screen.tab)].sync;
    },
    /* The synced level. */
    get level() {
      void revisions.screen;
      void revisions.settings;
      return state.settings.panels[panelTabOf(state.screen.tab)].level;
    },

    /* ---- the settings ---- */

    /* The Gear browser's filters and sort (its own fields; its panel is `panel('browse')`). */
    get browse() {
      void revisions.settings;
      return state.settings.browse;
    },
    /* Stat Allocation's example piece (its own fields; its panel is `panel('math')`). */
    get piece() {
      void revisions.settings;
      return state.settings.piece;
    },
    /* What the sheet list's gear sets show: 'effects' or 'points'. */
    get sheetFigures() {
      void revisions.settings;
      return state.settings.sheetFigures;
    },
    /* The GCD sub-tab's settings: {level, haste, speed}. */
    get gcd() {
      void revisions.math;
      return state.math.gcd;
    },
    /* Substat tiers' job (saved) and the level typed on it (null: the job's level cap): a new object each time. */
    get tiers() {
      void revisions.settings;
      void revisions.math;
      return { job: state.settings.tiers.job, level: state.math.tiersLevel };
    },

    /* The Job and sync panel of `tab` ('browse', 'math' or 'tiers'), open or not: {job, jobCtx, cap, sync, level}, a new object. */
    panel(tab: string) {
      void revisions.settings;
      return panelOf(state, tab);
    },
    /* The saved fields (what is written to localStorage). */
    persisted() {
      void revisions.settings;
      return persisted(state);
    },
    /* The screen the app store shows, as a route without the settings query (the router adds that). */
    route() {
      void revisions.screen;
      void revisions.sheets;
      return routeOf(state);
    },

    /* ---- the actions (app-actions.ts) ---- */

    setJob: actions.setJob,
    setTiersJob: actions.setTiersJob,
    setTiersLevel: actions.setTiersLevel,
    followLevelSync: actions.followLevelSync,
    setPanel: actions.setPanel,
    editPanel: actions.editPanel,
    editBrowse: actions.editBrowse,
    editPiece: actions.editPiece,
    editGcd: actions.editGcd,
    setSheetFigures: actions.setSheetFigures,
    resetAll: actions.resetAll,
    openTab: actions.openTab,
    showTab: actions.showTab,
    showSub: actions.showSub,

    /* Set the setting a number box names by its path ('level', 'cap', 'browse.min', 'piece.ilvl', 'gcd.speed', ...): the box's
       one way to write (number-field.js storeNumberField). A path is a field of the open tab's panel, or of `browse`, `piece` or
       `gcd`. */
    setField(path: string, value: unknown): void {
      const [group, field] = path.includes('.') ? path.split('.') : ['panel', path];
      if (group === 'panel') actions.editPanel({ [field]: value });
      else if (group === 'browse') actions.editBrowse({ [field]: value });
      else if (group === 'piece') actions.editPiece({ [field]: value });
      else if (group === 'gcd') actions.editGcd({ [field]: value });
      else throw new Error(`No setting at "${path}"`);
    },
  };
}

/* The app store's facade. */
export type AppFacade = ReturnType<typeof createAppFacade>;
