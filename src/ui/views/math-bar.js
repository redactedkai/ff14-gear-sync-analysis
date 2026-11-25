/* The math bar's Stat Allocation controls: what the Slot menu, the Substats & materia chip and its three menus, and the Gear item
   level slider show, and the edits they make (the page's own rules, for the <gsa-math-bar> element). Pure view builder: no DOM,
   so Node can load and test it. */
import { rankChoices } from '../ranks.js';
import { MATH_TAB_LABEL } from '../router/routes.js';
import { MATH_TABS } from '../state.js';
import { meldSlotChoices, meldSlotsOf } from '../job-sync-panel.js';
import { slotGroups, withSub } from './piece.js';
import { NO_SUBSTAT_LABEL, explainerItemLevel, pieceChipView } from './sync-explainer.js';

/* The math sub-tabs, in the order of the bar: the id of the sub-tab (`mathTab` of the store, the address's view) and its label (the
   router's, which the page title uses too). */
export const MATH_SUB_TABS = Object.freeze(MATH_TABS.map(sub => ({ sub, label: MATH_TAB_LABEL[sub] })));

/* How far along its range the Gear item level slider's thumb is, in percent: the track is drawn filled up to it. `range` is
   [lowest, highest] item level, `il` the one shown. */
export function ilvlFill(range, il) {
  const [lo, hi] = range;
  return hi > lo ? ((il - lo) / (hi - lo)) * 100 : 0;
}

/* What the controls of Stat Allocation's bar show, for `job` (a JobContext) under `sync` (syncSettings) and the example piece
   `piece` ({ilvl, slot, subs, slots}):
   {slotOptions, slotValue (the Slot menu: one choice per group of slots that share a budget share, and the group the piece's slot
   is in), chip ({text, name}: the Substats & materia chip's words), firstOptions, firstValue, secondOptions (none, then every
   substat but the 1st), secondValue ('' for none), slotsOptions (the totals of materia slots the slot's pieces have), slotsValue,
   range ([lowest, highest] item level), il (the one shown), fill (percent along the range)}. Every option is {value, label}. */
export function mathBarView(job, sync, piece) {
  const slotOptions = slotGroups(job);
  const { range, il } = explainerItemLevel(job, sync, piece);
  const label = stat => ({ value: stat, label: job.label[stat] });
  return {
    slotOptions,
    slotValue: slotOptions.find(option => option.slots.includes(piece.slot))?.value ?? '',
    chip: pieceChipView(job, piece),
    firstOptions: job.substats.map(label),
    firstValue: piece.subs[0],
    secondOptions: [{ value: '', label: NO_SUBSTAT_LABEL }].concat(rankChoices(piece.subs, 1, job.substats).map(label)),
    secondValue: piece.subs[1] || '',
    slotsOptions: meldSlotChoices(piece.slot).map(count => ({ value: String(count), label: String(count) })),
    slotsValue: String(meldSlotsOf(piece)),
    range,
    il,
    fill: ilvlFill(range, il),
  };
}

/* The change to the example piece when the Slot menu picks slot `slotType`: the slot, and the usual materia slots again when the
   choice the piece had is not a total the new slot's pieces have. `piece` is {slots}. */
export function slotEdit(piece, slotType) {
  return meldSlotChoices(slotType).includes(piece.slots) ? { slot: slotType } : { slot: slotType, slots: null };
}

/* The change to the example piece when substat menu `index` (0 the 1st, 1 the 2nd) picks `value` ('' for none): a stat the other
   menu holds swaps places with it. `piece` is {subs}; `job` a JobContext. */
export function subsEdit(piece, index, value, job) {
  return { subs: withSub(piece.subs, index, value, job.substats) };
}

/* The change to the example piece when the item level slider or box gives `text`, held to `range` ([lowest, highest]); null when
   the text is no number (nothing changes). The number is rounded to a whole item level. */
export function ilvlEdit(text, range) {
  const ilvl = Math.round(Number(text));
  if (!Number.isFinite(ilvl)) {
    return null;
  }
  return { ilvl: Math.max(range[0], Math.min(range[1], ilvl)) };
}
