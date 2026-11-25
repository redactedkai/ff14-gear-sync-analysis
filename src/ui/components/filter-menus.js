/* Where a floating note opens inside the Auto-fill settings popover (placeMenu: reads `document` and `window`). The Expansion and Gear
   categories menus used to open here too; they are Zag popovers now (ui/elements/gear-browser/). Spread into a component's data.
   TODO: the Spare points note is the last user of placeMenu; it goes, with this file, when R29 moves that note to a Zag popover. */
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

/* Members for the "Spare points" note: where it opens. Spread into the set page's components (menuFloat). */
export const menuFloat = {
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
    if (!menu || !anchor) {
      return;
    }
    const windowWidth = document.documentElement.clientWidth;
    const popover = menu.closest('.setpop');
    if (!popover) {
      menu.classList.remove('to-left');
      // the page's content column (.wrap: the body without its padding, 1,280 px at most), not the body, which is as wide as the window
      const contentRight = menu.closest('.wrap').getBoundingClientRect().right;
      if (menu.getBoundingClientRect().right > Math.min(windowWidth - MENU_EDGE_PX, contentRight)) {
        menu.classList.add('to-left');
      }
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
    if (rightEdgeOnButton) {
      box.left = `${Math.max(MENU_EDGE_PX, button.right - width)}px`;
    }
  },
};
