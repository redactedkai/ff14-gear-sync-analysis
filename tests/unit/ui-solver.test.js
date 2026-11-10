/* The page's solver (src/ui/solver.js): the request handler as a plain function (what the worker runs on each
   message), its requests and replies passing a structured clone (what postMessage does), the worker solver's ids,
   one request per kind in the worker with the newest waiting, and its fallback to the page's thread. A fake worker
   stands in for the browser's: it answers when the test says so. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSession } from '../../src/core/session.js';
import { evaluateSet } from '../../src/core/set.js';
import { inProcessSolver, isCancelled, makeSolverHandler, solverRequest, workerSolver } from '../../src/ui/solver.js';
import { gearToSearchView, solveView } from '../../src/ui/views/solve.js';
import { inputsOf, makeApp } from './helpers/views.js';

/* Sage at item level 123, a set's Fill settings with Food on. */
const SGE = (() => {
  const app = makeApp('SGE', { level: 100 });
  app.recipe.food = true;
  return inputsOf(app);
})();

test('solver handler: a solve and a Gear to search request give the view builders own results, cloned intact', () => {
  const session = makeSession();
  const handle = makeSolverHandler(session);
  const { job, sync, level, recipe } = SGE;
  // what postMessage does to the request and the reply: a structured clone
  const solve = handle(structuredClone(solverRequest('solve', SGE)));
  assert.ok(solve.ms >= 0);
  assert.equal(solve.result.kind, 'ok');
  assert.deepEqual(structuredClone(solve), solve);
  assert.deepEqual(solve.result, solveView(job, sync, level, recipe, session));
  // the reply carries the plain set and the recipe, so a sheet can keep the result
  assert.deepEqual(solve.result.recipe, recipe);
  const kept = evaluateSet(job, solve.result.set, sync, level);
  assert.ok(kept.gear.mind > 0);
  assert.notEqual(solve.result.set.meal, null, 'the food switch is on, so a meal is part of the set');
  const side = handle(structuredClone(solverRequest('gearToSearch', SGE)));
  assert.deepEqual(side.result, gearToSearchView(job, sync, level, recipe, session));
});

