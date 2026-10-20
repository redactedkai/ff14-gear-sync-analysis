/* The solver session (src/core/session.js): each kind keeps its last SESSION_SIZE entries, least recently used dropped
   first, and a job's gear is built once while it is kept. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jobGear } from '../../src/core/items.js';
import { makeJobContext } from '../../src/core/job-context.js';
import { makeSession, SESSION_SIZE } from '../../src/core/session.js';

test('session: memo builds once per key, keeps the last SESSION_SIZE keys per kind, and a hit counts as a use', () => {
  const session = makeSession({ gear: () => [] });
  let builds = 0;
  const value = (kind, key) =>
    session.memo(kind, key, () => {
      builds++;
      return { kind, key };
    });
  const first = value('prep', 'a');
  assert.equal(value('prep', 'a'), first);
  assert.equal(builds, 1);
  // another kind never shares or evicts an entry
  value('tier', 'a');
  assert.equal(builds, 2);
  // fill prep: a, b, c, d; using a again makes b the oldest, so e drops b
  for (const key of ['b', 'c', 'd']) value('prep', key);
  assert.equal(SESSION_SIZE, 4);
  value('prep', 'a');
  value('prep', 'e');
  builds = 0;
  for (const key of ['a', 'c', 'd', 'e']) value('prep', key);
  assert.equal(builds, 0, 'a, c, d and e are kept');
  value('prep', 'b');
  assert.equal(builds, 1, 'b was dropped');
  // a null key keeps nothing
  value('prep', null);
  value('prep', null);
  assert.equal(builds, 3);
});

test('session: get and set, and undefined for a key never set', () => {
  const session = makeSession({ size: 2, gear: () => [] });
  assert.equal(session.get('prep', 'x'), undefined);
  session.set('prep', 'x', 1);
  session.set('prep', 'y', 2);
  assert.equal(session.get('prep', 'x'), 1); // now y is the oldest
  session.set('prep', 'z', 3);
  assert.deepEqual(
    ['x', 'y', 'z'].map(k => session.get('prep', k)),
    [1, undefined, 3],
  );
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
