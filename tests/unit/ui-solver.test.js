/* The optimizer's solver (src/ui/solver.js): the request handler as a plain function (what the worker runs on each
   message), its requests and replies passing a structured clone (what postMessage does), the worker solver's ids,
   one request per kind in the worker with the newest waiting, and its fallback to the page's thread. A fake worker
   stands in for the browser's: it answers when the test says so. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSession } from '../../src/core/session.js';
import { inProcessSolver, isCancelled, makeSolverHandler, solverRequest, workerSolver } from '../../src/ui/solver.js';
import { optimizerInputs } from '../../src/ui/settings.js';
import { restoreState } from '../../src/ui/state.js';
import { createAppStore } from '../../src/ui/store.js';
import { gearToSearchView, optimizerView } from '../../src/ui/views/optimizer.js';

const inputsOf = saved => optimizerInputs(createAppStore(restoreState(saved)));
const SGE = inputsOf({ job: 'SGE', sync: true, cap: 123, level: 100, opt: { food: true, byTier: false } });

test('solver handler: a solve and a Gear to search request give the view builders own results, cloned intact', () => {
  const session = makeSession();
  const handle = makeSolverHandler(session);
  const { job, sync, level, recipe } = SGE;
  // what postMessage does to the request and the reply: a structured clone
  const solve = handle(structuredClone(solverRequest('solve', SGE)));
  assert.ok(solve.ms >= 0);
  assert.equal(solve.result.kind, 'ok');
  assert.deepEqual(structuredClone(solve), solve);
  assert.deepEqual(solve.result, optimizerView(job, sync, level, recipe, session));
  const side = handle(structuredClone(solverRequest('gearToSearch', SGE)));
  assert.deepEqual(side.result, gearToSearchView(job, sync, level, recipe, session));
});

test('solver handler: menu picks reach the search; a throw comes back as {error}', () => {
  const handle = makeSolverHandler();
  const first = handle(solverRequest('solve', SGE)).result;
  const row = first.rows.findIndex(r => r.same);
  const other = first.rows[row].same.groups.flatMap(g => g.items).find(x => !x.on);
  const picked = handle(solverRequest('solve', SGE, { pieces: { [row]: other.key }, meal: null })).result;
  assert.equal(picked.rows[row].item.gameId, other.key);
  const broken = makeSolverHandler({
    gear: () => {
      throw new Error('no gear');
    },
  });
  assert.deepEqual(broken(solverRequest('gearToSearch', SGE)), { error: 'no gear' });
});

test('in-process solver: answers at once and blocks the page; an error rejects', async () => {
  const solver = inProcessSolver();
  assert.equal(solver.blocksPage, true);
  const { result } = await solver.request(solverRequest('gearToSearch', SGE));
  assert.match(result.countText, /^searching [\d,]+ of [\d,]+ pieces$/);
  await assert.rejects(solver.request({ ...solverRequest('gearToSearch', SGE), jobId: 'SGE', recipe: null }));
});

/* A stand-in for the page's worker: keeps what is posted; reply(i, body) answers posted message i as the worker would,
   fail() fires its 'error' event. */
function fakeWorker() {
  const worker = {
    posted: [],
    terminated: false,
    onmessage: null,
    onerror: null,
    postMessage(message) {
      worker.posted.push(structuredClone(message));
    },
    terminate() {
      worker.terminated = true;
    },
    reply(i, body) {
      worker.onmessage({ data: { id: worker.posted[i].id, ...body } });
    },
    fail() {
      worker.onerror({ preventDefault() {} });
    },
  };
  return worker;
}

const request = (kind, mark) => ({ kind, jobId: 'SGE', mark });

test('worker solver: starts the worker on the first request; replies go to their request by id', async () => {
  let made = 0;
  const worker = fakeWorker();
  const solver = workerSolver(() => {
    made++;
    return worker;
  });
  assert.equal(made, 0, 'no worker before a request');
  const solve = solver.request(request('solve', 1));
  const side = solver.request(request('gearToSearch', 2));
  assert.equal(made, 1);
  assert.equal(solver.blocksPage, false);
  assert.deepEqual(
    worker.posted.map(m => [m.kind, m.mark]),
    [
      ['solve', 1],
      ['gearToSearch', 2],
    ],
  );
  assert.notEqual(worker.posted[0].id, worker.posted[1].id);
  // the replies in the other order: each reaches its own request
  worker.reply(1, { result: 'side', ms: 3 });
  worker.reply(0, { result: 'view', ms: 5 });
  assert.deepEqual(await solve, { result: 'view', ms: 5 });
  assert.deepEqual(await side, { result: 'side', ms: 3 });
  worker.onmessage({ data: { id: 999, result: 'unknown' } }); // no request with that id: ignored
  const failing = solver.request(request('gearToSearch', 3));
  worker.reply(2, { error: 'no gear' });
  await assert.rejects(failing, /no gear/);
});

