/* The actions that change the settings, the screen, the math tab's unsaved settings and the open gear set pages. Each is one
   `store.update('<slice>/<name>', ...)` (store.ts); the rules are those of the Alpine store the page had before, kept as they were.
   What each slice holds: app-state.ts. */
import { makeJobContext } from '../../core/job-context.js';
import { holdLevelSyncCap } from '../job-sync-panel.js';
import { MATH_TABS, TABS, resetForJob, restoreState } from '../state.js';
import { PANEL_KEYS, PANEL_TABS, panelFields, settingsOf } from './app-state.ts';
import type { AppState, AppStore, Panel, PanelTab, RestoredState, ScreenState } from './app-state.ts';

/* How the actions reach what is not state. frame(callback): run `callback` on the next animation frame (the default is the browser's
   requestAnimationFrame, read when it is called, so a test can replace it). */
export interface AppActionOptions {
  frame?: (callback: () => void) => void;
}

/* A frozen JobContext (job-context.js makeJobContext). */
type JobContext = ReturnType<typeof makeJobContext>;

/* Whether `tab` is one with a Job and sync panel (the Sheets tab has none). */
function hasPanel(tab: string): tab is PanelTab {
  return (PANEL_TABS as readonly string[]).includes(tab);
}

/* Hold the job's level cap on the synced level and the Gear browser's equip level filter, and reset the selections the new job
   cannot use (state.js resetForJob) for `tab`'s settings. resetForJob reads `level`, `piece` and `browse` of one object, so it
   is handed one built from the state; the level it may lower is written back to the panel when `writeLevelBack` is true (a job
   change did; a link's panel was already checked). */
function resetSettingsForJob(state: AppState, tab: PanelTab, job: JobContext, from: JobContext | null, writeLevelBack: boolean): void {
  const { settings } = state;
  const panel = settings.panels[tab];
  const carrier = { level: panel.level, piece: settings.piece, browse: settings.browse };
  // resetForJob's `from` has no type in the JavaScript (its default is null): the cast hands it the JobContext or null it takes
  resetForJob(carrier, job, from as null, [tab === 'browse' ? 'browse' : 'math']);
  if (writeLevelBack) panel.level = carrier.level;
}

/* While the math tab is open and its IL Sync is off, its panel holds level sync's item level as its cap (job-sync-panel.js
   holdLevelSyncCap). */
function followLevelSyncIn(state: AppState): void {
  if (state.screen.tab === 'math') holdLevelSyncCap(state.settings.panels.math);
}

/* The tab and math sub-tab that opening `tabName` gives: a math sub-view opens the math tab on it; a name that is no tab opens
   the first tab; a tab other than math leaves the sub-tab as it was. */
function screenAfterOpening(screen: ScreenState, tabName: string): { tab: string; mathTab: string } {
  if (MATH_TABS.includes(tabName)) return { tab: 'math', mathTab: tabName };
  return { tab: TABS.includes(tabName) ? tabName : TABS[0], mathTab: screen.mathTab };
}

/* Whether every field of `fields` already holds the value it is given in `target` (the same value by `Object.is`: a new array or
   object counts as a change, as it did when the old store was assigned to). An edit that changes nothing must not count, or
   the page draws again for it: a chart redrawn between a press and a release loses the click. */
function holdsAll(target: object, fields: object): boolean {
  const held = target as Record<string, unknown>;
  return Object.entries(fields).every(([field, value]) => Object.is(held[field], value));
}

