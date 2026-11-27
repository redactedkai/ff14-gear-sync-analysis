#!/usr/bin/env python3
"""Build src/data/item-level.json (ItemLevel budget table + ParamGrow level data) from the datamining CSVs.

Usage: python scripts/data/gen_item_level.py <path-to-ffxiv-datamining>/csv/en  [out.json]  [--source-commit SHA --source-date ISO]

Output: {"_generated": notice, "source": ..., "formatVersion": n, "IL": ..., "PG": ..., "MP": ..., "SHARES": ..., "JOBS": ..., "CLANS": ...}
_generated = one-line "do not edit" notice naming the source commit.
source = {repo, commit, date} of the datamining commit the CSVs come from, or null when unknown (the page's DATA_SOURCE).
formatVersion = `formatVersion` of src/core/item-format.json, the format the file follows (in every generated file).
IL = per-stat budget by item level (index = item level, 921 rows as of patch 7.50), one array per stat key
     in src/core/item-format.json.
PG = [[BaseSpeed, LevelModifier, ItemLevelSync]] for character levels 1 to the top level (100 today; the highest
     ParamGrow row with an ItemLevelSync), index = level - 1.
MP = per-item stat factor table, {stat key: [percent for BaseParamModifier 0..12]}, from each stat's BaseParam row
     (MeldParam columns; `statFactor` in src/core/item-format.json). An item row's last field indexes it.
IL and MP also hold the weapon damage and defense entries (`damageDefense` in item-format.json): their ItemLevel column
     and their BaseParam row's MeldParam percents.
SHARES = {weapon damage or defense key: [slot share in thousandths per slot code]}, from their BaseParam rows (the stats'
     shares are the slot `percent`s in item-format.json; these differ).
JOBS = {job: {attribute key: modifier in percent}} for every job in item-format.json, from ClassJob.csv (`jobModifiers`).
CLANS = [{race, clan, <attribute key>: offset}] for the 16 clans in Tribe row order, from Tribe.csv and Race.csv (`clans`):
     the points a clan adds to a character's attributes, flat at every level.

Also checks BaseParam.csv: every stat's slot shares must equal the slot `percent`s in src/core/item-format.json, which
the page uses. Missing columns or a mismatch stop the generator with exit status 1.
"""

import argparse
import re
from pathlib import Path

import provenance
from item_format import (
    ItemFormat,
    SchemaError,
    attribute_columns,
    check_slot_percents,
    load_format,
    read_csv,
    run_main,
    slot_shares,
    stat_factors,
)


def job_modifiers(class_job_csv: Path, fmt: ItemFormat) -> dict[str, dict[str, int]]:
    """{job: {attribute key: percent}} for every job in fmt['jobs'], from the ClassJob columns in fmt['jobModifiers'].
    A job with no row, or a modifier that is not a positive whole number, stops the generator (SchemaError)."""
    cols = attribute_columns(fmt['jobModifiers']['columns'])
    rows = {r['Abbreviation']: r for r in read_csv(class_job_csv, ['Abbreviation', *cols.values()])}
    out: dict[str, dict[str, int]] = {}
    for job in fmt['jobs']:
        if job not in rows:
            raise SchemaError(f'ClassJob.csv has no row for {job}')
        mods = {k: rows[job][c] for k, c in cols.items()}
        if not all(v.isdigit() and int(v) > 0 for v in mods.values()):
            raise SchemaError(f'ClassJob.csv {job}: modifiers {mods}, expected positive whole numbers')
        out[job] = {k: int(v) for k, v in mods.items()}
    return out


