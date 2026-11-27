// The numbers from src/core, asked of the worker thread in core-worker.ts.

import { Worker } from 'node:worker_threads';
import type { CoreCall, FUNCTIONS } from './core-worker.ts';

// The numbers the page must show come from src/core (lib/core-worker.ts), computed in a worker thread.
export let coreWorker: Worker;

type Pending = { resolve: (result: unknown) => void; reject: (error: Error) => void };

/* id -> the promise's resolvers of a call in flight; key (the call as JSON) -> the call's promise: a call made twice is
   computed once. */
const pendingById = new Map<number, Pending>();
const promiseByKey = new Map<string, Promise<unknown>>();

let coreId = 0;

/** Starts the worker thread that answers the `core` calls. */
export function startCore() {
  coreWorker = new Worker(new URL('./core-worker.ts', import.meta.url));
  coreWorker.on('message', ({ id, result, error }: { id: number; result?: unknown; error?: string }) => {
    const call = pendingById.get(id);
    if (!call) {
      return;
    }
    if (error) {
      call.reject(new Error(error));
    } else {
      call.resolve(result);
    }
  });
  coreWorker.on('error', e => {
    for (const call of pendingById.values()) {
      call.reject(e);
    }
  });
}

type CoreFunctions = typeof FUNCTIONS;

/** What `fn` of core-worker.ts returns in the worker, for JSON-able `args`. */
export function core<F extends keyof CoreFunctions>(
  fn: F,
  ...args: Parameters<CoreFunctions[F]>
): Promise<Awaited<ReturnType<CoreFunctions[F]>>> {
  const key = JSON.stringify([fn, args]);
  let promise = promiseByKey.get(key);
  if (!promise) {
    const id = coreId++;
    promise = new Promise((resolve, reject) => pendingById.set(id, { resolve, reject }));
    promiseByKey.set(key, promise);
    const call: CoreCall = { id, fn, args } as CoreCall;
    coreWorker.postMessage(call);
  }
  return promise as Promise<Awaited<ReturnType<CoreFunctions[F]>>>;
}

export const coreGear = (...args: Parameters<CoreFunctions['coreGear']>) => core('coreGear', ...args);

export const coreFiltered = (...args: Parameters<CoreFunctions['coreFiltered']>) => core('coreFiltered', ...args);

export const coreRecipe = (...args: Parameters<CoreFunctions['coreRecipe']>) => core('coreRecipe', ...args);

export const coreRings = (...args: Parameters<CoreFunctions['coreRings']>) => core('coreRings', ...args);

export const coreKeys = (...args: Parameters<CoreFunctions['coreKeys']>) => core('coreKeys', ...args);

export const coreSet = (...args: Parameters<CoreFunctions['coreSet']>) => core('coreSet', ...args);