/* The actions of the app state on `store`, as an object of functions (each returns nothing unless said). */
export function createAppActions(store: AppStore, options: AppActionOptions = {}) {
  const frame = options.frame ?? ((callback: () => void) => requestAnimationFrame(callback));

  /* Substat tiers' own job: the level typed into its box stays only if the new job's level cap allows it. */
  function setTiersJob(id: string): void {
    const job = makeJobContext(id);
    if (job.jobId === store.state.settings.tiers.job) return;
    store.update('settings/setTiersJob', state => {
      state.settings.tiers.job = job.jobId;
    });
    const typed = store.state.math.tiersLevel;
    if (typed !== null && typed >= job.maxLevel)
      store.update('math/setTiersLevel', state => {
        state.math.tiersLevel = null;
      });
  }

  return {
    setTiersJob,

    /* Switch the job of `owner` ('browse', 'math' or 'tiers'; the open tab's panel when omitted) to a different job: that
       owner's job-specific selections the new job cannot use are reset (state.js resetForJob), the levels are held to the job's
       cap, and every other tab and sub-tab keeps its own job. A user action only (the job menu's tile). On the Sheets tab,
       which has no panel, nothing changes. */
    setJob(id: string, owner: string = store.state.screen.tab): void {
      if (owner === 'tiers') {
        setTiersJob(id);
        return;
      }
      if (!hasPanel(owner)) return;
      const job = makeJobContext(id);
      const panel = store.state.settings.panels[owner];
      if (job.jobId === panel.job) return;
      store.update('settings/setJob', state => {
        const from = panel.job ? makeJobContext(panel.job) : null;
        panel.job = job.jobId;
        resetSettingsForJob(state, owner, job, from, true);
        followLevelSyncIn(state); // the level-sync number depends on the job's level cap
      });
    },

    /* While the math tab is open and its IL Sync is off, hold level sync's item level as its cap. Called from the user actions
       that change the inputs (job change, Reset, the level box), never from a watcher: a tab change leaves both tabs' fields as
       they were. */
    followLevelSync(): void {
      if (store.state.screen.tab !== 'math') return;
      // the cap level sync gives, tried on a copy: a panel that already holds it is not an action
      const held = { ...store.state.settings.panels.math };
      holdLevelSyncCap(held);
      if (held.cap === store.state.settings.panels.math.cap) return;
      store.update('settings/followLevelSync', followLevelSyncIn);
    },

    /* Set tab `tab`'s ('browse' or 'math') panel to `panel` ({job, cap, sync, level}, already checked: state.js restorePanel),
       whether or not that tab is open. A different job resets what that tab holds for its old job that the new one cannot use,
       as setJob does. The one place an address writes the panel, so the rules for cap and sync live here. */
    setPanel(tab: string, panel: Panel): void {
      if (!hasPanel(tab)) return;
      // the panel as it would be held, tried on a copy: the same job and the same fields are not an action
      const held = panelFields(panel);
      if (tab === 'math') holdLevelSyncCap(held);
      const current = store.state.settings.panels[tab];
      if (current.job === panel.job && holdsAll(current, held)) return;
      store.update('settings/setPanel', state => {
        const target = state.settings.panels[tab];
        const from = target.job ? makeJobContext(target.job) : null;
        const changed = target.job !== panel.job;
        Object.assign(target, panelFields(panel));
        if (tab === 'math') holdLevelSyncCap(target); // with IL Sync off, the cap is level sync's
        if (changed) resetSettingsForJob(state, tab, makeJobContext(panel.job), from, false);
      });
    },

    /* The open tab's settings back to their defaults (Paladin, level 100, sync off): its panel and its own fields (the piece,
       or the browser's filters). The other tabs stay; the Sheets tab has no settings here and nothing changes. */
    resetAll(): void {
      const tab = store.state.screen.tab;
      if (!hasPanel(tab)) return;
      store.update('settings/resetAll', state => {
        const defaults = settingsOf(restoreState(null) as RestoredState);
        state.settings.panels[tab] = defaults.panels[tab];
        if (tab === 'browse') state.settings.browse = defaults.browse;
        else state.settings.piece = defaults.piece;
        followLevelSyncIn(state);
      });
    },

    /* Change fields of `tab`'s panel (the open tab's by default) as typed: no check and no job reset (setJob does that). */
    editPanel(fields: Partial<Panel>, tab: string = store.state.screen.tab): void {
      if (!hasPanel(tab)) return;
      const edit = Object.fromEntries(PANEL_KEYS.filter(key => key in fields).map(key => [key, fields[key]]));
      if (holdsAll(store.state.settings.panels[tab], edit)) return;
      store.update('settings/editPanel', state => {
        Object.assign(state.settings.panels[tab], edit);
      });
    },

    /* Change fields of the Gear browser's filters and sort as typed. */
    editBrowse(fields: Partial<AppState['settings']['browse']>): void {
      if (holdsAll(store.state.settings.browse, fields)) return;
      store.update('settings/editBrowse', state => {
        Object.assign(state.settings.browse, fields);
      });
    },

    /* Change fields of Stat Allocation's example piece as typed. */
    editPiece(fields: Partial<AppState['settings']['piece']>): void {
      if (holdsAll(store.state.settings.piece, fields)) return;
      store.update('settings/editPiece', state => {
        Object.assign(state.settings.piece, fields);
      });
    },

    /* What the sheet list's gear sets show: 'effects' or 'points'. */
    setSheetFigures(figures: string): void {
      if (store.state.settings.sheetFigures === figures) return;
      store.update('settings/setSheetFigures', state => {
        state.settings.sheetFigures = figures;
      });
    },

    /* A tab link's action: marks tab `tabName` pending, waits for the frame that shows it, then opens the tab and clears the
       mark in one step. Opening a tab can take a second on a slow machine (the first Gear browser open builds its whole table),
       and the page would otherwise look unchanged until it was done. A newer openTab replaces one still waiting (Back during
       the opening): the older tab is never shown, so no screen shows between the two. */
    openTab(tabName: string): void {
      const request = store.update('screen/openTab', state => {
        state.screen.pendingTab = tabName;
        state.screen.openingTabRequest += 1;
        return state.screen.openingTabRequest;
      });
      frame(() =>
        setTimeout(() => {
          if (request !== store.state.screen.openingTabRequest) return;
          store.update('screen/showTab', state => {
            Object.assign(state.screen, screenAfterOpening(state.screen, tabName), { pendingTab: null });
          });
        }, 0),
      );
    },

    /* Open tab `tabName` (a math sub-view opens the math tab on it; an unknown name opens the first tab). Nothing is copied:
       each tab's panel stays where it is. */
    showTab(tabName: string): void {
      const { screen } = store.state;
      const next = screenAfterOpening(screen, tabName);
      if (next.tab === screen.tab && next.mathTab === screen.mathTab) return;
      store.update('screen/showTab', state => void Object.assign(state.screen, next));
    },

    /* Open math sub-tab `subTab` ('piece', 'gcd' or 'tiers'; anything else opens Stat Allocation) without changing the tab. */
    showSub(subTab: string): void {
      const next = MATH_TABS.includes(subTab) ? subTab : 'piece';
      if (store.state.screen.mathTab === next) return;
      store.update('screen/showSub', state => {
        state.screen.mathTab = next;
      });
    },

    /* Change fields of the GCD sub-tab's settings as typed. */
    editGcd(fields: Partial<AppState['math']['gcd']>): void {
      if (holdsAll(store.state.math.gcd, fields)) return;
      store.update('math/editGcd', state => {
        Object.assign(state.math.gcd, fields);
      });
    },

    /* The level typed on Substat tiers (null: follow the job's level cap). */
    setTiersLevel(level: number | null): void {
      if (store.state.math.tiersLevel === level) return;
      store.update('math/setTiersLevel', state => {
        state.math.tiersLevel = level;
      });
    },
  };
}

/* The actions of the app state on `store`. */
export type AppActions = ReturnType<typeof createAppActions>;