def clan_bonuses(tribe_csv: Path, race_csv: Path, fmt: ItemFormat) -> list[dict[str, str | int]]:
    """[{race, clan, <attribute key>: offset}] for the clans of fmt['clans'], in Tribe row order. A clan's race is Race.csv
    row ceil(Tribe row / tribesPerRace) (the sheets hold no link; the Wiki's Starting Attributes page groups the clans the
    same way). Raises SchemaError when a Tribe row 1 to `count` or a Race row 1 to `raceCount` is missing or has no name,
    when two clans share a name, or when an offset is not a whole number."""
    spec = fmt['clans']
    cols, name_col = attribute_columns(spec['columns']), spec['nameColumn']
    tribes = {int(r['#']): r for r in read_csv(tribe_csv, ['#', name_col, *cols.values()])}
    races = {int(r['#']): r for r in read_csv(race_csv, ['#', name_col])}
    missing = [f'Tribe {i}' for i in range(1, spec['count'] + 1) if not tribes.get(i, {}).get(name_col)]
    missing += [f'Race {i}' for i in range(1, spec['raceCount'] + 1) if not races.get(i, {}).get(name_col)]
    if missing:
        raise SchemaError(f'Tribe.csv or Race.csv has no name for {", ".join(missing)}')
    if spec['count'] != spec['raceCount'] * spec['tribesPerRace']:
        raise SchemaError(f'item-format.json clans: {spec["count"]} clans is not {spec["raceCount"]} races x {spec["tribesPerRace"]}')
    out: list[dict[str, str | int]] = []
    for i in range(1, spec['count'] + 1):
        row = tribes[i]
        offsets = {k: row[c] for k, c in cols.items()}
        if not all(re.fullmatch(r'-?\d+', v) for v in offsets.values()):
            raise SchemaError(f'Tribe.csv {row[name_col]}: offsets {offsets}, expected whole numbers')
        race = races[(i - 1) // spec['tribesPerRace'] + 1][name_col]
        out.append({'race': race, 'clan': row[name_col], **{k: int(v) for k, v in offsets.items()}})
    if len({c['clan'] for c in out}) != len(out):
        raise SchemaError('Tribe.csv: two clans share a name')
    return out


PARAM_GROW_COLUMNS = ['BaseSpeed', 'LevelModifier', 'ItemLevelSync']


def level_data(param_grow_csv: Path) -> list[list[int]]:
    """PG: [[BaseSpeed, LevelModifier, ItemLevelSync]] for character levels 1 to the top level (index = level - 1).
    The top level is the highest ParamGrow row with an ItemLevelSync, so it moves with the game's level cap: rows above
    the cap are zero (101 to 200 today), and the last row (201) holds 100/100 with no ItemLevelSync. Raises
    SchemaError when no row has one, or when a level from 1 to the top is missing or has a value that is not a positive
    whole number."""
    rows = {int(r['#']): r for r in read_csv(param_grow_csv, ['#', *PARAM_GROW_COLUMNS])}
    top = max((level for level, r in rows.items() if level >= 1 and r['ItemLevelSync'] not in ('', '0')), default=0)
    if not top:
        raise SchemaError(f'{Path(param_grow_csv).name}: no level has an ItemLevelSync')
    bad = [
        str(level)
        for level in range(1, top + 1)
        if level not in rows or not all(rows[level][c].isdigit() and int(rows[level][c]) > 0 for c in PARAM_GROW_COLUMNS)
    ]
    if bad:
        cols = ', '.join(PARAM_GROW_COLUMNS)
        raise SchemaError(f'{Path(param_grow_csv).name}: level(s) {", ".join(bad[:10])} missing or without a positive {cols}')
    return [[int(rows[level][c]) for c in PARAM_GROW_COLUMNS] for level in range(1, top + 1)]


def main(csv_dir: Path | str, out: Path | str, source: provenance.SourceArg = 'detect') -> None:
    """source: provenance dict, None for unknown, or 'detect' to ask git about csv_dir."""
    source = provenance.resolve(source, csv_dir)
    d = Path(csv_dir)
    fmt = load_format()
    check_slot_percents(d / 'BaseParam.csv', fmt)
    extra = fmt['damageDefense']['entries']
    MP = {**stat_factors(d / 'BaseParam.csv', fmt), **stat_factors(d / 'BaseParam.csv', fmt, extra)}
    SHARES = slot_shares(d / 'BaseParam.csv', fmt, extra)
    il_cols = {s['key']: s['itemLevelColumn'] for s in [*fmt['stats'], *extra]}
    il_rows = read_csv(d / 'ItemLevel.csv', ['#', *il_cols.values()])
    if [int(r['#']) for r in il_rows] != list(range(len(il_rows))):
        raise SchemaError('ItemLevel.csv ids are not 0, 1, 2, ... without gaps, so a row position is no longer its item level')
    IL = {k: [int(r[c]) for r in il_rows] for k, c in il_cols.items()}
    PG = level_data(d / 'ParamGrow.csv')
    JOBS = job_modifiers(d / 'ClassJob.csv', fmt)
    CLANS = clan_bonuses(d / 'Tribe.csv', d / 'Race.csv', fmt)
    # {"_generated": notice, "source": provenance, "formatVersion": n, "IL": {stat: [budget]}, "PG": [[...]], "MP": {stat: [%]},
    # "SHARES": {key: [share per slot code]}, "JOBS": {job: {attribute: %}}, "CLANS": [clan]}: one stat, level, job
    # or clan per line
    doc = {
        '_generated': provenance.note(source),
        'source': source,
        'formatVersion': fmt['formatVersion'],
        'IL': IL,
        'PG': PG,
        'MP': MP,
        'SHARES': SHARES,
        'JOBS': JOBS,
        'CLANS': CLANS,
    }
    provenance.write_generated(out, provenance.json_lines(doc, expand=('IL', 'PG', 'MP', 'SHARES', 'JOBS', 'CLANS')))


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('csv_dir')
    ap.add_argument('out', nargs='?', default='src/data/item-level.json')
    provenance.add_cli_args(ap)
    args = ap.parse_args()
    run_main(main, args.csv_dir, args.out, provenance.from_args(args))
