/* The reload and close guard: while a gear set's page holds work a reload or a closed tab would lose (a manual draft, a running
   Auto-fill, a waiting Auto-fill result), the browser asks before the page goes away (a `beforeunload` listener). The question
   itself is the browser's: a page cannot set its text. Pure: the caller passes the window-like `target`, the
   function that says whether work is held, and the storage that may hold the dev flag. */
import { STORE_KEY } from '../store-key.ts';

/* The dev flag's localStorage key (in the STORE_KEY family): the value '1' turns the guard off. The smoke test sets it before
   every page start (tests/e2e/lib/init-scripts.ts), so its many reloads are not held; the step that checks the guard sets
   '0' (a value this module does not read as off) to have it on. A person never needs it. */
export const UNLOAD_GUARD_OFF_KEY = `${STORE_KEY}:no-unload-guard`;

/* Whether the dev flag turns the guard off. Reads `storage` inside try/catch (a disabled storage throws; then the guard stays
   on). */
export function unloadGuardDisabled(storage: Pick<Storage, 'getItem'> | null | undefined): boolean {
  try {
    return storage?.getItem(UNLOAD_GUARD_OFF_KEY) === '1';
  } catch {
    return false;
  }
}

/* The part of a BeforeUnloadEvent the guard uses, and the part of `window` it listens on. */
export type UnloadEvent = Pick<BeforeUnloadEvent, 'preventDefault' | 'returnValue'>;
export interface UnloadTarget {
  addEventListener(type: 'beforeunload', listener: (event: UnloadEvent) => void): void;
}

/* Adds the `beforeunload` listener to `target` and returns it (a test removes it by hand). `hasUnsettled()` says whether
   work would be lost; the flag is read at each unload, so setting it needs no restart. The listener asks the browser to show
   its own question (preventDefault, and returnValue for older browsers) and does nothing otherwise. */
export function installUnloadGuard({
  target,
  hasUnsettled,
  storage,
}: {
  target: UnloadTarget;
  hasUnsettled: () => boolean;
  storage: Pick<Storage, 'getItem'> | null | undefined;
}): (event: UnloadEvent) => void {
  const listener = (event: UnloadEvent) => {
    if (unloadGuardDisabled(storage) || !hasUnsettled()) {
      return;
    }
    event.preventDefault();
    event.returnValue = '';
  };
  target.addEventListener('beforeunload', listener);
  return listener;
}
