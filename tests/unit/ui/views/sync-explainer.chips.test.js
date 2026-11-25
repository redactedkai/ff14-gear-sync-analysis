/* The math bar's two chips (src/ui/views/sync-explainer.js): the Sync chip (synced level, item level, IL Sync) and the
   Substats & materia chip, their widest texts and the empty-state sentence. The words come from the exported constants (SYNC_CHIP_TEXT,
   PIECE_CHIP_TEXT, OFF_TEXT), never repeated here. Item levels are the game's ParamGrow.ItemLevelSync: level 85 gives 536,
   level 80 gives 530; level 100 has no level sync (its highest real gear is 795, an IL Sync cap there is the user's). */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  NO_SUBSTAT_LABEL,
  OFF_TEXT,
  PIECE_CHIP_SIZERS,
  PIECE_CHIP_TEXT,
  SUBSTAT_SIZER,
  SYNC_CHIP_SIZERS,
  SYNC_CHIP_TEXT,
  WEAPON_LEVEL_SYNC_GUESS,
  capGuessText,
  explainerOffText,
  pieceChipView,
  syncChipView,
  widestNumber,
} from '../../../../src/ui/views/sync-explainer.js';
import { SLOT_SIZER } from '../../../../src/ui/views/piece.js';
import { syncSettings } from '../../../../src/ui/job-sync-panel.js';
import { makeJobContext } from '../../../../src/core/job-context.js';
import { JOBS } from '../../../../src/core/constants.js';
import { MAX_LEVEL, MAX_REAL } from '../../../../src/core/tables.js';

const T = SYNC_CHIP_TEXT;
const sage = makeJobContext('SGE');
/* The Sync chip for Sage under the panel {cap, sync, level} (the store's fields) and the example piece's slot. */
function chip(panel, slot = 'head', extra = {}) {
  return syncChipView(sage, syncSettings(panel), slot, {
    switchOn: Boolean(panel.sync),
    capMissing: Boolean(panel.sync) && panel.cap == null,
    ...extra,
  });
}
/* The chip's words as one string and its parts' classes. */
const words = view => view.parts.map(part => part.text).join(' ');
const classes = view => view.parts.map(part => part.cls);

test('Sync chip, IL Sync on: the level and the item level it caps to, both strong', () => {
  const view = chip({ cap: 270, sync: true, level: 85 });
  assert.equal(words(view), [T.level(85), T.separator, T.itemLevel(270)].join(' '));
  assert.deepEqual(classes(view), ['lv', 'dot', 'il']);
  assert.equal(view.name, T.name.on(T.label, 85, 270));
  assert.equal(view.guess, '');
});

test("Sync chip at the job's level cap: the level is still shown, with the item level cap", () => {
  const view = chip({ cap: 690, sync: true, level: 100 });
  assert.equal(words(view), [T.level(100), T.separator, T.itemLevel(690)].join(' '));
  assert.deepEqual(classes(view), ['lv', 'dot', 'il']);
  // Blue Mage's level cap is 80
  const blue = syncChipView(makeJobContext('BLU'), syncSettings({ cap: 500, sync: true, level: 80 }), 'head', { switchOn: true });
  assert.equal(words(blue), [T.level(80), T.separator, T.itemLevel(500)].join(' '));
});

test("Sync chip, IL Sync off: level sync's item level in the quiet style, the name says IL Sync is off", () => {
  const view = chip({ cap: 536, sync: false, level: 85 });
  assert.equal(words(view), [T.level(85), T.separator, T.itemLevel(536)].join(' '));
  assert.deepEqual(classes(view), ['lv', 'dot', 'il quiet']);
  assert.equal(view.name, T.name.off(T.label, 85, 536));
});

test('Sync chip, nothing synced (IL Sync off at the level cap): the one word', () => {
  const view = chip({ cap: null, sync: false, level: 100 });
  assert.equal(words(view), T.notSynced);
  assert.equal(view.name, T.name.notSynced(T.label));
  assert.equal(view.guess, '');
});

test('Sync chip, IL Sync on with no item level: the level and the missing item level in the error style', () => {
  const view = chip({ cap: null, sync: true, level: 85 });
  assert.equal(words(view), [T.level(85), T.separator, T.needCap].join(' '));
  assert.deepEqual(classes(view), ['lv', 'dot', 'il error']);
  assert.equal(view.name, T.name.needCap(T.label, 85));
});

test('Sync chip: a cap the page lowered shows in the lowered style', () => {
  // typed 700 at level 80: lowered to what level 80 allows (535); the chip knows the typed cap it was lowered from
  const view = chip({ cap: 535, sync: true, level: 80 }, 'head', { loweredFrom: 700 });
  assert.deepEqual(classes(view), ['lv', 'dot', 'il lowered']);
  assert.equal(words(view), [T.level(80), T.separator, T.itemLevel(535)].join(' '));
});

