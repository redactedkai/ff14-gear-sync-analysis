import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMarks } from '../../scripts/build/build.mjs';

/* A build marks itself as a test build everywhere but main (CLAUDE.md, Branches). */
test('build marks: none on main or an unknown branch; STAGING on staging; DEV elsewhere, with branch and commit', () => {
  assert.deepEqual(buildMarks({ branch: 'main', commit: 'abc1234' }), { badge: '', footer: '' });
  assert.deepEqual(buildMarks({ branch: null, commit: null }), { badge: '', footer: '' });
  const staging = buildMarks({ branch: 'staging', commit: 'abc1234' });
  assert.match(staging.badge, />STAGING</);
  assert.match(staging.footer, /STAGING build: staging @ abc1234/);
  const dev = buildMarks({ branch: 'dev', commit: null });
  assert.match(dev.badge, />DEV</);
  assert.match(dev.footer, /DEV build: dev</);
  assert.match(buildMarks({ branch: 'feature/<x>', commit: 'f' }).footer, /feature\/&#60;x&#62;/); // escaped
});
