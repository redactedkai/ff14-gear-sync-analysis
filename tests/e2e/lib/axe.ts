// axe-core in the smoke test: run its rules on the open page, and set aside the findings the page has today.
// axe-core is a dev dependency only: its script is injected into the page by the test and never reaches dist/index.html.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

/** The axe-core script (a global `axe`), read once. */
const AXE_SOURCE = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf-8');

/** Runs axe-core's default rules on the open page, in its current state (open menus and dialogs included). Returns the
 * violations, `{ rule, impact, help, targets }`: `rule` is axe's rule id, `impact` its level (minor, moderate, serious or
 * critical), `help` a short sentence naming the rule, `targets` the CSS selectors of the elements that break it.
 * Rules that cannot decide ("incomplete") are not returned. */
export async function axeViolations(pg) {
  if (!(await pg.evaluate(() => typeof globalThis.axe !== 'undefined'))) {
    await pg.addScriptTag({ content: AXE_SOURCE });
  }
  return pg.evaluate(async () => {
    const result = await globalThis.axe.run(document, { resultTypes: ['violations'] });
    return result.violations.map(v => ({
      rule: v.id,
      impact: v.impact,
      help: v.help,
      targets: v.nodes.map(node => node.target.join(' ')),
    }));
  });
}

/** Splits axe violations (the shape axeViolations returns) into the new ones and the known ones. `known` is a list of
 * `{ rule, target?, targetContains?, note }`: an element is known when an entry has its rule and, if the entry has a `target`,
 * the element's selector is exactly that, and, if it has `targetContains`, the selector holds that text (for elements whose
 * selector differs per row). Returns `{ fresh, matched }`: `fresh` are the violations with only their unknown elements (a
 * violation with none left is dropped), `matched` the entries of `known` that matched at least one element. */
export function splitKnown(violations, known) {
  const matched = new Set();
  const fresh = [];
  for (const violation of violations) {
    const unknownTargets = violation.targets.filter(target => {
      const entry = known.find(
        k =>
          k.rule === violation.rule &&
          (k.target === undefined || k.target === target) &&
          (k.targetContains === undefined || target.includes(k.targetContains)),
      );
      if (entry) {
        matched.add(entry);
      }
      return !entry;
    });
    if (unknownTargets.length) {
      fresh.push({ ...violation, targets: unknownTargets });
    }
  }
  return { fresh, matched };
}
