/* Draw a long list in steps: `grow()` runs in a task of its own after each frame (so the rows already drawn are on the
   screen first), and returns true while more is left to draw. Browser only (needs requestAnimationFrame); the part that
   cuts the list is views/limit-rows.js. */
export function drawInSteps(grow: () => boolean): void {
  const next = () =>
    requestAnimationFrame(() =>
      setTimeout(() => {
        if (grow()) {
          next();
        }
      }, 0),
    );
  next();
}
