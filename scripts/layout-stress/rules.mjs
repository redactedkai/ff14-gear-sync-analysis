/* The layout rules: their names, severities and thresholds, and the pure functions that judge what the page-side probe
   measured (probe.mjs). The probe only measures; every decision is here, so it can be tested on small made-up inputs.

   A measured control is {id, l, t, r, b} (its box in the window's coordinates, in px) plus, where a rule needs it,
   `up` (the index of the nearest control around it, or -1) and `c` (the index of its container). A container is
   {id, l, t, r, b, scrolls} (`scrolls`: it scrolls on its own, so what is beyond its edge is reachable). */
import { mathBarState } from './math-rules.mjs';

/* The thresholds, in px unless named. */
export const THRESHOLDS = Object.freeze({
  minRowsFail: 2, // gear rows fully visible under the pinned header: fewer fails
  minRowsWarn: 3, // fewer than this warns
  maxPinnedPercent: 40, // the pinned header's share of the window height
  maxNameLines: 2, // lines an item name may take in its button
  maxBarPercent: 25, // the math bar's share of the window height
  edgeTolerance: 1, // an element past the window's right edge
  outsideTolerance: 1, // a control past its container's edge
  overlapTolerance: 2, // two controls overlapping by more than this in both directions
  boxHeightTolerance: 1, // boxes in a row differ in height by more than this
  boxTopTolerance: 2, // boxes in a row differ in top by more than this
  rowGap: 3, // controls whose tops are within this share a row
  moveTolerance: 1.5, // a control that moved or resized by more than this between two layouts that should match
});

/* Every rule: id -> [severity, what it checks]. `fail` makes the run exit 1; `warn` is only reported. */
export const RULES = Object.freeze({
  'no-sideways-scroll': ['fail', 'The page never scrolls sideways (the document is no wider than the window).'],
  'no-clipped-cells': ['fail', 'No cell, panel, field or button holds text wider than itself (a name cut with an ellipsis is meant).'],
  'nothing-past-window': ['fail', `No visible element extends past the window's right edge by more than ${THRESHOLDS.edgeTolerance} px.`],
  'control-in-container': ['fail', 'No control is outside its container (the nearest box around it, unless that box scrolls on its own).'],
  'no-overlap': ['fail', 'No two controls overlap.'],
  'label-one-line': ['fail', 'Every label, field name and button text is on one line.'],
  'boxes-equal-height': ['fail', 'Boxes in a row are as high as each other and start at the same height.'],
  'widening-adds-rows': ['fail', 'Making the window wider never gives a group of controls more rows.'],
  'resize-equals-fresh': ['fail', 'A window resized to a width lays out like a page loaded at that width.'],
  'content-independent': ['fail', "A header's layout does not depend on its content (names, jobs, numbers)."],
  'menu-inside-window': ['fail', 'An open menu or popover ends inside the window.'],
  'menu-not-clipped': ['fail', 'An open menu or popover is not cut off by a box around it.'],
  'menu-below-pinned-header': ['fail', 'An open menu starts below the pinned header and column names.'],
  'focus-ring-clipped': ['fail', "A control's focus ring is not cut off by a box around it or by the window's edge."],
  'dialog-fits': ['fail', 'A dialog fits the window, or scrolls inside itself.'],
  'rows-visible': [
    'fail',
    `At least ${THRESHOLDS.minRowsFail} gear rows are fully visible under the pinned header (a warning below ${THRESHOLDS.minRowsWarn}).`,
  ],
  'pinned-share': ['warn', `The pinned header (with the column names) is at most ${THRESHOLDS.maxPinnedPercent}% of the window height.`],
  'names-max-lines': ['warn', `An item name takes at most ${THRESHOLDS.maxNameLines} lines in its button.`],
  'popup-inside-window': ['warn', 'A help popup ends inside the window when the page is at the top.'],
  'sticky-bar-share': ['warn', `The math bar is at most ${THRESHOLDS.maxBarPercent}% of the window height.`],
  'menu-keeps-layout': ['fail', 'Opening a menu or popover does not move the controls around it.'],
  'tabs-start-at-top': [
    'fail',
    'A sub-tab opened by a click starts at the top of the page, switching between the sub-tabs does not move the tab strip, the ? button or the Job box, and a round trip gives the same layout.',
  ],
  'pinned-bar-at-top': [
    'fail',
    'A sticky bar stays at the top of the window when the page is scrolled, and its controls keep their places.',
  ],
  'bar-dividers': ['fail', "The math bar's dividers show exactly when their section is not first on its line, in the middle of the gap."],
  'bar-breakpoints': [
    'fail',
    "Stat Allocation's controls change rows at 56 rem and 78 rem and nowhere else (at the page's own text size).",
  ],
  'bar-box-height': ['fail', 'Every box of the math bar is as high as the Job box.'],
  'bar-slider-track': ['warn', "The Item level slider's track is at least 100 px wide."],
  'no-page-errors': ['fail', 'No script error is raised on the page.'],
  'check-completed': ['fail', 'The scripted steps ran to the end (a step that cannot run is a fault of the page or of the check).'],
});

