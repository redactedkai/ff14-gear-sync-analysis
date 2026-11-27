/* The class-field trap: a field with an initializer next to `static properties` hides Lit's accessor. Three guards exist:
   the lint rule lit/no-classfield-shadowing (tests/unit/scripts/lint-lit.test.ts), Lit's development build, which throws
   (this file), and tsconfig's useDefineForClassFields false for TypeScript elements (this file). */
import { test, expect, ALLOW_PAGE_ERROR } from '../fixtures.ts';
import type { ClassFieldTrap, TypeScriptField } from './broken-elements.story.ts';

test.describe('the class-field trap', () => {
  test('a JavaScript class field fails the test through the fixture', async ({ mount }) => {
    // test.fail: this test passes only because the fixture fails it for the page error
    test.fail();
    await mount<typeof ClassFieldTrap>('app/broken-elements/ClassFieldTrap', { count: 2 });
    // the error arrives after mount() resolved: give Lit's update a turn
    await new Promise(resolve => setTimeout(resolve, 300));
  });

  test('Lit names the trap and draws nothing', async ({ mount, consoleLog, page }, testInfo) => {
    testInfo.annotations.push({ type: ALLOW_PAGE_ERROR });
    await mount<typeof ClassFieldTrap>('app/broken-elements/ClassFieldTrap', { count: 2 });
    await expect.poll(() => consoleLog.some(line => line.includes('will not trigger updates'))).toBe(true);
    await expect(page.locator('broken-field output')).toHaveCount(0);
  });

  test('a TypeScript field initializer works because the build assigns it', async ({ mount }) => {
    const component = await mount<typeof TypeScriptField>('app/broken-elements/TypeScriptField', { count: 2 });
    await expect(component.getByText('Count 2')).toBeVisible();
    await component.update({ count: 7 });
    await expect(component.getByText('Count 7')).toBeVisible();
  });
});
