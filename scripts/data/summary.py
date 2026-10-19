#!/usr/bin/env python3
"""Write src/data/summary.json, compare it with the previous one, and log a data update in docs/data-changelog.md.

Usage: python scripts/data/summary.py <path-to-ffxiv-datamining>/csv/en <report.json> [--no-changelog]
  report.json: what gen_items.py --report wrote (the selection funnel and the inferred routes of this run).

regen.py runs it after the generators. summary.json is committed with the data and holds:
  source, formatVersion : as in the other generated files;
  csv    : {sheet: git blob id} of each CSV the generators read (fetch.FILES), so the exact input files are named, not
           only the commit (`git ls-tree <commit> csv/en` gives the same ids);
  counts : the counts a game patch could move without any check failing: the funnel of the item database (Item.csv
           rows, rows each rule left out, LEFT_OUT categories, dangling ids), the rows kept, the highest item level,
           rows per slot code, per gear category and per "Gear from" box, pieces with no route, the inferred routes
           by activity, and the meals.
Each count is compared with the previous summary.json: any count that moved by more than DRIFT_SHARE (and DRIFT_MIN),
or appeared or went away, is printed as a warning to look into before committing. Nothing stops the run.

When the source commit has no line in docs/data-changelog.md yet, one is added: the commit date, the short commit,
its subject, and the rows and meals with their change since the previous summary. --no-changelog skips it (regen.py
--allow-dirty, whose data should not be committed).
"""

import argparse
import json
import subprocess
from pathlib import Path

import provenance
from item_format import ROOT, load_format, run_main

SUMMARY = ROOT / 'src' / 'data' / 'summary.json'
CHANGELOG = ROOT / 'docs' / 'data-changelog.md'
ITEMS, FOOD = ROOT / 'src' / 'data' / 'items.json', ROOT / 'src' / 'data' / 'food.json'
DRIFT_SHARE = 0.10  # a count that moves by more than this share of its old value is reported
DRIFT_MIN = 5  # ... and by more than this many, so small counts (4 seasonal event pieces) do not flag on noise


def csv_blobs(csv_dir, sheets):
    """{sheet: git blob id} of each sheets' CSV at the clone's HEAD, or None when git cannot tell (not a clone)."""
    try:
        run = subprocess.run(
            ['git', '-C', str(csv_dir), 'ls-tree', 'HEAD', '--', *(f'{s}.csv' for s in sheets)], capture_output=True, text=True
        )
    except OSError:  # git not installed
        return None
    if run.returncode:
        return None
    blobs = {}
    for line in run.stdout.splitlines():
        meta, _, path = line.partition('\t')
        blobs[Path(path).stem] = meta.split()[2]
    return dict(sorted(blobs.items()))


def summarize(items_doc, food_doc, report, fmt):
    """The counts of summary.json (see the module docstring) from the generated item and food files and the item
    generator's report."""
    rows = items_doc['items']
    field = {name: i for i, name in enumerate(fmt['itemRow']['fields'])}
    boxes = [a['key'] for a in fmt['activities']] + ['market_board']
    categories = [c['key'] for c in fmt['category']['list']]

    def count(keys):
        out = {}
        for key in keys:
            out[key] = out.get(key, 0) + 1
        return dict(sorted(out.items()))

    def has_bit(routes, bit):
        return any(mask >> bit & 1 for mask in routes)

    return {
        'itemSheetRows': report['itemSheetRows'],
        'dropped': report['dropped'],
        'leftOut': report['leftOut'],
        'dangling': report['dangling'],
        'rows': len(rows),
        'maxIlvl': max((r[field['ilvl']] for r in rows), default=0),
        'bySlot': {str(code): n for code, n in sorted(count(r[field['slotCode']] for r in rows).items())},
        'byCategory': count(categories[r[field['category']]] for r in rows),
        'byBox': {box: sum(1 for r in rows if has_bit(r[field['routes']], bit)) for bit, box in enumerate(boxes)},
        'noRoute': sum(1 for r in rows if not r[field['routes']]),
        'inferredPieces': report['inferredPieces'],
        'inferredCurrencies': report['inferredCurrencies'],
        'meals': len(food_doc['foods']),
    }


def flatten(counts, prefix=''):
    """{'dropped.name': 1921, 'rows': 20031, ...}: the counts as one level, for comparing two summaries."""
    flat = {}
    for key, value in counts.items():
        if isinstance(value, dict):
            flat.update(flatten(value, f'{prefix}{key}.'))
        else:
            flat[f'{prefix}{key}'] = value
    return flat