/* The severity of rule `rule` ('fail' or 'warn'); throws for a rule that does not exist, so a typo cannot hide a finding. */
export function severityOf(rule) {
  if (!RULES[rule]) {
    throw new Error(`unknown rule "${rule}"`);
  }
  return RULES[rule][0];
}

/* The rules as a Markdown table. */
export function rulesMarkdown() {
  const lines = Object.entries(RULES).map(([id, [severity, text]]) => `| ${id} | ${severity} | ${text} |`);
  return `| Rule | Severity | What it checks |\n| --- | --- | --- |\n${lines.join('\n')}\n`;
}

/* A collector of findings: `add(rule, detail, where, severity)` files one by the rule's severity (or `severity`, for a rule
   that warns on a lesser case, such as rows-visible). `where` names the part of the page. `list` holds {rule, severity, detail, where}. */
export function makeFindings() {
  const list = [];
  return {
    list,
    add(rule, detail, where = '', severity = severityOf(rule)) {
      list.push({ rule, severity, detail, where });
    },
  };
}

/* `items` ({t: top}) split into rows: items whose tops are within `gap` of the row's first one share a row. Rows come
   top to bottom, each row's items left to right when they have `l`. */
export function groupRows(items, gap = THRESHOLDS.rowGap) {
  const rows = [];
  for (const item of [...items].sort((a, b) => a.t - b.t || (a.l ?? 0) - (b.l ?? 0))) {
    const row = rows.find(candidate => Math.abs(candidate.top - item.t) <= gap);
    if (row) {
      row.items.push(item);
    } else {
      rows.push({ top: item.t, items: [item] });
    }
  }
  return rows.map(row => row.items.sort((a, b) => (a.l ?? 0) - (b.l ?? 0)));
}

/* The number of rows `controls` sit in. */
export function rowCount(controls) {
  return groupRows(controls).length;
}

/* The controls that sit past an edge of their container: [{id, container, by}] with `by` the px beyond the nearest edge.
   A container that scrolls on its own, and a control with no container, are skipped. */
export function findOutside(controls, containers, tolerance = THRESHOLDS.outsideTolerance) {
  const found = [];
  for (const control of controls) {
    const container = containers[control.c];
    if (!container || container.scrolls) {
      continue;
    }
    const by = Math.max(container.l - control.l, control.r - container.r, container.t - control.t, control.b - container.b);
    if (by > tolerance) {
      found.push({ id: control.id, container: container.id, by: Math.round(by) });
    }
  }
  return found;
}

/* Whether control `index` has control `other` among the controls around it (one holds the other: a button with a label
   inside, a field with its box). */
function isAround(controls, index, other) {
  for (let at = controls[index].up; at !== undefined && at >= 0; at = controls[at].up) {
    if (at === other) {
      return true;
    }
  }
  return false;
}

/* The pairs of controls that overlap by more than `tolerance` px both ways: [[idA, idB], ...]. A control and one around it are not a pair, and neither is a pair with a control that is positioned over its field on purpose (`overlay`). */
export function findOverlaps(controls, tolerance = THRESHOLDS.overlapTolerance) {
  const pairs = [];
  for (let first = 0; first < controls.length; first++) {
    for (let second = first + 1; second < controls.length; second++) {
      const a = controls[first];
      const b = controls[second];
      const across = Math.min(a.r, b.r) - Math.max(a.l, b.l);
      const down = Math.min(a.b, b.b) - Math.max(a.t, b.t);
      if (across <= tolerance || down <= tolerance) {
        continue;
      }
      if (a.overlay || b.overlay) {
        continue; // a control placed over another on purpose (a clear button inside its field)
      }
      if (isAround(controls, first, second) || isAround(controls, second, first)) {
        continue;
      }
      pairs.push([a.id, b.id]);
    }
  }
  return pairs;
}

/* The labels ({id, lines: the lines their text takes}) with more than one line. */
export function findWrappedLabels(labels) {
  return labels.filter(label => label.lines > 1).map(label => label.id);
}

/* Problems among boxes: boxes that share a row (their vertical ranges overlap by at least half of the shorter one) must
   be as high as each other (`heightTolerance`) and start at the same height (`topTolerance`). Returns
   [{ids, kind: 'height' | 'top', spread}] with the spread in px. */
