/* The Expansion and "Gear categories" filter menus' members for the components (the Gear browser and a set's Auto-fill settings),
   and where a floating menu opens (placeMenu: reads `document` and `window`). Spread into a component's data. */
import { ACTIVITIES, EXPANSIONS } from '../../core/constants.js';
import { CURRENT_TOMES, MAX_LEVEL } from '../../core/tables.js';
import { DEFAULT_EXCLUDE } from '../job-sync-panel.js';
import { fmtInt } from '../text.js';

/* The "Gear categories" menu's tabs, in order: each {title, order?}. `title` is the `section` of its boxes in item-format.json;
   `order` (optional) lists the box keys in the order the tab reads row by row, two to a row, instead of ACTIVITIES order (which
   is fixed by the data's route bits): Hard content pairs each fight's Current and Legacy boxes. */
const FROM_SECTIONS = [
  { title: 'Everyday' },
  { title: 'Side content' },
  { title: 'Hard content', order: ['extreme_current', 'extreme_legacy', 'savage_current', 'savage_legacy', 'ultimate'] },
];
/* How many columns a tab's boxes are laid out in (the menu has one width at every window size). */
const FROM_COLUMN_COUNT = 2;
/* The patch series of the level cap ("7.x" at level 100): A Realm Reborn is 2.x, each expansion one more. */
const CAP_PATCH = `${EXPANSIONS.findIndex(e => e.levelCap === MAX_LEVEL) + 2}.x`;

/* What a "Gear categories" box covers, shown under its name: its hint with the current tomestones and the level cap's
   patch series filled in. */
export function gearFromHint(activity) {
  return activity.hint.replace('{currentTomes}', CURRENT_TOMES.join(' or ')).replace('{capPatch}', CAP_PATCH);
}

/* The tabs of the "Gear categories" menu, frozen, in order (FROM_SECTIONS). Each {key, title, byRow, rows, boxes: [{key, label, hint}]}:
   `key` is the title in lower case with dashes (it names the tab's element ids); `boxes` are the section's ACTIVITIES entries
   (in the tab's `order` when it has one) with their hints filled in (gearFromHint); `byRow`: the boxes read across, two to a row,
   rather than down each column; `rows`: how many rows the boxes take when they read down FROM_COLUMN_COUNT columns. */
export const GEAR_FROM_SECTIONS = Object.freeze(
  FROM_SECTIONS.map(({ title, order }) => {
    const inSection = ACTIVITIES.filter(a => a.section === title);
    const ordered = order ? order.map(key => inSection.find(a => a.key === key)) : inSection;
    const boxes = ordered.map(a => Object.freeze({ key: a.key, label: a.label, hint: gearFromHint(a) }));
    return Object.freeze({
      key: title.toLowerCase().replace(/\s+/g, '-'),
      title,
      byRow: !!order,
      rows: Math.ceil(boxes.length / FROM_COLUMN_COUNT),
      boxes: Object.freeze(boxes),
    });
  }),
);

/* Which tab a key press on a tab selects (the WAI-ARIA tabs pattern): ArrowRight the next one and ArrowLeft the previous
   one (both wrap round), Home the first and End the last. Returns the new index, or -1 for any other key.
   `key`: the key event's `key`; `index`: the current tab's index; `count`: how many tabs there are. */
export function fromTabAfterKey(key, index, count) {
  if (key === 'ArrowRight') return (index + 1) % count;
  if (key === 'ArrowLeft') return (index + count - 1) % count;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return -1;
}

/* The "Gear categories" button's text: "All", "None", "All but N" (up to 5 left out) or "N of M". The market board switch is not
   in the text: the button always shows the market glyph, gold when it is on and red with a slash when it is off (fromMarketOff,
   fromMarketWords). off: the ACTIVITIES keys left out. */
export function gearFromSummary(off) {
  const on = ACTIVITIES.length - off.length;
  return !off.length ? 'All' : !on ? 'None' : off.length <= 5 ? `All but ${off.length}` : `${on} of ${ACTIVITIES.length}`;
}

/* The number at the end of a "Gear categories" box's name: `count` pieces with thousands separators ("1,380"), or '' before a
   count has landed (null): no number rather than a 0 that is not known. */
export function gearFromCountText(count) {
  return count == null ? '' : fmtInt(count);
}

/* The sentence a screen reader gets for a box's number (the number itself is hidden from it): "1,380 pieces in this category
   under the current filters.", "1 piece in ...", or "No pieces in this category for this job and filters." for 0; '' before a
   count has landed (null). `count`: the pieces in the box. */
export function gearFromCountWords(count) {
  if (count == null) return '';
  if (count === 0) return 'No pieces in this category for this job and filters.';
  return `${fmtInt(count)} ${count === 1 ? 'piece' : 'pieces'} in this category under the current filters.`;
}

/* Where a filter's settings live, for gearFromToggles and expansionToggles: `part` a field of $store.app ('browse'),
   changed in place; or an accessor {read(component) → the settings, write(component, patch)} for settings kept
   elsewhere (a gear set's Auto-fill settings, changed through the sheet store). Returns the accessor. */
