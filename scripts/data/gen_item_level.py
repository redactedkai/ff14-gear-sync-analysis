#!/usr/bin/env python3
"""Build src/data/item-level.js (ItemLevel budget table + ParamGrow level data) from the datamining CSVs.

Usage: python scripts/data/gen_item_level.py <path-to-ffxiv-datamining>/csv/en  [out.js]

IL = per-stat budget by item level (index = item level, 921 rows as of patch 7.50).
PG = [[BaseSpeed, LevelModifier, ItemLevelSync]] for character levels 1..100 (index = level - 1).
"""
import csv, json, sys
from pathlib import Path

IL_COLS = {'str': 'Strength', 'dex': 'Dexterity', 'int': 'Intelligence', 'mind': 'Mind', 'vit': 'Vitality',
           'crit': 'CriticalHit', 'det': 'Determination', 'dh': 'DirectHitRate', 'sks': 'SkillSpeed',
           'sps': 'SpellSpeed', 'piety': 'Piety', 'ten': 'Tenacity'}

def main(csv_dir, out):
    d = Path(csv_dir)
    il_rows = list(csv.DictReader(open(d / 'ItemLevel.csv', encoding='utf-8')))
    assert [int(r['#']) for r in il_rows] == list(range(len(il_rows))), 'ItemLevel ids not contiguous'
    IL = {k: [int(r[c]) for r in il_rows] for k, c in IL_COLS.items()}
    pg_rows = {int(r['#']): r for r in csv.DictReader(open(d / 'ParamGrow.csv', encoding='utf-8'))}
    PG = [[int(pg_rows[l]['BaseSpeed']), int(pg_rows[l]['LevelModifier']), int(pg_rows[l]['ItemLevelSync'])] for l in range(1, 101)]
    js = 'export const IL=' + json.dumps(IL, separators=(',', ':')) + ';\nexport const PG=' + json.dumps(PG, separators=(',', ':')) + ';\n'
    Path(out).write_text(js, encoding='utf-8')
    print(f'ItemLevel rows 0..{len(il_rows)-1}, ParamGrow levels 1..100 -> {out}')

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else 'src/data/item-level.js')
