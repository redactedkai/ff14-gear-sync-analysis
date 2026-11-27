/* The solver session (src/core/session.ts): the gear of the last SESSION_SIZE jobs, least recently used dropped
   first, and a job's gear is built once while it is kept. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jobGear } from '../../../src/core/items.ts';
import { makeJobContext } from '../../../src/core/job-context.ts';
import { makeSession, SESSION_SIZE } from '../../../src/core/session.ts';

test('session: gear is built once per job and kept for the last SESSION_SIZE jobs, a hit counts as a use', () => {
  let builds = 0;
  const session = makeSession({
    gear: job => {
      builds++;
      return [{ job: job.jobId }];
    },
  });
  assert.equal(SESSION_SIZE, 4);
  const jobs = ['SGE', 'WHM', 'PLD', 'WAR', 'BLM'].map(makeJobContext);
  const [sge, whm, pld, war, blm] = jobs;
  for (const job of [sge, whm, pld, war]) {
    session.gear(job);
  }
  assert.equal(builds, 4);
  // using SGE again makes WHM the oldest, so BLM drops WHM
  assert.equal(session.gear(sge), session.gear(sge));
  session.gear(blm);
  assert.equal(builds, 5);
  for (const job of [sge, pld, war, blm]) {
    session.gear(job);
  }
  assert.equal(builds, 5, 'SGE, PLD, WAR and BLM are kept');
  session.gear(whm);
  assert.equal(builds, 6, 'WHM was dropped');
});

test("session: a job's gear is every piece it can wear, built once and kept", () => {
  const session = makeSession();
  const sge = makeJobContext('SGE');
  const gear = session.gear(sge);
  assert.equal(session.gear(sge), gear);
  assert.ok(Object.isFrozen(gear));
  assert.deepEqual(
    gear.map(i => i.gameId),
    jobGear(sge).map(i => i.gameId),
  );
  // a test's own pool
  const pool = [{ name: 'x' }];
  assert.equal(makeSession({ gear: () => pool }).gear(sge), pool);
});
