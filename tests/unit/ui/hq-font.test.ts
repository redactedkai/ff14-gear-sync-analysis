/* The HQ mark's font loader (src/ui/hq-font.ts): the class is added only when a face loaded. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enableHqFont, HQ_FONT_CLASS, HQ_GLYPH } from '../../../src/ui/hq-font.ts';

const rootWithClasses = () => {
  const added: string[] = [];
  return { added, classList: { add: (name: string) => added.push(name) } };
};

test('a loaded face adds the class, asking for the HQ glyph', async () => {
  const asked: string[][] = [];
  const root = rootWithClasses();
  const load = (font: string, text: string) => {
    asked.push([font, text]);
    return Promise.resolve([1]);
  };
  await enableHqFont({ load }, root);
  assert.deepEqual(root.added, [HQ_FONT_CLASS]);
  assert.deepEqual(asked, [['16px FFXIV_Lodestone_SSF', HQ_GLYPH]]);
  assert.equal(HQ_GLYPH.charCodeAt(0), 0xe03c);
});

test('no face, a rejected load, a throwing load or no font API keep the text', async () => {
  for (const fonts of [
    { load: () => Promise.resolve([]) },
    { load: () => Promise.reject(new Error('network')) },
    {
      load: () => {
        throw new Error('syntax');
      },
    },
    undefined,
  ]) {
    const root = rootWithClasses();
    await enableHqFont(fonts, root);
    assert.deepEqual(root.added, []);
  }
});
