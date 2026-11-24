/* Focus and scroll after Back or Forward (src/ui/router/focus.js) over a stand-in document: the first visible heading of the
   visible tab panel gets the focus, and the page scrolls to the position asked for. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { focusScreenHeading } from '../../../../src/ui/router/focus.js';

const shown = { getClientRects: () => [{}] };
const hidden = { getClientRects: () => [] };

/* A heading that records its focus. */
const heading = visible => ({
  ...(visible ? shown : hidden),
  tabIndex: 0,
  focused: null,
  focus(options) {
    this.focused = options;
  },
});
/* A tab panel holding `headings`. */
const panel = (visible, headings) => ({ ...(visible ? shown : hidden), querySelectorAll: () => headings });
const docOf = panels => ({ querySelectorAll: () => panels, documentElement: { style: {} }, defaultView: { innerHeight: 900 } });
/* Frames that run when the test says so. */
function frames() {
  const queue = [];
  return {
    raf: callback => queue.push(callback),
    run: () => {
      while (queue.length) queue.shift()();
    },
  };
}

test('the first visible heading of the visible panel is focused and the page scrolls to the position', () => {
  const [hiddenHeading, first, second] = [heading(false), heading(true), heading(true)];
  const doc = docOf([panel(false, [heading(true)]), panel(true, [hiddenHeading, first, second])]);
  const clock = frames();
  const scrolled = [];
  focusScreenHeading({ scrollY: 250, doc, raf: clock.raf, scrollTo: y => scrolled.push(y), scrolledTo: () => scrolled.at(-1) });
  clock.run();
  assert.deepEqual(first.focused, { preventScroll: true });
  assert.equal(first.tabIndex, -1);
  assert.equal(second.focused, null);
  assert.equal(hiddenHeading.focused, null);
  assert.deepEqual(scrolled, [250]);
});

test('a screen with no heading still scrolls', () => {
  const clock = frames();
  const scrolled = [];
  focusScreenHeading({
    scrollY: 80,
    doc: docOf([panel(true, [])]),
    raf: clock.raf,
    scrollTo: y => scrolled.push(y),
    scrolledTo: () => scrolled.at(-1),
  });
  clock.run();
  assert.deepEqual(scrolled, [80]);
});

test('it waits for a tab that is still opening, then focuses; a tab that never opens is not waited for forever', () => {
  const h = heading(true);
  let pending = true;
  const queue = [];
  const raf = callback => queue.push(callback);
  const step = () =>
    queue.splice(0).forEach(callback => {
      callback();
    });
  const scrolled = [];
  focusScreenHeading({
    scrollY: 5,
    isPending: () => pending,
    doc: docOf([panel(true, [h])]),
    raf,
    scrollTo: y => scrolled.push(y),
    scrolledTo: () => scrolled.at(-1),
  });
  for (let frame = 0; frame < 10; frame += 1) step();
  assert.equal(h.focused, null, 'nothing while the tab is opening');
  assert.deepEqual(scrolled, []);
  pending = false;
  step();
  step();
  assert.deepEqual(h.focused, { preventScroll: true });
  assert.deepEqual(scrolled, [5]);

  // pending for good: after the frames it waits (the limit), it goes ahead
  const stuck = heading(true);
  const stuckQueue = [];
  focusScreenHeading({
    isPending: () => true,
    doc: docOf([panel(true, [stuck])]),
    raf: callback => stuckQueue.push(callback),
    scrollTo: () => {},
    scrolledTo: () => 0,
  });
  for (let frame = 0; frame < 200 && stuck.focused === null; frame += 1)
    stuckQueue.splice(0).forEach(callback => {
      callback();
    });
  assert.deepEqual(stuck.focused, { preventScroll: true });
});

test('a screen still too short to scroll to the position is tried again on the next frames', () => {
  const queue = [];
  const raf = callback => queue.push(callback);
  const step = () => {
    for (const callback of queue.splice(0)) callback();
  };
  let reachable = 0; // the page is still being drawn: it can scroll only this far
  let at = 0;
  const wanted = [];
  focusScreenHeading({
    scrollY: 600,
    doc: docOf([panel(true, [])]),
    raf,
    scrollTo: y => {
      wanted.push(y);
      at = Math.min(y, reachable);
    },
    scrolledTo: () => at,
  });
  step();
  step(); // the first try: 0 of 600 reached
  reachable = 900;
  step(); // the page is tall enough now
  step();
  assert.equal(at, 600);
  assert.ok(wanted.length >= 2 && wanted.every(y => y === 600));
  const tries = wanted.length;
  step();
  assert.equal(wanted.length, tries, 'it stops once the position is reached');
});

