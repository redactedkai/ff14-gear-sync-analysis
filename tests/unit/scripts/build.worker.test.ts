/* The optimizer's worker bundle, built as the page builds it and run in Node with a stand-in `self`, against the page
   thread's solver (ui/solver.ts inProcessSolver) on one request after another, as a set page sends them: Auto-fill with pins,
   melds, tier ranking and a Target GCD, two jobs, a goal that ties, and the Gear to search line. The replies must be equal
   whole, which includes the chosen pieces (game ids), their stones and the meal, not only the totals. The first request of
   build.test.ts covers the loading from the posted data texts. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as esbuild from 'esbuild';
import { esbuildOptions, SRC } from '../../../scripts/build/build.ts';
import { makeJobContext } from '../../../src/core/job-context.ts';
import { syncSettings } from '../../../src/ui/job-sync-panel.ts';
import { defaultFillSettings, fillRecipe } from '../../../src/ui/sheets/fill-settings.ts';
import { inProcessSolver, solverRequest } from '../../../src/ui/solver.ts';
import { fakeWorkerScope } from '../helpers/fakes.ts';
import type { Recipe } from '../../../src/core/recipe.ts';
import type { HandlerAnswer, SolverRequest } from '../../../src/ui/solver.ts';

/* What the solver answers to a request, and the message the worker posts for it. */
type Answer = Extract<HandlerAnswer, { result: unknown }>['result'];
type WorkerReply = { id: number; error?: string; result: Answer };

/* `answer` as a solve that found a set; fails the test otherwise. */
function okOf(answer: Answer): Extract<Answer, { kind: 'ok' }> {
  assert.ok('kind' in answer && answer.kind === 'ok', 'the solve found a set');
  return answer;
}

/* The worker's bundle as the page gets it: {WORKER_DATA, WORKER_SOURCE} from the `solver-worker:bundle` module. */
async function workerBundle(): Promise<{ WORKER_DATA: Record<string, string>; WORKER_SOURCE: string }> {
  const result = await esbuild.build({
    stdin: {
      contents: "import { WORKER_DATA, WORKER_SOURCE } from 'solver-worker:bundle';\nglobalThis.__worker = { WORKER_DATA, WORKER_SOURCE };",
      resolveDir: SRC,
      loader: 'js',
    },
    bundle: true,
    format: 'iife',
    plugins: esbuildOptions().plugins,
    write: false,
    logLevel: 'error',
  });
  const sandbox: { __worker?: { WORKER_DATA: Record<string, string>; WORKER_SOURCE: string } } = {};
  new Function('globalThis', result.outputFiles[0].text)(sandbox);
  assert.ok(sandbox.__worker, 'the script set __worker');
  return sandbox.__worker;
}

/* The inputs of one request: `jobId` at `cap` (null: sync off) and `level`, the job's default Auto-fill settings with
   `change` (the recipe's fields) on top. */
function inputsFor(jobId: string, cap: number | null, level: number, change: Partial<Recipe> = {}) {
  const job = makeJobContext(jobId);
  return {
    job,
    sync: syncSettings({ cap, sync: cap != null, level }),
    level,
    recipe: { ...fillRecipe(defaultFillSettings(job)), ...change },
  };
}

/* Pool items' own ids ('i1552') count the items built in their thread, so they differ between the worker and the page. */
const withoutPoolIds = (view: unknown): unknown =>
  JSON.parse(JSON.stringify(view, (key, value) => (key === 'id' && /^i\d+$/.test(value) ? undefined : value)));

