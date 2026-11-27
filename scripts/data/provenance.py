"""Which commit of a source repository the generated data comes from: xivapi/ffxiv-datamining for the game's tables,
xivapi/ffxiv-datamining-patches for the patch list.

detect(csv_dir) asks git for the commit of the clone that holds the CSVs (detect(directory, PATCHES_REPO) the patch
list's). It returns None when the directory is not inside a git clone of that repository (for example test fixtures),
so a fixture inside this project's own repo is not mistaken for game data.
"""

import json
import subprocess
from argparse import ArgumentParser, Namespace
from collections.abc import Collection, Mapping
from pathlib import Path
from subprocess import CompletedProcess
from typing import Literal, TypeAlias, TypedDict

REPO: str = 'xivapi/ffxiv-datamining'
PATCHES_REPO: str = 'xivapi/ffxiv-datamining-patches'


class Source(TypedDict):
    """Where a generated file's data comes from: `repo` ("owner/name"), the full `commit` id and its ISO 8601 `date`."""

    repo: str
    commit: str
    date: str


def _git(csv_dir: str | Path, *args: str) -> str | None:
    r: CompletedProcess[str] = subprocess.run(['git', '-C', str(csv_dir), *args], capture_output=True, text=True, check=False)
    return r.stdout.strip() if r.returncode == 0 else None


def detect(csv_dir: str | Path, repo: str = REPO) -> Source | None:
    """{'repo', 'commit', 'date'} for the clone of `repo` ("owner/name") containing csv_dir, or None. The clone's origin
    must be that repository exactly: ffxiv-datamining-patches is not ffxiv-datamining."""
    try:
        origin: str | None = _git(csv_dir, 'remote', 'get-url', 'origin')
        url: str = '' if origin is None else origin
        if url.rstrip('/').removesuffix('.git').rsplit('/', 1)[-1] != repo.split('/')[1]:
            return None
        out: str | None = _git(csv_dir, 'log', '-1', '--format=%H %cI')
    except OSError:  # git not installed
        return None
    if out is None or out == '':
        return None
    commit, date = out.split(' ', 1)
    return make(commit, date, repo)


SourceArg: TypeAlias = Source | Literal['detect'] | None  # what a generator's `source` parameter takes: a record, none, or ask git


def resolve(source: SourceArg, directory: str | Path, repo: str = REPO) -> Source | None:
    """`source` itself, or what detect() finds for `directory` when it is 'detect'."""
    return detect(directory, repo) if source == 'detect' else source


def local_edits(csv_dir: str | Path) -> list[str] | None:
    """The tracked files changed in the clone containing csv_dir since its commit (git status --porcelain lines, for
    example ' M csv/en/Item.csv'), [] when it is clean, or None when git cannot tell. The provenance names the commit
    only, so data generated from an edited clone would claim to be that commit's."""
    try:
        r: CompletedProcess[str] = subprocess.run(
            ['git', '-C', str(csv_dir), 'status', '--porcelain', '--untracked-files=no'], capture_output=True, text=True, check=False
        )
    except OSError:  # git not installed
        return None
    return [line for line in r.stdout.splitlines() if (line.strip()) != ''] if r.returncode == 0 else None


def make(commit: str, date: str, repo: str = REPO) -> Source:
    return {'repo': repo, 'commit': commit, 'date': date}


def note(source: Source | None, repo: str = REPO) -> str:
    """One-line notice naming the source commit, written as a generated JSON file's "_generated" field. `repo` is named
    when the commit is unknown (source None)."""
    if source is None:
        return f'GENERATED from {repo} (commit unknown). Do not edit; see docs/engineering/data-pipeline.md.'
    return f'GENERATED from {source["repo"]} {source["commit"]} ({source["date"]}). Do not edit; see docs/engineering/data-pipeline.md.'


def add_cli_args(parser: ArgumentParser) -> None:
    _ = parser.add_argument('--source-commit', help='datamining commit sha (default: detect from the CSV directory)')
    _ = parser.add_argument('--source-date', help='datamining commit date, ISO 8601')


def from_args(args: Namespace) -> SourceArg:
    """Provenance from --source-commit/--source-date, else detected from the CSV directory."""
    if args.source_commit:
        return make(args.source_commit, args.source_date)
    return detect(args.csv_dir)


def json_lines(doc: Mapping[str, object], expand: Collection[str] = (), ensure_ascii: bool = True) -> str:
    """`doc` (a dict) as JSON text with one top-level key per line, and, for each key in `expand`, one entry of its list
    or dict per line; everything else is compact. So a patch's diff of a generated file shows the rows that changed
    (an item, a stat's budget column, a level) instead of one changed line holding the whole file. Parses to the same
    value as json.dumps(doc); the page bundle (esbuild) minifies it, so the built page does not grow."""

    def compact(value: object) -> str:
        return json.dumps(value, ensure_ascii=ensure_ascii, separators=(',', ':'))

    lines: list[str] = []
    for key, value in doc.items():
        head: str = compact(key) + ':'
        if key in expand and isinstance(value, dict) and len(value) > 0:
            members: dict[str, object] = value
            entries: list[str] = [compact(k) + ':' + compact(v) for k, v in members.items()]
            lines.append(head + '{\n' + ',\n'.join(entries) + '\n}')
        elif key in expand and isinstance(value, list) and len(value) > 0:
            elements: list[object] = value
            lines.append(head + '[\n' + ',\n'.join(compact(v) for v in elements) + '\n]')
        else:
            lines.append(head + compact(value))
    return '{\n' + ',\n'.join(lines) + '\n}\n'


def write_generated(out: str | Path, js: str) -> None:
    """Write a generated file as UTF-8 with LF line endings on every platform (the repo stores LF)."""
    _ = Path(out).write_text(js, encoding='utf-8', newline='\n')
