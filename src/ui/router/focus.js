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

/* Focus the open screen's heading and scroll the page to `scrollY` once the screen is drawn: after the tab being opened
   (`isPending()`: a tab is opening, which waits for a painted frame) and the frame that draws the screen. `doc`: the document,
   `raf`: requestAnimationFrame, `scrollTo(y)`: scrolls the page, `scrolledTo()`: where it is scrolled. The heading is made focusable (tabindex -1) and is left out of
   the Tab order; nothing is focused when the screen has no heading, and the scroll happens either way. */
export function focusScreenHeading({
  scrollY = 0,
  isPending = () => false,
  doc = document,
  raf = requestAnimationFrame,
  scrollTo = y => window.scrollTo(0, y),
  scrolledTo = () => window.scrollY,
} = {}) {
  const MAX_FRAMES_WAITED = 120;
  let frames = 0;
  const attempt = () => {
    if (isPending() && frames++ < MAX_FRAMES_WAITED) return raf(attempt);
    return raf(() => {
      const heading = screenHeading(doc);
      if (heading) {
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
    if (Math.abs(scrolledTo() - y) <= 1) {
      stableFrames += 1;
    } else {
      stableFrames = 0;
      scrollTo(y);
    }
    if (stableFrames >= STABLE_FRAMES || scrollFrames++ >= MAX_SCROLL_FRAMES) return;
    raf(() => scrollToWhenTall(y));
  };
  raf(attempt);
}