function filterAccess(part) {
  if (typeof part !== 'string') return part;
  return { read: self => self.$store.app[part], write: (self, patch) => Object.assign(self.$store.app[part], patch) };
}

/* Room kept between a floating menu and the window's edges, the least height a menu is cut to when it has no room on
   either side, and the gap between a menu and its button, in px. */
const MENU_EDGE_PX = 8;
const MENU_BOTTOM_PX = 12;
const MENU_MIN_HEIGHT_PX = 160;
const MENU_GAP_PX = 4;

/* The height `box` (a shown element with its own scroll) has when no max-height cuts it, in px, measured by lifting its
   max-height; the caller sets the new max-height after. Setting a max-height makes the browser clamp the box's scrollTop, so
   it is put back after the caller is done: `place` runs with the measured height and returns nothing. Without this a box
   that scrolls (a menu or popover in a short window) jumps back to the top on every placement, and the wheel does nothing. */
export function placeKeepingScroll(box, place) {
  const scrollTop = box.scrollTop;
  box.style.maxHeight = 'none'; // to measure the height the box has when nothing cuts it
  place(box.getBoundingClientRect().height);
  box.scrollTop = scrollTop;
}

/* Where a floating box of `naturalHeight` px opens vertically, in px of the window: under its button when it fits there,
   else over it when there is more room above (the box is only as tall as it needs, or as the room above allows), else under
   it cut to the room left (at least MENU_MIN_HEIGHT_PX). Returns {top, maxHeight, flipped}.
   `button`: {top, bottom} of the anchor; `windowHeight`: the window's inner height; `gap`: space between button and box. */
export function placeBelowOrAbove(button, naturalHeight, windowHeight, gap = MENU_GAP_PX) {
  const topBelow = button.bottom + gap;
  const roomBelow = windowHeight - topBelow - MENU_BOTTOM_PX;
  const roomAbove = button.top - gap - MENU_EDGE_PX;
  if (naturalHeight <= roomBelow || roomBelow >= roomAbove) {
    // under the button (the floor only applies here: a box that flips is as tall as the room above)
    return { top: topBelow, maxHeight: Math.max(MENU_MIN_HEIGHT_PX, roomBelow), flipped: false };
  }
  const height = Math.min(naturalHeight, roomAbove);
  return { top: button.top - gap - height, maxHeight: height, flipped: true };
}

/* Members shared by the dropdown menus and notes (Expansion, Gear categories, the "Spare points" note): where they open. Spread into the components that use the partials (gearFromToggles and expansionToggles do). */
const menuFloat = {
  /* Whether a scroll event comes from inside one of the floating boxes (a menu or popover scrolling by itself, not the page):
     the window's capture listener also gets those, and a box's own scrolling must not place anything again. */
  isOwnScroll(event, ...boxes) {
    return boxes.some(box => box?.contains(event.target));
  },
  /* Put `menu` (shown) under `anchor`, the button that opened it. On a page it is absolutely placed by its CSS and opens
     leftwards (right edge on the button's) when it would pass the right edge of the page's content (the body without its
     padding, 1,280 px at most, so on a wide window the menu stays over the page's card: `.wrap`) or the window's, so the page
     does not scroll sideways.
     In the Auto-fill settings popover (.setpop) it is fixed to the window, so the popover's own scroll box does not cut it: it
     opens under the button, or over it when it does not fit below and there is more room above (placeBelowOrAbove), its
     width is cut to the window's, and it opens leftwards when it would pass the popover's or the window's right edge;
     a note (.popover) always opens leftwards. `coverTop`: an optional element (the Gear categories control, whose label sits over
     the button) the menu must not cover when it opens upward: it then ends 4 px over that element's top instead of the
     button's. */
  placeMenu(menu, anchor, coverTop) {
    if (!menu || !anchor) return;
    const windowWidth = document.documentElement.clientWidth;
    const popover = menu.closest('.setpop');
    if (!popover) {
      menu.classList.remove('to-left');
      // the page's content column (.wrap: the body without its padding, 1,280 px at most), not the body, which is as wide as the window
      const contentRight = menu.closest('.wrap').getBoundingClientRect().right;
      if (menu.getBoundingClientRect().right > Math.min(windowWidth - MENU_EDGE_PX, contentRight)) menu.classList.add('to-left');
      return;
    }
    menu.classList.remove('to-left');
    const button = anchor.getBoundingClientRect();
    const box = menu.style;
    box.right = 'auto';
    box.bottom = 'auto';
    box.minWidth = `${button.width}px`;
    box.maxWidth = `${windowWidth - 2 * MENU_EDGE_PX}px`;
    box.left = `${button.left}px`;
    const keepClear = { top: coverTop ? coverTop.getBoundingClientRect().top : button.top, bottom: button.bottom };
    let width = 0;
    placeKeepingScroll(menu, naturalHeight => {
      width = menu.getBoundingClientRect().width;
      const place = placeBelowOrAbove(keepClear, naturalHeight, window.innerHeight);
      box.top = `${place.top}px`;
      box.maxHeight = `${place.maxHeight}px`;
    });
    // a note (.popover, the "Spare points" one) has its right edge on the button's, as in B17, so it stays inside the popover;
    // a menu opens rightwards, and leftwards only when it would pass the popover's right edge or the window's
    const rightLimit = Math.min(windowWidth - MENU_EDGE_PX, popover.getBoundingClientRect().right);
    const rightEdgeOnButton = menu.classList.contains('popover') || button.left + width > rightLimit;
    if (rightEdgeOnButton) box.left = `${Math.max(MENU_EDGE_PX, button.right - width)}px`;
  },
};

