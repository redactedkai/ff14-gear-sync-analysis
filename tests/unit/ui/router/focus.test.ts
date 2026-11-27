/* Focus and scroll after Back or Forward (src/ui/router/focus.ts) over a stand-in document: the first visible heading of the
   visible tab panel gets the focus, and the page scrolls to the position asked for. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { focusScreenHeading, isPlacingScroll } from '../../../../src/ui/router/focus.ts';
import type { FocusScreenOptions, ScreenDocument, ScreenHeading, ScreenPanel, ScreenRoot } from '../../../../src/ui/router/focus.ts';

/* What a heading or a panel reports of being drawn: a box when visible, none when hidden. */
const shown = { getClientRects: (): unknown[] => [{}] };
const hidden = { getClientRects: (): unknown[] => [] };

/* A heading that records its focus. */
interface FakeHeading extends ScreenHeading {
  focused: { preventScroll: boolean } | null;
}
const heading = (visible: boolean): FakeHeading => ({
  ...(visible ? shown : hidden),
  tabIndex: 0,
  focused: null,
  focus(options) {
    this.focused = options;
  },
});
/* A tab panel holding `headings`. */
const panel = (visible: boolean, headings: ScreenHeading[]): ScreenPanel => ({
  ...(visible ? shown : hidden),
  querySelectorAll: () => headings,
});
/* The root element as the page has it: setting any style property adds a style attribute, and an empty one stays until it is
   removed (as in the browsers). */
interface FakeRoot extends ScreenRoot {
  hasStyleAttribute: boolean;
}
function rootElement(): FakeRoot {
  let minHeight = '';
  const root: FakeRoot = {
    hasStyleAttribute: false,
    style: {
      get minHeight() {
        return minHeight;
      },
      set minHeight(value) {
        minHeight = value;
        root.hasStyleAttribute = true;
      },
    },
    getAttribute: name => {
      if (name !== 'style' || !root.hasStyleAttribute) {
        return null;
      }
      return minHeight ? `min-height: ${minHeight};` : '';
    },
    removeAttribute: name => {
      if (name === 'style') {
        root.hasStyleAttribute = false;
      }
    },
  };
  return root;
}
/* A document with `panels`, a window 900 px high and a screen `bodyHeight` px tall (what the page's own content needs). */
interface FakeDocument extends ScreenDocument {
  readonly documentElement: FakeRoot;
}
const docOf = (panels: ScreenPanel[], bodyHeight = 900): FakeDocument => ({
  querySelectorAll: () => panels,
  documentElement: rootElement(),
  body: { scrollHeight: bodyHeight },
  defaultView: { innerHeight: 900 },
});
/* Frames that run when the test says so. */
function frames() {
  const queue: (() => void)[] = [];
  return {
    raf: (callback: () => void) => queue.push(callback),
    run: () => {
      for (let callback = queue.shift(); callback; callback = queue.shift()) {
        callback();
      }
    },
    step: () => {
      for (const callback of queue.splice(0)) {
        callback();
      }
    },
  };
}

test('the first visible heading of the visible panel is focused and the page scrolls to the position', () => {
  const [hiddenHeading, first, second] = [heading(false), heading(true), heading(true)];
  const doc = docOf([panel(false, [heading(true)]), panel(true, [hiddenHeading, first, second])]);
  const clock = frames();
  const scrolled: number[] = [];
  focusScreenHeading({ scrollY: 250, doc, raf: clock.raf, scrollTo: y => scrolled.push(y), scrolledTo: () => scrolled.at(-1) ?? 0 });
  clock.run();
  assert.deepEqual(first.focused, { preventScroll: true });
  assert.equal(first.tabIndex, -1);
  assert.equal(second.focused, null);
  assert.equal(hiddenHeading.focused, null);
  assert.deepEqual(scrolled, [250]);
});

test('a screen with no heading still scrolls', () => {
  const clock = frames();
  const scrolled: number[] = [];
  focusScreenHeading({
    scrollY: 80,
    doc: docOf([panel(true, [])]),
    raf: clock.raf,
    scrollTo: y => scrolled.push(y),
    scrolledTo: () => scrolled.at(-1) ?? 0,
  });
  clock.run();
  assert.deepEqual(scrolled, [80]);
});