export function findBoxRowProblems(boxes, heightTolerance = THRESHOLDS.boxHeightTolerance, topTolerance = THRESHOLDS.boxTopTolerance) {
  const rows = [];
  for (const box of [...boxes].sort((a, b) => a.t - b.t)) {
    const row = rows.find(candidate =>
      candidate.some(other => Math.min(box.b, other.b) - Math.max(box.t, other.t) >= Math.min(box.b - box.t, other.b - other.t) / 2),
    );
    if (row) {
      row.push(box);
    } else {
      rows.push([box]);
    }
  }
  const problems = [];
  for (const row of rows.filter(items => items.length > 1)) {
    const heights = row.map(box => box.b - box.t);
    const tops = row.map(box => box.t);
    const heightSpread = Math.max(...heights) - Math.min(...heights);
    const topSpread = Math.max(...tops) - Math.min(...tops);
    const ids = row.map(box => box.id);
    if (heightSpread > heightTolerance) {
      problems.push({ ids, kind: 'height', spread: Math.round(heightSpread * 10) / 10 });
    }
    if (topSpread > topTolerance) {
      problems.push({ ids, kind: 'top', spread: Math.round(topSpread * 10) / 10 });
    }
  }
  return problems;
}

/* From a series of widths widening ({width, rows: {scope: row count}}, in any order), the places where a scope got more
   rows at a larger width: [{scope, from: {width, rows}, to: {width, rows}}]. Only neighbouring widths are compared. */
export function rowsIncreaseWhenWidening(series) {
  const sorted = [...series].sort((a, b) => a.width - b.width);
  const found = [];
  for (let at = 1; at < sorted.length; at++) {
    for (const scope of Object.keys(sorted[at].rows)) {
      const before = sorted[at - 1].rows[scope];
      const after = sorted[at].rows[scope];
      if (before !== undefined && after > before) {
        found.push({ scope, from: { width: sorted[at - 1].width, rows: before }, to: { width: sorted[at].width, rows: after } });
      }
    }
  }
  return found;
}

/* The controls of a scope as one text per row ("a+b / c"), the shape of the layout without sizes. */
export function rowShape(controls) {
  return groupRows(controls)
    .map(row => row.map(control => control.id).join('+'))
    .join(' / ');
}

/* The differences between two measurements of one scope ({controls, height}) that should lay out alike: a different row
   shape, a different height of the scope, and each control present in both that moved or resized by more than
   `tolerance`. Returns a list of short texts; empty when they match. */
export function compareScopes(first, second, tolerance = THRESHOLDS.moveTolerance, commonOnly = false) {
  const differences = [];
  // a menu that opens inside the scope adds controls: only the controls both measures have are compared
  const secondIds = new Set(second.controls.map(control => control.id));
  const firstIds = new Set(first.controls.map(control => control.id));
  const firstControls = commonOnly ? first.controls.filter(control => secondIds.has(control.id)) : first.controls;
  const secondControls = commonOnly ? second.controls.filter(control => firstIds.has(control.id)) : second.controls;
  const firstShape = rowShape(firstControls);
  const secondShape = rowShape(secondControls);
  if (firstShape !== secondShape) {
    differences.push(`rows "${firstShape}" against "${secondShape}"`);
    return differences;
  }
  if (Math.abs((first.height ?? 0) - (second.height ?? 0)) > tolerance) {
    differences.push(`height ${Math.round(first.height)} against ${Math.round(second.height)} px`);
  }
  // down from the scope's own top, so a scope that moved as a whole (another header above it) is not a change
  const firstTop = first.rect?.t ?? 0;
  const secondTop = second.rect?.t ?? 0;
  const byId = new Map(secondControls.map(control => [control.id, control]));
  for (const a of firstControls) {
    const b = byId.get(a.id);
    if (!b) {
      continue;
    }
    const moved = Math.max(Math.abs(a.l - b.l), Math.abs(a.t - firstTop - (b.t - secondTop)));
    const resized = Math.max(Math.abs(a.r - a.l - (b.r - b.l)), Math.abs(a.b - a.t - (b.b - b.t)));
    if (moved > tolerance) {
      differences.push(`${a.id} moved ${Math.round(moved)} px`);
    } else if (resized > tolerance) {
      differences.push(`${a.id} resized ${Math.round(resized)} px`);
    }
  }
  return differences;
}

/* The differences between two whole probes' scopes ({name: scope}), as texts that name the scope. */
export function compareProbes(first, second, scopeNames, tolerance = THRESHOLDS.moveTolerance, commonOnly = false) {
  return scopeNames.flatMap(name => {
    if (!first.scopes[name] || !second.scopes[name]) {
      return first.scopes[name] || second.scopes[name] ? [`${name} is not on both pages`] : [];
    }
    return compareScopes(first.scopes[name], second.scopes[name], tolerance, commonOnly).map(text => `${name}: ${text}`);
  });
}

