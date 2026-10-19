#!/usr/bin/env python3
"""Build src/data/item-level.json (ItemLevel budget table + ParamGrow level data) from the datamining CSVs.

Usage: python scripts/data/gen_item_level.py <path-to-ffxiv-datamining>/csv/en  [out.json]  [--source-commit SHA --source-date ISO]

Output: {"_generated": notice, "source": ..., "IL": ..., "PG": ..., "MP": ..., "SHARES": ..., "JOBS": ...}
_generated = one-line "do not edit" notice naming the source commit.
source = {repo, commit, date} of the datamining commit the CSVs come from, or null when unknown (the page's DATA_SOURCE).
IL = per-stat budget by item level (index = item level, 921 rows as of patch 7.50), one array per stat key
     in src/core/item-format.json.
PG = [[BaseSpeed, LevelModifier, ItemLevelSync]] for character levels 1..100 (index = level - 1).
MP = per-item stat factor table, {stat key: [percent for BaseParamModifier 0..12]}, from each stat's BaseParam row
     (MeldParam columns; `statFactor` in src/core/item-format.json). An item row's last field indexes it.
IL and MP also hold the weapon damage and defense entries (`damageDefense` in item-format.json): their ItemLevel column
     and their BaseParam row's MeldParam percents.
SHARES = {weapon damage or defense key: [slot share in thousandths per slot code]}, from their BaseParam rows (the stats'
     shares are the slot `percent`s in item-format.json; these differ).
JOBS = {job: {attribute key: modifier in percent}} for every job in item-format.json, from ClassJob.csv (`jobModifiers`).

Also checks BaseParam.csv: every stat's slot shares must equal the slot `percent`s in src/core/item-format.json, which
the page uses. Missing columns or a mismatch stop the generator with exit status 1.
"""

import argparse
from pathlib import Path

import provenance
from item_format import SchemaError, check_slot_percents, load_format, read_csv, run_main, slot_shares, stat_factors


def job_modifiers(class_job_csv, fmt):
    """{job: {attribute key: percent}} for every job in fmt['jobs'], from the ClassJob columns in fmt['jobModifiers'].
    A job with no row, or a modifier that is not a positive whole number, stops the generator (SchemaError)."""
    cols = fmt['jobModifiers']['columns']
    rows = {r['Abbreviation']: r for r in read_csv(class_job_csv, ['Abbreviation', *cols.values()])}
    out = {}
    for job in fmt['jobs']:
        if job not in rows:
            raise SchemaError(f'ClassJob.csv has no row for {job}')
        mods = {k: rows[job][c] for k, c in cols.items()}
        if not all(v.isdigit() and int(v) > 0 for v in mods.values()):
            raise SchemaError(f'ClassJob.csv {job}: modifiers {mods}, expected positive whole numbers')
        out[job] = {k: int(v) for k, v in mods.items()}
    return out


def main(csv_dir, out, source='detect'):
    """source: provenance dict, None for unknown, or 'detect' to ask git about csv_dir."""
    if source == 'detect':
        source = provenance.detect(csv_dir)
    d = Path(csv_dir)
    fmt = load_format()
    check_slot_percents(d / 'BaseParam.csv', fmt)
    extra = fmt['damageDefense']['entries']
    MP = {**stat_factors(d / 'BaseParam.csv', fmt), **stat_factors(d / 'BaseParam.csv', fmt, extra)}
    SHARES = slot_shares(d / 'BaseParam.csv', fmt, extra)
    il_cols = {s['key']: s['itemLevelColumn'] for s in [*fmt['stats'], *extra]}
    il_rows = read_csv(d / 'ItemLevel.csv', ['#', *il_cols.values()])
    assert [int(r['#']) for r in il_rows] == list(range(len(il_rows))), 'ItemLevel ids not contiguous'
    IL = {k: [int(r[c]) for r in il_rows] for k, c in il_cols.items()}
    pg_rows = {int(r['#']): r for r in read_csv(d / 'ParamGrow.csv', ['#', 'BaseSpeed', 'LevelModifier', 'ItemLevelSync'])}
    PG = [[int(pg_rows[lvl]['BaseSpeed']), int(pg_rows[lvl]['LevelModifier']), int(pg_rows[lvl]['ItemLevelSync'])] for lvl in range(1, 101)]
    JOBS = job_modifiers(d / 'ClassJob.csv', fmt)
    # {"_generated": notice, "source": provenance, "IL": {stat: [budget]}, "PG": [[...]], "MP": {stat: [%]},
    # "SHARES": {key: [share per slot code]}, "JOBS": {job: {attribute: %}}}: one stat, level or job per line
    doc = {'_generated': provenance.note(source), 'source': source, 'IL': IL, 'PG': PG, 'MP': MP, 'SHARES': SHARES, 'JOBS': JOBS}
    provenance.write_generated(out, provenance.json_lines(doc, expand=('IL', 'PG', 'MP', 'SHARES', 'JOBS')))


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('csv_dir')
    ap.add_argument('out', nargs='?', default='src/data/item-level.json')
    provenance.add_cli_args(ap)
    args = ap.parse_args()
    run_main(main, args.csv_dir, args.out, provenance.from_args(args))