test("Sync chip: the weapon guess names the slot kinds whose level sync target is inferred, and only while it is level sync's", () => {
  for (const slot of ['weapon', 'offhand']) {
    assert.equal(chip({ cap: 530, sync: false, level: 80 }, slot).guess, WEAPON_LEVEL_SYNC_GUESS, slot);
  }
  for (const slot of ['head', 'body', 'ring', 'ear']) {
    assert.equal(chip({ cap: 530, sync: false, level: 80 }, slot).guess, '', slot);
  }
  // with IL Sync on at that cap the number is the user's, not a guess
  assert.equal(chip({ cap: 270, sync: true, level: 85 }, 'weapon').guess, '');
  assert.equal(capGuessText(sage, syncSettings({ cap: 270, sync: true, level: 85 }), 'weapon'), '');
  assert.equal(capGuessText(sage, syncSettings({ cap: 536, sync: false, level: 85 }), 'weapon'), WEAPON_LEVEL_SYNC_GUESS);
  // the chip's name carries the sentence for a screen reader
  assert.ok(chip({ cap: 530, sync: false, level: 80 }, 'weapon').name.endsWith(WEAPON_LEVEL_SYNC_GUESS));
});

test('Sync chip sizers: the widest level and item level, the unsynced word and the missing-item-level text, at the real limits', () => {
  assert.equal(SYNC_CHIP_SIZERS.length, 3);
  const [widest, unsynced, missing] = SYNC_CHIP_SIZERS.map(parts => parts.map(part => part.text).join(''));
  assert.equal(widest, `${T.level(widestNumber(MAX_LEVEL))}${T.separator}${T.itemLevel(widestNumber(MAX_REAL))}`);
  assert.equal(unsynced, T.notSynced);
  assert.equal(missing, `${T.level(widestNumber(MAX_LEVEL))}${T.separator}${T.needCap}`);
  assert.equal(widestNumber(795), '888');
});

test('Substats & materia chip: the short names of the two substats and the slot total; "none" for no second', () => {
  const paladin = makeJobContext('PLD');
  const piece = { slot: 'head', subs: ['crit', 'sks'], slots: null }; // head: 2 materia slots usually
  const view = pieceChipView(paladin, piece);
  assert.equal(view.text, ['CRT', 'SkS', `2 ${PIECE_CHIP_TEXT.slotMany}`].join(PIECE_CHIP_TEXT.separator));
  assert.equal(view.name, `${PIECE_CHIP_TEXT.label}: Critical Hit, Skill Speed, 2 ${PIECE_CHIP_TEXT.slotsLong}`);
  const single = pieceChipView(paladin, { slot: 'ring', subs: ['det', null], slots: 1 });
  assert.equal(single.text, ['DET', NO_SUBSTAT_LABEL, `1 ${PIECE_CHIP_TEXT.slotOne}`].join(PIECE_CHIP_TEXT.separator));
  assert.equal(single.name, `${PIECE_CHIP_TEXT.label}: Determination, ${PIECE_CHIP_TEXT.noSecond}, 1 ${PIECE_CHIP_TEXT.slotsLong}`);
  const none = pieceChipView(paladin, { slot: 'weapon', subs: ['crit', 'det'], slots: 0 });
  assert.ok(none.text.endsWith(`0 ${PIECE_CHIP_TEXT.slotMany}`));
});

test('the chip and menu sizers cover every text of every job', () => {
  // every job's pieceChipView text is one of the sizer lines, so no pick makes the chip wider than its hidden copy
  const lines = new Set(PIECE_CHIP_SIZERS);
  for (const { id } of JOBS) {
    const job = makeJobContext(id);
    const [first, ...others] = job.substats;
    for (const second of [null, ...others]) {
      for (const slot of job.activeSlotTypes) {
        const view = pieceChipView(job, { slot, subs: [first, second], slots: null });
        assert.ok(lines.has(view.text), `${id}: ${view.text}`);
      }
    }
  }
  const substatLines = SUBSTAT_SIZER.split('\n');
  for (const { id } of JOBS) {
    for (const stat of makeJobContext(id).substats) {
      assert.ok(substatLines.includes(makeJobContext(id).label[stat]), `${id} ${stat}`);
    }
  }
  assert.ok(substatLines.includes(NO_SUBSTAT_LABEL));
  // the Slot menu's texts: every job's groups, the longest among them
  const slotLines = SLOT_SIZER.split('\n');
  assert.ok(slotLines.includes('Head / Hands / Feet'));
  assert.equal(new Set(slotLines).size, slotLines.length, 'no text twice');
});

test('Stat Allocation: the empty-state sentence is one for IL Sync on and one for off, and neither points at a place on the page', () => {
  assert.equal(explainerOffText(true), OFF_TEXT.needCap);
  assert.equal(explainerOffText(false), OFF_TEXT.off);
  assert.notEqual(OFF_TEXT.needCap, OFF_TEXT.off);
  for (const text of Object.values(OFF_TEXT)) {
    assert.ok(!/\b(top|above|here)\b/.test(text), text);
  }
});