test('a scroll the browser clamps a frame later is scrolled again once the page is tall enough', () => {
  const queue = [];
  let reachable = 300; // how far the page can scroll when it is drawn
  let position = 0;
  let undrawn = false; // a scrollTo the page has not drawn yet: its position is reported as asked, and clamped at the next frame
  const wanted = [];
  focusScreenHeading({
    scrollY: 400,
    doc: docOf([panel(true, [])]),
    raf: callback => queue.push(callback),
    scrollTo: y => {
      wanted.push(y);
      position = y;
      undrawn = true;
    },
    scrolledTo: () => position,
  });
  const frame = () => {
    if (undrawn) position = Math.min(position, reachable);
    undrawn = false;
    for (const callback of queue.splice(0)) callback();
  };
  for (let count = 0; count < 4; count += 1) frame(); // asked for 400 and reported as 400 at once, but drawn at 300
  reachable = 900;
  for (let count = 0; count < 8; count += 1) frame();
  assert.equal(position, 400);
  assert.ok(wanted.length >= 2, 'it asked again after the page was drawn too short');
});

test('focus: false only scrolls', () => {
  const only = heading(true);
  const clock = frames();
  const scrolled = [];
  focusScreenHeading({
    scrollY: 120,
    focus: false,
    doc: docOf([panel(true, [only])]),
    raf: clock.raf,
    scrollTo: y => scrolled.push(y),
    scrolledTo: () => scrolled.at(-1),
  });
  clock.run();
  assert.equal(only.focused, null);
  assert.deepEqual(scrolled, [120]);
});

/* A page stand-in for the early scroll: a held height lets it scroll as deep as the position (a screen being swapped in is shorter
   until it is drawn), and it records what was held and released, in order. */
function heldPage({ reachableWhenDrawn }) {
  const page = { position: 0, held: 0, log: [], drawn: false };
  page.options = {
    scrollTo: y => {
      page.log.push(`scroll ${y}`);
      page.position = Math.min(y, page.drawn ? reachableWhenDrawn : Math.max(page.held, 0));
    },
    scrolledTo: () => page.position,
    holdHeight: y => {
      page.held = y;
      page.log.push(`hold ${y}`);
    },
    releaseHeight: () => {
      page.held = 0;
      page.log.push('release');
    },
  };
  return page;
}

test('a deep position is scrolled to in the call itself, with the height held, and the height is let go once it has held', () => {
  const page = heldPage({ reachableWhenDrawn: 900 });
  const clock = frames();
  focusScreenHeading({ scrollY: 400, doc: docOf([panel(true, [])]), raf: clock.raf, ...page.options });
  assert.deepEqual(page.log, ['hold 400', 'scroll 400'], 'before any frame has run');
  assert.equal(page.position, 400);
  page.drawn = true;
  clock.run();
  assert.equal(page.position, 400);
  assert.deepEqual(page.log, ['hold 400', 'scroll 400', 'release'], 'no second scroll, and the height is let go at the end');
});

test('a screen shorter than the position gets its height back and shows its own end', () => {
  const page = heldPage({ reachableWhenDrawn: 250 });
  const clock = frames();
  focusScreenHeading({ scrollY: 400, doc: docOf([panel(true, [])]), raf: clock.raf, ...page.options });
  page.drawn = true;
  page.position = Math.min(page.position, 250); // the screen is drawn, and the browser clamps the held position
  clock.run();
  assert.equal(page.log.at(-1), 'release');
  assert.equal(page.held, 0);
  assert.equal(page.position, 250);
});

test('position 0 and a tab still opening scroll nothing early and hold no height', () => {
  const top = heldPage({ reachableWhenDrawn: 900 });
  const clock = frames();
  focusScreenHeading({ scrollY: 0, doc: docOf([panel(true, [])]), raf: clock.raf, ...top.options });
  assert.deepEqual(top.log, ['release'], 'only the release of an earlier call');

  const opening = heldPage({ reachableWhenDrawn: 900 });
  focusScreenHeading({ scrollY: 300, isPending: () => true, doc: docOf([panel(true, [])]), raf: clock.raf, ...opening.options });
  assert.deepEqual(opening.log, ['release']);
});

test('a newer move takes over: the older one stops scrolling and does not release the height the newer one holds', () => {
  const page = heldPage({ reachableWhenDrawn: 900 });
  const clock = frames();
  focusScreenHeading({ scrollY: 400, doc: docOf([panel(true, [])]), raf: clock.raf, ...page.options });
  focusScreenHeading({ scrollY: 120, doc: docOf([panel(true, [])]), raf: clock.raf, ...page.options });
  page.drawn = true;
  clock.run();
  assert.equal(page.position, 120);
  assert.equal(page.log.filter(entry => entry === 'scroll 400').length, 1, 'the first move scrolled only in its own call');
  assert.equal(page.log.filter(entry => entry === 'release').length, 1, 'one release, by the newer move');
});
