// Drives the page's selects (<gsa-select>, elements/shared/select.ts) as a person does: press the button, press an option. A select is
// named by its button's id (`#p-slot`); its list is `#p-slot-list`, its chosen value is the button's `data-value`.

import { expect, placedByZag } from './expect.mjs';

/** The list of the select whose button is `selector`. */
const listOf = selector => `${selector}-list`;

/** The options of the select `selector`, in order: [{value, label}]. The list is in the page while it is closed. */
export function selectOptions(pg, selector) {
  return pg
    .locator(`${listOf(selector)} [role="option"]`)
    .evaluateAll(rows => rows.map(row => ({ value: row.dataset.value, label: row.textContent.trim() })));
}

/** The chosen value of the select `selector` ('' for an option that means none). */
export const selectValue = (pg, selector) => pg.locator(selector).getAttribute('data-value');

/** Waits until the select `selector` has the chosen value `value`. */
export const expectSelectValue = (pg, selector, value) => expect(pg.locator(selector)).toHaveAttribute('data-value', value);

/** Opens the select `selector` and presses the option `choice`: its value (a string), `{ label }` or `{ index }`. The list is open
 * and placed by Zag before the press, and closed after it. */
export async function pickOption(pg, selector, choice) {
  const options = await selectOptions(pg, selector);
  let value = choice;
  if (typeof choice !== 'string') {
    const option = 'label' in choice ? options.find(each => each.label === choice.label) : options[choice.index];
    if (!option) {
      throw new Error(`${selector} has no option ${JSON.stringify(choice)}; it has ${JSON.stringify(options)}`);
    }
    value = option.value;
  }
  const list = listOf(selector);
  await pg.click(selector);
  await expect(pg.locator(list)).toBeVisible();
  await placedByZag(pg, list);
  await pg.click(`${list} [role="option"][data-value="${value}"]`);
  await expect(pg.locator(list)).toBeHidden();
}
