import { checkEditLock, checkSetPageFocus } from './checks/auto-fill/focus.ts';
import { checkFillBestMeal, checkFillFood } from './checks/auto-fill/food.ts';
import { checkFillGoal } from './checks/auto-fill/goal.ts';
import { checkGcdLabel, checkSettingsAlignment } from './checks/auto-fill/layout.ts';
import { checkFillRealGear, checkWorkerFallback } from './checks/auto-fill/run.ts';
import { checkEmptySlotNote, checkFillCancel, checkFillSearch } from './checks/auto-fill/search.ts';
import { checkSparePointsNoteFollowsButton } from './checks/auto-fill/note-placement.ts';
import { checkTakeBoxFollowsWeapon } from './checks/auto-fill/take-box.ts';
import { checkBrowserColumnsStay, checkBrowserFourDigits, checkBrowserPages } from './checks/gear-browser/columns.ts';
import {
  checkExpansionFilter,
  checkPldOffhand,
  checkRingCopies,
  checkTypedNumberStaysAfterOtherFilter,
} from './checks/gear-browser/filters.ts';
import { checkGearFrom } from './checks/gear-browser/gear-from.ts';
import { checkGearFromCountsBrowser, checkGearFromCountsFill } from './checks/gear-browser/piece-counts.ts';
import { checkOffhandPills } from './checks/gear-browser/offhand-pills.ts';
import { checkBrowserRowsMatchView } from './checks/gear-browser/rows.ts';
import { checkSlotMenu, checkSlotMenuPicksAndLayers } from './checks/gear-browser/slot-menu.ts';
import { checkAccessibility } from './checks/look/accessibility.ts';
import { checkRadii } from './checks/look/radii.ts';
import { checkThemes } from './checks/look/themes.ts';
import { checkBreakpoints, checkViewports } from './checks/look/viewports.ts';
import { checkVisualParity } from './checks/look/visual-parity.ts';
import { checkHelpDimsPage, checkPieceLab } from './checks/math-page/piece-stats.ts';
import { checkGcdTab, checkTiers } from './checks/math-page/tiers-gcd.ts';
import { checkLevelBox, checkMathBarBoxes, checkMathJobs, checkSyncChip } from './checks/math-page/bar-layout.ts';
import { checkTiersNoteUnderPinnedBar } from './checks/math-page/tiers-note.ts';
import { checkCorruptedStorage, checkReloadPersists, checkReset } from './checks/saved-state/saved-state.ts';
import { checkAverageIlvl } from './checks/set-page/average-ilvl.ts';
import { checkSetPageColumns } from './checks/set-page/columns.ts';
import { checkPieceMenuKeepsButtonInSight, checkTableMenusUnderHeading } from './checks/set-page/menu-placement.ts';
import { checkMenuClicks, checkMenuSteps, checkPickMenu } from './checks/set-page/menus.ts';
import { checkTwoHandedPick } from './checks/set-page/mixed-weapon.ts';
import { checkOvermeldOdds } from './checks/set-page/overmeld-odds.ts';
import { checkMateriaPick, checkMealPick } from './checks/set-page/pick-totals.ts';
import { checkQuickClicks } from './checks/set-page/quick-clicks.ts';
import { checkSetPage, checkTabGuard } from './checks/set-page/set-page.ts';
import { checkDefaults, checkJobLevelCap, checkJobSwitch } from './checks/settings/defaults.ts';
import { checkFirstPaint } from './checks/settings/first-paint.ts';
import { checkJobStrip } from './checks/settings/job-strip.ts';
import { checkCapFlag } from './checks/sheets/cap-flag.ts';
import { checkClanParty } from './checks/sheets/clan-party.ts';
import { checkSetListColumns } from './checks/sheets/columns.ts';
import { checkSheetEdges } from './checks/sheets/edges.ts';
import { checkSheetCap, checkSheetForms } from './checks/sheets/forms.ts';
import { checkSheets } from './checks/sheets/manager.ts';
import { checkOpenRow, checkOpenSheetRow } from './checks/sheets/open-row.ts';
import { checkSetListSort } from './checks/sheets/sort.ts';
import { checkTwoTabs } from './checks/sheets/two-tabs.ts';
import { checkTwoTabsSettings } from './checks/saved-state/two-tabs.ts';
import {
  checkStartupBlockedStorage,
  checkStartupFailures,
  checkStartupHealthy,
  checkStartupMarkerAfterStart,
  checkStartupMarkerMissing,
  checkStartupReset,
  checkStartupShell,
} from './checks/startup/failure.ts';
import { checkLevelSync } from './checks/tabs/level-sync.ts';
import { checkForcedColorsCurrentTab, checkLinkClicks } from './checks/tabs/links.ts';
import { checkNoteSurvivesTabChange, checkOverlayKeys, checkOverlaysOneAtATimeAndScreenChange } from './checks/tabs/overlays.ts';
import {
  checkAddressSettings,
  checkRouting,
  checkRoutingAfterReload,
  checkRoutingGuard,
  checkScrollOnBack,
  checkScrollOnBackToLeftPosition,
  checkScrollOnBackToMath,
  checkScrollOnOpenedScreen,
  checkScrollOnForwardToUnscrolled,
  checkScrollOnForward,
  checkScrollOnReload,
  checkUnloadGuard,
} from './checks/tabs/routing.ts';
import { checkStoresSealed } from './checks/tabs/facades.ts';
import { checkBackAfterBackAndForward, checkBackAfterQuickClick, checkBackAfterScriptScroll } from './checks/tabs/routing-quick-clicks.ts';
import { walkJob } from './checks/tabs/walk.ts';
import type { Page } from 'playwright';
import { FAILING_WORKER, HOLD_SOLVE, NO_WORKER, SLOW_COUNT } from './lib/init-scripts.ts';

