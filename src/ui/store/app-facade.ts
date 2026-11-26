/* The app store as the page's screens read it (`ports.app`), over the store's state. Each getter reads the revision of each part of the state it returns and no other (app-state.ts STATE_PARTS), so
   a reader that reads it is run again when an action changes that part, and not when it changes another. The plain
   objects it hands out are frozen copies, made again only after their part changed, so nothing outside an action can change the
   state through them. Each method calls an action. Nothing here can be assigned to: every write is a call (`editPanel`,
   `editBrowse`, ...), so the store counts it, the page draws it and the settings are saved. What the state holds: app-state.ts. */
import { MAX_REAL } from '../../core/tables.ts';
import { deepFreeze } from '../view-cache.ts';
import { PANEL_KEYS, jobCtxOf, panelOf, persisted, routeOf } from './app-state.ts';
import type { AppActions } from './app-actions.ts';
import type { AppStore, Panel } from './app-state.ts';
import { partKey } from './store.ts';

/* The revision of each slice and each of its parts (store.ts revs): what a getter reads so its reader is run again after a change
   of what it shows. The page hands in the store's own; a test may hand in a recording stand-in. */
export type SliceRevisions = Record<string, number>;

/* The tab whose Job and sync panel the top-level job, cap, sync and level show: the open tab's, and the Gear browser's while the
   Sheets tab, which has no panel, is open. */
function panelTabOf(tab: string): 'browse' | 'math' {
  return tab === 'math' ? 'math' : 'browse';
}

/* A function that returns a frozen copy of what `read` gives, made again only when the revision it is handed differs from the
   last one's: the same object comes back until the part changed. */
function frozenView<View extends object>(read: () => View): (revision: string) => View {
  let lastRevision: string | null = null;
  let view: View;
  return revision => {
    if (revision !== lastRevision) {
      view = deepFreeze(structuredClone(read()));
      lastRevision = revision;
    }
    return view;
  };
}

/* The facade of `store` and its `actions` (createAppActions); `revisions` as above. */
export function createAppFacade(store: AppStore, actions: AppActions, revisions: SliceRevisions) {
  const { state } = store;
  /* Read the revision of the part `path` of slice `slice` (so the reader tracks it) and return it, as text. */
  const read = (slice: string, path: string) => String(revisions[partKey(slice, path)]);
  /* Read the revision of the open tab (which says whose panel it is) and of its panel's field `field`. */
  const readOpenPanel = (field: keyof Panel) => {
    void revisions[partKey('screen', 'tab')];
    void revisions[partKey('settings', `panels.${panelTabOf(state.screen.tab)}.${field}`)];
  };
  /* Read the revision of every field of tab `tab`'s panel ('tiers' has only its job). */
  const readPanel = (tab: string) => {
    if (tab === 'tiers') {
      void revisions[partKey('settings', 'tiers')];
    } else {
      for (const field of PANEL_KEYS) {
        void revisions[partKey('settings', `panels.${tab}.${field}`)];
      }
    }
  };
  const browseView = frozenView(() => state.settings.browse);
  const pieceView = frozenView(() => state.settings.piece);
  const gcdView = frozenView(() => state.math.gcd);
  return {
    /* The highest real item level, the top of every item level box. */
    maxReal: MAX_REAL,

    /* ---- the screen ---- */

    /* The open tab: 'sheets', 'browse' or 'math'. */
    get tab() {
      void revisions[partKey('screen', 'tab')];
      return state.screen.tab;
    },
    /* The open math sub-tab: 'piece', 'gcd' or 'tiers'. */
    get mathTab() {
      void revisions[partKey('screen', 'mathTab')];
      return state.screen.mathTab;
    },
    /* The tab a click is opening (shown as selected before it is built), or null. */
    get pendingTab() {
      void revisions[partKey('screen', 'pendingTab')];
      return state.screen.pendingTab;
    },

    /* ---- the open tab's Job and sync panel (a tab without one shows the Gear browser's) ---- */

    /* The job's id. */
    get job() {
      readOpenPanel('job');
      return panelOf(state, panelTabOf(state.screen.tab)).job;
    },
    /* The job's frozen JobContext. */
    get jobCtx() {
      readOpenPanel('job');
      return jobCtxOf(state, panelTabOf(state.screen.tab));
    },
    /* The item level cap (null: none). */
    get cap() {
      readOpenPanel('cap');
      return state.settings.panels[panelTabOf(state.screen.tab)].cap;
    },
    /* Whether item level sync is on. */
    get sync() {
      readOpenPanel('sync');
      return state.settings.panels[panelTabOf(state.screen.tab)].sync;
    },
    /* The synced level. */
    get level() {
      readOpenPanel('level');
      return state.settings.panels[panelTabOf(state.screen.tab)].level;
    },

    /* ---- the settings ---- */

    /* The Gear browser's filters and sort (its own fields; its panel is `panel('browse')`), frozen. */
    get browse() {
      return browseView(read('settings', 'browse'));
    },
    /* Stat Allocation's example piece (its own fields; its panel is `panel('math')`), frozen. */
    get piece() {
      return pieceView(read('settings', 'piece'));
    },
    /* What the sheet list's gear sets show: 'effects' or 'points'. */
    get sheetFigures() {
      void revisions[partKey('settings', 'sheetFigures')];
      return state.settings.sheetFigures;
    },
    /* The GCD sub-tab's settings: {level, haste, speed}, frozen. */
    get gcd() {
      return gcdView(read('math', 'gcd'));
    },
    /* Substat tiers' job (saved) and the level typed on it (null: the job's level cap): a new frozen object each time. */
    get tiers() {
      void revisions[partKey('settings', 'tiers')];
      void revisions[partKey('math', 'tiersLevel')];
      return Object.freeze({ job: state.settings.tiers.job, level: state.math.tiersLevel });
    },

    /* The Job and sync panel of `tab` ('browse', 'math' or 'tiers'), open or not: {job, jobCtx, cap, sync, level}, a new object. */
    panel(tab: string) {
      readPanel(tab);
      return panelOf(state, tab);
    },
    /* The saved fields (what is written to localStorage), the whole `settings` slice read. */
    persisted() {
      void revisions.settings;
      return persisted(state);
    },
    /* The screen the app store shows, as a route without the settings query (the router adds that). */
    route() {
      void revisions[partKey('screen', 'tab')];
      void revisions[partKey('screen', 'mathTab')];
      void revisions[partKey('screen', 'pendingTab')];
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
       one way to write (the number boxes, number-field.ts). A path is a field of the open tab's panel, or of `browse`, `piece` or
       `gcd`. */
    setField(path: string, value: unknown): void {
      const [group, field] = path.includes('.') ? path.split('.') : ['panel', path];
      if (group === 'panel') {
        actions.editPanel({ [field]: value });
      } else if (group === 'browse') {
        actions.editBrowse({ [field]: value });
      } else if (group === 'piece') {
        actions.editPiece({ [field]: value });
      } else if (group === 'gcd') {
        actions.editGcd({ [field]: value });
      } else {
        throw new Error(`No setting at "${path}"`);
      }
    },
  };
}

/* The app store's facade. */
export type AppFacade = ReturnType<typeof createAppFacade>;
