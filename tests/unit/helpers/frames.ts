/* Stand-ins for a DOM element and for the browser's frame callback, so a unit test runs the same code path as the page. */

/* An element stand-in: focus() and scrollIntoView() are recorded in `calls`; it holds no children. */
export function stubElement(calls = [], name = 'element') {
  return {
    isConnected: true,
    disabled: false,
    offsetHeight: 0,
    scrollTop: 0,
    style: { setProperty() {}, maxHeight: '' },
    focus: options => calls.push([name, 'focus', options]),
    scrollIntoView: options => calls.push([name, 'scrollIntoView', options]),
    querySelector: () => null,
    querySelectorAll: () => [],
    closest: () => null,
    getBoundingClientRect: () => ({ top: 0, bottom: 0, height: 0 }),
  };
}

/* Replaces requestAnimationFrame (Node has none): returns {pending (the callbacks waiting), step() (runs the ones
   waiting now; ones they add wait for the next step), restore()}. With `immediate`, a callback runs at once. */
export function fakeFrames({ immediate = false } = {}) {
  const before = globalThis.requestAnimationFrame;
  const frames = {
    pending: [],
    step() {
      const run = frames.pending.splice(0);
      for (const callback of run) {
        callback();
      }
      return run.length;
    },
    restore() {
      if (before === undefined) {
        delete globalThis.requestAnimationFrame;
      } else {
        globalThis.requestAnimationFrame = before;
      }
    },
  };
  globalThis.requestAnimationFrame = callback => (immediate ? callback() : frames.pending.push(callback));
  return frames;
}