/* Component members for one "Gear categories" filter (`part`: filterAccess): its `exclude` (ACTIVITIES keys left out, in
   ACTIVITIES order) and `market` (the market board switch). The component provides `fromCounts`, {box key: pieces}
   under the current job and filters (null until the numbers are known). The control's own scope ({open, tab}: the menu and the selected
   tab's key) lives in the partial. Methods, not getters (see expansionToggles). */
export function gearFromToggles(part) {
  const access = filterAccess(part);
  return {
    ...menuFloat,
    fromTabs: GEAR_FROM_SECTIONS,
    fromSummary() {
      const f = access.read(this);
      return gearFromSummary(f.exclude);
    },
    /* true when market board gear is left out: the button's glyph is red and slashed (on: gold, no slash) */
    fromMarketOff() {
      return !access.read(this).market;
    },
    /* the glyph's words (its accessible name and the button's title) for the market board switch's state */
    fromMarketWords() {
      return this.fromMarketOff() ? 'Market board gear not included' : 'Market board gear included';
    },
    fromOn(key) {
      return !access.read(this).exclude.includes(key);
    },
    setFromOn(key, on) {
      const off = access.read(this).exclude;
      access.write(this, { exclude: ACTIVITIES.map(a => a.key).filter(k => (k === key ? !on : off.includes(k))) });
    },
    /* the market board switch */
    marketOn() {
      return !!access.read(this).market;
    },
    setMarket(on) {
      access.write(this, { market: !!on });
    },
    /* "All", "None" or "Default" at the top of the menu */
    setFromAll(which) {
      access.write(this, { exclude: which === 'all' ? [] : which === 'none' ? ACTIVITIES.map(a => a.key) : [...DEFAULT_EXCLUDE] });
    },
    /* How many pieces a box holds under the current job and filters (the component's `fromCounts`), or null while the numbers are not
       known (before the first count has landed, or after the filters changed and before the new count). `key`: a box's key. */
    fromCount(key) {
      return this.fromCounts?.[key] ?? null;
    },
    /* the box's number as the menu prints it ("1,380"; '' while it is not known) */
    fromCountText(key) {
      return gearFromCountText(this.fromCount(key));
    },
    /* the sentence for the box's number: its hidden description and the row's title ('' while the number is not known) */
    fromCountWords(key) {
      return gearFromCountWords(this.fromCount(key));
    },
    /* true when the box holds no piece (a known 0: its number is gold and bold) */
    fromZero(key) {
      return this.fromCount(key) === 0;
    },
    /* How many of a tab's boxes are ticked, as the tab shows it: "7/8". `tab`: an entry of GEAR_FROM_SECTIONS. */
    fromTabCount(tab) {
      return `${tab.boxes.filter(box => this.fromOn(box.key)).length}/${tab.boxes.length}`;
    },
    /* A key press in the tab row: the arrows, Home and End (fromTabAfterKey) select a tab and move the focus onto it; other
       keys are left alone. `state`: {tab}, `event`: the key event, `tablist`: the row's element. */
    fromTabKey(state, event, tablist) {
      const current = GEAR_FROM_SECTIONS.findIndex(tab => tab.key === state.tab);
      const next = fromTabAfterKey(event.key, current, GEAR_FROM_SECTIONS.length);
      if (next < 0) return;
      event.preventDefault();
      state.tab = GEAR_FROM_SECTIONS[next].key;
      tablist.querySelectorAll('[role="tab"]')[next]?.focus();
    },
  };
}

/* Component members for one Expansion filter (`part`: filterAccess): its `expOff` (EXPANSIONS short names switched off,
   oldest first): the list, the dropdown button's text ("All expansions", one name, or how many are on) and the toggles.
   Methods, not getters: the components spread this object, which would run a getter before Alpine binds it. */
export function expansionToggles(part) {
  const access = filterAccess(part);
  return {
    ...menuFloat,
    expansions: EXPANSIONS,
    expSummary() {
      const on = EXPANSIONS.filter(e => this.expShown(e.short));
      if (on.length === EXPANSIONS.length) return 'All expansions';
      if (!on.length) return 'None';
      return on.length === 1 ? on[0].name : `${on.length} expansions`;
    },
    expShown(short) {
      return !access.read(this).expOff.includes(short);
    },
    setExpShown(short, on) {
      const off = access.read(this).expOff.filter(k => k !== short);
      access.write(this, { expOff: on ? off : EXPANSIONS.map(e => e.short).filter(k => k === short || off.includes(k)) });
    },
  };
}
