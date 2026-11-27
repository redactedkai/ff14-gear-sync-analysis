/* The functions that run inside the page (Playwright serialises each one, so none may use anything outside itself: no
   imports, no helpers of this file). They only measure and return plain data; rules.ts judges it. Every box is in the
   window's coordinates, rounded to 0.1 px. The type imports below are erased before the functions are sent to the page. */
import type { Box, Container, MathBar, Probe, ProbeConfig, Scope } from './types.ts';

/* Measures the open view. `config` (plain data from targets.ts):
   - scopes: {name: CSS selector} the areas whose controls, boxes and labels are measured; a scope's first match is its root;
   - controls: the CSS selector of the controls, labels: selectors of the texts that must stay on one line,
     boxes: the selectors of the boxes that share rows (fields, menu buttons), clipped: the selector of elements whose
     text must fit them, names: the selector of item names (their line count), pinned: {header, columns} (the selectors of
     the pinned header and of a column-name cell), rows: {rows, marker} (the gear rows and what marks a row that holds a piece).
   mathBar: true adds the math bar's measures (`mathBar`, judged by math-rules.ts).
   Returns {width, height, hscroll, past, clipped, wrapped, nameLines, pinned, rows, scopes: {name: {rect, height, controls,
   containers, boxes}}, mathBar?}. */
