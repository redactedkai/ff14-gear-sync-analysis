#!/usr/bin/env python3
"""Build src/data/items.json (the real-gear database) from the datamining CSVs.

Usage: python scripts/data/gen_items.py <path-to-ffxiv-datamining>/csv/en  [out.js]  [--source-commit SHA --source-date ISO]

Row format: [name, slotCode, ilvl, equipLevel, jobMask, "12 stats", unique, hq, sources]
  slotCode : index into `slots` in src/core/item-format.json (0=2H weapon 1=1H weapon 2=off-hand 3=head ... 11=ring)
  jobMask  : bit i set when `jobs[i]` in src/core/item-format.json can equip it
  stats    : in the order of `stats` in src/core/item-format.json  (HQ values = NQ + BaseParamValueSpecial)
  hq       : 1 when the item can be high quality (CanBeHq), so its stats are the HQ ones
  sources  : bit i set when the item comes from `sources[i]` in item-format.json (crafted, tomestone, ultimate;
             see gear_sources.py)
"""

import argparse
import json
from pathlib import Path

import provenance
from gear_sources import sources as gear_sources
from item_format import N_ITEM_PARAMS, SchemaError, item_columns, load_format, read_csv, run_main

MIN_ILVL = 100


def select(csv_dir):
    """The gear the database keeps: (kept, multi_slot), where kept is a list of (Item.csv row, database row) pairs in
    Item.csv order and multi_slot names the pieces left out because they also block another slot."""
    d = Path(csv_dir)
    fmt = load_format()
    param_idx = {s['baseParam']: i for i, s in enumerate(fmt['stats'])}  # BaseParam row id -> stat index
    n_stats = len(fmt['stats'])

    slot_cols = ['#', 'MainHand', 'OffHand', *(s['equipSlotColumn'] for s in fmt['slots'])]
    esc = {r['#']: r for r in read_csv(d / 'EquipSlotCategory.csv', slot_cols)}
    cjc = {}
    for r in read_csv(d / 'ClassJobCategory.csv', ['#', *fmt['jobs']]):
        m = 0
        for i, j in enumerate(fmt['jobs']):
            if r[j] == 'True':
                m |= 1 << i
        cjc[r['#']] = m

    def slot_of(e):
        """First slot (in format order) whose EquipSlotCategory column is 1. A main-hand item is two-handed when
        it also blocks the off-hand (OffHand == -1). Waist, soul crystal and non-gear return None."""
        if e is None:
            return None
        for s in fmt['slots']:
            if e[s['equipSlotColumn']] != '1':
                continue
            if 'twoHanded' in s and s['twoHanded'] != (e['OffHand'] == '-1'):
                continue
            return s['code']
        return None

    def blocks_other_slots(e):
        """True for gear that also occupies another slot (EquipSlotCategory value -1), e.g. a cloak that blocks the head.
        A two-handed weapon blocking the off-hand is the one expected case."""
        if e is None:
            return False
        return any(v == '-1' for c, v in e.items() if c not in ('#', 'OffHand')) or (e['OffHand'] == '-1' and e['MainHand'] != '1')

    items = read_csv(d / 'Item.csv', ['#', *item_columns()])
    src = gear_sources(d, items)
    kept, multi_slot = [], []
    for r in items:
        if not r['Name']:
            continue
        slot = slot_of(esc.get(r['EquipSlotCategory']))
        if slot is None:
            continue
        ilvl = int(r['LevelItem'])
        mask = cjc.get(r['ClassJobCategory'], 0)
        if ilvl < MIN_ILVL or not mask:
            continue
        st = [0] * n_stats
        for i in range(N_ITEM_PARAMS):
            p = int(r[f'BaseParam[{i}]'])
            if p in param_idx:
                st[param_idx[p]] += int(r[f'BaseParamValue[{i}]'])
        if r['CanBeHq'] == 'True':  # only craftable/HQ-able items get the HQ bonus
            for i in range(N_ITEM_PARAMS):
                p = int(r[f'BaseParamSpecial[{i}]'])
                if p in param_idx:
                    st[param_idx[p]] += int(r[f'BaseParamValueSpecial[{i}]'])
        if not any(st):
            continue
        # Multi-slot gear would need a summed slot share and a blocked slot in the optimizer; it is left out instead
        # and listed, so a patch that adds more of it is noticed.
        if blocks_other_slots(esc.get(r['EquipSlotCategory'])):
            multi_slot.append(f'{r["Name"]} (item level {ilvl})')
            continue
        kept.append(
            (
                r,
                [
                    r['Name'],
                    slot,
                    ilvl,
                    int(r['LevelEquip']),
                    mask,
                    ','.join(map(str, st)),
                    1 if r['IsUnique'] == 'True' else 0,
                    1 if r['CanBeHq'] == 'True' else 0,
                    src.get(int(r['#']), 0),
                ],
            )
        )
    return kept, multi_slot


def main(csv_dir, out, source='detect'):
    """source: provenance dict, None for unknown, or 'detect' to ask git about csv_dir. Only written as a header comment;
    the DATA_SOURCE constant lives in item-level.json."""
    if source == 'detect':
        source = provenance.detect(csv_dir)
    fmt = load_format()
    kept, multi_slot = select(csv_dir)
    rows = [row for _, row in kept]
    # A job no item is left for means the job columns or their values changed shape (e.g. 'True' became '1').
    seen = 0
    for r in rows:
        seen |= r[4]
    absent = [j for i, j in enumerate(fmt['jobs']) if not seen >> i & 1]
    if absent:
        raise SchemaError(f'ClassJobCategory.csv: no item is wearable by {", ".join(absent)}. Did the job columns change?')
    rows.sort(key=lambda x: (-x[2], x[1], x[0]))
    # one line, compact: {"_generated": notice, "source": provenance, "items": [rows]}
    doc = {'_generated': provenance.note(source), 'source': source, 'items': rows}
    provenance.write_generated(out, json.dumps(doc, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(f'{len(rows)} rows -> {out}')
    if multi_slot:
        print(f'left out {len(multi_slot)} multi-slot pieces: ' + ', '.join(multi_slot))


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('csv_dir')
    ap.add_argument('out', nargs='?', default='src/data/items.json')
    provenance.add_cli_args(ap)
    args = ap.parse_args()
    run_main(main, args.csv_dir, args.out, provenance.from_args(args))
