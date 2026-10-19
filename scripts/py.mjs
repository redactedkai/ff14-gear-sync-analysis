// Run Python with the given arguments: `node scripts/py.mjs -m ruff check .`.
// The npm scripts go through this because the command name differs by system: stock macOS and many Linux
// distributions have only `python3`, while Windows usually has only `python` (its `python3` is often the
// Microsoft Store stub). So try the usual name for this system first, then the other. An active virtual
// environment provides both names, so it is used either way.
// Exits with Python's exit code, so a failing test or lint run still fails the npm script.
import { spawnSync } from 'node:child_process';

const PYTHON_NAMES = process.platform === 'win32' ? ['python', 'python3'] : ['python3', 'python'];
const pythonArgs = process.argv.slice(2);

for (const pythonName of PYTHON_NAMES) {
  const result = spawnSync(pythonName, pythonArgs, { stdio: 'inherit' });
  // not installed under this name: try the next one
  if (result.error?.code === 'ENOENT') continue;
  if (result.error) throw result.error;
  // killed by a signal: status is null, so report a failure
  process.exit(result.status ?? 1);
}

console.error(`error: no Python found on PATH (tried ${PYTHON_NAMES.join(', ')}). Install Python 3, or activate a virtual environment.`);
process.exit(1);