test('build: the solver worker answers a series of requests with the same pieces, stones and meal as the page thread', async () => {
  const { WORKER_DATA, WORKER_SOURCE } = await workerBundle();
  const worker = fakeWorkerScope<WorkerReply>();
  new Function('self', WORKER_SOURCE)(worker.scope);
  worker.send({ data: structuredClone(WORKER_DATA) });
  const page = inProcessSolver(); // one session for the series, as the worker has
  let nextId = 1;
  /* The worker's reply and the page thread's to one request, which must be equal. Returns the reply's result. */
  const bothAnswer = async (request: SolverRequest, label: string): Promise<Answer> => {
    const id = nextId++;
    worker.send(structuredClone({ id, ...request }));
    const reply = worker.posted.pop();
    assert.ok(reply, `${label}: the worker answered`);
    assert.equal(reply.id, id, label);
    assert.equal(reply.error, undefined, `${label}: ${reply.error}`);
    const local = (await page.request(request)).result;
    assert.deepEqual(withoutPoolIds(reply.result), withoutPoolIds(local), label);
    return reply.result;
  };

  // plain Auto-fill under sync, with the Gear to search line
  const sage = inputsFor('SGE', 123, 50, { byTier: false, melds: false, food: false });
  const plain = okOf(await bothAnswer(solverRequest('solve', sage), 'Sage cap 123, no tiebreak (a tie)'));
  assert.ok(
    plain.set.pieces.some(piece => piece.gameId != null),
    'the set has real pieces to compare',
  );
  await bothAnswer(solverRequest('gearToSearch', sage), 'Sage Gear to search');

  // pins: half of another goal's pieces kept (so they are not what the search would pick), the rest filled around them
  const piety = okOf(
    await bothAnswer(
      solverRequest('solve', inputsFor('SGE', 123, 50, { target: 'piety', byTier: false, melds: false, food: false })),
      'Sage piety goal',
    ),
  );
  const pinned = piety.set.pieces.filter(piece => piece.gameId != null).filter((_, row) => row % 2 === 0);
  const pins = {
    pieces: pinned.flatMap(piece => (piece.gameId == null ? [] : [{ slot: piece.slot, gameId: piece.gameId, stones: piece.stones ?? [] }])),
    meal: null,
  };
  const withPins = okOf(await bothAnswer(solverRequest('solve', sage, { pins }), 'Sage with pins'));
  assert.notEqual(JSON.stringify(withPins.set), JSON.stringify(plain.set), 'the pins change the set, so dropping them shows');
  for (const piece of pinned) {
    assert.ok(
      withPins.set.pieces.some(row => row.slot === piece.slot && row.gameId === piece.gameId),
      `the pinned ${piece.slot} stays in the worker's answer`,
    );
  }

  // melds and food with tier ranking, unsynced and synced, on a tank
  const paladin = inputsFor('PLD', null, 100, { target: 'crit', tb: 'det', byTier: true, melds: true, food: true });
  const melded = okOf(await bothAnswer(solverRequest('solve', paladin), 'Paladin melds, tier ranking, food'));
  assert.ok(
    melded.set.pieces.some(piece => (piece.stones ?? []).some(Boolean)),
    'some piece carries stones, so the stones are compared',
  );
  await bothAnswer(
    solverRequest('solve', inputsFor('PLD', 660, 90, { tb: 'crit', byTier: true, melds: true, food: true })),
    'Paladin cap 660',
  );

  // a Target GCD (2.50 s or faster) without tier ranking, then with it, on a caster
  const black = (change: Partial<Recipe>, label: string) =>
    bothAnswer(solverRequest('solve', inputsFor('BLM', 475, 80, { tb: 'crit', melds: true, ...change })), label);
  okOf(await black({ byTier: false, gcd: '2.50', gcdMode: 'min', food: true }, 'Black Mage Target GCD'));
  await black({ byTier: true, gcd: '2.50', gcdMode: 'min', food: true }, 'Black Mage Target GCD with tier ranking');

  // the second job on the same worker, a different role, and a goal that ties on the stats nobody ranked
  await bothAnswer(solverRequest('solve', inputsFor('DRG', 123, 50, { target: 'det', byTier: false, melds: true, food: true })), 'Dragoon');
  await bothAnswer(
    solverRequest('solve', inputsFor('BRD', null, 100, { byTier: false, melds: true, food: false })),
    'Bard, no tiebreak (a tie)',
  );
});