export function measureView(config: ProbeConfig): Probe {
  const round = (value: number): number => Math.round(value * 10) / 10;
  const boxOf = (element: Element): Box => {
    const rect = element.getBoundingClientRect();
    return { l: round(rect.left), t: round(rect.top), r: round(rect.right), b: round(rect.bottom) };
  };
  const classOf = (element: Element): string => {
    const first = typeof element.className === 'string' ? element.className.trim().split(/\s+/)[0] : '';
    return element.tagName.toLowerCase() + (first ? `.${first}` : '');
  };
  const visible = (element: Element): boolean => {
    if (element.checkVisibility && !element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) {
      return false;
    }
    const rect = element.getBoundingClientRect();
    return rect.width >= 2 && rect.height >= 2;
  };
  // whether an element is drawn as a box: it has a background or a border of its own
  const isDrawn = (element: Element): boolean => {
    const style = getComputedStyle(element);
    const painted = style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent';
    const bordered = ['Top', 'Right', 'Bottom', 'Left'].some(
      side =>
        parseFloat(style.getPropertyValue(`border-${side.toLowerCase()}-width`)) > 0 &&
        style.getPropertyValue(`border-${side.toLowerCase()}-style`) !== 'none',
    );
    return painted || bordered;
  };
  // a box around a control: the nearest ancestor that is drawn, clips its content, or is a table cell or dialog
  const isBox = (element: Element): boolean => {
    const style = getComputedStyle(element);
    const clips = style.overflowX !== 'visible' || style.overflowY !== 'visible';
    return isDrawn(element) || clips || ['TD', 'TH', 'DIALOG'].includes(element.tagName);
  };
  const scrollsByItself = (element: Element): boolean => {
    const style = getComputedStyle(element);
    return ['auto', 'scroll'].includes(style.overflowX) || ['auto', 'scroll'].includes(style.overflowY);
  };

  const out: Probe = {
    width: innerWidth,
    height: innerHeight,
    hscroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    past: [],
    clipped: [],
    wrapped: [],
    nameLines: null,
    pinned: null,
    rows: null,
    scopes: {},
  };

  // elements past the window's right edge, unless a box around them that ends inside the window cuts them off
  const limit = document.documentElement.clientWidth + 1;
  for (const element of document.body.querySelectorAll('*')) {
    if (out.past.length >= 4) {
      break;
    }
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || style.position === 'fixed') {
      continue;
    }
    const rect = element.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2 || rect.right <= limit) {
      continue;
    }
    let cut = false;
    for (let up = element.parentElement; up && up !== document.body; up = up.parentElement) {
      if (getComputedStyle(up).overflowX !== 'visible' && up.getBoundingClientRect().right <= limit) {
        cut = true;
      }
    }
    if (!cut) {
      out.past.push(`${element.id ? `#${element.id}` : classOf(element)} +${Math.round(rect.right - limit + 1)}px`);
    }
  }

  // text wider than its box
  for (const element of document.querySelectorAll(config.clipped)) {
    if (!visible(element)) {
      continue;
    }
    const style = getComputedStyle(element);
    if (style.textOverflow === 'ellipsis' || scrollsByItself(element)) {
      continue;
    }
    if (element.scrollWidth > element.clientWidth + 1) {
      out.clipped.push(`${element.id ? `#${element.id}` : classOf(element)} ${element.scrollWidth}>${element.clientWidth}`);
    }
  }

  // labels on one line: the lines their text takes (the distinct tops of its text rectangles)
  const linesOf = (element: Element): number => {
    const tops: number[] = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!(node.textContent ?? '').trim()) {
        continue;
      }
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const rect of range.getClientRects()) {
        if (rect.width > 0 && !tops.some(top => Math.abs(top - rect.top) < 4)) {
          tops.push(rect.top);
        }
      }
    }
    return tops.length;
  };
  for (const selector of config.labels) {
    for (const element of document.querySelectorAll(selector)) {
      if (!visible(element)) {
        continue;
      }
      const lines = linesOf(element);
      if (lines > 1) {
        out.wrapped.push({
          id: `${element.id ? `#${element.id}` : classOf(element)} "${(element.textContent || '').trim().slice(0, 24)}"`,
          lines,
        });
      }
    }
  }

  // lines of each item name
  if (config.names) {
    const counts = [...document.querySelectorAll(config.names)].filter(visible).map(element => {
      const lineHeight = parseFloat(getComputedStyle(element).lineHeight) || 20;
      return Math.round(element.getBoundingClientRect().height / lineHeight);
    });
    out.nameLines = { over: counts.filter(lines => lines > 2).length, max: Math.max(0, ...counts) };
  }

  // the pinned header, and the gear rows fully in view under it
  if (config.pinned) {
    const header = document.querySelector(config.pinned.header);
    const column = config.pinned.columns ? document.querySelector(config.pinned.columns) : null;
    const headerBottom = header ? header.getBoundingClientRect().bottom : 0;
    const stuck = column && getComputedStyle(column).position === 'sticky';
    out.pinned = {
      head: header ? Math.round(header.getBoundingClientRect().height) : 0,
      stack: Math.round(column && stuck ? Math.max(headerBottom, column.getBoundingClientRect().bottom) : headerBottom),
    };
  }
  if (config.rows) {
    const rows = [...document.querySelectorAll(config.rows.rows)].filter(row => row.querySelector(config.rows?.marker ?? ''));
    const stack = out.pinned ? out.pinned.stack : 0;
    out.rows = {
      total: rows.length,
      visible: rows.filter(row => row.getBoundingClientRect().top >= stack - 1 && row.getBoundingClientRect().bottom <= innerHeight).length,
    };
  }

  // each scope: its controls (with their container and the control around them), its boxes
  for (const [name, selector] of Object.entries(config.scopes)) {
    const root = document.querySelector(selector);
    if (!root || !visible(root)) {
      continue;
    }
    const scope: Scope = { rect: boxOf(root), height: round(root.getBoundingClientRect().height), controls: [], containers: [], boxes: [] };
    const elements = [...root.querySelectorAll(config.controls)].filter(visible);
    const containerIndex = new Map<Element, number>();
    const seen = new Map<string, number>();
    const idOf = (element: Element): string => {
      const base = element.id ? `#${element.id}` : classOf(element);
      const count = (seen.get(base) ?? 0) + 1;
      seen.set(base, count);
      return element.id ? base : `${base}:${count}`;
    };
    const ids = new Map(elements.map(element => [element, idOf(element)]));
    for (const element of elements) {
      // the container: the nearest box around it, outside the control itself
      let container = element.parentElement;
      while (container && container !== document.body && !isBox(container)) {
        container = container.parentElement;
      }
      let c = -1;
      if (container && container !== document.body) {
        if (!containerIndex.has(container)) {
          containerIndex.set(container, scope.containers.length);
          const rect = container.getBoundingClientRect();
          const style = getComputedStyle(container);
          // a container's inside is its padding box, less the border
          scope.containers.push({
            id: container.id ? `#${container.id}` : classOf(container),
            l: round(rect.left + parseFloat(style.borderLeftWidth)),
            t: round(rect.top + parseFloat(style.borderTopWidth)),
            r: round(rect.right - parseFloat(style.borderRightWidth)),
            b: round(rect.bottom - parseFloat(style.borderBottomWidth)),
            scrolls: scrollsByItself(container) || container.tagName === 'TD' || container.tagName === 'TH',
          } satisfies Container);
        }
        c = containerIndex.get(container) ?? -1;
      }
      let up = -1;
      for (let around = element.parentElement; around && around !== root.parentElement; around = around.parentElement) {
        if (ids.has(around)) {
          up = elements.indexOf(around);
          break;
        }
      }
      scope.controls.push({
        id: ids.get(element) ?? '',
        ...boxOf(element),
        c,
        up,
        overlay: ['absolute', 'fixed'].includes(getComputedStyle(element).position),
      });
    }
    const boxSeen = new Map<string, number>();
    for (const boxSelector of config.boxes) {
      for (const element of root.querySelectorAll(boxSelector)) {
        if (!visible(element) || !isDrawn(element)) {
          continue; // a box has a border or a background of its own
        }
        const base = element.id ? `#${element.id}` : classOf(element);
        const count = (boxSeen.get(base) ?? 0) + 1;
        boxSeen.set(base, count);
        scope.boxes.push({ id: element.id ? base : `${base}:${count}`, ...boxOf(element) });
      }
    }
    out.scopes[name] = scope;
  }

  // the math bar's own measures (dividers, the tops of its parts, the heights of its boxes), for a view that has one
  if (config.mathBar) {
    const row = document.querySelector('.barrow');
    const q = (selector: string): HTMLElement | null => document.querySelector<HTMLElement>(selector);
    const shown = (element: HTMLElement | null): element is HTMLElement => Boolean(element && element.offsetWidth > 0);
    if (row) {
      const rowBox = row.getBoundingClientRect();
      const rowStyle = getComputedStyle(row);
      const clipMargin = parseFloat(rowStyle.overflowClipMargin) || 0;
      const clear = (color: string): boolean => color === 'rgba(0, 0, 0, 0)' || color === 'transparent';
      const sections = [...row.querySelectorAll<HTMLElement>(':scope > .divided, :scope > .jobctl, :scope > * > .divided')]
        .filter(shown)
        .map((section): MathBar['sections'][number] => {
          const box = section.getBoundingClientRect();
          const rule = getComputedStyle(section, '::before');
          const hasRule = rule.content !== 'none';
          const ruleLeft = hasRule ? box.left + parseFloat(rule.left) : 0;
          const ruleWidth = hasRule ? parseFloat(rule.width) : 0;
          return {
            id: section.id || (typeof section.className === 'string' ? section.className.trim().split(/\s+/)[0] : ''),
            kind: section.classList.contains('divided') ? 'divided' : 'job',
            wideGap: section.classList.contains('afterjob') || section.classList.contains('ilgroup'),
            left: box.left,
            top: box.top,
            height: box.height,
            startsLine: box.left <= rowBox.left + 1,
            hasRule,
            ruleLeft,
            ruleHeight: hasRule ? parseFloat(rule.height) : 0,
            ruleClear: hasRule ? clear(rule.backgroundColor) : false,
            ruleShown: hasRule && ruleLeft + ruleWidth > rowBox.left - clipMargin + 0.01 && ruleLeft < rowBox.right,
          };
        });
      const topOf = (selector: string): number | null => {
        const element = q(selector);
        return shown(element) ? element.getBoundingClientRect().top : null;
      };
      const jobBox = q('#m-job-btn');
      const range = q('#p-range');
      out.mathBar = {
        rem: parseFloat(getComputedStyle(document.documentElement).fontSize),
        rowWidth: row.clientWidth,
        columnGap: parseFloat(rowStyle.columnGap) || 0,
        extraGap: parseFloat(rowStyle.getPropertyValue('--job-gap-extra')) || 0,
        overflowX: rowStyle.overflowX,
        sections,
        tops: {
          job: topOf('#m-job-wrap'),
          piecesec: topOf('.piecesec'),
          piece: topOf('#p-piece-wrap'),
          sync: topOf('#p-sync-wrap'),
          il: topOf('#p-ilgroup'),
        },
        jobBoxHeight: shown(jobBox) ? jobBox.getBoundingClientRect().height : 0,
        boxHeights: ['#p-slot', '#p-piece-chip', '#p-sync-chip', '#p-ilvl', '#t-level', '#g-level', '#g-haste', '#g-speed'].flatMap(
          selector => {
            const element = q(selector);
            return shown(element) ? [{ id: selector, h: element.getBoundingClientRect().height }] : [];
          },
        ),
        track: shown(q('#p-ilgroup')) && range ? range.getBoundingClientRect().width : null,
      };
    }
  }
  return out;
}

