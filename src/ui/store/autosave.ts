/* Saving the settings: one subscription to the store, a write a moment after the last change, and a write at once when the page
   is hidden or closed, so a link opened and the page reloaded within the moment loses nothing. localStorage is a convenience:
   a write that throws is ignored (ui/state.ts save does that), and the settings it could not write are tried again at the
   next change of the store (a tab switch is one), at the next write and at 'pagehide', so they are saved once storage works. */
import { save } from '../state.ts';
import { persisted } from './app-state.ts';
import type { AppStore } from './app-state.ts';

/* How long after the last change the settings are written (ms). */
export const AUTOSAVE_DEBOUNCE_MS = 150;

/* The timer functions autosave uses (the browser's by default; a test hands in a clock it controls). */
export interface AutosaveTimers {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

/* What autosave takes besides the store. write(json): store the serialized settings (state.ts `save`); it reports a failure by
   returning false or by throwing; timers: as above; pageEvents: where 'pagehide' is heard (the window; null for none). */
export interface AutosaveOptions {
  write?: (json: string) => unknown;
  timers?: AutosaveTimers;
  pageEvents?: Pick<EventTarget, 'addEventListener' | 'removeEventListener'> | null;
}

/* What autosave gives back: flush() writes now if a change waits, or a write failed; stop() ends the saving (a waiting change is
   written first). */
export interface Autosave {
  flush(): void;
  stop(): void;
}

/* Start saving `store`'s settings: after the start and after each change of the `settings` slice (the only one that is saved),
   the JSON of `persisted(state)` is written AUTOSAVE_DEBOUNCE_MS after the last change, unless it is what was written last. The
   first write is made at the start too, since it repairs an older saved shape (state.ts restoreState). The JSON is made when it
   is written, not at each change, so a burst of changes costs one serialization. */
export function startAutosave(store: AppStore, options: AutosaveOptions = {}): Autosave {
  const write = options.write ?? save;
  const timers: AutosaveTimers = options.timers ?? {
    setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
    clearTimeout: handle => clearTimeout(handle as number),
  };
  const pageEvents = options.pageEvents === undefined ? (globalThis as unknown as EventTarget) : options.pageEvents;

  let timer: unknown = null;
  let waiting = false;
  let lastWritten: string | null = null;
  let seenRevision = store.revs.settings;

  /* Serialize the settings and write them unless they are what was written last. */
  function writeNow(): void {
    timer = null;
    waiting = false;
    const started = performance.now();
    const json = JSON.stringify(persisted(store.state));
    performance.measure('save', { start: started }); // read by scripts/perf/browser.mjs
    if (json === lastWritten) {
      return;
    }
    let stored: unknown;
    try {
      stored = write(json);
    } catch {
      stored = false;
    }
    if (stored === false) {
      waiting = true; // storage unavailable: the settings stay waiting, so the next change of the store, the next write and 'pagehide' try again
    } else {
      lastWritten = json;
    }
  }

  /* Wait AUTOSAVE_DEBOUNCE_MS from now for the write, replacing a wait already running. */
  function schedule(): void {
    if (timer !== null) {
      timers.clearTimeout(timer);
    }
    waiting = true;
    timer = timers.setTimeout(writeNow, AUTOSAVE_DEBOUNCE_MS);
  }

  /* Write now what waits (the page is going away). */
  function flush(): void {
    if (!waiting) {
      return;
    }
    if (timer !== null) {
      timers.clearTimeout(timer);
    }
    writeNow();
  }

  const unsubscribe = store.subscribe(() => {
    if (store.revs.settings === seenRevision) {
      if (waiting && timer === null) {
        schedule(); // a write failed: try again after this change of the store
      }
      return;
    }
    seenRevision = store.revs.settings;
    schedule();
  });
  pageEvents?.addEventListener('pagehide', flush);
  schedule();

  return {
    flush,
    stop() {
      unsubscribe();
      pageEvents?.removeEventListener('pagehide', flush);
      flush();
    },
  };
}
