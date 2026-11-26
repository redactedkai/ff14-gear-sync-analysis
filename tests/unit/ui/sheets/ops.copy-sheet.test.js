/* Copy sheet (copySheet) on random sheets of real pieces from a fixed seed: every job copied to every other job of its gear
   group. The copy reads back as a sheet with the same sets and rows; every piece left is one the new job can wear and every
   piece cleared is exactly piecesToClear's; the goal's stats and every stone's stat are stats the new job has; the source sheet
   is unchanged; a pin names a row that still holds a piece; the copy's sets evaluate to finite totals; and copying back to the
   first job gives the goal and stones it started with when nothing was cleared. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JOBS, ROW } from '../../../../src/core/constants.ts';
import { GEAR_GROUPS } from '../../../../src/core/gear-groups.ts';
import { itemById, jobGear } from '../../../../src/core/items.ts';
import { makeJobContext } from '../../../../src/core/job-context.ts';
import { copySheet, piecesToClear } from '../../../../src/ui/sheets/ops.ts';
import { SET_ROW_SLOTS, parseSheet } from '../../../../src/ui/sheets/storage.ts';
import { evaluateInSheet } from '../../../../src/ui/views/set-totals.ts';
import { rng } from '../../helpers/common.js';

const SHEETS = 900;
const SYNC = { on: true, cap: 660 };

test('Copy sheet keeps what the new job can wear, moves the goal and stones to its stats and changes nothing else', () => {
  const rand = rng(515151);
  const int = count => Math.floor(rand() * count);
  const pick = list => list[int(list.length)];
  const jobs = JOBS.map(job => makeJobContext(job.id));
  const gearOf = new Map(jobs.map(job => [job.jobId, jobGear(job)]));
  let nextSetId = 0;
  const setId = () => `g_copy${nextSetId++}`;

  for (let n = 0; n < SHEETS; n++) {
    // a random sheet: one to three sets of random real pieces with random stones, a goal and some pins
    const job = pick(jobs);
    const gear = gearOf.get(job.jobId);
    const sets = Array.from({ length: 1 + int(3) }, (_, k) => {
      const pieces = SET_ROW_SLOTS.map(slot => {
        const items = gear.filter(item => item.type === slot);
        if (!items.length || rand() < 0.2) {
          return { slot };
        }
        const stones = Array.from({ length: int(6) }, () => (rand() < 0.2 ? null : { stat: pick(job.substats), grade: 1 + int(12) }));
        return { slot, gameId: pick(items).gameId, stones };
      });
      const target = pick(job.stats);
      const tb = rand() < 0.5 ? pick(job.stats.filter(stat => stat !== target)) : '';
      return {
        id: `g_${n}_${k}`,
        name: `Set ${k}`,
        description: '',
        pieces,
        meal: null,
        pinned: { pieces: [...Array(12).keys()].filter(() => rand() < 0.2), meal: false },
        fillSettings: { goal: { target, tb, tb2: '' }, searchCriteria: {} },
        createdAt: 1,
        updatedAt: 1,
      };
    });
    const sheet = {
      v: 1,
      id: `s_${n}`,
      name: 'x',
      description: '',
      job: job.jobId,
      level: job.maxLevel,
      sync: SYNC,
      sets,
      gameData: { commit: 'x', date: 'x' },
      createdAt: 1,
      updatedAt: 1,
    };
    const frozen = JSON.stringify(sheet);

    for (const to of GEAR_GROUPS.find(group => group.includes(job.jobId)).filter(id => id !== job.jobId)) {
      const newJob = jobs.find(candidate => candidate.jobId === to);
      const label = `${job.jobId} to ${to}`;
      const copy = copySheet(sheet, { name: 'copy', job: to, level: newJob.maxLevel, sync: SYNC }, `s_c${n}`, 2, setId);

      // it reads back as a sheet of the same shape
      const read = parseSheet(JSON.stringify(copy), copy.id);
      assert.ok(read.sheet, `${label}: copy not readable: ${read.cause}`);
      assert.equal(copy.sets.length, sheet.sets.length, `${label}: set count`);
      assert.ok(
        copy.sets.every(set => set.pieces.length === 12),
        `${label}: rows`,
      );

      // what is kept, cleared, moved and pinned
      const jobBit = 1 << newJob.jobIndex;
      const cleared = piecesToClear(sheet, to);
      copy.sets.forEach((set, setIndex) => {
        set.pieces.forEach((row, index) => {
          const before = sheet.sets[setIndex].pieces[index];
          if (row.gameId != null) {
            assert.ok(itemById(row.gameId)[ROW.jobMask] & jobBit, `${label}: kept ${row.gameId}, which ${to} cannot wear`);
          }
          const wasCleared = cleared.some(entry => entry.setId === sheet.sets[setIndex].id && entry.index === index);
          assert.equal(
            wasCleared,
            before.gameId != null && row.gameId == null,
            `${label}: row ${index} cleared or kept against piecesToClear`,
          );
          for (const stone of row.stones ?? []) {
            if (stone) {
              assert.ok(newJob.substats.includes(stone.stat), `${label}: stone of ${stone.stat}`);
            }
          }
        });
        const goal = set.fillSettings?.goal;
        for (const key of ['target', 'tb', 'tb2']) {
          if (goal?.[key]) {
            assert.ok(newJob.stats.includes(goal[key]), `${label}: goal ${key} ${goal[key]}`);
          }
        }
        for (const index of set.pinned.pieces) {
          assert.ok(
            set.pieces[index].gameId != null || sheet.sets[setIndex].pieces[index].gameId == null,
            `${label}: a pin on cleared row ${index}`,
          );
        }
      });
      assert.equal(JSON.stringify(sheet), frozen, `${label}: the source sheet changed`);

      // the copy's sets evaluate to finite totals
      for (const set of copy.sets) {
        const { evaluated } = evaluateInSheet(read.sheet, set);
        for (const total of Object.values(evaluated.withFood)) {
          assert.ok(Number.isFinite(total) && total >= 0, `${label}: total ${total}`);
        }
      }

      // nothing cleared: copying back gives the goal and the stones' stats it started with
      if (!cleared.length) {
        const back = copySheet(copy, { name: 'back', job: job.jobId, level: job.maxLevel, sync: SYNC }, 's_back', 3, () => 'g_back');
        back.sets.forEach((set, setIndex) => {
          const started = sheet.sets[setIndex];
          const goalBefore = started.fillSettings.goal;
          const goalAfter = set.fillSettings.goal;
          assert.equal(goalAfter.target, goalBefore.target, `${label}: goal after copying back`);
          if (goalBefore.tb) {
            assert.equal(goalAfter.tb, goalBefore.tb, `${label}: tiebreak after copying back`);
          }
          set.pieces.forEach((row, index) => {
            const statsOf = piece => (piece.stones ?? []).map(stone => stone?.stat ?? null);
            assert.deepEqual(statsOf(row), statsOf(started.pieces[index]), `${label}: stones of row ${index} after copying back`);
          });
        });
      }
    }
  }
});
