/* What the built page puts on `window` for the tests (src/main.js, "The test hook"), so a callback sent to the page through
   Playwright (`pg.evaluate(() => window.gsaDebug.app.level)`) typechecks. The page freezes the object: it is read-only. */
import type AxeCore from 'axe-core';
import type { AppFacade } from '../../../src/ui/store/app-facade.ts';
import type { SheetsFacade } from '../../../src/ui/store/sheets-facade.ts';
import type { AppStore } from '../../../src/ui/store/app-state.ts';

/* One frame of the first-paint probe: what showed. */
export interface FirstPaintFrame {
  page: boolean;
  panel: boolean;
  job: string;
  tabs: string[];
}

/* What the boot shell showed on the frames the startup check watched (checks/startup/failure.ts). */
export interface ShellRecord {
  shown: boolean;
  selected: string;
  line: string;
  title: string;
  leaked: string;
  /* The tab bar's x, y, width and height in px, rounded to a tenth. */
  bar?: number[];
}

declare global {
  interface Window {
    /* Set by the HOLD_SOLVE init script (lib/init-scripts.ts): while true, the solver worker never answers an Auto-fill. */
    __holdSolve?: boolean;
    /* axe-core, once axeViolations has injected its script (lib/axe.ts). */
    axe?: typeof AxeCore;
    /* One entry per frame the first-paint probe saw (checks/settings/first-paint.ts). */
    __firstPaint?: FirstPaintFrame[];
    /* How many storage events this tab has heard (checks/saved-state/two-tabs.ts). */
    __storageEvents?: number;
    /* The Gear browser rows check (checks/gear-browser/rows.ts): describes the first way the table differs from the element's
       rows (an empty string when none), and starts or stops a per-frame watch that returns what it saw. */
    __rowsMismatch?: () => string;
    __rowsWatch?: (on: boolean) => string;
    /* The saved-data failure check keeps the real Storage setItem here while a failing one is installed (checks/tabs/overlays.ts). */
    realSetItem?: Storage['setItem'];
    /* The startup checks (checks/startup/failure.ts). */
    __brokenFrame?: boolean;
    __markerAt?: boolean[];
    __shell?: ShellRecord;
    /* The scroll recorders (checks/tabs/routing.ts): the page's scroll position at every frame, and the same with whether a marker
       element is drawn, from a recorder that stops when told. */
    gsaScrollFrames?: { frames: number[]; timer: number };
    gsaFrameRecorder?: { frames: { y: number; shown: boolean }[]; stopped: boolean };
    readonly gsaDebug: {
      /* The app facade the screens read. */
      readonly app: AppFacade;
      /* The sheets facade the screens read. */
      readonly sheets: SheetsFacade;
      /* The store's live state. */
      readonly state: AppStore['state'];
      /* The names of the store's last 50 actions. */
      readonly log: string[];
    };
  }
}