test('worker solver: one request per kind in the worker; the newest waits and answers the ones it replaced', async () => {
  const worker = fakeWorker();
  const solver = workerSolver(() => worker);
  const answers = [];
  const ask = mark =>
    solver.request(request('gearToSearch', mark)).then(reply => {
      answers.push([mark, reply.result]);
    });
  const all = [ask(1), ask(2), ask(3), ask(4)];
  assert.deepEqual(
    worker.posted.map(m => m.mark),
    [1],
    'the others wait for the first',
  );
  worker.reply(0, { result: 'for 1', ms: 1 });
  assert.deepEqual(
    worker.posted.map(m => m.mark),
    [1, 4],
    'only the newest waiting one is posted next',
  );
  worker.reply(1, { result: 'for 4', ms: 1 });
  await Promise.all(all);
  assert.deepEqual(answers, [
    [1, 'for 1'],
    [2, 'for 4'],
    [3, 'for 4'],
    [4, 'for 4'],
  ]);
});

test('worker solver: no worker (creating it throws): every request runs on the page thread', async () => {
  const handled = [];
  const solver = workerSolver(
    () => {
      throw new Error('workers are blocked');
    },
    () => ({ blocksPage: true, request: r => Promise.resolve({ result: `local ${r.mark}`, ms: 1 }).finally(() => handled.push(r.mark)) }),
  );
  assert.deepEqual(await solver.request(request('solve', 1)), { result: 'local 1', ms: 1 });
  assert.equal(solver.blocksPage, true);
  await solver.request(request('gearToSearch', 2));
  assert.deepEqual(handled, [1, 2]);
});

test('worker solver: the worker fails: the requests not yet answered are asked again on the page thread', async () => {
  const worker = fakeWorker();
  const handled = [];
  const solver = workerSolver(
    () => worker,
    () => ({
      blocksPage: true,
      request: r => {
        handled.push(r.mark);
        return Promise.resolve({ result: `local ${r.mark}`, ms: 1 });
      },
    }),
  );
  const a = solver.request(request('solve', 1));
  const b = solver.request(request('solve', 2)); // waiting behind 1
  const c = solver.request(request('gearToSearch', 3));
  worker.fail();
  assert.equal(worker.terminated, true);
  assert.equal(solver.blocksPage, true);
  // per kind, the newest request is asked again, and answers every caller of that kind
  assert.deepEqual(handled, [2, 3]);
  assert.deepEqual(
    (await Promise.all([a, b, c])).map(r => r.result),
    ['local 2', 'local 2', 'local 3'],
  );
  await solver.request(request('solve', 4));
  assert.deepEqual(handled, [2, 3, 4], 'later requests go to the page thread too');
});

test('worker solver: a request that cannot be posted rejects, and the next one still goes', async () => {
  const worker = fakeWorker();
  const solver = workerSolver(() => worker);
  const proxy = new Proxy({}, {}); // like Alpine's reactive proxies: not cloneable
  await assert.rejects(solver.request({ kind: 'solve', recipe: proxy }), /could not be cloned/);
  const next = solver.request(request('solve', 2));
  worker.reply(0, { result: 'ok', ms: 1 });
  assert.deepEqual(await next, { result: 'ok', ms: 1 });
});

/* Workers made by a worker solver, one fake per createWorker call (cancel starts a new one). */
function fakeWorkers() {
  const made = [];
  return {
    made,
    create: () => {
      made.push(fakeWorker());
      return made.at(-1);
    },
  };
}

const wasCancelled = error => isCancelled(error);

