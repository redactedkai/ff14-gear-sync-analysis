/* Moving the keyboard focus to the screen a Back or Forward opened, so a screen reader reads where the page landed, and the
   scroll to where the player left that screen. A click already puts the focus where the player acted; only a move through
   history (the router's focusScreen) needs this. */

/* The first heading of the open screen that is on the page (the first visible h2 in the open tab's panel), or null. */
function screenHeading(doc) {
  const panel = [...doc.querySelectorAll('.tab')].find(tab => tab.getClientRects().length > 0);
  if (!panel) return null;
  return [...panel.querySelectorAll('h2')].find(heading => heading.getClientRects().length > 0) ?? null;
}

/* How many frames the scroll is tried for (about half a second), and how many frames in a row the page must stay at the
   position before the scroll is let go (the browser moves a scroll it cannot reach only when it next draws the page). */
const MAX_SCROLL_FRAMES = 30;
const STABLE_FRAMES = 3;

/* The most a page is held tall for a position the screen has not drawn yet: this many window heights, or the page's own scroll
   range when that is larger. A saved position far beyond it (a damaged or stale one) scrolls as far as the hold reaches and is
   tried again as the screen grows, so the page never turns millions of pixels tall. */
const MAX_HELD_WINDOWS = 4;

/* The latest call's number: a call that is no longer the latest (a newer Back or Forward started) stops scrolling and leaves the
   page's height alone, so two moves never pull the page in turn. */
let latestCall = 0;

/* Whether the latest call is still placing its position. */
let placing = false;

/* Whether the page is still being put at the position of a Back, Forward or reload (the latest call has not finished). The
   scroll events of that time are the placement's own and the browser's clamp to a screen not yet drawn, not the player's, so the
   router does not remember them as where an entry was left. */
export function isPlacingScroll() {
  return placing;
}

/* Focus the open screen's heading and put the page at `scrollY` (also 0) from the first frame of the screen. `doc`: the document,
   `raf`: requestAnimationFrame, `scrollTo(y)`: scrolls the page, `scrolledTo()`: where it is scrolled. The heading is made
   focusable (tabindex -1) and is left out of the Tab order; nothing is focused when the screen has no heading, and the scroll
   happens either way. `focus: false` only scrolls (a reload puts the page back where it was without moving the focus).

   The position is placed in the call itself, in the task that swaps the screen in and before the next paint, so the screen is
   drawn at that position from its first frame, not where the browser clamps the old position to the new screen. While a tab is
   opening (`isPending()`: it is swapped in a later task, after a painted frame) the page is left as it is and the same placement
   runs in the first frame after the swap, still before it is painted. A position above 0 holds the page tall enough to scroll to it: `holdHeight(y)` sets a
   minimum height of `y` plus a window on the root element (at most MAX_HELD_WINDOWS windows more than the page's own range), and
   `releaseHeight()` clears it (the style attribute with it) once the position has held. While the screen is still being drawn it
   may grow to reach the position; `naturalHeight()` (the screen's own height, not the held one) tells: once the screen stops
   growing short of the position, the hold is let go and the page shows the screen's own end, not blank space.
   `viewportHeight()` is the window's height. */
