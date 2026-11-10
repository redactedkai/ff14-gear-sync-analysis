/* The Sheets tab's dialogs as plain view objects: New sheet, Copy sheet (with the list of pieces the new job cannot wear
   and the box that accepts clearing them), "Name and description" for a sheet or a gear set, and the Delete questions.
   The component keeps each form's fields; these builders turn them into what the dialog shows. Pure: no Alpine, no
   store. Rules: docs/engineering/sheets.md ("Names", "Copy sheet", "Where an action lands"). */
import { SLOT_LABEL, jobById } from '../../core/constants.js';
import { GEAR_GROUPS, gearGroupName } from '../../core/gear-groups.js';
import { oneOrMany, plural } from '../helpers.js';
import { DESCRIPTION_MAX_LENGTH, NAME_MAX_LENGTH, defaultSheetName, piecesToClear, ranges } from '../sheet-ops.js';

/* The New sheet dialog for `form` ({name, nameTyped (the user typed a name: it no longer follows the job), description,
   job ('' for none), level, sync: {on, cap}, error}). Returns {title, name (the name the box shows: the default name
   while none is typed), namePlaceholder, nameMax, descriptionMax, jobText (its name, or "none chosen"), jobNote,
   level, cap (sheet-ops.js ranges), buttonText, error}. */
export function newSheetFormView(form) {
  return {
    title: 'New sheet',
    name: form.nameTyped ? form.name : defaultSheetName(form),
    namePlaceholder: 'Choose a job for a default name',
    nameMax: NAME_MAX_LENGTH,
    descriptionMax: DESCRIPTION_MAX_LENGTH,
    jobText: jobById(form.job)?.name ?? 'none chosen',
    jobNote: 'fixed once the sheet is made',
    ...ranges(form.job || null),
    buttonText: 'Create sheet',
    error: form.error ?? '',
  };
}

/* The Copy sheet note over the job boxes: "Healers: the jobs that share Sage’s gear" (the group's role name when it has
   one, gear-groups.js gearGroupName), else "the jobs that share Sage’s gear". `own`: the sheet's job (jobById). */
function groupNote(own) {
  const role = gearGroupName(own.id);
  return `${role ? `${role}: ` : ''}the jobs that share ${own.name}’s gear`;
}

/* The Copy sheet dialog for `sheet` (a saved Sheet) and `form` ({name, job, level, sync: {on, cap}, ack (the box that
   accepts clearing the pieces is ticked), error}). The jobs offered are the sheet's gear group (gear-groups.js), its
   own job included, in the group's order; Blue Mage and Beastmaster are alone in theirs. Returns:
   - title ("Copy “Bahamut T13 Healer”"), name, nameMax, buttonText, error;
   - jobs: [{id, name, checked}]; jobText (the chosen job's name), jobNote ("Healers: the jobs that share Sage’s gear", or "a Blue
     Mage sheet copies to no other job");
   - level, cap: the fields' ranges for the chosen job (sheet-ops.js ranges);
   - warning: null, or {title ("Astrologian cannot wear 1 piece."), text, items: [{key, setName, slotLabel, name}],
     ackText ("Clear this piece in the copy")} when the chosen job cannot wear some of the sheet's pieces;
   - disabled: the warning shows and its box is not ticked (Copy waits until it is). */
export function copySheetFormView(sheet, form) {
  const own = jobById(sheet.job);
  const group = GEAR_GROUPS.find(g => g.includes(sheet.job)) ?? [sheet.job];
  const chosen = jobById(form.job) ?? own;
  const cleared = piecesToClear(sheet, chosen.id);
  const items = cleared.map(piece => ({
    key: `${piece.setId}:${piece.index}`,
    setName: piece.setName,
    slotLabel: SLOT_LABEL[piece.slot],
    name: piece.name,
  }));
  const warning = cleared.length
    ? {
        title: `${chosen.name} cannot wear ${plural(cleared.length, 'piece')}.`,
        text: `In the copy ${oneOrMany(cleared.length, 'its slot is', 'their slots are')} cleared and unpinned:`,
        items,
        ackText: `Clear ${oneOrMany(cleared.length, 'this piece', `these ${cleared.length} pieces`)} in the copy`,
      }
    : null;
  return {
    title: `Copy “${sheet.name}”`,
    name: form.name,
    nameMax: NAME_MAX_LENGTH,
    jobs: group.map(id => ({ id, name: jobById(id).name, checked: id === chosen.id })),
    jobText: chosen.name,
    jobNote: group.length > 1 ? groupNote(own) : `a ${own.name} sheet copies to no other job`,
    ...ranges(chosen.id),
    warning,
    disabled: !!warning && !form.ack,
    buttonText: 'Copy sheet',
    error: form.error ?? '',
  };
}

/* The "Name and description" dialog of a sheet or a gear set: {title, nameMax, descriptionMax, buttonText}. */
export function editFormView() {
  return { title: 'Name and description', nameMax: NAME_MAX_LENGTH, descriptionMax: DESCRIPTION_MAX_LENGTH, buttonText: 'Save' };
}

/* The question a Delete asks first (rule 8: always, no undo). `kind`: 'sheet' (`target` a Sheet: named with its number of
   gear sets), 'set' (a GearSet) or 'unreadable' (a record the manager could not read: {id, cause}). Returns {question,
   buttonText}. */
export function deleteQuestionView(kind, target) {
  let question;
  if (kind === 'sheet') {
    const count = target.sets.length;
    question = `Delete the sheet “${target.name}” ${count ? `and its ${plural(count, 'gear set')}` : '(it has no gear sets)'}?`;
  } else if (kind === 'set') question = `Delete the gear set “${target.name}”?`;
  else question = `Delete the saved sheet that could not be read (${target.cause})?`;
  return { question, buttonText: 'Delete' };
}
