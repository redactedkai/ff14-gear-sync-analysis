/* The page's solver: what runs a set page's Auto-fill (solve.js solveView) and the line under its Auto-fill settings' Gear
   to search (gearToSearchView), on the page's thread or in a Web Worker. Under a Target GCD with tier ranking a search
   can take seconds; in the worker the page stays responsive meanwhile.

   Both kinds of solver take the same request and give the same reply:
     request  {kind: 'solve' | 'gearToSearch', jobId, sync, level, recipe, key?, pins?}: plain data (solverRequest), so
              it can be posted to a worker (the worker solver keeps `key` to itself; see workerSolver)
     reply    a Promise of {result (solveView's or gearToSearchView's), ms (how long the handler took)}; rejected
              with the handler's error message if it threw, or with a cancelled error (isCancelled) if cancel(kind)
              stopped it (the worker solver only)
   The solver session (core/session.js: the job's gear and the search caches) lives with the handler: in the worker
   when there is one, so the page's thread never builds the job's gear and only one copy of it is held.

   Pure module: no DOM and no Worker, so Node can test it. The page's worker is made in main.js (a Blob URL of the
   worker bundle, scripts/build/build.mjs solverWorker); its entry is ui/solver-worker.js. */
import { makeJobContext } from '../core/job-context.ts';
import { makeSession } from '../core/session.js';
import { gearToSearchView, solveView } from './solve.js';

/** A solver request from an element's inputs: `kind` 'solve' (an Auto-fill's answer) or 'gearToSearch' (the line under Gear
   to search); `inputs` {job: a JobContext, sync (job-sync-panel.js syncSettings), level, recipe (sheets/fill-settings.js
   fillRecipe)}; options: `key` (a string or number) names the caller, so that workerSolver keeps its requests apart
   from other callers' (a gear set's id); `pins` (sheets/fill.js fillPlan's {pieces, meal}) the slots an Auto-fill keeps, sent
   only when there are some. The JobContext goes as its id, rebuilt by the handler (makeJobContext is cached and pure).
   The other inputs must be plain data (no Proxy objects, no functions), or posting them to
   the worker throws.
   @param {string} kind
   @param {{ job: { jobId: string }, sync: unknown, level: unknown, recipe: unknown }} inputs
   @param {{ key?: string | number, pins?: unknown }} [options]
   @returns {import('./elements/set-page/session-types.ts').SolverRequest} */
export function solverRequest(kind, { job, sync, level, recipe }, { key, pins = null } = {}) {
  const request = { kind, jobId: job.jobId, sync, level, recipe };
  if (pins) {
    request.pins = pins;
  }
  if (key !== undefined) {
    request.key = key;
  }
  return request;
}

/* The handler of solver requests, with its own session (one per handler; a test may pass its own). Returns
   handle(request) → {result, ms}, or {error: message} when the view builder throws (solveView catches its own errors
   and answers with them, so in practice only gearToSearchView can). Synchronous: the worker runs it on each message,
   the in-process solver on the page's thread. */
export function makeSolverHandler(session = makeSession()) {
  return request => {
    const t0 = performance.now();
    const { kind, jobId, sync, level, recipe, pins } = request;
    try {
      const job = makeJobContext(jobId);
      const result =
        kind === 'solve' ? solveView(job, sync, level, recipe, session, pins ?? null) : gearToSearchView(job, sync, level, recipe, session);
      return { result, ms: performance.now() - t0 };
    } catch (e) {
      return { error: e?.message || String(e) };
    }
  };
}

/* A handler's answer ({result, ms} or {error}) as a solver's reply: a Promise of {result, ms}, rejected on an error. */
function settle(answer) {
  return 'error' in answer ? Promise.reject(new Error(answer.error)) : Promise.resolve({ result: answer.result, ms: answer.ms });
}

/* The error a cancelled request's reply is rejected with (workerSolver cancel): `cancelled` marks it, so the caller can
   tell it from a failed request and ignore it. */
function cancelledError() {
  return Object.assign(new Error('search cancelled'), { cancelled: true });
}

/* How long a request may stay in the worker before it is stopped as hung (ms). The slowest search measured is 18 s
   (tier ranking with a Target GCD, eight sweeps sharing the machine; perf-log.md section 5.1), and
   a Gear to search request takes 20 to 100 ms, so 60 s leaves a slow device three times that and still ends a worker
   that will never answer. */
const SOLVER_TIMEOUT_MS = 60_000;

/* The error of a request stopped by SOLVER_TIMEOUT_MS; its message ends the page's "The search failed: ..." line. */
function timedOutError(ms) {
  return new Error(`no answer after ${ms / 1000} s`);
}

/* Whether a solver reply was rejected because its request was cancelled (true), not because it failed. */
export function isCancelled(error) {
  return error?.cancelled === true;
}