/* What the page's measures say about the discrete layout, as one text: the row shape of every scope, whether the page
   scrolls sideways and how many labels wrap or cells clip. Two widths with the same key lay out alike; the sweep looks for
   the widths where the key changes. */
export function layoutKey(probe) {
  const shapes = Object.entries(probe.scopes).map(([name, scope]) => `${name}=${rowShape(scope.controls)}`);
  return JSON.stringify({
    shapes,
    hscroll: probe.hscroll,
    wraps: probe.wrapped?.length ?? 0,
    clipped: probe.clipped?.length ?? 0,
    lines: probe.nameLines ?? null,
    bar: mathBarState(probe.mathBar),
  });
}

/* A value of a layout key as text: an object as JSON. */
const asText = value => (value !== null && typeof value === 'object' ? JSON.stringify(value) : String(value));

/* What changed between two probes' layout keys, as short texts: the scopes whose row shape differs and the counts. */
export function describeKeyChange(before, after) {
  const a = JSON.parse(layoutKey(before));
  const b = JSON.parse(layoutKey(after));
  const changes = [];
  a.shapes.forEach((shape, at) => {
    if (shape !== b.shapes[at]) {
      changes.push(`${shape.split('=')[0]}: ${shape.split('=').slice(1).join('=')} -> ${b.shapes[at].split('=').slice(1).join('=')}`);
    }
  });
  for (const key of ['hscroll', 'wraps', 'clipped', 'lines', 'bar']) {
    if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) {
      changes.push(`${key}: ${asText(a[key])} -> ${asText(b[key])}`);
    }
  }
  return changes;
}

/* The rows of a scope per name ({scope: row count}), for `rowsIncreaseWhenWidening`. */
export function rowCounts(probe) {
  return Object.fromEntries(Object.entries(probe.scopes).map(([name, scope]) => [name, rowCount(scope.controls)]));
}

/* The verdict on the gear rows under a pinned header: `visible` rows fully in view, `stack` px pinned in a window of
   `windowHeight` px. Returns [{rule, severity, detail}]. */
export function judgeRowsVisible({ visible, stack, windowHeight }) {
  const out = [];
  if (visible < THRESHOLDS.minRowsFail) {
    out.push({
      rule: 'rows-visible',
      severity: 'fail',
      detail: `only ${visible} row(s) fully visible (${stack} px of ${windowHeight} px pinned)`,
    });
  } else if (visible < THRESHOLDS.minRowsWarn) {
    out.push({ rule: 'rows-visible', severity: 'warn', detail: `${visible} rows visible (${stack} px of ${windowHeight} px pinned)` });
  }
  const percent = Math.round((100 * stack) / windowHeight);
  if (percent > THRESHOLDS.maxPinnedPercent) {
    out.push({ rule: 'pinned-share', severity: 'warn', detail: `${percent}% of the window pinned (${stack} of ${windowHeight} px)` });
  }
  return out;
}

/* The verdict on an open menu or popover: its box ({top, bottom, left, right}), the window, the bottom edge of what is pinned
   at the top (`stack`, 0 for none) and `coveredPoints` (corners of the menu where another box is on top: it is cut off).
   Returns [{rule, detail}]. */
export function judgeMenu({ top, bottom, left, right, windowWidth, windowHeight, stack = 0, coveredPoints = 0 }) {
  const out = [];
  if (bottom > windowHeight + 1) {
    out.push({ rule: 'menu-inside-window', detail: `ends ${Math.round(bottom - windowHeight)} px below the window` });
  }
  if (left < -1 || right > windowWidth + 1) {
    out.push({
      rule: 'menu-inside-window',
      detail: `sticks out at the side (${Math.round(left)} to ${Math.round(right)} of ${windowWidth} px)`,
    });
  }
  if (stack && top < stack - 1) {
    out.push({ rule: 'menu-below-pinned-header', detail: `starts ${Math.round(stack - top)} px under the pinned header` });
  }
  if (coveredPoints > 0) {
    out.push({ rule: 'menu-not-clipped', detail: `${coveredPoints} corner(s) covered by another box` });
  }
  return out;
}

/* The verdict on a dialog's box and whether it scrolls inside itself. Returns [{rule, detail}]. */
export function judgeDialog({ top, bottom, height, windowHeight, scrolls }) {
  if ((top < 0 || bottom > windowHeight + 1) && !scrolls) {
    return [{ rule: 'dialog-fits', detail: `${Math.round(height)} px dialog in a ${windowHeight} px window, not scrolling` }];
  }
  return [];
}
