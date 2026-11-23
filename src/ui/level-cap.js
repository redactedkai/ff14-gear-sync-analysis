/* The cap follows the level: the rule that lowers a Job and sync panel's or a sheet's cap to what its level allows, and the
   texts of the cap field's notes. Pure: no storage, no Alpine. */
import { capCeiling } from '../core/sync-target.js';
import { MAX_REAL } from '../core/tables.js';
import { syncSettings } from './job-sync-panel.js';

/* The cap follows the level: a cap above what the level allows (capCeiling, the best gear made for it) is lowered to it,
   whatever the job (a job at its own level cap included), while item level sync is on. Above it the cap changes nothing
   (syncTarget), so the field shows the cap that applies. A cap is never raised: a low cap is a real duty's (Minimum IL).
   Called when the level settles, when a cap is entered, when sync is switched on, and on restore.
   Returns {from, to, level} when it lowered the cap (the note under the field), else null. */
export function limitCapToLevel(app) {
  if (!syncSettings(app).sync) return null;
  const top = app.level == null ? MAX_REAL : capCeiling(app.level);
  if (app.cap <= top) return null;
  const lowered = { from: app.cap, to: top, level: app.level ?? null };
  app.cap = top;
  return lowered;
}

/* The note under a cap field after limitCapToLevel lowered it (`lowered` its {from, to, level}, or null: ''), on the Job
   and sync panel and on a sheet's page and forms: "Lowered to 135, max for level 50." */
export function capLoweredText(lowered) {
  if (!lowered) return '';
  return `Lowered to ${lowered.to}, max ${lowered.level == null ? 'item level' : `for level ${lowered.level}`}.`;
}

/* What a cap field's label line shows in place of its range while the cap was lowered or holds no cap (Option C of the
   960 px settings row mockups). Returns {kind, short, full}: kind 'error' | 'lowered' | '' (none: short and full are ''); short is
   the few words shown with an icon ("Enter a cap" for a missing cap, "1-795 only" for text that is no cap, "Max 288" for a
   lowered cap); full is the whole sentence, the field's tooltip and its live regions' text. `error` is the error text ('' for
   none), `missing` whether that error is the missing cap (CAP_MISSING_TEXT) rather than CAP_TYPED_BAD_TEXT, `note` the lowered
   note (capLoweredText, '' for none), `lowered` its {to}, `range` the range text ("1-795"). An error wins over the lowered
   note. */
export function capFlag({ error, missing = false, note, lowered, range }) {
  if (error) return { kind: 'error', short: missing ? CAP_MISSING_FLAG : rangeOnly(range), full: error };
  if (note && lowered) return { kind: 'lowered', short: `Max ${lowered.to}`, full: note };
  return { kind: '', short: '', full: '' };
}

/* A number field's range in its label line, from 1 to `max`: "1–100" for a level, "1–795" for an item level. */
export function rangeText(max) {
  return `1–${max}`;
}

/* The few words of an error flag for text that is no value of the field: its range and "only" ("1–795 only", "1–100 only"). */
export function rangeOnly(range) {
  return `${range} only`;
}

/* The error under the Job and sync panel's cap field while item level sync is on and the field is empty, and the few words
   of its flag in the label line (capFlag). */
export const CAP_MISSING_TEXT = 'Enter a sync cap';
export const CAP_MISSING_FLAG = 'Enter a cap';

/* The error under a cap field holding text that is no whole item level from 1 (the field keeps its last cap). */
export const CAP_TYPED_BAD_TEXT = `Enter a whole item level from 1 to ${MAX_REAL}`;

/* The texts of a level field, for `max` the job's level cap: its range in the label line ("1–100") and the error for text that
   is no whole level from 1 to `max` (the field keeps its last level; the sentence is the field's tooltip and live-region text,
   and its flag in the label line says `rangeOnly(range)`). Stat Allocation's Level box and the GCD tab's Level box (`max` there
   is the highest level the tab takes). Templates and tests read these. */
export const LEVEL_TEXT = Object.freeze({
  range: rangeText,
  typedBad: max => `Enter a whole level from 1 to ${max}`,
});

/* Text typed in a level field is no level: empty, not a whole number (letters, 12.5), or outside 1 to `max`, the job's level cap
   (0, -5 and 101 at Paladin's 100 are bad; 100 is a level). The cap field's counterpart is capTextBad. */
export function levelTextBad(text, max) {
  const value = Number(text);
  return !(text !== '' && Number.isInteger(value) && value >= 1 && value <= max);
}

/* Text typed in a cap field is no cap: not empty and not a whole number from 1. A whole number above the highest real
   item level is a cap (limitCapToLevel lowers it). The Job and sync panel and a sheet's page. */
export function capTextBad(text) {
  const value = Number(text);
  return text !== '' && !(Number.isInteger(value) && value >= 1);
}
