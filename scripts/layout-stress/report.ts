/* The HTML report of a stress run: one self-contained page, dark, with the findings, a table per screen and setup, and
   the breakpoint table. Pure: it turns the run's data into text. */
import { STRESS_ITEM_LEVEL, STRESS_LEVEL } from './build.ts';
import { RULES } from './rules.ts';

/* `text` safe to put in HTML. */
export function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* A list of window or width labels as short text: the first `limit`, then the number left. */
export function shortList(items, limit = 5) {
  return items.length <= limit ? items.join(', ') : `${items.slice(0, limit).join(', ')} and ${items.length - limit} more`;
}

/* Findings that are the same thing (rule, screen, view, setup, browser, place) in other windows, as one row with its windows:
   [{rule, severity, screen, view, setup, browser, where, detail, windows: [labels]}], failures first. The detail is that of
   the first window in numeric order (the numbers differ from window to window). The windows run at the same time and report
   in the order they finish, so the findings are sorted by window first: the same page gives the same rows on every run. */
export function groupFindings(findings) {
  const groups = new Map();
  const byWindow = [...findings].sort((a, b) => String(a.window).localeCompare(String(b.window), 'en', { numeric: true }));
  for (const item of byWindow) {
    const key = [item.rule, item.screen, item.view, item.setup, item.browser, item.where].join('|');
    const group = groups.get(key) ?? {
      rule: item.rule,
      severity: item.severity,
      screen: item.screen,
      view: item.view,
      setup: item.setup,
      browser: item.browser,
      where: item.where,
      detail: item.detail,
      windows: [],
    };
    if (!group.windows.includes(item.window)) {
      group.windows.push(item.window);
    }
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => {
    if (a.severity === b.severity) {
      return a.rule.localeCompare(b.rule);
    }
    return a.severity === 'fail' ? -1 : 1;
  });
}

/* The windows of one screen and setup in one browser, as table rows: {window, covers, fails, warns, rules}. */
export function windowRows(windowResults, { browser, screen, setup }) {
  return windowResults
    .filter(item => item.browser === browser && item.screen === screen && item.setup === setup)
    .map(item => ({
      window: item.window,
      covers: item.setups.map(entry => `${entry.physical} at ${entry.scale * 100}%`).join(', '),
      fails: item.findings.filter(finding => finding.severity === 'fail').length,
      warns: item.findings.filter(finding => finding.severity === 'warn').length,
      rules: [...new Set(item.findings.map(finding => finding.rule))].sort(),
    }))
    .sort((a, b) => Number.parseInt(a.window, 10) - Number.parseInt(b.window, 10));
}

const STYLE = `
body{background:#0d1517;color:#e5eeed;font:14px/1.45 system-ui,sans-serif;margin:20px auto;max-width:1400px;padding:0 16px}
h1,h2,h3{font-weight:600}h2{margin-top:32px;border-bottom:1px solid #2b3d40;padding-bottom:4px}h3{margin:20px 0 6px}
table{border-collapse:collapse;margin:6px 0 14px;width:100%}th,td{border:1px solid #2b3d40;padding:4px 8px;text-align:left;vertical-align:top;font-size:.82rem}
th{background:#142023}.n{color:#92a5a5}.fail{background:#3b1c19}.warn{background:#3a3220}.pass{background:#17301f}
code{background:#142023;padding:1px 4px;border-radius:3px}ul{margin:4px 0}li{margin:2px 0}
`;

