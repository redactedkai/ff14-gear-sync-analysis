/* Waits that run inside the page and that the stories (tests/stories/layers.ts) and the smoke test (tests/e2e/lib/expect.mjs,
   nav.mjs) share: each is handed to `evaluate`, so it must not use anything outside its own body. */

/* Resolves when the element's box has not moved for 3 frames in a row (a layer still being moved to its anchor, or one that Zag
   has placed once and moves again, is not settled). Frames are counted, never timed, so a runner whose frames come late waits as
   long as it needs. */
export function boxStillForFrames(element: Element): Promise<void> {
  return new Promise<void>(done => {
    let last = '';
    let frames = 0;
    const check = () => {
      const box = element.getBoundingClientRect();
      const now = `${box.x},${box.y},${box.width},${box.height}`;
      frames = now === last ? frames + 1 : 0;
      last = now;
      if (frames >= 3) {
        done();
      } else {
        requestAnimationFrame(check);
      }
    };
    check();
  });
}

/* Resolves after two frames and a task: the frames in which Zag arms what closes a layer by itself (a press or a focus outside
   it), and in which an Auto-fill waits before it starts. Anything that must have run by then has. */
export function afterTwoFramesAndATask(): Promise<void> {
  return new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 0))));
}