test('worker solver: cancel stops a running search: the worker is terminated, its callers get a cancelled error', async () => {
  const workers = fakeWorkers();
  const solver = workerSolver(workers.create);
  const running = solver.request(request('solve', 1));
  const waiting = solver.request(request('solve', 2)); // behind 1
  const old = workers.made[0];
  assert.equal(solver.cancel('solve'), true);
  assert.equal(old.terminated, true);
  assert.equal(workers.made.length, 2, 'a fresh worker is started at once');
  for (const reply of [running, waiting]) await assert.rejects(reply, wasCancelled);
  assert.equal(solver.blocksPage, false);
  // the next search goes to the new worker at once, not behind the cancelled one
  const next = solver.request(request('solve', 3));
  const fresh = workers.made[1];
  assert.deepEqual(
    fresh.posted.map(m => m.mark),
    [3],
  );
  fresh.reply(0, { result: 'for 3', ms: 1 });
  assert.deepEqual(await next, { result: 'for 3', ms: 1 });
  assert.equal(old.onmessage, null, 'a late reply of the old worker is not taken');
});

test("worker solver: cancel re-sends the other kind's unanswered requests to the new worker", async () => {
  const workers = fakeWorkers();
  const solver = workerSolver(workers.create);
  const search = solver.request(request('solve', 1));
  const sideA = solver.request(request('gearToSearch', 2));
  const sideB = solver.request(request('gearToSearch', 3)); // waiting behind 2
  solver.cancel('solve');
  await assert.rejects(search, wasCancelled);
  const fresh = workers.made[1];
  // the newest of that kind is posted again, and answers both callers
  assert.deepEqual(
    fresh.posted.map(m => [m.kind, m.mark]),
    [['gearToSearch', 3]],
  );
  fresh.reply(0, { result: 'side 3', ms: 1 });
  assert.deepEqual(
    (await Promise.all([sideA, sideB])).map(r => r.result),
    ['side 3', 'side 3'],
  );
});

test('worker solver: with nothing else pending, cancel asks the new worker the last Gear to search request again', async () => {
  const workers = fakeWorkers();
  const solver = workerSolver(workers.create);
  const side = solver.request(request('gearToSearch', 1));
  workers.made[0].reply(0, { result: 'side 1', ms: 1 });
  await side;
  const search = solver.request(request('solve', 2));
  solver.cancel('solve');
  await assert.rejects(search, wasCancelled);
  const fresh = workers.made[1];
  assert.deepEqual(
    fresh.posted.map(m => [m.kind, m.mark]),
    [['gearToSearch', 1]],
    "the new worker builds the job's gear before the next search",
  );
  // a Gear to search request asked meanwhile waits for it, then goes
  const next = solver.request(request('gearToSearch', 3));
  fresh.reply(0, { result: 'side 1', ms: 1 });
  fresh.reply(1, { result: 'side 3', ms: 1 });
  assert.deepEqual(await next, { result: 'side 3', ms: 1 });
});

test('worker solver: cancel with no search in the worker, or after the fallback, only returns false', async () => {
  const workers = fakeWorkers();
  const solver = workerSolver(workers.create, () => ({ blocksPage: true, request: () => Promise.resolve({ result: 'local', ms: 1 }) }));
  assert.equal(solver.cancel('solve'), false, 'no worker yet');
  const search = solver.request(request('solve', 1));
  workers.made[0].reply(0, { result: 'done', ms: 1 });
  await search;
  assert.equal(solver.cancel('solve'), false, 'the search was answered: nothing to stop');
  assert.deepEqual([workers.made.length, workers.made[0].terminated], [1, false]);
  workers.made[0].fail();
  assert.equal(solver.blocksPage, true);
  const local = solver.request(request('solve', 2));
  assert.equal(solver.cancel('solve'), false, 'on the page thread there is nothing to stop');
  assert.deepEqual(await local, { result: 'local', ms: 1 });
  assert.equal(inProcessSolver().cancel('solve'), false);
});

test('worker solver: cancel when the new worker cannot be made: the other requests go to the page thread', async () => {
  let calls = 0;
  const first = fakeWorker();
  const solver = workerSolver(
    () => {
      if (calls++) throw new Error('workers are blocked');
      return first;
    },
    () => ({ blocksPage: true, request: r => Promise.resolve({ result: `local ${r.mark}`, ms: 1 }) }),
  );
  const search = solver.request(request('solve', 1));
  const side = solver.request(request('gearToSearch', 2));
  assert.equal(solver.cancel('solve'), true);
  await assert.rejects(search, wasCancelled);
  assert.deepEqual(await side, { result: 'local 2', ms: 1 });
  assert.equal(solver.blocksPage, true);
});
