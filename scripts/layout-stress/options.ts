/* The command line of `npm run stress:layout`. Pure: it reads an argument list and returns the options or an error text. */
import { SCREENS, defaultScreenIds } from './targets.ts';

/* The browsers the tool can launch (Playwright's names). */
export const BROWSER_NAMES = Object.freeze(['chromium', 'firefox', 'webkit']);

/* The usage text. */
export const USAGE = `usage: npm run stress:layout -- [options]
  --screens=a,b     screens to visit: ${SCREENS.map(screen => screen.id).join(', ')} (default: every screen that is built)
  --browsers=a,b    ${BROWSER_NAMES.join(', ')} (default: chromium)
  --fonts           also run the font and text setups: Google Fonts blocked, Verdana, 125%, 150% and 200% text
  --quick           four windows, one sweep height, a coarse sweep: a fast run
  --report=path     where to write the HTML report (default: <temporary folder>/layout-stress/report.html)
  --workers=n       pages measured at once (default 4)
  --no-stress       leave out the build with level 888 and item level 8888
  --keep            keep the private builds in the temporary folder
  --rules           print the rules and exit`;

/* The options `argv` (the arguments after the command) names, as {screens, browsers, fonts, quick, report, workers,
   stress, keep, rules}, or {error} with a text that says what is wrong. A screen that waits for the math bar port is
   accepted by name and visited as "waiting". */
export function parseArgs(argv) {
  const options = {
    screens: defaultScreenIds(),
    browsers: ['chromium'],
    fonts: false,
    quick: false,
    report: null,
    workers: 4,
    stress: true,
    keep: false,
    rules: false,
  };
  for (const argument of argv) {
    const [name, value] = argument.startsWith('--') ? argument.slice(2).split(/=(.*)/s, 2) : [argument, undefined];
    if (name === 'fonts') {
      options.fonts = true;
    } else if (name === 'quick') {
      options.quick = true;
    } else if (name === 'keep') {
      options.keep = true;
    } else if (name === 'rules') {
      options.rules = true;
    } else if (name === 'no-stress') {
      options.stress = false;
    } else if (name === 'report' && value) {
      options.report = value;
    } else if (name === 'workers' && /^\d+$/.test(value ?? '') && Number(value) > 0) {
      options.workers = Number(value);
    } else if ((name === 'screens' || name === 'browsers') && value) {
      const names = value.split(',').filter(Boolean);
      const known = name === 'screens' ? SCREENS.map(screen => screen.id) : BROWSER_NAMES;
      const unknown = names.filter(item => !known.includes(item));
      if (unknown.length) {
        return { error: `unknown ${name === 'screens' ? 'screen' : 'browser'} ${unknown.join(', ')}; the choices are ${known.join(', ')}` };
      }
      options[name] = names;
    } else {
      return { error: `unknown option ${argument}` };
    }
  }
  return options;
}
