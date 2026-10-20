/* The optimizer's solver: what runs the optimizer's search (optimizerView) and the line under Gear to search
   (gearToSearchView) for the optimizer component, on the page's thread or in a Web Worker (audit 16 R8, owner
   2026-10-19). Under a Target GCD with tier ranking a search can take seconds; in the worker the page stays responsive
   meanwhile.

   Both kinds of solver take the same request and give the same reply:
     request  {kind: 'solve' | 'gearToSearch', jobId, sync, level, recipe, choices}: plain data (solverRequest), so it
              can be posted to a worker
     reply    a Promise of {result (optimizerView's or gearToSearchView's), ms (how long the handler took)}; rejected
              with the handler's error message if it threw
   The solver session (core/session.js: the job's gear and the search caches) lives with the handler: in the worker
   when there is one, so the page's thread never builds the job's gear and only one copy of it is held.

   Pure module: no DOM and no Worker, so Node can test it. The page's worker is made in main.js (a Blob URL of the
   worker bundle, scripts/build/build.mjs solverWorker); its entry is ui/solver-worker.js. */
import { makeJobContext } from '../core/job-context.js';
import { makeSession } from '../core/session.js';
import { gearToSearchView, optimizerView } from './views/optimizer.js';

/* A solver request from the component's inputs: `kind` 'solve' (the optimizer's result) or 'gearToSearch' (the line
   under Gear to search); `inputs` as ui/settings.js optimizerInputs gives them ({job: a JobContext, sync, level,
   recipe}); `choices` the menu picks on the last result ({pieces, meal}: optimizerView). The JobContext goes as its
   id, rebuilt by the handler (makeJobContext is cached and pure). The other inputs must be plain data, not Alpine's
   reactive proxies (read the store through Alpine.raw), or posting them to the worker throws. */
export function solverRequest(kind, { job, sync, level, recipe }, choices = {}) {
  return { kind, jobId: job.jobId, sync, level, recipe, choices };
}

/* The handler of solver requests, with its own session (one per handler; a test may pass its own). Returns
   handle(request) → {result, ms}, or {error: message} when the view builder throws (optimizerView catches its own
   errors and shows them, so in practice only gearToSearchView can). Synchronous: the worker runs it on each message,
   the in-process solver on the page's thread. */
export function makeSolverHandler(session = makeSession()) {
  return request => {
    const t0 = performance.now();
    const { kind, jobId, sync, level, recipe, choices } = request;
    try {
      const job = makeJobContext(jobId);
      const result =
        kind === 'solve' ? optimizerView(job, sync, level, recipe, session, choices) : gearToSearchView(job, sync, level, recipe, session);
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

/* A solver that runs on the page's thread, as the page did before the worker; the tests use it, and the page falls back
   to it when the worker cannot start. Returns {blocksPage: true, request(request) → reply}: the handler runs at once,
   inside request(); blocksPage tells the component to paint its progress bar before asking. */
export function inProcessSolver(session = makeSession()) {
  const handle = makeSolverHandler(session);
  return { blocksPage: true, request: request => settle(handle(request)) };
}

/* A solver that posts its requests to a worker. `createWorker()` makes the worker, its data already handed over (the
   page's: main.js), and is called on the first request, so the worker starts only once the optimizer needs it.
   `fallback()` makes the solver used instead when the worker cannot be made (createWorker throws, e.g. a browser or
   policy that refuses workers) or fails (an 'error' event: it could not load, or it crashed): the requests not yet
   answered are asked of it again, so the page always gets an answer. Returns {blocksPage (true once fallen back),
   request(request) → reply}.

   One request per kind is in the worker at a time; a newer request of that kind waits, and replaces the one already
   waiting, whose caller then gets the newer one's reply (settings typed during a long search are not all solved one
   after the other). Each request is tagged with an id, and a reply goes to the request with its id. Callers still
   drop replies they no longer want (the component's solveId): a reply can come for settings that have changed since.
   No reply is cut short: terminating the worker would also throw away its session (the job's gear and the caches). */
export function workerSolver(createWorker, fallback = inProcessSolver) {
  let worker = null;
  let backup = null; // the fallback solver, once the worker failed
  let nextId = 0;
  // per kind: the request in the worker and the one waiting, each {id, request, callers: [{resolve, reject}]}
  const lanes = { solve: { flight: null, waiting: null }, gearToSearch: { flight: null, waiting: null } };

  // a reply (a Promise) handed to every caller of a request
  const answer = (callers, reply) =>
    reply.then(
      value => {
        for (const c of callers) c.resolve(value);
      },
      error => {
        for (const c of callers) c.reject(error);
      },
    );

  // 1. the fallback: every caller still waiting is answered by it, with the newest request of its kind
  const fallBack = () => {
    if (backup) return;
    backup = fallback();
    worker?.terminate();
    worker = null;
    for (const lane of Object.values(lanes)) {
      const pending = [lane.flight, lane.waiting].filter(Boolean);
      lane.flight = lane.waiting = null;
      if (!pending.length) continue;
      answer(
        pending.flatMap(p => p.callers),
        backup.request(pending.at(-1).request),
      );
    }
  };

  // 2. a request to the worker: post it, or answer its callers with the error if it cannot be posted (not plain data)
  const post = (lane, entry) => {
    lane.flight = entry;
    try {
      worker.postMessage({ id: entry.id, ...entry.request });
    } catch (error) {
      lane.flight = null;
      answer(entry.callers, Promise.reject(error));
    }
  };

  // 3. a reply from the worker: to the callers of the request with its id; then the waiting request of that kind goes
  const onReply = ({ data }) => {
    const lane = Object.values(lanes).find(l => l.flight?.id === data.id);
    if (!lane) return;
    const { callers } = lane.flight;
    lane.flight = null;
    answer(callers, settle(data));
    if (lane.waiting) {
      const next = lane.waiting;
      lane.waiting = null;
      post(lane, next);
    }
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
    worker.onerror = event => {
      event?.preventDefault?.(); // handled: not reported as an uncaught error of the page
      fallBack();
    };
  };

  return {
    get blocksPage() {
      return !!backup;
    },
    request(request) {
      if (!worker && !backup) start();
      if (backup) return backup.request(request);
      return new Promise((resolve, reject) => {
        const lane = lanes[request.kind];
        if (!lane) throw new Error(`unknown solver request kind: ${request.kind}`);
        const caller = { resolve, reject };
        if (!lane.flight) {
          post(lane, { id: ++nextId, request, callers: [caller] });
        } else {
          // the newest waits; an older waiting one is replaced, its callers answered with the newest's reply
          const callers = [...(lane.waiting?.callers ?? []), caller];
          lane.waiting = { id: ++nextId, request, callers };
        }
      });
    },
  };
}
