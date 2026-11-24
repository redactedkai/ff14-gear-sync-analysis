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

/* The latest call's number: a call that is no longer the latest (a newer Back or Forward started) stops scrolling and leaves the
   page's height alone, so two moves never pull the page in turn. */
let latestCall = 0;

/* Focus the open screen's heading and scroll the page to `scrollY` once the screen is drawn: after the tab being opened
   (`isPending()`: a tab is opening, which waits for a painted frame) and the frame that draws the screen. `doc`: the document,
   `raf`: requestAnimationFrame, `scrollTo(y)`: scrolls the page, `scrolledTo()`: where it is scrolled. The heading is made
   focusable (tabindex -1) and is left out of the Tab order; nothing is focused when the screen has no heading, and the scroll
   happens either way. `focus: false` only scrolls (a reload puts the page back where it was without moving the focus).

   A move to a screen left scrolled deep (`scrollY` above 0, no tab opening) scrolls in the call itself, before the screen is
   swapped in and before the next paint, so the screen is drawn at that position from its first frame, not at the top for a
   frame until the scroll below catches up. The page is held tall enough for that: `holdHeight(y)` sets a minimum height of `y`
   plus a window on the root element, and `releaseHeight()` clears it once the position has held, so a screen that turns out
   shorter than the position then shows its own end. */
export function focusScreenHeading({
  scrollY = 0,
  focus = true,
  isPending = () => false,
  doc = document,
  raf = requestAnimationFrame,
  scrollTo = y => window.scrollTo(0, y),
  scrolledTo = () => window.scrollY,
  holdHeight = y => {
    doc.documentElement.style.minHeight = `${y + doc.defaultView.innerHeight}px`;
  },
  releaseHeight = () => {
    doc.documentElement.style.minHeight = '';
  },
} = {}) {
  const MAX_FRAMES_WAITED = 120;
  const call = ++latestCall;
  let frames = 0;
  let holding = false;
  const finish = () => {
    if (holding && call === latestCall) releaseHeight();
    holding = false;
  };
  const attempt = () => {
    if (call !== latestCall) return undefined;
    if (isPending() && frames++ < MAX_FRAMES_WAITED) return raf(attempt);
    return raf(() => {
      if (call !== latestCall) return;
      const heading = screenHeading(doc);
      if (heading && focus) {
        heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
      }
      scrollToWhenTall(scrollY);
    });
  };

  /* Scroll to `y`. A screen that is still being drawn is too short to reach it, and the browser clamps the scroll a frame later
     (`scrolledTo()` can still report `y` right after `scrollTo`), so look at the position on the next frames and scroll again
     while it is off, until it has stayed at `y` for STABLE_FRAMES frames (at most MAX_SCROLL_FRAMES frames). */
  let scrollFrames = 0;
  let stableFrames = 0;
  const scrollToWhenTall = y => {
    if (call !== latestCall) return;
    if (Math.abs(scrolledTo() - y) <= 1) {
      stableFrames += 1;
    } else {
      stableFrames = 0;
      scrollTo(y);
    }
    if (stableFrames >= STABLE_FRAMES || scrollFrames++ >= MAX_SCROLL_FRAMES) {
      finish();
      return;
    }
    raf(() => scrollToWhenTall(y));
  };

  // the position is placed now, in the task that swaps the screen, so no frame shows the screen at the top
  if (scrollY > 0 && !isPending()) {
    holdHeight(scrollY);
    holding = true;
    scrollTo(scrollY);
  } else {
    releaseHeight(); // the height an earlier call held, which this call replaces
  }
  raf(attempt);
}
