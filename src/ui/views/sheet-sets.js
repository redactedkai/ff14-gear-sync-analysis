/* A sheet's page (the Sheets tab's second level): its name and description, its settings and the list of its gear sets,
   each with the header figures; and the breadcrumb and read-only settings line of a set page. Takes a saved Sheet
   (docs/engineering/sheets.md "Saved data") and builds plain view objects; the template only displays them. Pure: no
   Alpine, no store. Rules: sheets.md "A sheet's level and sync" and "Where an action lands". */
import { makeJobContext } from '../../core/job-context.js';
import { fillPlan } from './fill.js';
import { evaluateInSheet, setFigures, setTotalsView } from './set-totals.js';
import { plural } from '../helpers.js';
import { ranges } from '../sheet-ops.js';
import { settingsLine } from './sheet-text.js';

/* One gear set of a sheet for the list: {id, name, description, descriptionLine, originText, figures}. descriptionLine
   is the first line of the set's notes, '' without; originText counts the rows Fill keeps and changes ("5
   pinned, 6 unpinned", owner: counts only, no goal text), with "2 slots empty" after it while the set has
   rows with no piece; figures are the header's figures (setFigures) under the sheet's settings. */
function setListRow(sheet, gearSet) {
  const context = evaluateInSheet(sheet, gearSet);
  const plan = fillPlan(context.job, gearSet);
  const empty = setTotalsView(context).total.emptyCount;
  const counts = `${plan.pinnedRows.length} pinned, ${plan.openRows.length} unpinned`;
  const description = gearSet.description ?? '';
  return {
    id: gearSet.id,
    name: gearSet.name,
    description,
    descriptionLine: description.split('\n')[0],
    originText: empty ? `${counts} · ${plural(empty, 'slot')} empty` : counts,
    figures: setFigures(context),
  };
}

/* The page of `sheet` (a saved Sheet). Returns:
   - crumbs: [{text, to}, {text, here: true}], "Sheets / <sheet>" (`to` names the screen a link opens);
   - name; description {text, empty} ("No description" in muted text when empty);
   - job {id, name} (fixed once the sheet exists); level {value, max (the job's level cap), rangeText "1–100"};
     sync {on, cap, max (the highest real item level), rangeText "1–795"}; note: the line under the fields;
   - setCount; columns: the list's column headers (the figures' labels, first set's job), set rows (setListRow);
   - empty: no sets; emptyCard {title, text} is the "No gear sets yet" card with a New set button;
   - reorderHint: how to reorder the list. */
export function sheetPageView(sheet) {
  const job = makeJobContext(sheet.job);
  const fields = ranges(sheet.job);
  const rows = sheet.sets.map(gearSet => setListRow(sheet, gearSet));
  const description = sheet.description ?? '';
  return {
    crumbs: [
      { text: 'Sheets', to: 'sheets' },
      { text: sheet.name, here: true },
    ],
    name: sheet.name,
    description: { text: description || 'No description', empty: !description },
    job: { id: job.jobId, name: job.jobName },
    level: { value: sheet.level, ...fields.level },
    sync: { on: sheet.sync.on, cap: sheet.sync.cap, ...fields.cap },
    note: 'Level and item level sync apply to every gear set of the sheet. The job cannot change; Copy sheet makes a copy for another job that shares its gear.',
    setCount: sheet.sets.length,
    title: 'Gear sets',
    columns: rows.length ? rows[0].figures.map(figure => figure.label) : [],
    rows,
    empty: rows.length === 0,
    emptyCard: {
      title: 'No gear sets yet',
      text: 'A gear set is a set of pieces, their materia and a meal. Choose the pieces yourself, let Fill choose them for a goal, or both.',
    },
    reorderHint: 'Drag a row by its handle to reorder, or focus the handle and press Up or Down arrow.',
  };
}

/* The line above a set page: the breadcrumb "Sheets / <sheet> / <set>" and the sheet's settings as one read-only line
   (job, level, item level sync; edited on the sheet page only), and the set's notes. Returns {crumbs:
   [{text, to}, {text, to}, {text, here: true}], settingsText, jobId, notes}. notes: the set's description as saved
   (line ends kept), '' without; the page shows it in full under the set
   bar, and nothing when it is empty. `gearSet`: the saved GearSet that is open. */
export function setHeaderView(sheet, gearSet) {
  const job = makeJobContext(sheet.job);
  return {
    crumbs: [
      { text: 'Sheets', to: 'sheets' },
      { text: sheet.name, to: 'sheet' },
      { text: gearSet.name, here: true },
    ],
    jobId: job.jobId,
    settingsText: settingsLine(sheet, job.jobName),
    notes: gearSet.description ?? '',
  };
}
