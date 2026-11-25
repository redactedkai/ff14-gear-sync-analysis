// The numbers from src/core, asked of the worker thread in core-worker.mjs.

import { Worker } from 'node:worker_threads';

// The numbers the page must show come from src/core (lib/core-worker.mjs), computed in a worker thread.
export let coreWorker;

const coreCalls = new Map(); // key -> promise of the result: a call made twice is computed once

let coreId = 0;

export function startCore() {
  coreWorker = new Worker(new URL('./core-worker.mjs', import.meta.url));
  coreWorker.on('message', ({ id, result, error }) => {
    const call = coreCalls.get(id);
    if (error) {
      call.reject(new Error(error));
    } else {
      call.resolve(result);
    }
  });
  coreWorker.on('error', e => {
    for (const c of coreCalls.values()) {
      c.reject?.(e);
    }
  });
}

/** `fn` of core-worker.mjs in the worker, with JSON-able `args`. */
export function core(fn, ...args) {
  const key = JSON.stringify([fn, args]);
  if (!coreCalls.has(key)) {
    const id = coreId++;
    const p = new Promise((resolve, reject) => coreCalls.set(id, { resolve, reject }));
    coreCalls.set(key, p);
    coreWorker.postMessage({ id, fn, args });
  }
  return coreCalls.get(key);
}

export const coreGear = (...a) => core('coreGear', ...a);

export const coreFiltered = (...a) => core('coreFiltered', ...a);

export const coreRecipe = (...a) => core('coreRecipe', ...a);

export const coreRings = (...a) => core('coreRings', ...a);

export const coreKeys = (...a) => core('coreKeys', ...a);
