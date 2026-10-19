"""Which xivapi/ffxiv-datamining commit the generated data comes from.

detect(csv_dir) asks git for the commit of the clone that holds the CSVs. It returns None when the directory is not
inside a git clone of ffxiv-datamining (for example test fixtures), so a fixture inside this project's own repo is
not mistaken for game data.
"""

import json
import subprocess

REPO = 'xivapi/ffxiv-datamining'


def _git(csv_dir, *args):
    r = subprocess.run(['git', '-C', str(csv_dir), *args], capture_output=True, text=True)
    return r.stdout.strip() if r.returncode == 0 else None


def detect(csv_dir):
    """{'repo', 'commit', 'date'} for the clone containing csv_dir, or None."""
    try:
        url = _git(csv_dir, 'remote', 'get-url', 'origin') or ''
        if 'ffxiv-datamining' not in url:
            return None
        out = _git(csv_dir, 'log', '-1', '--format=%H %cI')
    except OSError:  # git not installed
        return None
    if not out:
        return None
    commit, date = out.split(' ', 1)
    return make(commit, date)


def local_edits(csv_dir):
    """The tracked files changed in the clone containing csv_dir since its commit (git status --porcelain lines, for
    example ' M csv/en/Item.csv'), [] when it is clean, or None when git cannot tell. The provenance names the commit
    only, so data generated from an edited clone would claim to be that commit's."""
    try:
        r = subprocess.run(['git', '-C', str(csv_dir), 'status', '--porcelain', '--untracked-files=no'], capture_output=True, text=True)
    except OSError:  # git not installed
        return None
    return [line for line in r.stdout.splitlines() if line.strip()] if r.returncode == 0 else None


def make(commit, date):
    return {'repo': REPO, 'commit': commit, 'date': date}


def note(source):
    """One-line notice naming the source commit, written as a generated JSON file's "_generated" field."""
    if source is None:
        return 'GENERATED from xivapi/ffxiv-datamining (commit unknown). Do not edit; see docs/engineering/data-pipeline.md.'
    return f'GENERATED from {source["repo"]} {source["commit"]} ({source["date"]}). Do not edit; see docs/engineering/data-pipeline.md.'


def add_cli_args(parser):
    parser.add_argument('--source-commit', help='datamining commit sha (default: detect from the CSV directory)')
    parser.add_argument('--source-date', help='datamining commit date, ISO 8601')


def from_args(args):
    """Provenance from --source-commit/--source-date, else detected from the CSV directory."""
    if args.source_commit:
        return make(args.source_commit, args.source_date)
    return detect(args.csv_dir)


def json_lines(doc, expand=(), ensure_ascii=True):
    """`doc` (a dict) as JSON text with one top-level key per line, and, for each key in `expand`, one entry of its list
    or dict per line; everything else is compact. So a patch's diff of a generated file shows the rows that changed
    (an item, a stat's budget column, a level) instead of one changed line holding the whole file. Parses to the same
    value as json.dumps(doc); the page bundle (esbuild) minifies it, so the built page does not grow."""

    def compact(value):
        return json.dumps(value, ensure_ascii=ensure_ascii, separators=(',', ':'))

    lines = []
    for key, value in doc.items():
        head = compact(key) + ':'
        if key in expand and isinstance(value, dict) and value:
            entries = [compact(k) + ':' + compact(v) for k, v in value.items()]
            lines.append(head + '{\n' + ',\n'.join(entries) + '\n}')
        elif key in expand and isinstance(value, list) and value:
            lines.append(head + '[\n' + ',\n'.join(compact(v) for v in value) + '\n]')
        else:
            lines.append(head + compact(value))
    return '{\n' + ',\n'.join(lines) + '\n}\n'


def write_generated(out, js):
    """Write a generated file as UTF-8 with LF line endings on every platform (the repo stores LF)."""
    with open(out, 'w', encoding='utf-8', newline='\n') as f:
        f.write(js)
