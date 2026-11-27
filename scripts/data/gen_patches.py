#!/usr/bin/env python3
"""Build src/data/patches.json (the game's patches and their release days) from the patch list of
xivapi/ffxiv-datamining-patches.

Usage: python scripts/data/gen_patches.py <patches clone>/patchlist.json  [out.json]  [--source-commit SHA --source-date ISO]

Output: {"_generated": notice, "source": ..., "formatVersion": n, "PATCHES": [[version, release day], ...]}
_generated = one-line "do not edit" notice naming the source commit.
source = {repo, commit, date} of the patch list's commit, or null when unknown. The repository is not the data repository
     (xivapi/ffxiv-datamining): the two commits differ, and only the data's names the game tables.
formatVersion = `formatVersion` of src/core/item-format.json (in every generated file).
PATCHES = every patch of the list, oldest first: its version as the game names it ("7.56", "2.1b") and the day it was
     released, "YYYY-MM-DD" in UTC, from the list's Unix `ReleaseDate`. The list holds Patch 2.0 twice (ids 0 and 2, same
     date): the first is kept. Patches released on one day keep the list's order (2.1 and 2.1b), so the last one of a
     day is the newest. `patchAt` in src/core/patches.ts reads it.

Checks (a SchemaError stops the generator with exit status 1): the list is not empty; each entry has an id, a version
like "7.56" or "2.1b", an English name that begins "Patch <that version>" and a release date; the ids rise; the release
dates never go back; a version listed twice has the same date both times.
"""

import argparse
import json
import re
from argparse import ArgumentParser, Namespace
from datetime import UTC, datetime
from pathlib import Path
from re import Pattern

import provenance
from item_format import SchemaError, load_format, run_main
from provenance import Source

VERSION: Pattern[str] = re.compile(r'\d+\.\d+[a-z]?')


def release_day(timestamp: int) -> str:
    """The UTC day, "YYYY-MM-DD", of a Unix timestamp in seconds."""
    return datetime.fromtimestamp(timestamp, UTC).strftime('%Y-%m-%d')


def patch_table(entries: object) -> list[list[str]]:
    """[[version, release day]] for the entries of patchlist.json (a list of dicts), oldest first, with a repeated entry
    (same version, same day) kept once. Raises SchemaError as the module's header lists."""
    if not isinstance(entries, list) or (len(entries) == 0):
        raise SchemaError('patchlist.json is not a list with entries')
    table: list[list[str]] = []
    last_id: int | None = None
    listed: list[object] = entries
    for item in listed:
        where: str = f'patchlist.json entry {item.get("ID")!r}' if isinstance(item, dict) else 'patchlist.json entry'
        if not isinstance(item, dict) or not all(k in item for k in ('ID', 'Version', 'Name_en', 'ReleaseDate')):
            raise SchemaError(f'{where} lacks ID, Version, Name_en or ReleaseDate. Did the list change shape?')
        entry: dict[str, object] = item
        version, name, stamp = entry['Version'], entry['Name_en'], entry['ReleaseDate']
        if not isinstance(version, str) or ((VERSION.fullmatch(version)) is None):
            raise SchemaError(f'{where}: version {version!r}, expected like "7.56" or "2.1b"')
        if not isinstance(name, str) or ((re.match(rf'Patch {re.escape(version)}\b', name)) is None):
            raise SchemaError(f'{where}: the name {name!r} does not begin "Patch {version}"')
        if isinstance(stamp, bool) or not isinstance(stamp, int) or stamp <= 0:
            raise SchemaError(f'{where} ({version}): ReleaseDate {stamp!r}, expected a Unix timestamp in seconds')
        entry_id: object = entry['ID']
        if isinstance(entry_id, bool) or not isinstance(entry_id, int):
            raise SchemaError(f'{where} ({version}): ID {entry_id!r}, expected an integer')
        if last_id is not None and not entry_id > last_id:
            raise SchemaError(f'{where} ({version}): ids do not rise (after {last_id})')
        last_id = entry_id
        day: str = release_day(stamp)
        if (len(table) > 0) and day < table[-1][1]:
            raise SchemaError(f'{where} ({version}) is released {day}, before {table[-1][0]} ({table[-1][1]}) listed above it')
        same: list[list[str]] = [row for row in table if row[0] == version]
        if len(same) > 0:
            if same[0][1] != day:
                raise SchemaError(f'{where}: version {version} is listed with two dates, {same[0][1]} and {day}')
            continue
        table.append([version, day])
    return table


def main(patchlist: Path | str, out: Path | str, source: provenance.SourceArg = 'detect') -> None:
    """source: provenance dict, None for unknown, or 'detect' to ask git about the patch list's clone."""
    source = provenance.resolve(source, Path(patchlist).parent, provenance.PATCHES_REPO)
    with Path(patchlist).open(encoding='utf-8') as f:
        entries: object = json.load(f)
    doc: dict[str, Source | int | list[list[str]] | str | None] = {
        '_generated': provenance.note(source, provenance.PATCHES_REPO),
        'source': source,
        'formatVersion': load_format()['formatVersion'],
        'PATCHES': patch_table(entries),
    }
    provenance.write_generated(out, provenance.json_lines(doc, expand=('PATCHES',)))


if __name__ == '__main__':
    ap: ArgumentParser = argparse.ArgumentParser()
    _ = ap.add_argument('patchlist')
    _ = ap.add_argument('out', nargs='?', default='src/data/patches.json')
    _ = ap.add_argument('--source-commit', help='commit sha of the patch list (default: detect from its directory)')
    _ = ap.add_argument('--source-date', help='commit date of the patch list, ISO 8601')
    args: Namespace = ap.parse_args()
    given: str | Source = provenance.make(args.source_commit, args.source_date, provenance.PATCHES_REPO) if args.source_commit else 'detect'
    run_main(main, args.patchlist, args.out, given)