/* The whole report. `run` is what index.ts collected. */
export function renderReport(run) {
  const {
    options,
    waiting,
    setups,
    windows,
    heights,
    findings,
    knownLines,
    staleLines,
    breakpoints,
    windowResults,
    browserNotes,
    seconds,
    pageFonts,
  } = run;
  const fails = findings.filter(item => item.severity === 'fail').length;
  const warns = findings.filter(item => item.severity === 'warn').length;
  const html = [];
  html.push(`<!doctype html><meta charset="utf-8"><title>Layout stress report</title><style>${STYLE}</style>`);
  html.push('<h1>Layout stress report</h1>');
  html.push(
    `<p>${fails} failure(s), ${warns} warning(s), ${knownLines.length} known failure(s). Browsers: ${escapeHtml(options.browsers.join(', '))}. Screens: ${escapeHtml(
      run.screens
        .filter(screen => !screen.waiting)
        .map(screen => screen.id)
        .join(', '),
    )}. Setups: ${escapeHtml(setups.map(setup => setup.label).join('; '))}. ${windows.length} windows, sweep heights ${heights.join(', ')} px${options.quick ? ' (quick run)' : ''}. ${seconds} s. Dark theme only.</p>`,
  );
  html.push('<h2>What this run did and did not do</h2><ul>');
  let pageFontsText = 'were not asked for';
  if (pageFonts === true) {
    pageFontsText = 'loaded (Google Fonts was reachable)';
  } else if (pageFonts === false) {
    pageFontsText = 'did NOT load (no network): the "page fonts" setup shows the fallback stack';
  }
  html.push(`<li>The page fonts ${pageFontsText}.</li>`);
  html.push(
    `<li>The stress setup is a build with the level limit ${STRESS_LEVEL} and the item level limit ${STRESS_ITEM_LEVEL} (a private copy; the repo's source is untouched), visited in the matrix's windows only.</li>`,
  );
  html.push(
    '<li>Customizable selects (<code>appearance: base-select</code>) exist in Chromium only; Firefox and WebKit show their own list there, so those lists are not compared across browsers.</li>',
  );
  html.push(
    '<li>The focus-ring walk runs in the page-fonts and stress setups only; the sweeps change the window by resizing one page, then load a page fresh at the change points and every eighth coarse width and compare.</li>',
  );
  for (const screen of waiting) {
    html.push(`<li>${escapeHtml(screen.label)} (${escapeHtml(screen.id)}): ${escapeHtml(screen.waiting)}.</li>`);
  }
  for (const note of browserNotes) {
    html.push(`<li>${escapeHtml(note.browser)} did not start: ${escapeHtml(note.error)}</li>`);
  }
  html.push('</ul>');

  if (knownLines.length || staleLines.length) {
    html.push('<h2>Known failures</h2><ul>');
    for (const line of [...knownLines, ...staleLines]) {
      html.push(`<li>${escapeHtml(line)}</li>`);
    }
    html.push('</ul>');
  }

  html.push(`<h2>Findings</h2>`);
  const groups = groupFindings(findings);
  if (!groups.length) {
    html.push('<p class="n">none</p>');
  } else {
    html.push(
      '<table><tr><th>Severity</th><th>Rule</th><th>Screen / view</th><th>Setup</th><th>Browser</th><th>Window or width</th><th>Where and what</th></tr>',
    );
    for (const group of groups) {
      html.push(
        `<tr class="${group.severity}"><td>${group.severity}</td><td>${escapeHtml(group.rule)}</td><td>${escapeHtml(group.screen)} / ${escapeHtml(group.view)}</td><td>${escapeHtml(group.setup)}</td><td>${escapeHtml(group.browser)}</td><td>${escapeHtml(shortList(group.windows))}</td><td>${escapeHtml(group.where)}: ${escapeHtml(group.detail)}</td></tr>`,
      );
    }
    html.push('</table>');
  }

  html.push('<h2>Windows, per browser, screen and setup</h2>');
  for (const browser of options.browsers) {
    for (const screen of run.screens.filter(item => !item.waiting)) {
      for (const setup of setups) {
        const rows = windowRows(windowResults, { browser, screen: screen.id, setup: setup.id });
        if (!rows.length) {
          continue;
        }
        html.push(
          `<h3>${escapeHtml(browser)}, ${escapeHtml(screen.label)}, ${escapeHtml(setup.label)}</h3><table><tr><th>Window</th><th>Screens it stands for</th><th>Failures</th><th>Warnings</th><th>Rules</th></tr>`,
        );
        for (const row of rows) {
          let rowClass = 'pass';
          if (row.fails) {
            rowClass = 'fail';
          } else if (row.warns) {
            rowClass = 'warn';
          }
          html.push(
            `<tr class="${rowClass}"><td>${row.window}</td><td class="n">${escapeHtml(row.covers || 'quick set')}</td><td>${row.fails}</td><td>${row.warns}</td><td>${escapeHtml(row.rules.join(', '))}</td></tr>`,
          );
        }
        html.push('</table>');
      }
    }
  }

  html.push(
    '<h2>Breakpoints: widths where the layout changes</h2><p class="n">Each width is the first of the new layout (the layout one pixel below is the old one). A width sweep from 960 to 2560 px, a coarse step, every change bisected to 1 px. A change that goes away again inside one step is missed.</p>',
  );
  for (const item of breakpoints.filter(entry => entry.changes.length || true)) {
    html.push(
      `<h3>${escapeHtml(item.browser)}, ${escapeHtml(item.screen)} / ${escapeHtml(item.view)}, ${escapeHtml(item.setup)}, ${item.height} px high <span class="n">(${item.measured} widths measured)</span></h3>`,
    );
    if (!item.changes.length) {
      html.push('<p class="n">no change: one layout across the range</p>');
    } else {
      html.push('<table><tr><th>At width</th><th>What changes</th></tr>');
      for (const change of item.changes) {
        html.push(`<tr><td><b>${change.at} px</b></td><td>${change.changes.map(escapeHtml).join('<br>')}</td></tr>`);
      }
      html.push('</table>');
    }
  }

  html.push('<h2>Rules</h2><table><tr><th>Rule</th><th>Severity</th><th>What it checks</th></tr>');
  for (const [id, [severity, text]] of Object.entries(RULES)) {
    html.push(`<tr><td>${id}</td><td>${severity}</td><td>${escapeHtml(text)}</td></tr>`);
  }
  html.push('</table>');
  return html.join('\n');
}
