/* Stand-ins for a DOM element and for the browser's frame callback, so a unit test runs the same code path as the page. */
import type { HostElement } from '../../../../src/ui/elements/set-page/session-types.ts';

/* A call an element stand-in recorded: the element's name, the method and the argument it got. */
export type ElementCall = [name: string, method: string, argument: unknown];

/* An element stand-in, complete for HostElement (the members the set page's logic uses): focus() and scrollIntoView() are
   recorded in `calls` under `name`; it is not disabled and is a zero-size box. */
export function stubElement(calls: ElementCall[] = [], name = 'element'): HostElement {
  return {
    disabled: false,
    focus: options => {
      calls.push([name, 'focus', options]);
    },
    scrollIntoView: options => {
      calls.push([name, 'scrollIntoView', options]);
    },
    getBoundingClientRect: () => ({ x: 0, y: 0, top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, toJSON: () => ({}) }),
  };
}

/* What fakeFrames returns: the callbacks waiting, step (runs the ones waiting now, returns how many) and restore. */
export interface FakeFrames {
  pending: FrameRequestCallback[];
  step(): number;
  restore(): void;
}

/* Replaces requestAnimationFrame (Node has none): returns {pending (the callbacks waiting), step() (runs the ones
   waiting now; ones they add wait for the next step), restore()}. With `immediate`, a callback runs at once. */
export function fakeFrames({ immediate = false } = {}): FakeFrames {
  const before: typeof globalThis.requestAnimationFrame | undefined = globalThis.requestAnimationFrame;
  const frames: FakeFrames = {
    pending: [],
    step() {
      const run = frames.pending.splice(0);
      for (const callback of run) {
        callback(performance.now());
      }
      return run.length;
    },
    restore() {
      if (before === undefined) {
        Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
      } else {
        globalThis.requestAnimationFrame = before;
      }
    },
  };
  globalThis.requestAnimationFrame = callback => {
    if (immediate) {
      callback(performance.now());
      return 0;
    }
    return frames.pending.push(callback);
  };
  return frames;
}