export function focusScreenHeading({
  scrollY = 0,
  focus = true,
  isPending = () => false,
  doc = document,
  raf = requestAnimationFrame,
  scrollTo = y => window.scrollTo(0, y),
  scrolledTo = () => window.scrollY,
  viewportHeight = () => doc.defaultView.innerHeight,
  naturalHeight = () => doc.body.scrollHeight,
  watchSize = onResize => {
    if (typeof ResizeObserver === 'undefined') return () => {};
    const observer = new ResizeObserver(onResize);
    observer.observe(doc.body);
    return () => observer.disconnect();
  },
  holdHeight = y => {
    const windowHeight = viewportHeight();
    const ownRange = Math.max(0, naturalHeight() - windowHeight);
    const held = Math.min(y, Math.max(ownRange, MAX_HELD_WINDOWS * windowHeight));
    doc.documentElement.style.minHeight = `${held + windowHeight}px`;
  },
  releaseHeight = () => {
    const root = doc.documentElement;
    root.style.minHeight = '';
    if (!root.getAttribute('style')) root.removeAttribute('style');
  },
} = {}) {
  const MAX_FRAMES_WAITED = 120;
  const target = scrollY;
  const call = ++latestCall;
  placing = true;
  let framesWaited = 0;
  let placed = false;
  let holding = false;
  let framesSincePlaced = 0;
  let stableFrames = 0;
  let scrollFrames = 0;
  let lastReach = Number.NEGATIVE_INFINITY;
  let screenReaches = false;
  let stopWatching = () => {};
  const finish = () => {
    stopWatching();
    if (call !== latestCall) return;
    if (holding) releaseHeight();
    holding = false;
    placing = false;
  };

  /* Put the page at the target: hold the height up to it, then scroll. The screen is in the page by now (or about to be, in the
     same task), and the browser has not laid it out yet. */
  const place = () => {
    placed = true;
    if (target > 0) {
      holdHeight(target);
      holding = true;
    } else {
      releaseHeight(); // the height an earlier call held, which this call replaces
    }
    scrollTo(target);
    // the page's own update may still change the screen after this (a part of it hides a moment later) and the browser moves the
    // position with it: whenever the layout changes, the position is put back before the frame is drawn, not on the next one
    stopWatching = watchSize(() => {
      if (call !== latestCall) stopWatching();
      else if (Math.abs(scrolledTo() - target) > 1) scrollTo(target);
    });
  };

  /* While the screen is held tall: note whether the screen reaches the target on its own, and let the hold go when it has stopped
     growing short of it (it is shorter than when the position was left), so the page shows the screen's own end and no blank
     space. */
  const releaseWhenNotGrowing = () => {
    if (!holding || call !== latestCall) return;
    const reach = naturalHeight() - viewportHeight();
    const growing = reach > lastReach;
    lastReach = reach;
    screenReaches = reach >= target - 1;
    if (!screenReaches && !growing) {
      releaseHeight();
      holding = false;
    }
  };

  /* One frame after the screen is placed: the heading takes the focus on the second, and the position is checked on each. The
     browser clamps a scroll a screen too short for it (and moves it only when it next draws), so the position is looked at on the
     next frames and scrolled again while it is off, until it has stayed there for STABLE_FRAMES frames (at most MAX_SCROLL_FRAMES
     frames). */
  const onFrame = () => {
    if (call !== latestCall) {
      stopWatching();
      return;
    }
    if (!placed) {
      if (isPending() && framesWaited++ < MAX_FRAMES_WAITED) {
        raf(onFrame);
        return;
      }
      place();
    }
    framesSincePlaced += 1;
    if (framesSincePlaced === 2) {
      const heading = screenHeading(doc);
      if (heading && focus) {
        heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
      }
    }
    if (Math.abs(scrolledTo() - target) <= 1) {
      stableFrames += 1;
    } else {
      stableFrames = 0;
      scrollTo(target);
    }
    releaseWhenNotGrowing();
    if (stableFrames >= STABLE_FRAMES && (!holding || screenReaches)) {
      finish();
      return;
    }
    if (scrollFrames++ >= MAX_SCROLL_FRAMES) {
      finish();
      return;
    }
    raf(onFrame);
  };

  // the position is placed now, in the task that swaps the screen, so no frame shows the screen at the clamped position
  if (isPending()) {
    releaseHeight(); // the height an earlier call held, which this call replaces
  } else {
    place();
    // the screen as it is once the page's own update has swapped it in (a microtask, before any frame): a screen that has not
    // grown by the first frame is complete, so a hold it does not reach is let go before that frame is drawn
    queueMicrotask(releaseWhenNotGrowing);
  }
  raf(onFrame);
}