test('solver handler: pins reach the search; a throw comes back as {error}', () => {
  const handle = makeSolverHandler();
  const first = handle(solverRequest('solve', SGE)).result;
  const meal = first.set.meal;
  // a pin the solve cannot keep (no piece has that game id) is answered as such, with the key and pins left off
  const bad = handle(solverRequest('solve', SGE, { key: 'set-a', pins: { pieces: [{ slot: 'head', gameId: -1, stones: [] }], meal } }));
  assert.equal(bad.result.kind, 'badpin');
  assert.equal(bad.result.badPins[0].reason, 'missing');
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
    onmessageerror: null,
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

test('worker solver: a reply the page cannot read (messageerror) falls back like a failed worker', async () => {
  const worker = fakeWorker();
  const solver = workerSolver(
    () => worker,
    () => ({ blocksPage: true, request: r => Promise.resolve({ result: `local ${r.mark}`, ms: 1 }) }),
  );
  const a = solver.request(request('solve', 1));
  worker.onmessageerror({ preventDefault() {} });
  assert.equal(worker.terminated, true);
  assert.equal(worker.onmessageerror, null, 'the stopped worker has its handlers off');
  assert.deepEqual(await a, { result: 'local 1', ms: 1 });
  assert.equal(solver.blocksPage, true);
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

test('worker solver: a request with no answer after the timeout fails, and a fresh worker takes the next', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const workers = fakeWorkers();
  const solver = workerSolver(workers.create, undefined, { timeoutMs: 1000 });
  const hung = solver.request(request('solve', 1));
  t.mock.timers.tick(999);
  assert.equal(workers.made[0].terminated, false);
  t.mock.timers.tick(1);
  await assert.rejects(hung, error => !isCancelled(error) && error.message === 'no answer after 1 s');
  assert.equal(workers.made[0].terminated, true);
  assert.equal(workers.made.length, 2, 'a fresh worker is started at once');
  // an answered request's timer is cleared: no stop later
  const next = solver.request(request('solve', 2));
  workers.made[1].reply(0, { result: 'for 2', ms: 1 });
  assert.deepEqual(await next, { result: 'for 2', ms: 1 });
  t.mock.timers.tick(5000);
  assert.equal(workers.made.length, 2);
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

/* Caller keys (a gear set's id): a Sage item level 123 request as solverRequest builds it, with a key. */
const keyed = (kind, key, mark) => ({
  ...solverRequest(kind, { job: { jobId: 'SGE' }, sync: 123, level: 100, recipe: { goal: 'sps' } }, { key }),
  mark,
});
const marks = worker => worker.posted.map(m => m.mark);

test('solverRequest: the key and the pins are added only when given', () => {
  const inputs = { job: { jobId: 'SGE' }, sync: 123, level: 100, recipe: {} };
  const plain = solverRequest('solve', inputs);
  assert.deepEqual(['key' in plain, 'pins' in plain], [false, false]);
  const pins = { pieces: [], meal: null };
  const keyed = solverRequest('solve', inputs, { key: 'set-a', pins });
  assert.deepEqual([keyed.key, keyed.pins], ['set-a', pins]);
});

test("worker solver keys: two sets interleaved never get each other's result", async () => {
  const worker = fakeWorker();
  const solver = workerSolver(() => worker);
  const a1 = solver.request(keyed('solve', 'a', 'a1')); // in the worker
  const b1 = solver.request(keyed('solve', 'b', 'b1')); // waits
  const a2 = solver.request(keyed('solve', 'a', 'a2')); // waits, beside b1: does not replace it
  assert.deepEqual(marks(worker), ['a1']);
  assert.equal('key' in worker.posted[0], false, 'the key is not sent to the worker');
  worker.reply(0, { result: 'for a1', ms: 1 });
  assert.deepEqual(marks(worker), ['a1', 'b1'], 'b1 is next, in the order asked');
  worker.reply(1, { result: 'for b1', ms: 2 });
  assert.deepEqual(marks(worker), ['a1', 'b1', 'a2']);
  worker.reply(2, { result: 'for a2', ms: 3 });
  assert.deepEqual(await a1, { result: 'for a1', ms: 1 });
  assert.deepEqual(await b1, { result: 'for b1', ms: 2 });
  assert.deepEqual(await a2, { result: 'for a2', ms: 3 });
});

test('worker solver keys: a newer request supersedes the waiting one of the same key only', async () => {
  const worker = fakeWorker();
  const solver = workerSolver(() => worker);
  const running = solver.request(keyed('solve', 'a', 'a1'));
  const b1 = solver.request(keyed('solve', 'b', 'b1'));
  const a2 = solver.request(keyed('solve', 'a', 'a2'));
  const a3 = solver.request(keyed('solve', 'a', 'a3')); // replaces a2; its caller gets a3's reply
  const b2 = solver.request(keyed('solve', 'b', 'b2')); // replaces b1
  worker.reply(0, { result: 'for a1', ms: 1 });
  assert.deepEqual(marks(worker), ['a1', 'a3'], 'the waiting order follows the newest request of each key');
  worker.reply(1, { result: 'for a3', ms: 3 });
  assert.deepEqual(marks(worker), ['a1', 'a3', 'b2']);
  worker.reply(2, { result: 'for b2', ms: 2 });
  assert.equal((await running).result, 'for a1');
  for (const reply of [b1, b2]) assert.equal((await reply).result, 'for b2');
  for (const reply of [a2, a3]) assert.equal((await reply).result, 'for a3');
});

test('worker solver keys: requests without a key behave as before (one caller)', async () => {
  const worker = fakeWorker();
  const solver = workerSolver(() => worker);
  const first = solver.request(request('solve', 1));
  const second = solver.request(request('solve', 2));
  const third = solver.request(request('solve', 3));
  worker.reply(0, { result: 'one', ms: 1 });
  assert.deepEqual(marks(worker), [1, 3]);
  worker.reply(1, { result: 'three', ms: 1 });
  assert.equal((await first).result, 'one');
  for (const reply of [second, third]) assert.equal((await reply).result, 'three');
});

test('worker solver keys: a timeout rejects the stuck key, the other key is asked of the new worker', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const workers = fakeWorkers();
  const solver = workerSolver(workers.create, undefined, { timeoutMs: 1000 });
  const stuck = solver.request(keyed('solve', 'a', 'a1'));
  const stuckLater = solver.request(keyed('solve', 'a', 'a2'));
  const other = solver.request(keyed('solve', 'b', 'b1'));
  t.mock.timers.tick(1000);
  for (const reply of [stuck, stuckLater]) await assert.rejects(reply, error => error.message === 'no answer after 1 s');
  assert.equal(workers.made.length, 2);
  assert.deepEqual(marks(workers.made[1]), ['b1']);
  workers.made[1].reply(0, { result: 'for b1', ms: 4 });
  assert.deepEqual(await other, { result: 'for b1', ms: 4 });
});

test('worker solver keys: cancel with a key stops that key only; without one, every key of the kind', async () => {
  const workers = fakeWorkers();
  const solver = workerSolver(workers.create);
  const a = solver.request(keyed('solve', 'a', 'a1'));
  const b = solver.request(keyed('solve', 'b', 'b1'));
  assert.equal(solver.cancel('solve', 'a'), true);
  await assert.rejects(a, wasCancelled);
  assert.deepEqual(marks(workers.made[1]), ['b1'], 'b is asked of the new worker');
  workers.made[1].reply(0, { result: 'for b1', ms: 1 });
  assert.equal((await b).result, 'for b1');
  assert.equal(solver.cancel('solve', 'b'), false, 'b was answered: nothing to stop');

  const c = solver.request(keyed('solve', 'c', 'c1'));
  const d = solver.request(keyed('solve', 'd', 'd1'));
  assert.equal(solver.cancel('solve'), true);
  for (const reply of [c, d]) await assert.rejects(reply, wasCancelled);
});

test('worker solver keys: when the worker fails, each key is answered by the fallback with its own request', async () => {
  const worker = fakeWorker();
  const asked = [];
  const solver = workerSolver(
    () => worker,
    () => ({
      blocksPage: true,
      request: req => {
        asked.push(req.mark);
        return Promise.resolve({ result: `local ${req.mark}`, ms: 1 });
      },
    }),
  );
  const a1 = solver.request(keyed('solve', 'a', 'a1'));
  const b1 = solver.request(keyed('solve', 'b', 'b1'));
  const a2 = solver.request(keyed('solve', 'a', 'a2'));
  worker.fail();
  assert.deepEqual(asked.sort(), ['a2', 'b1']);
  assert.equal((await b1).result, 'local b1');
  for (const reply of [a1, a2]) assert.equal((await reply).result, 'local a2');
});

test('worker solver keys: cancel of a key that only waits rejects it and leaves the worker running', async () => {
  const workers = fakeWorkers();
  const solver = workerSolver(workers.create);
  const a = solver.request(keyed('solve', 'a', 'a1')); // in the worker
  const b = solver.request(keyed('solve', 'b', 'b1')); // waits
  const c = solver.request(keyed('solve', 'c', 'c1')); // waits
  assert.equal(solver.cancel('solve', 'b'), true);
  await assert.rejects(b, wasCancelled);
  assert.equal(workers.made.length, 1, 'no restart: the search in the worker goes on');
  assert.equal(workers.made[0].terminated, false);
  workers.made[0].reply(0, { result: 'for a1', ms: 1 });
  assert.deepEqual(marks(workers.made[0]), ['a1', 'c1'], 'b1 is never posted');
  workers.made[0].reply(1, { result: 'for c1', ms: 1 });
  assert.equal((await a).result, 'for a1');
  assert.equal((await c).result, 'for c1');
  assert.equal(solver.cancel('solve', 'b'), false, 'b is gone');
});

test('worker solver: a waiting request that cannot be posted rejects, and the ones behind it still go', async () => {
  const worker = fakeWorker();
  const solver = workerSolver(() => worker);
  const proxy = new Proxy({}, {}); // like Alpine's reactive proxies: not cloneable
  const first = solver.request(keyed('solve', 'a', 'a1'));
  const broken = solver.request({ ...keyed('solve', 'b', 'b1'), recipe: proxy }); // waits, then fails to post
  const last = solver.request(keyed('solve', 'z', 'z1')); // waits behind it
  worker.reply(0, { result: 'for a1', ms: 1 });
  await assert.rejects(broken, /could not be cloned/);
  assert.deepEqual(marks(worker), ['a1', 'z1'], 'the next waiting request is posted');
  worker.reply(1, { result: 'for z1', ms: 1 });
  assert.equal((await first).result, 'for a1');
  assert.equal((await last).result, 'for z1');
});
