/* A sheet's page (the Sheets tab's second level): its name and description, its settings and the list of its gear sets,
   each with the header figures; and the breadcrumb and read-only settings line of a set page. Takes a saved Sheet
   (docs/engineering/sheets.md "Saved data") and builds plain view objects; the template only displays them. Pure: no
   store. Rules: sheets.md "A sheet's level and sync" and "Where an action lands". */
import { makeJobContext } from '../../core/job-context.js';
import { fillPlan } from '../sheets/fill.js';
import { bonusNote, evaluateInSheet, setFigures, setTotalsView } from './set-totals.js';
import { plural } from '../text.ts';
import { ranges } from '../sheets/ops.js';
import { settingsLine } from './sheet-text.js';
import { sheetHref } from '../store/app-state.ts';

/* One gear set of a sheet for the list: {id, href (its address), name, description, descriptionLine, originText, figures, points}. descriptionLine
   is the first line of the set's notes, '' without; originText counts the rows Auto-fill keeps and changes ("5
   pinned, 6 unpinned", owner: counts only, no goal text), with "2 slots empty" after it while the set has
   rows with no piece; figures are the header's figures (setFigures) under the sheet's settings; points the stat points the
   Total row of the set's page shows, [{key, label, text}] one per stat of the job (the character panel's numbers). */
function setListRow(sheet, gearSet) {
  const context = evaluateInSheet(sheet, gearSet);
  const plan = fillPlan(context.job, gearSet);
  const totals = setTotalsView(context).total;
  const empty = totals.emptyCount;
  const counts = `${plan.pinnedRows.length} pinned, ${plan.openRows.length} unpinned`;
  const description = gearSet.description ?? '';
  return {
    id: gearSet.id,
    href: sheetHref(sheet.id, gearSet.id),
    name: gearSet.name,
    description,
    descriptionLine: description.split('\n')[0],
    originText: empty ? `${counts} · ${plural(empty, 'slot')} empty` : counts,
    figures: setFigures(context),
    points: totals.cells.map(cell => ({ key: cell.stat, label: cell.header, text: String(cell.value) })),
  };
}

/* The number in a figure's text ("22.9%" 22.9, "+179 MP" 179, "2.48s" 2.48, "1324" 1324): what a heading sorts by. */
const figureNumber = text => Number.parseFloat(text.replace(/[^0-9.-]/g, ''));

/* What a click on a heading of the gear sets list starts with: names A to Z, the GCD lowest first (the best first), every
   other figure highest first. `key`: 'name' or a figure's key (setFigures; a stat's key in the stat points view). */
export function firstSortDir(key, mode) {
  if (key === 'name') {
    return 'asc';
  }
  return key === 'gcd' && mode === 'effects' ? 'asc' : 'desc';
}

/* The list's sort after a click on heading `key` (the sort now is `current`, {key, dir}, key '' for the saved order):
   a new heading starts with firstSortDir, the same heading again flips it, and a third click goes back to the saved
   order. Returns {key, dir}. */
export function nextListSort(current, key, mode) {
  const first = firstSortDir(key, mode);
  if (current.key !== key) {
    return { key, dir: first };
  }
  if (current.dir === first) {
    return { key, dir: first === 'asc' ? 'desc' : 'asc' };
  }
  return { key: '', dir: '' };
}

/* `rows` (the page's set rows) sorted by `sort` ({key, dir}) in the view `mode` ('effects' or 'points'): a copy, the
   rows with equal figures keep their saved order; with no key the saved order. */
export function sortSetRows(rows, sort, mode) {
  if (!sort.key) {
    return rows;
  }
  const sign = sort.dir === 'asc' ? 1 : -1;
  const figureOf = row => (mode === 'points' ? row.points : row.figures).find(f => f.key === sort.key);
  const figureValue = row => {
    const figure = figureOf(row);
    return figure ? figureNumber(figure.text) : Number.NEGATIVE_INFINITY;
  };
  // a hasted GCD's `text` is the hasted GCD, the same for sets that differ only in speed; the number the page shows in
  // front ("2.46s (2.22s)", the GCD without the haste) breaks those ties, so the column sorts by what it shows
  const shownValue = row => Number.parseFloat(figureOf(row)?.shown ?? '') || 0;
  const compare =
    sort.key === 'name'
      ? (a, b) => a.name.localeCompare(b.name)
      : (a, b) => figureValue(a) - figureValue(b) || shownValue(a) - shownValue(b);
  return [...rows].sort((a, b) => sign * compare(a, b));
}

/* The page of `sheet` (a saved Sheet). Returns:
   - crumbs: [{text, to, href}, {text, here: true}], "Sheets / <sheet>" (`to` names the screen a link opens, `href` is its address);
   - id, name; description {text, empty} ("No description" in muted text when empty);
   - job {id, name} (fixed once the sheet exists); level {value, max (the job's level cap)};
     sync {on, cap, max (the highest real item level)};
   - setCount; columns: the list's column headers (the figures' labels, first set's job), pointColumns the same for the stat points, columnKeys and pointKeys their figures' keys (what a heading sorts by), wideColumns (per column: true for a figure with a longer text, the GCD of a job with haste), set rows (setListRow);
   - bonusNote: the note under the table when the sheet sets a clan or a party bonus (set-totals.js bonusNote), '' without;
   - empty: no sets; emptyCard {title, text} is the "No gear sets yet" card with a New set button. */
