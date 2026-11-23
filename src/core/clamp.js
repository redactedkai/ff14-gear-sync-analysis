/* Number helpers shared by core and the page. */

/* `value` held to the range `low` to `high`: `low` when below it, `high` when above it, NaN for NaN. The range must
   have low <= high (with low > high the result is `high`, whatever the value). */
export function clamp(value, low, high) {
  return Math.min(high, Math.max(low, value));
}
