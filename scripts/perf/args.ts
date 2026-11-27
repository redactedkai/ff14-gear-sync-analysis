/* Command line options shared by the perf scripts, all in one style: `--name value` options and bare `--name` flags.
   For example `node scripts/perf/bench.ts --jobs SGE,WAR --repeats 3 --quick`. */

/* The text after `--name`, or `dflt` when the option is not given. */
export function option(name: string, dflt: string | null = null): string | null {
  const at = process.argv.indexOf(`--${name}`);
  return at < 0 ? dflt : (process.argv[at + 1] ?? dflt);
}

/* `--name` as a number, or `dflt` when not given. */
export function numberOption(name: string, dflt: number): number {
  const value = option(name);
  return value === null ? dflt : Number(value);
}

/* `--name a,b,c` as ['a', 'b', 'c'], or `dflt` when not given. */
export function listOption(name: string, dflt: string[]): string[] {
  const value = option(name);
  return value ? value.split(',') : dflt;
}

/* True when the bare flag `--name` is given. */
export function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}
