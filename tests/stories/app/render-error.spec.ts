/* The fixture's own proof: a story whose element throws in render() must fail the test. Playwright does not fail a test
   on a page error and `mount()` resolves before Lit renders, so only the fixture (tests/stories/fixtures.ts) catches it. */
import { test, expect } from '../fixtures.ts';
import type { ThrowingRender } from './broken-elements.story.js';

test.describe('the fixture', () => {
  test('fails a test whose element throws in render()', async ({ mount }) => {
    // test.fail: this test passes only because the fixture fails it
    test.fail();
    await mount<typeof ThrowingRender>('app/broken-elements/ThrowingRender');
    // the error arrives after mount() resolved: give Lit's update a turn
    await new Promise(resolve => setTimeout(resolve, 300));
  });

  test('rejects a story id that does not exist', async ({ mount }) => {
    await expect(mount('app/nothing/Nothing')).rejects.toThrow('Unknown story');
  });
});