/* A solver that runs on the page's thread; the tests use it, and the page falls back to it when the worker cannot
   start. Returns {blocksPage: true, request(request) → reply, cancel(kind) → false}: the
   handler runs at once, inside request(), so there is never a request to stop; blocksPage tells the caller to paint
   its progress bar before asking. */
export function inProcessSolver(session = makeSession()) {
  const handle = makeSolverHandler(session);
  return { blocksPage: true, request: request => settle(handle(request)), cancel: () => false };
}

/* A solver that posts its requests to a worker. `createWorker()` makes the worker, its data already handed over (the
   page's: main.js), and is called on the first request, so the worker starts only once a set page needs it.
   `fallback()` makes the solver used instead when the worker cannot be made (createWorker throws, e.g. a browser or
   policy that refuses workers) or fails (an 'error' event: it could not load, or it crashed; or a 'messageerror': a
   reply the page could not deserialize): the requests not yet answered are asked of it again, so the page always gets
   an answer. Returns {blocksPage (true once fallen back),
   request(request) → reply, cancel(kind) → whether the worker was stopped}.

   One request per kind is in the worker at a time; a newer request of that kind waits, and replaces the one already
   waiting from the same caller, whose caller then gets the newer one's reply (settings typed during a long search are
   not all solved one after the other). A caller is named by the request's optional `key` (e.g. a gear set's id):
   requests with different keys never replace each other and each gets its own reply; requests without a key all
   count as one caller. Each request is tagged with an id, and a reply goes to the request with its id. Callers still
   drop replies they no longer want (the set page's fillId): a reply can come for settings that have changed since.
   A request that cannot be posted (not plain data) is answered with the error, and the next waiting request of its
   kind is posted, so no caller waits behind it.

   cancel(kind, key) stops the request of that kind in the worker (an Auto-fill's Cancel): a worker cannot be interrupted
   mid-search, so it is terminated, and a fresh one is started at once (it parses the data again; its session builds
   the job's gear again). The cancelled request and the ones waiting behind it are rejected with a cancelled error
   (isCancelled); with a `key`, only that key's: when that key's request is in the worker, the other keys' waiting
   requests are asked of the new worker; when it is only waiting, it is taken out of the queue and rejected, and the
   worker goes on with the request it has. The other kind's requests not yet answered are posted to the new worker, so
   none is lost; with none, the last Gear to search request is asked again, so the new worker builds the job's gear
   before the next search. With nothing of that kind (and key) in the worker or waiting (it was answered, or the solver
   has fallen back to the page's thread) cancel does nothing and returns false: the caller just drops the reply.

   A request still in the worker after `timeoutMs` (SOLVER_TIMEOUT_MS) is stopped the same way, its callers rejected
   with an error saying so (not a cancelled one: the page shows it as a failed search); only the callers of the
   timed-out request's key are rejected, other keys' waiting requests are asked of the new worker. */
