/* The width sweep's search for the widths where the layout changes: measure at a coarse step, then split every step
   whose two ends differ until the change is pinned to 1 px. Pure: the measuring is a function the caller passes. */

/* Finds the change points of a layout between widths `from` and `to`.
   - `measure(width)`: an async function giving what the page looks like at that width (called once per width);
   - `keyOf(result)`: a text; two widths lay out alike when their keys are equal;
   - `describe(before, after)`: short texts for what changed between the results at the two sides of a change point;
   - `step`: the coarse step.
   Returns {changes: [{at, changes: texts}], series: [{width, result}] (every width measured, widest last), measured}.
   A change point is the first width of the new layout, so the layout at `at - 1` is the old one. Where both ends of a step
   (or of a half of it) have the same key, the part between is taken as flat: a change that goes away again inside one
   step is missed. */
export async function findChangePoints({ from, to, step, measure, keyOf, describe }) {
  const cache = new Map();
  const at = async width => {
    if (!cache.has(width)) {
      cache.set(width, await measure(width));
    }
    return cache.get(width);
  };

  // the coarse pass
  const coarse = [];
  for (let width = from; width < to; width += step) {
    coarse.push(width);
  }
  coarse.push(to);
  for (const width of coarse) {
    await at(width);
  }

  // every step whose ends differ is split in halves until two neighbours differ by 1 px
  const changes = [];
  const refine = async (low, high) => {
    const lowResult = await at(low);
    const highResult = await at(high);
    if (keyOf(lowResult) === keyOf(highResult)) {
      return;
    }
    if (high - low <= 1) {
      changes.push({ at: high, changes: describe(lowResult, highResult) });
      return;
    }
    const middle = Math.floor((low + high) / 2);
    await refine(low, middle);
    await refine(middle, high);
  };
  for (let index = 1; index < coarse.length; index++) {
    await refine(coarse[index - 1], coarse[index]);
  }

  changes.sort((a, b) => a.at - b.at);
  const series = [...cache.entries()].sort((a, b) => a[0] - b[0]).map(([width, result]) => ({ width, result }));
  return { changes, series, measured: cache.size };
}
