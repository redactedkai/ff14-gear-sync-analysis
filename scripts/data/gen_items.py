#!/usr/bin/env python3
"""Build src/data/items.js (the real-gear database) from the datamining CSVs.

Usage: python scripts/data/gen_items.py <path-to-ffxiv-datamining>/csv/en  [out.js]

Row format: [name, slotCode, ilvl, equipLevel, jobMask, "12 stats", unique]
  slotCode : index into `slots` in src/core/item-format.json (0=2H weapon 1=1H weapon 2=off-hand 3=head ... 11=ring)
  jobMask  : bit i set when `jobs[i]` in src/core/item-format.json can equip it
  stats    : in the order of `stats` in src/core/item-format.json  (HQ values = NQ + BaseParamValueSpecial)
"""
import json, sys
from pathlib import Path
from item_format import load_format, read_csv

MIN_ILVL = 100


def main(csv_dir, out):
    d = Path(csv_dir)
    fmt = load_format()
    param_idx = {s['baseParam']: i for i, s in enumerate(fmt['stats'])}   # BaseParam row id -> stat index
    n_stats = len(fmt['stats'])

    esc = {r['#']: r for r in read_csv(d / 'EquipSlotCategory.csv')}
    cjc = {}
    for r in read_csv(d / 'ClassJobCategory.csv'):
        m = 0
        for i, j in enumerate(fmt['jobs']):
            if r.get(j) == 'True': m |= 1 << i
        cjc[r['#']] = m

    def slot_of(e):
        """First slot (in format order) whose EquipSlotCategory column is 1. A main-hand item is two-handed when
        it also blocks the off-hand (OffHand == -1). Waist, soul crystal and non-gear return None."""
        if e is None: return None
        for s in fmt['slots']:
            if e[s['equipSlotColumn']] != '1': continue
            if 'twoHanded' in s and s['twoHanded'] != (e['OffHand'] == '-1'): continue
            return s['code']
        return None

    rows = []
    for r in read_csv(d / 'Item.csv'):
        if not r['Name']: continue
        slot = slot_of(esc.get(r['EquipSlotCategory']))
        if slot is None: continue
        ilvl = int(r['LevelItem'])
        mask = cjc.get(r['ClassJobCategory'], 0)
        if ilvl < MIN_ILVL or not mask: continue
        st = [0] * n_stats
        for i in range(6):
            p = int(r[f'BaseParam[{i}]'])
            if p in param_idx:
                st[param_idx[p]] += int(r[f'BaseParamValue[{i}]'])
        if r['CanBeHq'] == 'True':  # only craftable/HQ-able items get the HQ bonus
            for i in range(6):
                p = int(r[f'BaseParamSpecial[{i}]'])
                if p in param_idx:
                    st[param_idx[p]] += int(r[f'BaseParamValueSpecial[{i}]'])
        if not any(st): continue
        rows.append([r['Name'], slot, ilvl, int(r['LevelEquip']), mask, ','.join(map(str, st)), 1 if r['IsUnique'] == 'True' else 0])
    rows.sort(key=lambda x: (-x[2], x[1], x[0]))
    Path(out).write_text('export const ITEMS=' + json.dumps(rows, ensure_ascii=False, separators=(',', ':')) + ';\n', encoding='utf-8')
    print(f'{len(rows)} rows -> {out}')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else 'src/data/items.js')
