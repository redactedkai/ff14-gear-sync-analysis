/* What the built page puts on `window` for the tests (src/main.js, "The test hook"), so a callback sent to the page through
   Playwright (`pg.evaluate(() => window.gsaDebug.app.level)`) typechecks. The page freezes the object: it is read-only. */
import type AxeCore from 'axe-core';
import type { AppFacade } from '../../../src/ui/store/app-facade.ts';
import type { SheetsFacade } from '../../../src/ui/store/sheets-facade.ts';
import type { AppStore } from '../../../src/ui/store/app-state.ts';

declare global {
  interface Window {
    /* Set by the HOLD_SOLVE init script (lib/init-scripts.ts): while true, the solver worker never answers an Auto-fill. */
    __holdSolve?: boolean;
    /* axe-core, once axeViolations has injected its script (lib/axe.ts). */
    axe?: typeof AxeCore;
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
