"""Which xivapi/ffxiv-datamining commit the generated data comes from.

detect(csv_dir) asks git for the commit of the clone that holds the CSVs. It returns None when the directory is not
inside a git clone of ffxiv-datamining (for example test fixtures), so a fixture inside this project's own repo is
not mistaken for game data.
"""

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


def make(commit, date):
    return {'repo': REPO, 'commit': commit, 'date': date}


def header(source):
    """One-line JS comment naming the source commit."""
    if source is None:
        return '/* GENERATED from xivapi/ffxiv-datamining (commit unknown). Do not edit; run npm run regen. */\n'
    return f'/* GENERATED from {source["repo"]} {source["commit"]} ({source["date"]}). Do not edit; run npm run regen. */\n'


def add_cli_args(parser):
    parser.add_argument('--source-commit', help='datamining commit sha (default: detect from the CSV directory)')
    parser.add_argument('--source-date', help='datamining commit date, ISO 8601')


def from_args(args):
    """Provenance from --source-commit/--source-date, else detected from the CSV directory."""
    if args.source_commit:
        return make(args.source_commit, args.source_date)
    return detect(args.csv_dir)


def write_generated(out, js):
    """Write a generated file as UTF-8 with LF line endings on every platform (the repo stores LF)."""
    with open(out, 'w', encoding='utf-8', newline='\n') as f:
        f.write(js)
