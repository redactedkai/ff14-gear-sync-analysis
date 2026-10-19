/* Command line options shared by the perf scripts, all in one style: `--name value` options and bare `--name` flags.
   For example `node scripts/perf/bench.mjs --jobs SGE,WAR --repeats 3 --quick`. */

/* The text after `--name`, or `dflt` when the option is not given. */
export function option(name, dflt = null) {
  const at = process.argv.indexOf(`--${name}`);
  return at < 0 ? dflt : process.argv[at + 1];
}

/* `--name` as a number, or `dflt` when not given. */
export function numberOption(name, dflt) {
  const value = option(name);
  return value === null ? dflt : Number(value);
}

/* `--name a,b,c` as ['a', 'b', 'c'], or `dflt` when not given. */
export function listOption(name, dflt) {
  const value = option(name);
  return value ? value.split(',') : dflt;
}

/* True when the bare flag `--name` is given. */
export function flag(name) {
  return process.argv.includes(`--${name}`);
}