/* The first visible element matching `selector` as a menu or popover: its box, the window, and how many of its four
   corners (4 px inside) have another box on top of them (it is cut off by a box around it). Corners outside the window are
   not counted: the menu-inside-window rule has them. Returns null when none is visible. */
export function measureMenu(selector: string): {
  top: number;
  bottom: number;
  left: number;
  right: number;
  height: number;
  windowWidth: number;
  windowHeight: number;
  coveredPoints: number;
  scrolls: boolean;
} | null {
  const element = [...document.querySelectorAll(selector)].find(
    item => item.getBoundingClientRect().height > 0 && getComputedStyle(item).visibility !== 'hidden',
  );
  if (!element) {
    return null;
  }
  const rect = element.getBoundingClientRect();
  let coveredPoints = 0;
  for (const [x, y] of [
    [rect.left + 4, rect.top + 4],
    [rect.right - 4, rect.top + 4],
    [rect.left + 4, rect.bottom - 4],
    [rect.right - 4, rect.bottom - 4],
  ]) {
    if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) {
      continue;
    }
    const hit = document.elementFromPoint(x, y);
    if (hit && !element.contains(hit) && !hit.contains(element)) {
      coveredPoints++;
    }
  }
  const style = getComputedStyle(element);
  return {
    top: Math.round(rect.top),
    bottom: Math.round(rect.bottom),
    left: Math.round(rect.left),
    right: Math.round(rect.right),
    height: Math.round(rect.height),
    windowWidth: document.documentElement.clientWidth,
    windowHeight: innerHeight,
    coveredPoints,
    scrolls: ['auto', 'scroll'].includes(style.overflowY) && element.scrollHeight > element.clientHeight + 1,
  };
}

