/* The test fixtures of the stories: Playwright's `test` plus two things it lacks.
   - A page error or a console error fails the test (Playwright reports neither by itself, and `mount()` does not reject
     when a Lit render throws later). A test that expects an error says so with the annotation ALLOW_PAGE_ERROR.
   - `axe()` runs axe-core on the mounted story, injected the way tests/e2e/lib/axe.mjs does. */
import { test as base, expect } from 'playwright/test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const AXE_SOURCE = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf-8');

/* The annotation type a test adds to expect an error of the page (see the file comment). */
export const ALLOW_PAGE_ERROR = 'allow-pageerror';

/* A log line that counts as an error: a page error or a console message of type error. */
const ERROR_LINE = /^(pageerror|error): /;

/* The part of axe-core's API and result the fixture reads. */
type AxeResult = { violations: { id: string; nodes: { target: string[] }[] }[] };
type AxeApi = { run(context: Element | null, options: object): Promise<AxeResult> };

type Fixtures = {
  /** Every console message and page error of the test, as "type: text". */
  consoleLog: string[];
  /** Runs axe-core on the mounted story (the gallery's #root, so page-level rules such as one main landmark
   *  do not apply) and returns the violations as "rule: targets". */
  axe: () => Promise<string[]>;
};

/* Playwright's `test` with two extra fixtures, `consoleLog` and `axe`; a page error or console error fails the test. */
export const test = base.extend<Fixtures>({
  consoleLog: [
    async ({ page }, use, testInfo) => {
      const log: string[] = [];
      const onConsole = (message: { type(): string; text(): string }) => log.push(`${message.type()}: ${message.text()}`);
      const onError = (error: Error) => log.push(`pageerror: ${error.message}`);
      page.on('console', onConsole);
      page.on('pageerror', onError);
      await use(log);
      // the page is reused between the tests of a worker (reuseContext), so the listeners must go
      page.off('console', onConsole);
      page.off('pageerror', onError);
      const errors = log.filter(line => ERROR_LINE.test(line));
      if (errors.length && !testInfo.annotations.some(annotation => annotation.type === ALLOW_PAGE_ERROR)) {
        throw new Error(`the page reported an error: ${errors[0].slice(0, 300)}`);
      }
    },
    { auto: true },
  ],
  axe: async ({ page }, use) => {
    await use(async () => {
      if (!(await page.evaluate(() => 'axe' in globalThis))) await page.addScriptTag({ content: AXE_SOURCE });
      return page.evaluate(async () => {
        const result: AxeResult = await (globalThis as unknown as { axe: AxeApi }).axe.run(document.getElementById('root'), {
          resultTypes: ['violations'],
        });
        return result.violations.map(violation => `${violation.id}: ${violation.nodes.map(node => node.target.join(' ')).join(' | ')}`);
      });
    });
  },
});

export { expect };
