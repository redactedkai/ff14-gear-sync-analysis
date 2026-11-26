/* The screenshot baseline wrapper (scripts/visual.mjs): it runs only in the pinned image, does nothing with a clear
   message elsewhere or before baselines exist, and the pinned image is the one the workflow and the lock file name. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { VIEWS } from '../../../scripts/shots/views.mjs';
import { IMAGE_ENV, PINNED_IMAGE, hasBaselines, pinnedTag, plan } from '../../../scripts/visual.mjs';

const ROOT = join(import.meta.dirname, '..', '..', '..');
const read = relative => readFileSync(join(ROOT, relative), 'utf8');

/* A folder with one baseline image in it, and an empty one. */
function foldersWithAndWithoutBaselines() {
  const withImage = mkdtempSync(join(tmpdir(), 'visual-test-'));
  writeFileSync(join(withImage, 'a-dark.png'), '');
  return { withImage, empty: mkdtempSync(join(tmpdir(), 'visual-test-')) };
}

test('outside the pinned image: nothing runs and the message names the image', () => {
  const { withImage } = foldersWithAndWithoutBaselines();
  const decision = plan({ env: {}, argv: ['--update'], snapshotFolder: withImage });
  assert.equal(decision.run, false);
  assert.ok(decision.message.includes(PINNED_IMAGE));
});

test('in the pinned image: no baselines yet is a message, baselines run, --update runs without them', () => {
  const { withImage, empty } = foldersWithAndWithoutBaselines();
  const env = { [IMAGE_ENV]: pinnedTag() };
  assert.equal(hasBaselines(empty), false);
  assert.equal(plan({ env, argv: [], snapshotFolder: empty }).run, false);
  assert.deepEqual(plan({ env, argv: [], snapshotFolder: withImage }), { run: true, update: false });
  assert.deepEqual(plan({ env, argv: ['--update'], snapshotFolder: empty }), { run: true, update: true });
});

test('--local needs its own scratch folder, so the committed baselines are never touched', () => {
  const { empty } = foldersWithAndWithoutBaselines();
  assert.equal(plan({ env: {}, argv: ['--local', '--update'], snapshotFolder: empty }).run, false);
  const env = { GSA_VISUAL_SNAPSHOTS: empty };
  assert.deepEqual(plan({ env, argv: ['--local', '--update'], snapshotFolder: empty }), { run: true, update: true });
});

test('the pinned image carries the Playwright version of the lock file and is the one the workflow runs in', () => {
  const lockedVersion = JSON.parse(read('package-lock.json')).packages['node_modules/playwright'].version;
  assert.equal(pinnedTag().startsWith(`v${lockedVersion}-`), true, `image ${PINNED_IMAGE} against Playwright ${lockedVersion}`);
  const workflow = read('.github/workflows/visual.yml');
  const images = [...workflow.matchAll(/image: (\S+)/g)].map(match => match[1]);
  assert.ok(images.length >= 2, 'both jobs run in a container');
  for (const image of images) {
    assert.equal(image, PINNED_IMAGE);
  }
  const tags = [...workflow.matchAll(new RegExp(`${IMAGE_ENV}: (\\S+)`, 'g'))].map(match => match[1]);
  assert.deepEqual(
    tags,
    images.map(() => pinnedTag()),
  );
});

test('test:visual is its own script and is not part of check', () => {
  const scripts = JSON.parse(read('package.json')).scripts;
  assert.equal(scripts['test:visual'], 'node scripts/visual.mjs');
  assert.equal(scripts.check.includes('visual'), false);
  assert.equal(scripts['check:all'].includes('visual'), false);
});

test('the view list: numbered names that stay unique, and the counts the docs and headers give', () => {
  const names = Object.keys(VIEWS);
  for (const name of names) {
    assert.match(name, /^\d\d-[a-z0-9-]+$/, `view name ${name}`);
  }
  assert.equal(new Set(names.map(name => name.slice(0, 2))).size, names.length, 'two views share a number');
  const testing = read('docs/engineering/testing.md');
  assert.ok(testing.includes(`${names.length} views) at 1440 and 960 px wide`), `testing.md names ${names.length} views for the baselines`);
  assert.ok(testing.includes(`${names.length * 2} images expected`), `testing.md names ${names.length * 2} baseline images`);
  assert.ok(testing.includes(`${names.length * 4} shots for the ${names.length} views`), `testing.md names ${names.length * 4} shots`);
  assert.ok(read('scripts/shots/shots.mjs').includes(`${names.length} views, ${names.length * 4} shots`), 'shots.mjs header count');
  assert.ok(read('tests/visual/screens.spec.mjs').includes(`${names.length * 2} baselines`), 'screens.spec.mjs header count');
});
