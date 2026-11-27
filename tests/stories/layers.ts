/* Waits for the open overlay layers of the stories (menus, popovers, lists, notes). A layer counts as open as soon as it is
   visible, but Zag finishes opening it a frame or two later: it places the layer (until then it sits above the window), and
   it moves the focus into it. A test that reads a box, clicks a row, presses a key or moves the focus itself right after
   `toBeVisible()` can run before that and, on a runner whose frames come late, meets the layer unplaced or the focus still on
   its button (the key is lost), or a Tab out of the layer does not close it yet. These helpers wait for
   the condition itself, never for a fixed time. */
import { expect, type Locator, type Page } from 'playwright/test';
import { afterTwoFramesAndATask, boxStillForFrames } from '../e2e/lib/layer-wait.ts';

/* Waits until the layer has been placed: it is in the window (Zag parks an unplaced layer above it) and its box has not moved
   for three frames (a layer still being moved to its anchor, or one that Zag has placed once and moves again, is not settled). */
export async function layerPlaced(layer: Locator): Promise<void> {
  await expect(layer, 'the layer is placed in the window').toBeInViewport();
  await layer.evaluate(boxStillForFrames);
}

/* Waits for the frames in which Zag sets up what closes a layer by itself: a frame after the layer opens it starts to watch for a press
   or a focus outside it, and the focus moving out is reported a frame after that. A Tab out of the layer, or a press outside it,
   before then closes nothing. (Zag's interact-outside: `trackInteractOutside` starts in `raf`, its press listener in a timeout.) */
export async function layerArmed(page: Page): Promise<void> {
  await page.evaluate(afterTwoFramesAndATask);
}

/* Waits until the focus is on the layer or on something inside it: Zag moves it there a frame after the layer opens. A test that
   focuses a control of the layer itself, or presses a key, only after this. */
export async function focusInside(layer: Locator): Promise<void> {
  await expect
    .poll(() => layer.evaluate(element => element.contains(document.activeElement)), { message: 'the focus is inside the layer' })
    .toBe(true);
}