// A step: its name, the function that runs it, and its domain (a key of DOMAINS in tests/domains.ts: the part of the
// product the step checks, named by what its comment says; the folder of its file does not decide). A step that
// starts from the shared setup has `shared: true`.
export interface Step {
  name: string;
  run: (pg: Page) => Promise<unknown>;
  domain: string;
  shared: boolean;
}
export const step = (fn: Step['run'], domain: string): Step => ({ name: fn.name, run: fn, domain, shared: true });

/** A group of steps run in order on one page. `fresh`: no shared setup; `slow`: started first; `initScript`: a script every page of
 * the group runs before its own (addInitScript). */
export interface Group {
  fresh?: boolean;
  slow?: boolean;
  initScript?: () => void;
  steps: Step[];
}

// walkJobs: every tab for one job, from a fresh page of its own setup; the frame that holds the tabs, so `app`.
const walk = (job: string): Step => ({ name: `walkJobs ${job}`, run: walkJob(job), domain: 'app', shared: false });

export const GROUPS: Group[] = [
  { fresh: true, steps: [step(checkDefaults, 'app')] },
  { fresh: true, slow: true, steps: [step(checkFirstPaint, 'app')] },
  { fresh: true, steps: [step(checkNoteSurvivesTabChange, 'app')] },
  {
    steps: [
      step(checkOverlayKeys, 'app'),
      step(checkOverlaysOneAtATimeAndScreenChange, 'app'),
      step(checkPieceLab, 'math-page'),
      step(checkHelpDimsPage, 'math-page'),
      step(checkJobSwitch, 'app'),
      step(checkJobStrip, 'app'),
      step(checkPldOffhand, 'gear-browser'),
    ],
  },
  {
    steps: [
      step(checkMathJobs, 'math-page'),
      step(checkSyncChip, 'math-page'),
      step(checkLevelBox, 'math-page'),
      step(checkMathBarBoxes, 'math-page'),
    ],
  },
  { steps: [step(checkBrowserPages, 'gear-browser'), step(checkBrowserRowsMatchView, 'gear-browser')] },
  { steps: [step(checkBrowserColumnsStay, 'gear-browser')] },
  { steps: [step(checkBrowserFourDigits, 'gear-browser')] },
  { steps: [step(checkSlotMenu, 'gear-browser'), step(checkSlotMenuPicksAndLayers, 'gear-browser')] },
  { steps: [step(checkStoresSealed, 'app')] },
  { steps: [step(checkRouting, 'app')] },
  { steps: [step(checkLinkClicks, 'app')] },
  { fresh: true, steps: [step(checkForcedColorsCurrentTab, 'app')] },
  { steps: [step(checkRoutingGuard, 'app')] },
  { steps: [step(checkRoutingAfterReload, 'app')] },
  { steps: [step(checkUnloadGuard, 'app')] },
  { steps: [step(checkAddressSettings, 'app')] },
  {
    steps: [
      step(checkScrollOnBack, 'app'),
      step(checkScrollOnForward, 'app'),
      step(checkScrollOnReload, 'app'),
      step(checkScrollOnBackToLeftPosition, 'app'),
    ],
  },
  { fresh: true, steps: [step(checkScrollOnBackToMath, 'app')] },
  { fresh: true, steps: [step(checkScrollOnForwardToUnscrolled, 'app')] },
  { fresh: true, steps: [step(checkScrollOnOpenedScreen, 'app')] },
  { fresh: true, steps: [step(checkBackAfterQuickClick, 'app')] },
  { fresh: true, steps: [step(checkBackAfterBackAndForward, 'app')] },
  { fresh: true, steps: [step(checkBackAfterScriptScroll, 'app')] },
  { steps: [step(checkSheets, 'sheets')] },
  { steps: [step(checkSheetForms, 'sheets')] },
  { steps: [step(checkSheetEdges, 'sheets')] },
  { steps: [step(checkSetListSort, 'sheets')] },
  { steps: [step(checkSetListColumns, 'sheets')] },
  { steps: [step(checkOpenRow, 'sheets')] },
  { steps: [step(checkOpenSheetRow, 'sheets')] },
  { steps: [step(checkClanParty, 'sheets')] },
  { steps: [step(checkCapFlag, 'sheets')] },
  { steps: [step(checkSetPageColumns, 'set-page')] },
  { steps: [step(checkOvermeldOdds, 'set-page')] },
  { steps: [step(checkMateriaPick, 'set-page'), step(checkMealPick, 'set-page')] },
  { steps: [step(checkAverageIlvl, 'set-page')] },
  { steps: [step(checkQuickClicks, 'set-page')] },
  {
    steps: [step(checkPickMenu, 'set-page'), step(checkMenuClicks, 'set-page'), step(checkBreakpoints, 'look')],
  },
  { steps: [step(checkTableMenusUnderHeading, 'set-page'), step(checkPieceMenuKeepsButtonInSight, 'set-page')] },
  {
    steps: [step(checkSparePointsNoteFollowsButton, 'auto-fill'), step(checkTiersNoteUnderPinnedBar, 'math-page')],
  },
  { steps: [step(checkSheetCap, 'sheets')] },
  { fresh: true, steps: [step(checkTwoTabs, 'sheets')] },
  { fresh: true, steps: [step(checkTwoTabsSettings, 'app')] },
  { slow: true, steps: [step(checkThemes, 'look')] },
  { slow: true, steps: [step(checkAccessibility, 'look')] },
  { slow: true, steps: [step(checkViewports, 'look')] },
  { slow: true, steps: [step(checkSetPage, 'set-page'), step(checkTabGuard, 'set-page')] },
  { slow: true, steps: [step(checkRadii, 'look')] },
  { steps: [step(checkVisualParity, 'look')] },
  { slow: true, steps: [step(checkFillRealGear, 'auto-fill')] },
  { slow: true, steps: [step(checkFillGoal, 'auto-fill')] },
  { steps: [step(checkSettingsAlignment, 'auto-fill'), step(checkGcdLabel, 'auto-fill')] },
  // the label read while the Gear to search count is still on its way (the first state of the label is "Target GCD" alone)
  { initScript: SLOW_COUNT, steps: [{ ...step(checkGcdLabel, 'auto-fill'), name: 'checkGcdLabel (slow count)' }] },
  { slow: true, steps: [step(checkFillFood, 'auto-fill'), step(checkFillBestMeal, 'auto-fill')] },
  { slow: true, steps: [step(checkFillSearch, 'auto-fill')] },
  { slow: true, steps: [step(checkEmptySlotNote, 'auto-fill')] },
  { slow: true, steps: [step(checkFillCancel, 'auto-fill')] },
  { slow: true, steps: [step(checkMenuSteps, 'set-page')] },
  {
    slow: true,
    initScript: HOLD_SOLVE,
    steps: [step(checkEditLock, 'auto-fill'), step(checkSetPageFocus, 'auto-fill')],
  },
  {
    slow: true,
    steps: [step(checkRingCopies, 'gear-browser'), step(checkGearFrom, 'gear-browser'), step(checkGearFromCountsBrowser, 'gear-browser')],
  },
  { slow: true, steps: [step(checkGearFromCountsFill, 'gear-browser')] },
  { steps: [step(checkOffhandPills, 'gear-browser')] },
  {
    slow: true,
    steps: [step(checkTwoHandedPick, 'set-page'), step(checkTakeBoxFollowsWeapon, 'auto-fill')],
  },
  { slow: true, steps: [step(checkExpansionFilter, 'gear-browser'), step(checkReset, 'app')] },
  { steps: [step(checkTypedNumberStaysAfterOtherFilter, 'gear-browser')] },
  { slow: true, steps: [step(checkReloadPersists, 'app')] },
  { slow: true, steps: [step(checkCorruptedStorage, 'app')] },
  { slow: true, steps: [step(checkLevelSync, 'app'), step(checkJobLevelCap, 'app')] },
  { slow: true, steps: [step(checkTiers, 'math-page'), step(checkGcdTab, 'math-page')] },
  { slow: true, initScript: NO_WORKER, steps: [{ ...step(checkWorkerFallback, 'auto-fill'), name: 'checkWorkerFallback (no Worker)' }] },
  {
    slow: true,
    initScript: FAILING_WORKER,
    steps: [{ ...step(checkWorkerFallback, 'auto-fill'), name: 'checkWorkerFallback (worker fails)' }],
  },
  {
    fresh: true,
    steps: [
      step(checkStartupHealthy, 'app'),
      step(checkStartupShell, 'app'),
      step(checkStartupFailures, 'app'),
      step(checkStartupMarkerMissing, 'app'),
      step(checkStartupMarkerAfterStart, 'app'),
      step(checkStartupReset, 'app'),
      step(checkStartupBlockedStorage, 'app'),
    ],
  },
  { steps: ['SGE', 'WAR', 'PLD'].map(walk) },
  { steps: ['BLM', 'NIN', 'DRG'].map(walk) },
  { steps: ['BST', 'BLU'].map(walk) },
];
