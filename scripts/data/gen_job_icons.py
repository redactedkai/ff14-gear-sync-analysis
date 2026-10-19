#!/usr/bin/env python3
"""Build src/data/job-icons.js from the job icons fetch.py saved in data/icons/<JOB>.png.

Usage: python scripts/data/gen_job_icons.py [icon_dir] [out.js]

JOB_ICONS = {job: 'data:image/png;base64,...'} for every job in src/core/item-format.json, embedded so the page stays
one self-contained file with no image requests. A missing icon, or a file that is not a 64 x 64 PNG, stops the
generator with exit status 1.

The header comment records where the icons come from: the date they were fetched (the FETCH_RECORD file fetch.py
writes, or, without one, the newest icon's file date) and the sha256 of each PNG, since the asset endpoint has no
version to pin.
"""

import argparse
import base64
import hashlib
import json
import struct
from datetime import datetime, timezone
from pathlib import Path

import provenance
from item_format import ROOT, SchemaError, load_format, run_main

SIZE = 64
PNG_SIGNATURE = b'\x89PNG\r\n\x1a\n'
FETCH_RECORD = 'fetched.txt'  # in the icon folder: the UTC date fetch.py downloaded the icons (YYYY-MM-DD)


def fetch_date(icon_dir, paths):
    """(date, how it is known) of the icons in icon_dir: the date in FETCH_RECORD, or, without that file, the newest
    of `paths`' file dates (UTC), which is when the last icon was written."""
    record = Path(icon_dir) / FETCH_RECORD
    if record.exists():
        return record.read_text(encoding='utf-8').strip(), 'fetch.py'
    newest = max(path.stat().st_mtime for path in paths)
    return datetime.fromtimestamp(newest, timezone.utc).date().isoformat(), 'newest file date'


def header(date, how, hashes):
    """The generated file's header comment: the source, the fetch date and how it is known, and {job: sha256 of its
    PNG}, one job per line."""
    lines = [
        "/* GENERATED from the game's framed job icons (icon 062100 + ClassJob row, via xivapi's asset endpoint; see",
        f'   scripts/data/fetch.py). Do not edit; see docs/engineering/data-pipeline.md. Fetched {date} ({how}).',
        '   sha256 of each PNG:',
        *(f'   {job} {digest}' for job, digest in hashes.items()),
        '*/',
    ]
    return '\n'.join(lines) + '\n'


def png_size(data):
    """(width, height) of a PNG, or None if `data` is not one."""
    if data[:8] != PNG_SIGNATURE or data[12:16] != b'IHDR':
        return None
    return struct.unpack('>II', data[16:24])


def main(icon_dir, out):
    icon_dir = Path(icon_dir)
    icons, hashes, problems = {}, {}, []
    for job in load_format()['jobs']:
        path = icon_dir / f'{job}.png'
        if not path.exists():
            problems.append(f'{job}: no {path.name}')
            continue
        data = path.read_bytes()
        size = png_size(data)
        if size != (SIZE, SIZE):
            problems.append(f'{job}: {path.name} is ' + (f'{size[0]} x {size[1]}' if size else 'not a PNG') + f', expected {SIZE} x {SIZE}')
            continue
        icons[job] = 'data:image/png;base64,' + base64.b64encode(data).decode('ascii')
        hashes[job] = hashlib.sha256(data).hexdigest()
    if problems:
        raise SchemaError('job icons: ' + '; '.join(problems) + '. Run: python scripts/data/fetch.py')
    date, how = fetch_date(icon_dir, [icon_dir / f'{job}.png' for job in icons])
    js = header(date, how, hashes) + 'export const JOB_ICONS=' + json.dumps(icons, separators=(',', ':')) + ';\n'
    provenance.write_generated(out, js)


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('icon_dir', nargs='?', default=str(ROOT / 'data' / 'icons'))
    ap.add_argument('out', nargs='?', default=str(ROOT / 'src' / 'data' / 'job-icons.js'))
    args = ap.parse_args()
    run_main(main, args.icon_dir, args.out)