export function sheetPageView(sheet) {
  const job = makeJobContext(sheet.job);
  const fields = ranges(sheet.job);
  const rows = sheet.sets.map(gearSet => setListRow(sheet, gearSet));
  const description = sheet.description ?? '';
  return {
    crumbs: [
      { text: 'Sheets', to: 'sheets', href: sheetHref() },
      { text: sheet.name, here: true },
    ],
    id: sheet.id,
    name: sheet.name,
    description: { text: description || 'No description', empty: !description },
    job: { id: job.jobId, name: job.jobName },
    level: { value: sheet.level, ...fields.level },
    sync: { on: sheet.sync.on, cap: sheet.sync.cap, ...fields.cap },
    setCount: sheet.sets.length,
    title: 'Gear sets',
    columns: rows.length ? rows[0].figures.map(figure => figure.label) : [],
    pointColumns: rows.length ? rows[0].points.map(point => point.label) : [],
    columnKeys: rows.length ? rows[0].figures.map(figure => figure.key) : [],
    pointKeys: rows.length ? rows[0].points.map(point => point.key) : [],
    wideColumns: rows.length ? rows[0].figures.map(figure => Boolean(figure.shown)) : [],
    rows,
    bonusNote: bonusNote(sheet),
    empty: rows.length === 0,
    emptyCard: {
      title: 'No gear sets yet',
      text: 'A gear set is a set of pieces, their materia and a meal. Choose the pieces yourself, let Auto-fill choose them for a goal, or both.',
    },
  };
}

/* The line above a set page: the breadcrumb "Sheets / <sheet> / <set>" and the sheet's settings as one read-only line
   (job, level, item level sync; edited on the sheet page only), and the set's notes. Returns {crumbs:
   [{text, to}, {text, to}, {text, here: true}], settingsText, jobId, notes: {text, empty}}. notes: the set's description
   as saved (line ends kept), or "No description" (empty: true, shown dim) without; the page shows it under the set name. `gearSet`: the saved GearSet that is open. */
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
    notes: { text: gearSet.description || 'No description', empty: !gearSet.description },
  };
}

/* What the gear sets list of a sheet's page draws, for the page view `page` (sheetPageView), the list's `sort` ({key, dir},
   key '' for the saved order) and the figures `mode` ('effects' or 'points'). Returns:
   - sort: the sort in force: `sort` while its column is on the page (the stat points view has other columns than the effects),
     else the saved order;
   - columns: the headings after the Set column, [{key, label, wide (a figure with a longer text), ariaSort}], and nameAriaSort,
     the Set heading's own; an aria-sort is 'descending', 'ascending' or 'none';
   - rows: the set rows in the sort in force, each {id, href, name, description, descriptionLine, originText, cells:
     [{key, text}] (the figures of the mode)};
   - orderLocked: the list is sorted, so its rows have no order of their own to drag or step in. */
export function sheetListView(page, sort, mode) {
  const keys = mode === 'points' ? page.pointKeys : page.columnKeys;
  const labels = mode === 'points' ? page.pointColumns : page.columns;
  const inForce = sort.key && (sort.key === 'name' || keys.includes(sort.key)) ? sort : { key: '', dir: '' };
  const ariaSort = key => {
    if (inForce.key !== key) {
      return 'none';
    }
    return inForce.dir === 'desc' ? 'descending' : 'ascending';
  };
  return {
    sort: inForce,
    nameAriaSort: ariaSort('name'),
    columns: keys.map((key, index) => ({
      key,
      label: labels[index],
      wide: mode === 'effects' && page.wideColumns[index],
      ariaSort: ariaSort(key),
    })),
    rows: sortSetRows(page.rows, inForce, mode).map(row => ({
      id: row.id,
      href: row.href,
      name: row.name,
      description: row.description,
      descriptionLine: row.descriptionLine,
      originText: row.originText,
      cells: (mode === 'points' ? row.points : row.figures).map(figure => ({ key: figure.key, text: figure.shown ?? figure.text })),
    })),
    orderLocked: Boolean(inForce.key),
  };
}

/* What the caret menu after the sheet's name shows (<gsa-switch-menu>): `rows` (the manager's rows), `currentId` (the open sheet's
   id) and `busy` (an Auto-fill runs: the menu is off). Returns {items: [{id, name, href, current}], allLabel, allHref, newLabel,
   disabled}: a link to the manager, one per saved sheet (the open one marked) and "+ New sheet". */
export function sheetSwitcherView(rows, currentId, busy) {
  return {
    items: rows.map(row => ({ id: row.id, name: row.name, href: row.href, current: row.id === currentId })),
    allLabel: `All sheets (${rows.length})`,
    allHref: sheetHref(),
    newLabel: '+ New sheet',
    disabled: busy,
  };
}
