/* Putting a component together from parts (src/ui/components/compose.js): one member name, one part. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compose } from '../../../../src/ui/components/compose.js';

test('compose: a member defined by two parts is an error that names it', () => {
  assert.throws(() => compose({ open() {} }, { open() {} }), /Two parts both define "open"/);
  assert.throws(
    () =>
      compose(
        {
          get view() {
            return 1;
          },
        },
        { view: 2 },
      ),
    /Two parts both define "view"/,
  );
});

test('compose: members of different parts are all kept, and a getter stays a getter', () => {
  let reads = 0;
  const part = {
    get live() {
      reads += 1;
      return reads;
    },
  };
  const component = compose(part, { other: 7 });
  assert.equal(component.other, 7);
  assert.equal(component.live, 1);
  assert.equal(component.live, 2);
});