def drift(old, new):
    """The counts that moved by more than DRIFT_SHARE and DRIFT_MIN between two `counts`, or appeared or went away, as
    text such as 'byCategory.savage 1,117 -> 0 (-100%)'."""
    before, after = flatten(old), flatten(new)
    lines = []
    for key in sorted(set(before) | set(after)):
        was, now = before.get(key), after.get(key)
        if was is None:
            lines.append(f'{key} new: {now:,}')
        elif now is None:
            lines.append(f'{key} gone (was {was:,})')
        elif abs(now - was) > max(DRIFT_SHARE * was, DRIFT_MIN):
            share = f' ({(now - was) / was:+.0%})' if was else ''
            lines.append(f'{key} {was:,} -> {now:,}{share}')
    return lines


def commit_subject(csv_dir):
    """The subject line of the clone's HEAD commit, or ''."""
    try:
        run = subprocess.run(['git', '-C', str(csv_dir), 'log', '-1', '--format=%s'], capture_output=True, text=True)
    except OSError:
        return ''
    return run.stdout.strip() if run.returncode == 0 else ''


def changelog_line(source, subject, counts, old_counts):
    """One changelog line, for example '- 2026-09-30, `d9582a6` "TC 7.25 (#119)": 20,031 rows (+0), 296 meals (+0)'.
    old_counts: the previous summary's counts, or None (no change shown)."""

    def with_change(key, label):
        change = f' ({counts[key] - old_counts[key]:+,})' if old_counts and key in old_counts else ''
        return f'{counts[key]:,} {label}{change}'

    title = f' "{subject}"' if subject else ''
    return f'- {source["date"][:10]}, `{source["commit"][:7]}`{title}: {with_change("rows", "rows")}, {with_change("meals", "meals")}'


def main(csv_dir, report_path, changelog=True, summary_path=SUMMARY, changelog_path=CHANGELOG):
    """Write the summary, print the drift since the previous one, and add the changelog line (see the module
    docstring)."""
    fmt = load_format()
    source = provenance.detect(csv_dir)
    old = json.loads(summary_path.read_text(encoding='utf-8')) if summary_path.exists() else None
    items_doc = json.loads(ITEMS.read_text(encoding='utf-8'))
    food_doc = json.loads(FOOD.read_text(encoding='utf-8'))
    report = json.loads(Path(report_path).read_text(encoding='utf-8'))
    import fetch  # here: fetch imports the gear modules, not needed by the helpers above

    counts = summarize(items_doc, food_doc, report, fmt)
    doc = {
        '_generated': provenance.note(source),
        'source': source,
        'formatVersion': fmt['formatVersion'],
        'csv': csv_blobs(csv_dir, fetch.FILES),
        'counts': counts,
    }
    provenance.write_generated(summary_path, json.dumps(doc, indent=1, ensure_ascii=False) + '\n')

    # what moved since the previous run
    if old is not None:
        moved = drift(old['counts'], counts)
        since = f'the last run (commit {(old.get("source") or {}).get("commit", "unknown")[:7]})'
        if moved:
            print(
                f'Warning: {len(moved)} count(s) moved by more than {DRIFT_SHARE:.0%} since {since}; look into each before committing: '
                + '; '.join(moved)
            )
        else:
            print(f'No count moved by more than {DRIFT_SHARE:.0%} since {since}.')

    # one changelog line per data update
    if changelog and source and changelog_path.exists():
        text = changelog_path.read_text(encoding='utf-8')
        if f'`{source["commit"][:7]}`' not in text:
            line = changelog_line(source, commit_subject(csv_dir), counts, old and old['counts'])
            text = text.rstrip('\n')
            gap = '\n' if text.splitlines()[-1].startswith('- ') else '\n\n'  # a blank line before the first entry
            provenance.write_generated(changelog_path, text + gap + line + '\n')
            print(f'Added to {changelog_path.name}: {line}')


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description='Write src/data/summary.json and report how the counts moved.')
    ap.add_argument('csv_dir')
    ap.add_argument('report')
    ap.add_argument('--no-changelog', action='store_true', help='do not add a line to docs/data-changelog.md')
    args = ap.parse_args()
    run_main(main, args.csv_dir, args.report, not args.no_changelog)