test('it waits for a tab that is still opening, then focuses; a tab that never opens is not waited for forever', () => {
  const h = heading(true);
  let pending = true;
  const queue: (() => void)[] = [];
  const raf = (callback: () => void) => queue.push(callback);
  const step = () =>
    queue.splice(0).forEach(callback => {
      callback();
    });
  const scrolled: number[] = [];
  focusScreenHeading({
    scrollY: 5,
    isPending: () => pending,
    doc: docOf([panel(true, [h])]),
    raf,
    scrollTo: y => scrolled.push(y),
    scrolledTo: () => scrolled.at(-1) ?? 0,
  });
  for (let frame = 0; frame < 10; frame += 1) {
    step();
  }
  assert.equal(h.focused, null, 'nothing while the tab is opening');
  assert.deepEqual(scrolled, []);
  pending = false;
  step();
  step();
  assert.deepEqual(h.focused, { preventScroll: true });
  assert.deepEqual(scrolled, [5]);

  // pending for good: after the frames it waits (the limit), it goes ahead
  const stuck = heading(true);
  const stuckQueue: (() => void)[] = [];
  focusScreenHeading({
    isPending: () => true,
    doc: docOf([panel(true, [stuck])]),
    raf: callback => stuckQueue.push(callback),
    scrollTo: () => {},
    scrolledTo: () => 0,
  });
  for (let frame = 0; frame < 200 && stuck.focused === null; frame += 1) {
    stuckQueue.splice(0).forEach(callback => {
      callback();
    });
  }
  assert.deepEqual(stuck.focused, { preventScroll: true });
});

test('a screen still too short to scroll to the position is tried again on the next frames', () => {
  const queue: (() => void)[] = [];
  const raf = (callback: () => void) => queue.push(callback);
  const step = () => {
    for (const callback of queue.splice(0)) {
      callback();
    }
  };
  let reachable = 0; // the page is still being drawn: it can scroll only this far
  let at = 0;
  const wanted: number[] = [];
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
  const queue: (() => void)[] = [];
  let reachable = 300; // how far the page can scroll when it is drawn
  let position = 0;
  let undrawn = false; // a scrollTo the page has not drawn yet: its position is reported as asked, and clamped at the next frame
  const wanted: number[] = [];
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
    if (undrawn) {
      position = Math.min(position, reachable);
    }
    undrawn = false;
    for (const callback of queue.splice(0)) {
      callback();
    }
  };
  for (let count = 0; count < 4; count += 1) {
    frame(); // asked for 400 and reported as 400 at once, but drawn at 300
  }
  reachable = 900;
  for (let count = 0; count < 8; count += 1) {
    frame();
  }
  assert.equal(position, 400);
  assert.ok(wanted.length >= 2, 'it asked again after the page was drawn too short');
});

test('focus: false only scrolls', () => {
  const only = heading(true);
  const clock = frames();
  const scrolled: number[] = [];
  focusScreenHeading({
    scrollY: 120,
    focus: false,
    doc: docOf([panel(true, [only])]),
    raf: clock.raf,
    scrollTo: y => scrolled.push(y),
    scrolledTo: () => scrolled.at(-1) ?? 0,
  });
  clock.run();
  assert.equal(only.focused, null);
  assert.deepEqual(scrolled, [120]);
});

/* A page stand-in for the early scroll: a held height lets it scroll as deep as the position (a screen being swapped in is shorter
   until it is drawn), and it records what was held and released, in order. */
