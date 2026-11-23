/* The patch table (src/core/patches.js, generated from the patch list of xivapi/ffxiv-datamining-patches) and the lookup
   of the patch a game data date belongs to. Expected values are the patches' published release days (7.5 on 2026-04-29,
   7.56 on 2026-09-08, 7.57 on 2026-10-13; the patch list and the Wiki agree to the day). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATA_SOURCE } from '../../../src/core/tables.js';
import { PATCHES, PATCHES_SOURCE, patchOnDay } from '../../../src/core/patches.js';

test('the patch table names the patch list repository and a full commit, and is in date order with each version once', () => {
  assert.equal(PATCHES_SOURCE.repo, 'xivapi/ffxiv-datamining-patches');
  assert.match(PATCHES_SOURCE.commit, /^[0-9a-f]{40}$/);
  assert.ok(PATCHES.length >= 100, `${PATCHES.length} patches`);
  for (const [version, day] of PATCHES) {
    assert.match(version, /^\d+\.\d+[a-z]?$/);
    assert.match(day, /^\d{4}-\d{2}-\d{2}$/);
  }
  assert.deepEqual(
    PATCHES.map(([, day]) => day),
    PATCHES.map(([, day]) => day).sort(),
  );
  assert.equal(new Set(PATCHES.map(([version]) => version)).size, PATCHES.length);
  assert.deepEqual(PATCHES[0], ['2.0', '2013-08-16']);
});

test('the patch list is at least as new as the game data: a data update that left the patch table behind would name an older patch', () => {
  assert.ok(
    Date.parse(PATCHES_SOURCE.date) >= Date.parse(DATA_SOURCE.date),
    `patches.json is from ${PATCHES_SOURCE.date}, before the game data (${DATA_SOURCE.date}); run npm run data:update`,
  );
});

test('patchOnDay: the newest patch released on or before the day, and the release day itself counts', () => {
  assert.equal(patchOnDay('2026-09-30'), '7.56'); // after 7.56 (2026-09-08), before 7.57 (2026-10-13)
  assert.equal(patchOnDay('2026-09-08'), '7.56'); // the release day
  assert.equal(patchOnDay('2026-09-07'), '7.5'); // the day before
  assert.equal(patchOnDay('2026-10-13'), '7.57');
  assert.equal(patchOnDay('2026-04-29'), '7.5');
  assert.equal(patchOnDay('2030-01-01'), PATCHES.at(-1)[0]); // later than every patch: the newest one
});

test('patchOnDay: patches of one day give the last of them; a day before the first patch or not a date gives nothing', () => {
  assert.equal(patchOnDay('2013-12-17'), '2.1b'); // 2.1 and 2.1b came out the same day
  assert.equal(patchOnDay('2013-08-15'), '');
  for (const notADay of ['', '2026-9-30', '2026-09-30T03:03:49-05:00', 'September', null, undefined, 20260930]) {
    assert.equal(patchOnDay(notADay), '', String(notADay));
  }
});

test('patchOnDay reads any table in the shape of PATCHES', () => {
  const table = [
    ['1.0', '2020-01-01'],
    ['1.1', '2020-02-01'],
  ];
  assert.equal(patchOnDay('2020-01-31', table), '1.0');
  assert.equal(patchOnDay('2020-02-01', table), '1.1');
  assert.equal(patchOnDay('2019-12-31', table), '');
  assert.equal(patchOnDay('2020-01-01', []), '');
});