export function workerSolver(createWorker, fallback = inProcessSolver, { timeoutMs = SOLVER_TIMEOUT_MS } = {}) {
  let worker = null;
  let backup = null; // the fallback solver, once the worker failed
  let nextId = 0;
  // per kind: the request in the worker (`flight`) and the ones waiting (`waiting`: one per caller key, in the order they
  // were asked), each {id, key, request, callers: [{resolve, reject}]}
  const lanes = { solve: { flight: null, waiting: new Map() }, gearToSearch: { flight: null, waiting: new Map() } };
  let lastGearToSearch = null; // the last Gear to search request asked for: asked again of a restarted worker

  // a reply (a Promise) handed to every caller of a request
  const answer = (callers, reply) =>
    reply.then(
      value => {
        for (const c of callers) {
          c.resolve(value);
        }
      },
      error => {
        for (const c of callers) {
          c.reject(error);
        }
      },
    );

  // a lane's requests not yet answered, emptied from it: one entry per caller key, each the newest request of that key
  // with the callers of all that key's requests (requests without a key count as one key); [] if none
  const takePending = lane => {
    const byKey = new Map();
    for (const entry of [lane.flight, ...lane.waiting.values()]) {
      if (!entry) {
        continue;
      }
      const older = byKey.get(entry.key);
      byKey.set(entry.key, older ? { ...entry, callers: [...older.callers, ...entry.callers] } : entry);
    }
    lane.flight = null;
    lane.waiting.clear();
    return [...byKey.values()];
  };

  // the worker stopped, its handlers off first (a reply already on its way is not taken), its requests' timers cleared
  const stopWorker = () => {
    if (!worker) {
      return;
    }
    for (const lane of Object.values(lanes)) {
      clearTimeout(lane.flight?.timer);
    }
    worker.onmessage = worker.onerror = worker.onmessageerror = null;
    worker.terminate();
    worker = null;
  };

  // 1. the fallback: every caller still waiting is answered by it, with the newest request of its kind and key
  const fallBack = () => {
    if (backup) {
      return;
    }
    backup = fallback();
    stopWorker();
    for (const lane of Object.values(lanes)) {
      for (const pending of takePending(lane)) {
        answer(pending.callers, backup.request(pending.request));
      }
    }
  };

  // 2. a request to the worker: post it, or answer its callers with the error if it cannot be posted (not plain data)
  // and post the next one waiting. The key stays on the page: the worker is sent the request without it.
  const post = (lane, entry) => {
    lane.flight = entry;
    entry.timer = setTimeout(() => restart(entry.request.kind, timedOutError(timeoutMs), entry.key), timeoutMs);
    entry.timer?.unref?.(); // in Node (the tests), a pending timer does not keep the process running
    try {
      const { key, ...message } = entry.request;
      worker.postMessage({ id: entry.id, ...message });
    } catch (error) {
      clearTimeout(entry.timer);
      lane.flight = null;
      answer(entry.callers, Promise.reject(error));
      postNext(lane);
    }
  };

  // the oldest request waiting in a lane, posted (none waiting: nothing happens)
  const postNext = lane => {
    const next = lane.waiting.values().next().value;
    if (!next) {
      return;
    }
    lane.waiting.delete(next.key);
    post(lane, next);
  };

  // a request of a lane: posted if the worker is free; otherwise it waits, replacing the request already waiting with
  // the same key, whose callers then get the newer one's reply (a request with another key is not touched)
  const enqueue = (lane, entry) => {
    if (!lane.flight) {
      post(lane, entry);
      return;
    }
    const older = lane.waiting.get(entry.key);
    lane.waiting.delete(entry.key); // the newest goes last
    lane.waiting.set(entry.key, older ? { ...entry, callers: [...older.callers, ...entry.callers] } : entry);
  };

  // 3. a reply from the worker: to the callers of the request with its id; then the next waiting request of that kind
  const onReply = ({ data }) => {
    const lane = Object.values(lanes).find(l => l.flight?.id === data.id);
    if (!lane) {
      return;
    }
    const { callers, timer } = lane.flight;
    clearTimeout(timer);
    lane.flight = null;
    answer(callers, settle(data));
    postNext(lane);
  };

  // 4. the worker, made on the first request
  const start = () => {
    try {
      worker = createWorker();
    } catch {
      fallBack();
      return;
    }
    worker.onmessage = onReply;
    // it could not load or it crashed ('error'), or a reply could not be read on the page ('messageerror', which
    // carries no id, so that request would never be answered): the page's thread answers instead
    worker.onerror = worker.onmessageerror = event => {
      event?.preventDefault?.(); // handled: not reported as an uncaught error of the page
      fallBack();
    };
  };

  // 5. cancel or a timeout: the worker terminated and a fresh one started, the requests that stay posted to it (section
  // above). With a `key` only that key's requests of `kind` are rejected with `error`, and the other keys' requests of
  // the kind are asked again; without one all of the kind's are rejected. A key whose request only waits is taken out
  // of the queue and rejected, and the worker is left as it is.
  const restart = (kind, error, key) => {
    const lane = lanes[kind];
    if (!worker || !lane) {
      return false;
    }
    if (key !== undefined && lane.flight?.key !== key) {
      const waiting = lane.waiting.get(key);
      if (!waiting) {
        return false;
      }
      lane.waiting.delete(key);
      for (const caller of waiting.callers) {
        caller.reject(error);
      }
      return true;
    }
    if (!lane.flight) {
      return false;
    }
    const stopped = takePending(lane);
    stopWorker();
    const kept = [];
    for (const pending of stopped) {
      if (key === undefined || pending.key === key) {
        for (const caller of pending.callers) {
          caller.reject(error);
        }
      } else {
        kept.push(pending);
      }
    }
    start();
    if (backup) {
      // the new worker could not be made: fallBack has asked the page's thread for the other lanes
      for (const pending of kept) {
        answer(pending.callers, backup.request(pending.request));
      }
      return true;
    }
    let resent = false;
    for (const pending of kept) {
      enqueue(lane, pending);
      resent = true;
    }
    for (const other of Object.values(lanes)) {
      if (other === lane) {
        continue;
      }
      for (const pending of takePending(other)) {
        enqueue(other, pending);
        resent = true;
      }
    }
    if (!resent && lastGearToSearch) {
      post(lanes.gearToSearch, { id: ++nextId, key: null, request: lastGearToSearch, callers: [] });
    }
    return true;
  };

  return {
    get blocksPage() {
      return Boolean(backup);
    },
    cancel: (kind, key) => restart(kind, cancelledError(), key === undefined ? undefined : (key ?? null)),
    request(request) {
      if (!worker && !backup) {
        start();
      }
      if (backup) {
        return backup.request(request);
      }
      if (request.kind === 'gearToSearch') {
        lastGearToSearch = request;
      }
      return new Promise((resolve, reject) => {
        const lane = lanes[request.kind];
        if (!lane) {
          throw new Error(`unknown solver request kind: ${request.kind}`);
        }
        enqueue(lane, { id: ++nextId, key: request.key ?? null, request, callers: [{ resolve, reject }] });
      });
    },
  };
}