/* The element with the focus: whether its focus ring (the outline, with its offset) is cut off by a box around it that
   clips, or by the window's side edges. Returns null when nothing but the body has the focus. */
export function measureFocusRing(): { id: string; outline: boolean; clippedBy: string } | null {
  const element = document.activeElement;
  if (!element || element === document.body) {
    return null;
  }
  const style = getComputedStyle(element);
  const grow = style.outlineStyle === 'none' ? 0 : parseFloat(style.outlineWidth) + Math.max(0, parseFloat(style.outlineOffset));
  const rect = element.getBoundingClientRect();
  const ring = { l: rect.left - grow, t: rect.top - grow, r: rect.right + grow, b: rect.bottom + grow };
  let clippedBy = '';
  for (let up = element.parentElement; up && up !== document.documentElement; up = up.parentElement) {
    const around = getComputedStyle(up);
    if (around.overflowX === 'visible' && around.overflowY === 'visible') {
      continue;
    }
    const box = up.getBoundingClientRect();
    const sidesCut = around.overflowX !== 'visible' && (ring.l < box.left - 0.5 || ring.r > box.right + 0.5);
    const topBottomCut = around.overflowY !== 'visible' && (ring.t < box.top - 0.5 || ring.b > box.bottom + 0.5);
    // a box that scrolls shows the part in view: only the sides of a box that does not scroll count for the vertical edge
    if (sidesCut || (topBottomCut && !['auto', 'scroll'].includes(around.overflowY))) {
      clippedBy = up.id
        ? `#${up.id}`
        : up.tagName.toLowerCase() +
          (typeof up.className === 'string' && up.className.trim() ? `.${up.className.trim().split(/\s+/)[0]}` : '');
      break;
    }
  }
  if (!clippedBy && (ring.l < -0.5 || ring.r > document.documentElement.clientWidth + 0.5)) {
    clippedBy = 'the window edge';
  }
  return {
    id: element.id
      ? `#${element.id}`
      : element.tagName.toLowerCase() +
        (typeof element.className === 'string' && element.className.trim() ? `.${element.className.trim().split(/\s+/)[0]}` : ''),
    outline: style.outlineStyle !== 'none',
    clippedBy,
  };
}

/* The size of the open dialog: its box, the window, and whether it scrolls inside itself. null when none is open. */
export function measureDialog(
  selector: string,
): { top: number; bottom: number; height: number; windowHeight: number; scrolls: boolean } | null {
  const element = document.querySelector(selector);
  if (!element) {
    return null;
  }
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  return {
    top: Math.round(rect.top),
    bottom: Math.round(rect.bottom),
    height: Math.round(rect.height),
    windowHeight: innerHeight,
    scrolls: ['auto', 'scroll'].includes(style.overflowY) && element.scrollHeight > element.clientHeight + 1,
  };
}
