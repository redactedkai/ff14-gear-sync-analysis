import { checkEditLock, checkSetPageFocus } from './checks/auto-fill/focus.mjs';
import { checkFillBestMeal, checkFillFood } from './checks/auto-fill/food.mjs';
import { checkFillGoal } from './checks/auto-fill/goal.mjs';
import { checkGcdLabel, checkSettingsAlignment } from './checks/auto-fill/layout.mjs';
import { checkFillRealGear, checkWorkerFallback } from './checks/auto-fill/run.mjs';
import { checkEmptySlotNote, checkFillCancel, checkFillSearch } from './checks/auto-fill/search.mjs';
import { checkSparePointsNoteFollowsButton } from './checks/auto-fill/note-placement.mjs';
import { checkTakeBoxFollowsWeapon } from './checks/auto-fill/take-box.mjs';
import { checkBrowserColumnsStay, checkBrowserFourDigits, checkBrowserPages } from './checks/gear-browser/columns.mjs';
import {
  checkExpansionFilter,
  checkPldOffhand,
  checkRingCopies,
  checkTypedNumberStaysAfterOtherFilter,
} from './checks/gear-browser/filters.mjs';
import { checkGearFrom } from './checks/gear-browser/gear-from.mjs';
import { checkGearFromCountsBrowser, checkGearFromCountsFill } from './checks/gear-browser/piece-counts.mjs';
import { checkOffhandPills } from './checks/gear-browser/offhand-pills.mjs';
import { checkBrowserRowsMatchView } from './checks/gear-browser/rows.mjs';
import { checkSlotMenu, checkSlotMenuPicksAndLayers } from './checks/gear-browser/slot-menu.mjs';
import { checkAccessibility } from './checks/look/accessibility.mjs';
import { checkRadii } from './checks/look/radii.mjs';
import { checkThemes } from './checks/look/themes.mjs';
import { checkBreakpoints, checkViewports } from './checks/look/viewports.mjs';
import { checkVisualParity } from './checks/look/visual-parity.mjs';
import { checkHelpDimsPage, checkPieceLab } from './checks/math-page/piece-stats.mjs';
import { checkGcdTab, checkTiers } from './checks/math-page/tiers-gcd.mjs';
import { checkLevelBox, checkMathBarBoxes, checkMathJobs, checkSyncChip } from './checks/math-page/bar-layout.mjs';
import { checkTiersNoteUnderPinnedBar } from './checks/math-page/tiers-note.mjs';
import { checkCorruptedStorage, checkReloadPersists, checkReset } from './checks/saved-state/saved-state.mjs';
import { checkAverageIlvl } from './checks/set-page/average-ilvl.mjs';
import { checkSetPageColumns } from './checks/set-page/columns.mjs';
import { checkPieceMenuKeepsButtonInSight, checkTableMenusUnderHeading } from './checks/set-page/menu-placement.mjs';
import { checkMenuClicks, checkMenuSteps, checkPickMenu } from './checks/set-page/menus.mjs';
import { checkTwoHandedPick } from './checks/set-page/mixed-weapon.mjs';
import { checkOvermeldOdds } from './checks/set-page/overmeld-odds.mjs';
import { checkMateriaPick, checkMealPick } from './checks/set-page/pick-totals.mjs';
import { checkQuickClicks } from './checks/set-page/quick-clicks.mjs';
import { checkSetPage, checkTabGuard } from './checks/set-page/set-page.mjs';
import { checkDefaults, checkJobLevelCap, checkJobSwitch } from './checks/settings/defaults.mjs';
import { checkFirstPaint } from './checks/settings/first-paint.mjs';
import { checkJobStrip } from './checks/settings/job-strip.mjs';
import { checkCapFlag } from './checks/sheets/cap-flag.mjs';
import { checkClanParty } from './checks/sheets/clan-party.mjs';
import { checkSetListColumns } from './checks/sheets/columns.mjs';
import { checkSheetEdges } from './checks/sheets/edges.mjs';
import { checkSheetCap, checkSheetForms } from './checks/sheets/forms.mjs';
import { checkSheets } from './checks/sheets/manager.mjs';
import { checkOpenRow, checkOpenSheetRow } from './checks/sheets/open-row.mjs';
import { checkSetListSort } from './checks/sheets/sort.mjs';
import { checkTwoTabs } from './checks/sheets/two-tabs.mjs';
import { checkTwoTabsSettings } from './checks/saved-state/two-tabs.mjs';
import {
  checkStartupBlockedStorage,
  checkStartupFailures,
  checkStartupHealthy,
  checkStartupMarkerAfterStart,
  checkStartupMarkerMissing,
  checkStartupReset,
  checkStartupShell,
} from './checks/startup/failure.mjs';
import { checkLevelSync } from './checks/tabs/level-sync.mjs';
import { checkForcedColorsCurrentTab, checkLinkClicks } from './checks/tabs/links.mjs';
import { checkNoteSurvivesTabChange, checkOverlayKeys, checkOverlaysOneAtATimeAndScreenChange } from './checks/tabs/overlays.mjs';
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
} from './checks/tabs/routing.mjs';
import { checkStoresSealed } from './checks/tabs/facades.mjs';
import { checkBackAfterBackAndForward, checkBackAfterQuickClick, checkBackAfterScriptScroll } from './checks/tabs/routing-quick-clicks.mjs';
import { walkJob } from './checks/tabs/walk.mjs';
import { FAILING_WORKER, HOLD_SOLVE, NO_WORKER, SLOW_COUNT } from './lib/init-scripts.mjs';

// A step: its name, the function that runs it, and its domain (a key of DOMAINS in tests/domains.mjs: the part of the
// product the step checks, named by what its comment says; the folder of its file does not decide). A step that
// starts from the shared setup has `shared: true`.
export const step = (fn, domain) => ({ name: fn.name, run: fn, domain, shared: true });

// walkJobs: every tab for one job, from a fresh page of its own setup; the frame that holds the tabs, so `app`.
const walk = job => ({ name: `walkJobs ${job}`, run: walkJob(job), domain: 'app', shared: false });

export const GROUPS = [
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
