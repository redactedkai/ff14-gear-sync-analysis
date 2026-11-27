// Accessibility rules (axe-core) on every main screen and on the open menus and dialogs, dark scheme.

import { openViewSet, viewSheets } from './screens.ts';
import { axeViolations, splitKnown } from '../../lib/axe.ts';
import { check, currentRecord, expect } from '../../lib/expect.ts';
import { seedSheets } from '../../lib/sheets.ts';
import type { Page } from 'playwright';

// TODO: each entry goes when the page is fixed: names for the drag handles, an h4 before the materia menu title, a <main> around
// the page, and the visible text inside the two aria-labels.
/** One finding the page has today: see KNOWN_AXE. */
type KnownAxe = { rule: string; target?: string; targetContains?: string; note: string };

/** Findings the page has today (reported to the owner, not yet changed): printed as "KNOWN FAILURE" lines, they do not fail the
 * run, and a finding that stops happening fails it until it is removed here. `rule` is axe's rule id, `target` limits the entry
 * to one element's selector and `targetContains` to selectors holding that text (none of the two: any element), `note` says
 * what is wrong. */
const KNOWN_AXE: KnownAxe[] = [
  { rule: 'aria-command-name', targetContains: '.draghandle', note: 'the drag handles of the sheet and set lists have no accessible name' },
  { rule: 'heading-order', target: 'h5', note: 'the materia menu title is an h5 with no h4 before it' },
  { rule: 'landmark-one-main', note: 'the page has no <main> landmark' },
  { rule: 'label-content-name-mismatch', target: '#p-piece-chip', note: 'piece chip: its aria-label leaves out the visible text' },
];

/** Runs axe on the open screen `name` and records what it finds: a failed check for each new violation (rule, level, and the
 * first elements), a KNOWN FAILURE line for each known one. `seen` collects the KNOWN_AXE entries that happened. */
async function checkScreen(pg: Page, name: string, seen: Set<KnownAxe>) {
  const { fresh, matched } = splitKnown(await axeViolations(pg), KNOWN_AXE);
  for (const entry of matched) {
    seen.add(entry);
    currentRecord().known.set(
      `axe ${entry.rule} ${entry.target ?? entry.targetContains ?? ''}`,
      `KNOWN FAILURE (accessibility, ${entry.rule}): ${entry.note}`,
    );
  }
  for (const violation of fresh) {
    const shown = violation.targets.slice(0, 3).join(', ');
    const more = violation.targets.length > 3 ? ` and ${violation.targets.length - 3} more` : '';
    check(false, `accessibility (${name}): ${violation.rule} [${violation.impact}] ${violation.help}: ${shown}${more}`);
  }
}

/** Opens math sub-tab `sub` ('piece', 'gcd' or 'tiers'). */
async function openMathTab(pg: Page, sub: 'piece' | 'gcd' | 'tiers') {
  await pg.click(`[data-sub=${sub}]`);
  await expect(pg.locator(`#tab-${sub}`)).toBeVisible();
}

/** axe-core's rules on the Sheets list, the New sheet dialog, a sheet's page, a set page and its materia menu, the Gear
 * browser with its Job menu open, and the three Math sub-tabs, in the dark scheme (light is not checked for now). The page has
 * no iframes, so one run of the injected script covers each state. */
export async function checkAccessibility(pg: Page) {
  const seen = new Set<KnownAxe>(); // the KNOWN_AXE entries that happened
  await pg.emulateMedia({ colorScheme: 'dark' });
  await seedSheets(pg, viewSheets());
  await pg.click('[data-tab=sheets]');
  await expect(pg.locator('#sh-list')).toBeVisible();
  await checkScreen(pg, 'Sheets list', seen);

  // the New sheet dialog
  await pg.click('#sh-new');
  await expect(pg.locator('#sh-dialog')).toBeVisible();
  await checkScreen(pg, 'New sheet dialog', seen);
  await pg.keyboard.press('Escape');
  await expect(pg.locator('#sh-dialog')).toHaveCount(0);

  // a sheet's page, then a set page and the materia menu of its overmeld slot
  await pg.locator('#sh-list a.sname', { hasText: 'Five sets' }).click();
  await expect(pg.locator('#sh-sets')).toBeVisible();
  await checkScreen(pg, 'sheet page', seen);
  await pg.click('#sh-sheet .setcrumb a');
  await openViewSet(pg, 'Sage with an earring', 'Mine');
  await checkScreen(pg, 'set page', seen);
  await pg.click('[data-chip="7:2"]');
  await expect(pg.locator('.matpop')).toBeVisible();
  await checkScreen(pg, 'materia menu', seen);
  await pg.keyboard.press('Escape');

  // the Gear browser, then its Job menu
  await pg.click('[data-tab=browse]');
  await expect(pg.locator('#job-menu-btn')).toBeVisible();
  await checkScreen(pg, 'Gear browser', seen);
  await pg.click('#job-menu-btn');
  await expect(pg.locator('#job-menu')).toBeVisible();
  await checkScreen(pg, 'Gear browser, Job menu open', seen);
  await pg.keyboard.press('Escape');

  // the three Math sub-tabs
  await pg.click('[data-tab=math]');
  for (const [sub, name] of [
    ['piece', 'Stat Allocation'],
    ['gcd', 'GCD Scaling'],
    ['tiers', 'Substat tiers'],
  ] as const) {
    await openMathTab(pg, sub);
    await checkScreen(pg, name, seen);
  }

  // a known finding that no longer happens is removed from KNOWN_AXE
  for (const entry of KNOWN_AXE) {
    const where = entry.target ?? entry.targetContains;
    check(
      seen.has(entry),
      `accessibility: the known finding "${entry.rule}${where ? ` ${where}` : ''}" no longer happens: remove it from KNOWN_AXE`,
    );
  }
  await pg.emulateMedia({ colorScheme: null });
  await pg.click('[data-tab=browse]');
}
