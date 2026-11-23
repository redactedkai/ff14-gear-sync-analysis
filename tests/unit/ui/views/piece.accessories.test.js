/* The four accessory slots (Earring, Necklace, Bracelet, Ring) take one choice, "Accessories", in Stat Allocation's Slot
   menu because they share one budget share (67 per mille). These tests pin that: the page's own numbers, tables and
   chart are the same for the four slots, for one job per role, so a change to one slot's share fails here. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACCESSORY_SLOTS, SLOT_LABEL } from '../../../../src/core/constants.js';
import { makeJobContext } from '../../../../src/core/job-context.js';
import { capsFor } from '../../../../src/core/formulas.js';
import { slotGroups } from '../../../../src/ui/views/piece.js';
import { gearOf, explainerViewOf, makeApp, pieceViewOf } from '../../helpers/views.js';

// one job per role: tank, healer, melee, physical ranged, caster
const JOBS = ['PLD', 'SGE', 'MNK', 'BRD', 'BLM'];
const ITEM_LEVELS = [123, 275, 475, 640, 790];

/* A view as text with the slot's own name replaced, so the four slots' views can be compared. */
function withoutSlotName(view) {
  let text = JSON.stringify(view);
  for (const type of ACCESSORY_SLOTS) text = text.split(SLOT_LABEL[type].toLowerCase()).join('SLOT');
  return text;
}

test('Slot menu: the four accessories are one choice, "Accessories", whatever the job', () => {
  for (const jobId of JOBS) {
    const group = slotGroups(makeJobContext(jobId)).find(g => g.slots.includes('ear'));
    assert.equal(group.label, 'Accessories', jobId);
    assert.deepEqual(group.slots, ACCESSORY_SLOTS, jobId);
    assert.equal(group.value, 'ear', jobId);
  }
});

test('the four accessory slots have the same share, and the Wiki caps at item level 123: 24 main, 23 each substat', () => {
  for (const jobId of JOBS) {
    const job = makeJobContext(jobId);
    assert.equal(new Set(ACCESSORY_SLOTS.map(type => job.slotPct[type])).size, 1, jobId);
    for (const type of ACCESSORY_SLOTS) {
      const caps = capsFor(job, type, 123);
      assert.equal(caps[job.mainKey], 24, `${jobId} ${type}`);
      for (const sub of job.substats) assert.equal(caps[sub], 23, `${jobId} ${type} ${sub}`);
    }
  }
});

test('Stat Allocation: the four accessory slots give the same stats, ceilings, tables and chart at every item level and cap', () => {
  for (const jobId of JOBS) {
    const job = makeJobContext(jobId);
    for (const subs of [job.substats.slice(0, 2), [job.substats.at(-1), null]]) {
      for (const ilvl of ITEM_LEVELS) {
        // no sync, then a cap below, at and above the item level
        for (const cap of [null, ilvl - 10, ilvl, ilvl + 10]) {
          const app = makeApp(jobId, cap === null ? { sync: false, cap: null, level: 100 } : { sync: true, cap, level: 100 });
          const views = ACCESSORY_SLOTS.map(slot => {
            app.piece = { ilvl, slot, subs };
            return withoutSlotName({ steps: pieceViewOf(app, ilvl), chart: explainerViewOf(app, { piece: 900 }) });
          });
          for (const view of views.slice(1)) assert.equal(view, views[0], `${jobId} item level ${ilvl} cap ${cap} ${subs}`);
        }
      }
    }
  }
});

test('real item level 475 accessories of each job: the four slots carry the same main stat and Vitality', () => {
  for (const jobId of JOBS) {
    const job = makeJobContext(jobId);
    const pieces = gearOf(job).filter(piece => piece.ilvl === 475 && ACCESSORY_SLOTS.includes(piece.type));
    const types = new Set(pieces.map(piece => piece.type));
    assert.equal(types.size, 4, `${jobId}: a real item level 475 piece in every accessory slot`);
    const shapes = new Set(pieces.map(piece => `${piece.stats[job.mainKey]}/${piece.stats.vit}`));
    assert.equal(shapes.size, 1, `${jobId}: ${[...shapes]}`);
  }
});
