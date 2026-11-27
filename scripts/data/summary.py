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
           rows per slot code, per gear category of a piece and per box of the Gear categories filter, pieces with no route,
           the inferred routes by activity, and the meals.
Each count is compared with the previous summary.json: any count that moved by more than DRIFT_SHARE (and DRIFT_MIN),
or appeared or went away, is printed as a warning to look into before committing. Nothing stops the run.

When the source commit has no line in docs/data-changelog.md yet, one is added: the commit date, the short commit,
its subject, and the rows and meals with their change since the previous summary. --no-changelog skips it (regen.py
--allow-dirty, whose data should not be committed).
"""

import argparse
import json
import subprocess
from argparse import ArgumentParser, Namespace
from collections.abc import Iterable, Mapping, Sequence
from pathlib import Path
from subprocess import CompletedProcess
from typing import TypeAlias, TypedDict, TypeVar

import provenance
from item_format import ROOT, ItemCell, ItemFormat, ItemRow, SchemaError, load_format, run_main, whole, whole_list
from provenance import Source

Counts: TypeAlias = Mapping[str, 'int | Counts']  # the counts of summary.json: whole numbers, and maps of them (by slot, by category, ...)


class ItemsDoc(TypedDict):
    """items.json as summarize() reads it: only the rows."""

    items: list[ItemRow]


class FoodDoc(TypedDict):
    """food.json as summarize() reads it: only the meals, which it counts."""

    foods: list[object]


class ItemReport(TypedDict):
    """What `gen_items.py --report` writes: the selection funnel and the inferred routes of the run, each a count by name."""

    itemSheetRows: int
    dropped: dict[str, int]
    leftOut: dict[str, int]
    dangling: dict[str, int]
    inferredPieces: dict[str, int]
    inferredCurrencies: dict[str, int]


class SummaryDoc(TypedDict):
    """summary.json as drift() reads the previous run: the counts, and the source they were made from."""

    counts: Counts
    source: Mapping[str, str]


CountKey = TypeVar('CountKey', int, str)

SUMMARY: Path = ROOT / 'src' / 'data' / 'summary.json'
CHANGELOG: Path = ROOT / 'docs' / 'data-changelog.md'
ITEMS, FOOD = ROOT / 'src' / 'data' / 'items.json', ROOT / 'src' / 'data' / 'food.json'
DRIFT_SHARE: float = 0.10  # a count that moves by more than this share of its old value is reported
DRIFT_MIN: int = 5  # ... and by more than this many, so small counts (4 seasonal event pieces) do not flag on noise


def csv_blobs(csv_dir: Path | str, sheets: list[str]) -> dict[str, str] | None:
    """{sheet: git blob id} of each sheets' CSV at the clone's HEAD, or None when git cannot tell (not a clone)."""
    try:
        run: CompletedProcess[str] = subprocess.run(
            ['git', '-C', str(csv_dir), 'ls-tree', 'HEAD', '--', *(f'{s}.csv' for s in sheets)],
            capture_output=True,
            text=True,
            check=False,
        )
    except OSError:  # git not installed
        return None
    if run.returncode != 0:
        return None
    blobs: dict[str, str] = {}
    for line in run.stdout.splitlines():
        meta, _, path = line.partition('\t')
        blobs[Path(path).stem] = meta.split()[2]
    return dict(sorted(blobs.items()))


def summarize(items_doc: ItemsDoc, food_doc: FoodDoc, report: ItemReport, fmt: ItemFormat) -> Counts:
    """The counts of summary.json (see the module docstring) from the generated item and food files and the item
    generator's report."""
    rows: list[Sequence[ItemCell]] = items_doc['items']
    field: dict[str, int] = {name: i for i, name in enumerate(fmt['itemRow']['fields'])}
    boxes: list[str] = [a['key'] for a in fmt['activities']] + ['market_board']
    categories: list[str] = [c['key'] for c in fmt['category']['list']]

    def count(keys: Iterable[CountKey]) -> dict[CountKey, int]:
        out: dict[CountKey, int] = {}
        for key in keys:
            out[key] = out.get(key, 0) + 1
        return dict(sorted(out.items()))

    def has_bit(routes: Iterable[int], bit: int) -> bool:
        return any(mask >> bit & 1 for mask in routes)

    return {
        'itemSheetRows': report['itemSheetRows'],
        'dropped': report['dropped'],
        'leftOut': report['leftOut'],
        'dangling': report['dangling'],
        'rows': len(rows),
        'maxIlvl': max((whole(r, field['ilvl']) for r in rows), default=0),
        'bySlot': {str(code): n for code, n in sorted(count(whole(r, field['slotCode']) for r in rows).items())},
        'byCategory': count(categories[whole(r, field['category'])] for r in rows),
        'byBox': {box: sum(1 for r in rows if has_bit(whole_list(r, field['routes']), bit)) for bit, box in enumerate(boxes)},
        'noRoute': sum(1 for r in rows if len(whole_list(r, field['routes'])) == 0),
        'inferredPieces': report['inferredPieces'],
        'inferredCurrencies': report['inferredCurrencies'],
        'meals': len(food_doc['foods']),
    }


def flatten(counts: Counts, prefix: str = '') -> dict[str, int]:
    """{'dropped.name': 1921, 'rows': 20031, ...}: the counts as one level, for comparing two summaries."""
    flat: dict[str, int] = {}
    for key, value in counts.items():
        if isinstance(value, Mapping):
            flat.update(flatten(value, f'{prefix}{key}.'))
        else:
            flat[f'{prefix}{key}'] = value
    return flat


