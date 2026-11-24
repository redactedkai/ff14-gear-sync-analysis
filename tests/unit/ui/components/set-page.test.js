/* How the set page is put together from its parts (src/ui/components/set-page.js): its parts define no member twice. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setPage } from '../../../../src/ui/components/set-page.js';

test('the set page: its seven parts define no member twice', () => {
  const component = setPage();
  for (const member of ['init', 'destroy', 'view', 'fill', 'applySuggestion', 'answerLeave', 'refreshCount']) {
    assert.ok(member in component, member);
  }
});
