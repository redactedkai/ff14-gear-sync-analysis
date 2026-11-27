// Scripts a group runs in every page before the page's own script (addInitScript).

/** Scripts that keep the solver worker from running, for the fallback groups (addInitScript, before the page's own
 * script): a browser with no Worker, and a worker whose script fails as it loads (an 'error' event). */
export const NO_WORKER = () => {
  Reflect.deleteProperty(window, 'Worker');
};

export const FAILING_WORKER = () => {
  const RealWorker = window.Worker;
  window.Worker = class extends RealWorker {
    constructor(_pageWorkerUrl: string | URL, options?: WorkerOptions) {
      // the page's worker script is replaced by one that throws
      const failing = new Blob(['throw new Error("worker failed to load (smoke test)")'], { type: 'text/javascript' });
      super(URL.createObjectURL(failing), options);
    }
  };
};

/** A solver worker that never answers an Auto-fill while `window.__holdSolve` is true (a stand-in for a slow search: addInitScript,
 * before the page's own script). Gear to search requests still get their answers, and Cancel still ends the worker. The test
 * sets the flag, so an Auto-fill stays running as long as the step needs, on any machine. */
export const HOLD_SOLVE = () => {
  const RealWorker = window.Worker;
  window.__holdSolve = true;
  window.Worker = class extends RealWorker {
    postMessage(message: unknown, transfer: Transferable[]): void;
    postMessage(message: unknown, options?: StructuredSerializeOptions): void;
    postMessage(message: unknown, second?: Transferable[] | StructuredSerializeOptions): void {
      const kind = typeof message === 'object' && message !== null && 'kind' in message ? message.kind : null;
      if (window.__holdSolve && kind === 'solve') {
        return;
      }
      if (Array.isArray(second)) {
        super.postMessage(message, second);
      } else {
        super.postMessage(message, second);
      }
    }
  };
};

/** A solver worker that answers a Gear to search request only after 300 ms (a stand-in for a busy worker: addInitScript,
 * before the page's own script). The delayed request keeps the label of the Auto-fill settings' Target GCD field at its
 * first state, "Target GCD" alone, for that long: a check that reads the label too early sees it. Auto-fill requests go
 * through at once. */
export const SLOW_COUNT = () => {
  const RealWorker = window.Worker;
  window.Worker = class extends RealWorker {
    postMessage(message: unknown, transfer: Transferable[]): void;
    postMessage(message: unknown, options?: StructuredSerializeOptions): void;
    postMessage(message: unknown, second?: Transferable[] | StructuredSerializeOptions): void {
      const kind = typeof message === 'object' && message !== null && 'kind' in message ? message.kind : null;
      const send = () => {
        if (Array.isArray(second)) {
          super.postMessage(message, second);
        } else {
          super.postMessage(message, second);
        }
      };
      if (kind === 'gearToSearch') {
        setTimeout(send, 300);
      } else {
        send();
      }
    }
  };
};

/** Turns the page's reload and close guard off (the dev flag, src/ui/router/unload-guard.ts), so a step that reloads or closes
 * the page while a draft is open is not held by the browser's question. Every group gets it (smoke.ts runGroup), before the
 * page's own script. `flagKey` is the flag's localStorage key. The flag is set once per tab (sessionStorage remembers it), so a
 * step that wants the guard sets the flag to '0' and later loads keep it, and a reset of the page's saved keys (the startup
 * check) is not undone by the next load. */
export const NO_UNLOAD_GUARD = (flagKey: string) => {
  try {
    if (sessionStorage.getItem(flagKey) === null) {
      sessionStorage.setItem(flagKey, 'set');
      localStorage.setItem(flagKey, '1');
    }
  } catch {
    // no storage: the guard is on, as for a person
  }
};
