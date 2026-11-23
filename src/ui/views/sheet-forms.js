/* The Sheets tab's dialogs as plain view objects: New sheet, Copy sheet (with the list of pieces the new job cannot wear
   and the box that accepts clearing them), "Edit sheet" and "Edit gear set", and the Delete questions.
   The component keeps each form's fields; these builders turn them into what the dialog shows. Pure: no Alpine, no
   store. Rules: docs/engineering/sheets.md ("Names", "Copy sheet", "Where an action lands"). */
import { SLOT_LABEL, jobById } from '../../core/constants.js';
import { GEAR_GROUPS, gearGroupName } from '../../core/gear-groups.js';
import { oneOrMany, plural } from '../text.js';
import { DESCRIPTION_MAX_LENGTH, FORM_FIELD, NAME_MAX_LENGTH, defaultSheetName, piecesToClear, ranges } from '../sheets/ops.js';

/* Where a refused form's reason shows, from the form's `error` (the reason, '' for none) and `errorField` (the FORM_FIELD
   it is about, '' for none). Returns {error (the reason), errors: {name, job, ack, title}}: `errors` holds the reason
   under the place that shows it (the label row of that field, or the title row for a reason about no field) and '' under
   the others, so a template only displays them. */
export function errorPlaces({ error = '', errorField = '' }) {
  const places = { name: '', job: '', ack: '', title: '' };
  if (error) places[Object.values(FORM_FIELD).includes(errorField) ? errorField : 'title'] = error;
  return { error, errors: places };
}

/* The New sheet dialog for `form` ({name, nameTyped (the user typed a name: it no longer follows the job), description,
   job ('' for none), level, sync: {on, cap}, error, errorField}). Returns {title, name (the name the box shows: the
   default name while none is typed), namePlaceholder, nameMax, descriptionMax,
   level, cap (sheets/ops.js ranges), buttonText, error, errors (errorPlaces)}. */
export function newSheetFormView(form) {
  return {
    title: 'New sheet',
    name: form.nameTyped ? form.name : defaultSheetName(form),
    namePlaceholder: form.job ? '' : 'Choose a job for a default name', // with a job the name box is never empty unless it was emptied: no hint then
    nameMax: NAME_MAX_LENGTH,
    descriptionMax: DESCRIPTION_MAX_LENGTH,
    ...ranges(form.job || null),
    buttonText: 'Create sheet',
    ...errorPlaces(form),
  };
}

/* The game's name for the armor each gear group wears, by the group's first job (checked against the item data: the
   armor sets named "of Fending", "of Healing", "of Striking", ... are worn by exactly these groups). */
const ARMOR_TYPE_OF_GROUP_LEADER = Object.freeze({
  PLD: 'Fending',
  WHM: 'Healing',
  MNK: 'Striking',
  DRG: 'Maiming',
  NIN: 'Scouting',
  BRD: 'Aiming',
  BLM: 'Casting',
});

/* "Melee (Striking)", or whichever of the two is known. */
function groupLabel(role, armorType) {
  return role && armorType ? `${role} (${armorType})` : (role ?? armorType ?? null);
}

/* The "?" panel of the Copy sheet dialog: how a copy is made and which jobs copy to which. `ownJobId`: the sheet's job (its
   group is marked). Returns {title, outcomes: [{label, text}] (what a copy keeps and what it clears), groupsTitle (the heading over the list), groups: [{label ("Melee (Striking)": the role row of the picker and the
   game's armor type; either alone when the other is unknown), jobs ("Paladin, Warrior, ..."), own}], footText (the jobs alone in their groups)}. The groups are gear-groups.js GEAR_GROUPS: jobs that
   can wear most of the same armor at the same level cap; a job alone in its group (Blue Mage, Beastmaster) is listed
   in footText, not in groups. */
export function copyHelpView(ownJobId) {
  const alone = GEAR_GROUPS.filter(group => group.length < 2).map(group => jobById(group[0]).name);
  return {
    title: 'How copying works:',
    outcomes: [
      { label: 'Kept', text: 'Every gear piece the new job can wear.' },
      { label: 'Not kept', text: 'The weapon, and any other gear piece unique to the old job.' },
    ],
    groupsTitle: 'Which jobs share similar gear (at same level cap):',
    groups: GEAR_GROUPS.filter(group => group.length > 1).map(group => ({
      label: groupLabel(gearGroupName(group[0]), ARMOR_TYPE_OF_GROUP_LEADER[group[0]]),
      jobs: group.map(id => jobById(id).name).join(', '),
      own: group.includes(ownJobId),
    })),
    footText: `Limited jobs like ${alone.join(' and ')} copy to no other job.`,
  };
}

/* The Copy sheet dialog for `sheet` (a saved Sheet) and `form` ({name, job, level, sync: {on, cap}, ack (the box that
   accepts clearing the pieces is ticked), error, errorField}). The jobs offered are the sheet's gear group (gear-groups.js), its
   own job included, in the group's order; Blue Mage and Beastmaster are alone in theirs. Returns:
   - title ("Copy “Bahamut T13 Healer” sheet"), sheetName (the sheet's name, which the title shows clipped to one line), name, nameMax, buttonText, error, errors (errorPlaces);
   - jobs: [{id, name, checked}]; help (copyHelpView: the "?" panel);
   - level, cap: the fields' ranges for the chosen job (sheets/ops.js ranges);
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
    title: `Copy “${sheet.name}” sheet`,
    sheetName: sheet.name,
    name: form.name,
    nameMax: NAME_MAX_LENGTH,
    jobs: group.map(id => ({ id, name: jobById(id).name, checked: id === chosen.id })),
    help: copyHelpView(sheet.job),
    ...ranges(chosen.id),
    warning,
    disabled: !!warning && !form.ack,
    buttonText: 'Copy sheet',
    ...errorPlaces(form),
  };
}

/* The edit dialog of a sheet or a gear set: {title, nameMax, descriptionMax, buttonText, error, errors (errorPlaces)}. `kind`:
   'edit-sheet' (title "Edit sheet") or 'edit-set' (title "Edit gear set"); `form`: {error, errorField}. */
export function editFormView(kind, form) {
  const title = kind === 'edit-set' ? 'Edit gear set' : 'Edit sheet';
  return { title, nameMax: NAME_MAX_LENGTH, descriptionMax: DESCRIPTION_MAX_LENGTH, buttonText: 'Save', ...errorPlaces(form) };
}

/* The question a Delete asks first (rule 8: always, no undo). `kind`: 'sheet' (`target` a Sheet: named with its number of
   gear sets), 'set' (a GearSet) or 'unreadable' (a record the manager could not read: {id, cause}); `form`: {error}. Returns
   {question, buttonText, error (the reason a refused Delete shows beside the buttons)}. */
export function deleteQuestionView(kind, target, form) {
  let question;
  if (kind === 'sheet') {
    const count = target.sets.length;
    question = `Delete the sheet “${target.name}” ${count ? `and its ${plural(count, 'gear set')}` : '(it has no gear sets)'}?`;
  } else if (kind === 'set') question = `Delete the gear set “${target.name}”?`;
  else question = `Delete the saved sheet that could not be read (${target.cause})?`;
  return { question, buttonText: 'Delete', error: form.error ?? '' };
}
