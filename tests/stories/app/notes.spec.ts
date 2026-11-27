/* Story of <gsa-notes>: a note is announced in the polite status line and clears itself when its time is up, a failed save's message
   stays in the alert line, and axe. The element has no key of its own (it holds no control). The clock is Playwright's, so the test
   waits for the note's time without waiting in real time; the timer's own rules are note-timer's Node test. */
import { NOTE_MS } from '../../../src/ui/elements/app/note-timer.ts';
import { expect, test } from '../fixtures.ts';
import { NOTE_TEXT, SAVE_MESSAGE, type Default } from './notes.story.ts';

const STORY = 'app/notes/Default';

test.describe('<gsa-notes>', () => {
  test('a note shows in the status line and clears itself after its time; a failed save stays in the alert line', async ({
    mount,
    page,
  }) => {
    // the clock stands still after install, so only runFor moves it
    await page.clock.install({ time: 0 });
    await page.clock.pauseAt(1000);
    const component = await mount<typeof Default>(STORY);
    const status = page.getByRole('status');
    const alert = page.getByRole('alert');
    await expect(status).toBeEmpty();
    await expect(alert).toBeEmpty();

    await page.getByRole('button', { name: 'Say a note' }).click();
    await page.getByRole('button', { name: 'Fail a save' }).click();
    await expect(status).toHaveText(NOTE_TEXT);
    await expect(alert).toHaveText(SAVE_MESSAGE);

    // just before its time the note is still there; after it the element says so and the page clears the note
    await page.clock.runFor(NOTE_MS - 1);
    await expect(status).toHaveText(NOTE_TEXT);
    await page.clock.runFor(1);
    await expect(status).toBeEmpty();
    await expect(component.getByTestId('events')).toHaveText('["note-expire"]');
    await expect(alert).toHaveText(SAVE_MESSAGE);
  });

  test('has no axe violations, with a note and a message shown', async ({ mount, page, axe }) => {
    await mount<typeof Default>(STORY);
    expect(await axe(), 'empty').toEqual([]);
    await page.getByRole('button', { name: 'Say a note' }).click();
    await page.getByRole('button', { name: 'Fail a save' }).click();
    await expect(page.getByRole('status')).toHaveText(NOTE_TEXT);
    expect(await axe(), 'shown').toEqual([]);
  });
});