def drift(old: Counts, new: Counts) -> list[str]:
    """The counts that moved by more than DRIFT_SHARE and DRIFT_MIN between two `counts`, or appeared or went away, as
    text such as 'byCategory.savage 1,117 -> 0 (-100%)'."""
    before, after = flatten(old), flatten(new)
    lines: list[str] = []
    for key in sorted(set(before) | set(after)):
        was, now = before.get(key), after.get(key)
        if was is None:
            lines.append(f'{key} new: {now:,}')
        elif now is None:
            lines.append(f'{key} gone (was {was:,})')
        elif abs(now - was) > max(DRIFT_SHARE * was, DRIFT_MIN):
            share: str = f' ({(now - was) / was:+.0%})' if was != 0 else ''
            lines.append(f'{key} {was:,} -> {now:,}{share}')
    return lines


def commit_subject(csv_dir: Path | str) -> str:
    """The subject line of the clone's HEAD commit, or ''."""
    try:
        run: CompletedProcess[str] = subprocess.run(
            ['git', '-C', str(csv_dir), 'log', '-1', '--format=%s'], capture_output=True, text=True, check=False
        )
    except OSError:
        return ''
    return run.stdout.strip() if run.returncode == 0 else ''


def total(counts: Counts, key: str) -> int:
    """The whole number under `key` in `counts` (rows, meals: a count, not a map of counts); raises SchemaError otherwise."""
    value: int | Counts = counts[key]
    if not isinstance(value, int):
        raise SchemaError(f'summary count {key!r} is {value!r}, expected a whole number')
    return value


def changelog_line(source: Source, subject: str, counts: Counts, old_counts: Counts | None) -> str:
    """One changelog line, for example '- 2026-09-30, `d9582a6` "TC 7.25 (#119)": 20,031 rows (+0), 296 meals (+0)'.
    old_counts: the previous summary's counts, or None (no change shown)."""

    def with_change(key: str, label: str) -> str:
        change: str = f' ({total(counts, key) - total(old_counts, key):+,})' if old_counts is not None and key in old_counts else ''
        return f'{total(counts, key):,} {label}{change}'

    title: str = f' "{subject}"' if subject != '' else ''
    return f'- {source["date"][:10]}, `{source["commit"][:7]}`{title}: {with_change("rows", "rows")}, {with_change("meals", "meals")}'


def main(
    csv_dir: Path | str, report_path: Path | str, changelog: bool = True, summary_path: Path = SUMMARY, changelog_path: Path = CHANGELOG
) -> None:
    """Write the summary, print the drift since the previous one, and add the changelog line (see the module
    docstring)."""
    fmt: ItemFormat = load_format()
    source: Source | None = provenance.detect(csv_dir)
    old: SummaryDoc | None = json.loads(summary_path.read_text(encoding='utf-8')) if summary_path.exists() else None
    items_doc: ItemsDoc = json.loads(ITEMS.read_text(encoding='utf-8'))
    food_doc: FoodDoc = json.loads(FOOD.read_text(encoding='utf-8'))
    report: ItemReport = json.loads(Path(report_path).read_text(encoding='utf-8'))
    import fetch  # here: fetch imports the gear modules, not needed by the helpers above

    counts: Mapping[str, int | Counts] = summarize(items_doc, food_doc, report, fmt)
    doc: dict[str, Mapping[str, int | Counts] | Source | dict[str, str] | int | str | None] = {
        '_generated': provenance.note(source),
        'source': source,
        'formatVersion': fmt['formatVersion'],
        'csv': csv_blobs(csv_dir, fetch.FILES),
        'counts': counts,
    }
    provenance.write_generated(summary_path, json.dumps(doc, indent=1, ensure_ascii=False) + '\n')

    # what moved since the previous run
    if old is not None:
        moved: list[str] = drift(old['counts'], counts)
        old_source: Mapping[str, str] | None = old.get('source')
        old_commit: str = 'unknown' if old_source is None else old_source.get('commit', 'unknown')
        since: str = f'the last run (commit {old_commit[:7]})'
        if len(moved) > 0:
            print(
                f'Warning: {len(moved)} count(s) moved by more than {DRIFT_SHARE:.0%} since {since}; look into each before committing: '
                + '; '.join(moved)
            )
        else:
            print(f'No count moved by more than {DRIFT_SHARE:.0%} since {since}.')

    # one changelog line per data update
    if changelog and bool(source) and changelog_path.exists():
        text: str = changelog_path.read_text(encoding='utf-8')
        if f'`{source["commit"][:7]}`' not in text:
            line: str = changelog_line(source, commit_subject(csv_dir), counts, old['counts'] if old is not None else None)
            text = text.rstrip('\n')
            gap = '\n' if text.splitlines()[-1].startswith('- ') else '\n\n'  # a blank line before the first entry
            provenance.write_generated(changelog_path, text + gap + line + '\n')
            print(f'Added to {changelog_path.name}: {line}')


if __name__ == '__main__':
    ap: ArgumentParser = argparse.ArgumentParser(description='Write src/data/summary.json and report how the counts moved.')
    _ = ap.add_argument('csv_dir')
    _ = ap.add_argument('report')
    _ = ap.add_argument('--no-changelog', action='store_true', help='do not add a line to docs/data-changelog.md')
    args: Namespace = ap.parse_args()
    run_main(main, args.csv_dir, args.report, not args.no_changelog)
