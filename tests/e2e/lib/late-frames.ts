/* Late animation frames, to reproduce a slow runner on a fast machine. Zag opens a layer a frame or two before it places it and
   moves the focus a frame after a key, so a test that reads too early passes on a fast machine and fails on a CI runner whose
   frames come late. `lateFramesScript` delays every `requestAnimationFrame` callback of the page by a number of milliseconds.
   It is opt-in: the stories read STORIES_FRAME_DELAY_MS, the smoke test SMOKE_FRAME_DELAY_MS (tests/stories/fixtures.ts,
   tests/e2e/smoke.mjs; both off by default, 40 reproduces the failures seen on GitHub's Linux runner). */

/* The delay in ms that the environment variable `name` asks for, 0 when it is unset or not a positive number. */
export function frameDelayFromEnv(name: string): number {
  const delayMs = Number(process.env[name] || 0);
  return delayMs > 0 ? delayMs : 0;
}

/* An init script (for `addInitScript(lateFramesScript, delayMs)`, before the page's own script) that makes each animation frame
   of the page `delayMs` late. A page that has the script more than once (a page reused by several tests) is wrapped once. */
export function lateFramesScript(delayMs: number): void {
  if ('frameDelayed' in window) {
    return;
  }
  Object.assign(window, { frameDelayed: true });
  const nativeFrame = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = callback => window.setTimeout(() => nativeFrame(callback), delayMs);
}
