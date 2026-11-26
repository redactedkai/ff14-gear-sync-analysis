/* restoreState over saved settings damaged in several fields at once (helpers/fuzz.js), from a fixed seed: it never throws,
   every field of the result is in range (job, level up to the job's cap, cap, sync, tabs, the piece's slot and substats,
   the search text), and restoring the result's own JSON gives the same state. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JOBS } from '../../../src/core/constants.ts';
import { makeJobContext } from '../../../src/core/job-context.ts';
import { MATH_TABS, TABS, defaultState, restoreState } from '../../../src/ui/state.js';
import { rng } from '../helpers/common.js';
import { WRONG, clone, damage } from '../helpers/fuzz.js';

const CASES = 40000;
const isNumber = value => typeof value === 'number' && Number.isFinite(value);

test('restoreState never throws, always returns a state in range and restores its own result to itself', () => {
  const rand = rng(20261113);
  const pick = list => list[Math.floor(rand() * list.length)];
  const good = [
    clone(defaultState()),
    clone(
      restoreState({
        tab: 'math',
        job: 'SGE',
        cap: 123,
        sync: true,
        level: 50,
        piece: { job: 'WAR', slot: 'body' },
        browse: { job: 'BLU', q: 'x', sort: 'ilvl', type: 'ring' },
      }),
    ),
  ];
  for (let n = 0; n < CASES; n++) {
    // every tenth input is not a saved object at all
    const raw = n % 10 === 0 ? pick(WRONG) : damage(pick(good), 1 + Math.floor(rand() * 4), rand);
    const label = JSON.stringify(raw).slice(0, 400);
    let state;
    assert.doesNotThrow(() => {
      state = restoreState(raw);
    }, label);

    assert.ok(
      JOBS.some(entry => entry.id === state.job),
      `job ${state.job}: ${label}`,
    );
    const job = makeJobContext(state.job);
    assert.ok(isNumber(state.level) && state.level >= 1 && state.level <= job.maxLevel, `level ${state.level}: ${label}`);
    assert.ok(state.cap === null || (Number.isInteger(state.cap) && state.cap >= 1), `cap ${state.cap}: ${label}`);
    assert.equal(typeof state.sync, 'boolean', `sync: ${label}`);
    assert.ok(TABS.includes(state.tab), `tab ${state.tab}: ${label}`);
    assert.ok(MATH_TABS.includes(state.mathTab), `mathTab ${state.mathTab}: ${label}`);
    const pieceJob = makeJobContext(state.piece.job);
    assert.ok(pieceJob.activeSlotTypes.includes(state.piece.slot), `piece.slot ${state.piece.slot}: ${label}`);
    assert.ok(
      state.piece.subs.every(sub => sub === null || pieceJob.stats.includes(sub)),
      `piece.subs ${JSON.stringify(state.piece.subs)}: ${label}`,
    );
    assert.ok(typeof state.browse.q === 'string' && state.browse.q.length <= 100, `browse.q: ${label}`);
    assert.deepEqual(restoreState(JSON.parse(JSON.stringify(state))), state, `not idempotent: ${label}`);
  }
});