interface HeldPage {
  position: number;
  held: number;
  log: string[];
  drawn: boolean;
  options: Required<Pick<FocusScreenOptions, 'scrollTo' | 'scrolledTo' | 'holdHeight' | 'releaseHeight'>>;
}
function heldPage({ reachableWhenDrawn }: { reachableWhenDrawn: number }): HeldPage {
  const page: HeldPage = {
    position: 0,
    held: 0,
    log: [],
    drawn: false,
    options: {
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

test('a screen that stops growing short of the position gets its height back at once and shows its own end, not blank space', () => {
  const page = heldPage({ reachableWhenDrawn: 250 });
  const clock = frames();
  const screenHeight = 1150; // the screen's own height: 250 px of scrolling in a 900 px window, short of the 400 asked for
  focusScreenHeading({
    scrollY: 400,
    doc: docOf([panel(true, [])]),
    raf: clock.raf,
    naturalHeight: () => screenHeight,
    ...page.options,
  });
  page.drawn = true;
  assert.equal(page.held, 400, 'held tall at first: the screen may still be growing');
  clock.step(); // the first look at the screen: no growth seen yet
  assert.equal(page.held, 400);
  clock.step(); // the same height as a frame ago: it has stopped growing
  assert.equal(page.held, 0, 'the hold is let go as soon as the height stops growing');
  assert.equal(page.log.filter(entry => entry === 'release').length, 1);
});

test('a screen already complete when it is swapped in loses the hold before its first frame is drawn', async () => {
  const page = heldPage({ reachableWhenDrawn: 250 });
  const clock = frames();
  focusScreenHeading({
    scrollY: 400,
    doc: docOf([panel(true, [])]),
    raf: clock.raf,
    naturalHeight: () => 1150, // short of the position
    ...page.options,
  });
  assert.equal(page.held, 400);
  await Promise.resolve(); // the page's own update has run: the first look at the screen
  assert.equal(page.held, 400);
  page.drawn = true;
  clock.step(); // the first frame: the height is the same as at the first look
  assert.equal(page.held, 0, 'let go in the first frame, before it is drawn');
});

test('a tab swapped in complete and shorter than the position loses the hold in the frame that places it, before it is drawn', () => {
  const page = heldPage({ reachableWhenDrawn: 250 });
  const clock = frames();
  let pending = true;
  focusScreenHeading({
    scrollY: 400,
    isPending: () => pending,
    doc: docOf([panel(true, [])]),
    raf: clock.raf,
    naturalHeight: () => 1150, // the window got taller since the position was left: the screen no longer reaches it
    ...page.options,
  });
  clock.step(); // a frame of the screen still on show
  pending = false; // the tab was swapped in, in a task before the next frame
  clock.step(); // the frame that places the position and is then drawn
  assert.equal(page.held, 0, 'no frame is drawn with the blank space of the hold');
  assert.deepEqual(page.log, ['release', 'hold 400', 'scroll 400', 'release']);
});

test('a screen that is still growing keeps its height held until it reaches the position', () => {
  const page = heldPage({ reachableWhenDrawn: 900 });
  const clock = frames();
  let screenHeight = 1000;
  focusScreenHeading({
    scrollY: 400,
    doc: docOf([panel(true, [])]),
    raf: clock.raf,
    naturalHeight: () => screenHeight,
    ...page.options,
  });
  for (const height of [1100, 1200, 1250, 1290]) {
    screenHeight = height; // the screen grew since the last frame
    clock.step();
    assert.equal(page.held, 400, `still held at ${height}`);
  }
  for (let frame = 0; frame < 6; frame += 1) {
    clock.step(); // 450 px of scrolling now: the position is reached and has held
  }
  assert.equal(page.held, 0);
  assert.equal(page.position, 400);
});

test('the height is held at most a few windows more than the page is tall, however far the saved position is', () => {
  const cases: [number, string][] = [
    [1e12, '4500px'], // 4 windows of 900 px, and the window
    [5000, '4500px'],
    [700, '1600px'],
  ];
  for (const [saved, want] of cases) {
    const doc = docOf([panel(true, [])], 1300); // a page 400 px longer than the window
    focusScreenHeading({ scrollY: saved, doc, raf: () => {}, scrollTo: () => {}, scrolledTo: () => 0 });
    assert.equal(doc.documentElement.style.minHeight, want, `saved ${saved}`);
  }
  // a page of its own range beyond that holds as far as it reaches
  const tall = docOf([panel(true, [])], 9000);
  focusScreenHeading({ scrollY: 1e12, doc: tall, raf: () => {}, scrollTo: () => {}, scrolledTo: () => 0 });
  assert.equal(tall.documentElement.style.minHeight, '9000px');
});

test('letting the height go removes the style attribute it made, and leaves one that holds other styles', () => {
  const doc = docOf([panel(true, [])]);
  const clock = frames();
  focusScreenHeading({ scrollY: 300, doc, raf: clock.raf, scrollTo: () => {}, scrolledTo: () => 300 });
  assert.equal(doc.documentElement.hasStyleAttribute, true, 'held');
  clock.run();
  assert.equal(doc.documentElement.style.minHeight, '');
  assert.equal(doc.documentElement.hasStyleAttribute, false, 'no empty style attribute is left');

  const styled = docOf([panel(true, [])]);
  const original = styled.documentElement.getAttribute;
  styled.documentElement.getAttribute = name => (name === 'style' ? 'color: red;' : original(name));
  focusScreenHeading({ scrollY: 300, doc: styled, raf: clock.raf, scrollTo: () => {}, scrolledTo: () => 300 });
  clock.run();
  assert.equal(styled.documentElement.hasStyleAttribute, true, 'another style on the element keeps the attribute');
});

test('the page counts as placing from the call until the position has held', () => {
  const clock = frames();
  assert.equal(isPlacingScroll(), false);
  focusScreenHeading({ scrollY: 300, doc: docOf([panel(true, [])]), raf: clock.raf, scrollTo: () => {}, scrolledTo: () => 300 });
  assert.equal(isPlacingScroll(), true);
  clock.step();
  clock.step();
  assert.equal(isPlacingScroll(), true, 'not yet stable');
  clock.run();
  assert.equal(isPlacingScroll(), false);

  // a newer call takes over: the older one's end does not say the page is placed
  focusScreenHeading({ scrollY: 300, doc: docOf([panel(true, [])]), raf: clock.raf, scrollTo: () => {}, scrolledTo: () => 300 });
  focusScreenHeading({ scrollY: 100, doc: docOf([panel(true, [])]), raf: clock.raf, scrollTo: () => {}, scrolledTo: () => 100 });
  clock.step();
  clock.step();
  clock.step();
  assert.equal(isPlacingScroll(), false);
});

test('position 0 is placed in the call itself with no height held; a tab still opening is placed in the first frame after it opens', () => {
  const top = heldPage({ reachableWhenDrawn: 900 });
  const clock = frames();
  focusScreenHeading({ scrollY: 0, doc: docOf([panel(true, [])]), raf: clock.raf, ...top.options });
  assert.deepEqual(top.log, ['release', 'scroll 0'], 'the release of an earlier call, then the scroll to the top, before any frame');

  let pending = true;
  const opening = heldPage({ reachableWhenDrawn: 900 });
  focusScreenHeading({ scrollY: 300, isPending: () => pending, doc: docOf([panel(true, [])]), raf: clock.raf, ...opening.options });
  assert.deepEqual(opening.log, ['release'], 'the screen on show is not scrolled while the tab is opening');
  clock.step();
  clock.step();
  assert.deepEqual(opening.log, ['release']);
  pending = false; // the tab was swapped in, in a task before this frame
  clock.step();
  assert.deepEqual(
    opening.log.slice(0, 3),
    ['release', 'hold 300', 'scroll 300'],
    'placed in the first frame after the swap, not a frame later',
  );
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

test('a screen opened at the top is put there once, the player scrolling next is left alone, and the placement is over after one frame', () => {
  const first = heading(true);
  const doc = docOf([panel(true, [first])]);
  const clock = frames();
  let at = 400; // the screen before it was scrolled to 400
  const scrolled: number[] = [];
  focusScreenHeading({
    focus: false,
    once: true,
    doc,
    raf: clock.raf,
    scrollTo: y => {
      scrolled.push(y);
      at = y;
    },
    scrolledTo: () => at,
  });
  assert.deepEqual(scrolled, [0], 'at the top before the first frame');
  assert.equal(isPlacingScroll(), true);
  at = 120; // the player scrolls the new screen
  clock.run();
  assert.deepEqual(scrolled, [0], 'not pulled back');
  assert.equal(isPlacingScroll(), false);
  assert.equal(first.focused, null, 'the focus stays where the click put it');
});

test('a screen opened at the top does not watch the page size: a layout change that moves the page later does not pull it back', () => {
  const doc = docOf([panel(true, [heading(true)])]);
  const clock = frames();
  let at = 400;
  const scrolled: number[] = [];
  const watchers: (() => void)[] = [];
  focusScreenHeading({
    focus: false,
    once: true,
    doc,
    raf: clock.raf,
    scrollTo: y => {
      scrolled.push(y);
      at = y;
    },
    scrolledTo: () => at,
    watchSize: onResize => {
      watchers.push(onResize);
      return () => {};
    },
  });
  clock.run();
  at = 90; // the player scrolls, then the screen changes height
  for (const onResize of watchers) {
    onResize();
  }
  assert.deepEqual(scrolled, [0], 'the page is placed once and never moved by a size change');
});

test('a screen opened at the top while a tab is still opening waits for the tab, then scrolls once', () => {
  const doc = docOf([panel(true, [heading(true)])]);
  const clock = frames();
  let pending = true;
  const scrolled: number[] = [];
  focusScreenHeading({
    focus: false,
    once: true,
    isPending: () => pending,
    doc,
    raf: clock.raf,
    scrollTo: y => scrolled.push(y),
    scrolledTo: () => 0,
  });
  assert.deepEqual(scrolled, [], 'the old tab is still on show');
  clock.step();
  clock.step();
  assert.deepEqual(scrolled, []);
  pending = false;
  clock.run();
  assert.deepEqual(scrolled, [0]);
  assert.equal(isPlacingScroll(), false);
});
