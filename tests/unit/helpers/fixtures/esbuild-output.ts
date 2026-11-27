/* The text of a built file, for the tests that build the page with esbuild (write: false). */
import type { OutputFile } from 'esbuild';

/* The text of the first output file of `result` whose path ends with `extension` ('.js' by default); fails when the build made none. */
export function outputText(result: { outputFiles: OutputFile[] }, extension = '.js'): string {
  const file = result.outputFiles.find(each => each.path.endsWith(extension));
  if (!file) {
    throw new Error(`the build made no ${extension} file`);
  }
  return file.text;
}
