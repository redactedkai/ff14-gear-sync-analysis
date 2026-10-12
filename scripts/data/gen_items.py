#!/usr/bin/env python3
"""Build src/data/items.json (the real-gear database) from the datamining CSVs.

Usage: python scripts/data/gen_items.py <path-to-ffxiv-datamining>/csv/en  [out.js]  [--source-commit SHA --source-date ISO]

Row format: [name, slotCode, ilvl, equipLevel, jobMask, "12 stats", unique, hq, sources]
  slotCode : index into `slots` in src/core/item-format.json (0=2H weapon 1=1H weapon 2=off-hand 3=head ... 11=ring,
             12=body that also covers the head)
  jobMask  : bit i set when `jobs[i]` in src/core/item-format.json can equip it
  stats    : in the order of `stats` in src/core/item-format.json  (HQ values = NQ + BaseParamValueSpecial)
  hq       : 1 when the item can be high quality (CanBeHq), so its stats are the HQ ones
  sources  : bit i set when the item is in group `sources[i]` of item-format.json (crafted, tomestone, ultimate,
             savage, relic): from its category (gear_categories.py) and the shop and recipe flags (gear_sources.py)
"""

import argparse
import json
from pathlib import Path

import gear_categories
import provenance
from gear_sources import sources as gear_sources
from item_format import N_ITEM_PARAMS, SchemaError, item_columns, load_format, read_csv, run_main

MIN_ILVL = 100


def select(csv_dir):
    """The gear the database keeps: (kept, multi_slot), where kept is a list of (Item.csv row, database row) pairs in
    Item.csv order and multi_slot names the pieces left out because they block a combination of slots with no slot
    code in item-format.json."""
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

    column = {s['type']: s['equipSlotColumn'] for s in fmt['slots']}

    def slot_of(e):
        """First slot (in format order) whose EquipSlotCategory column is 1 and whose blocked slots (value -1) are
        exactly the ones the format names: OffHand for a two-handed weapon, the `blocks` types otherwise (a cloak:
        Head). Waist, soul crystal, non-gear and an unsupported multi-slot combination return None."""
        if e is None:
            return None
        blocked = {c for c, v in e.items() if v == '-1'}
        for s in fmt['slots']:
            if e[s['equipSlotColumn']] != '1':
                continue
            expect = {'OffHand'} if s.get('twoHanded') else {column[t] for t in s.get('blocks', [])}
            if blocked == expect:
                return s['code']
        return None

    def blocks_other_slots(e):
        """True for gear that occupies another slot too (EquipSlotCategory value -1)."""
        return e is not None and any(v == '-1' for c, v in e.items() if c != '#')

    items = read_csv(d / 'Item.csv', ['#', *item_columns()])
    src = gear_sources(d, items)
    kept, multi_slot = [], []
    for r in items:
        if not r['Name']:
            continue
        e = esc.get(r['EquipSlotCategory'])
        slot = slot_of(e)
        unsupported = slot is None and blocks_other_slots(e)  # multi-slot gear with no slot code: listed, not kept
        if slot is None and not unsupported:
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
        # Multi-slot gear needs its own slot code (summed slot share, blocked slots); a combination without one is
        # left out and listed, so a patch that adds more of it is noticed.
        if unsupported:
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
    weapon_slots = {s['code'] for s in fmt['slots'] if s['type'] in ('weapon', 'offhand')}
    cats = gear_categories.categorize(csv_dir, kept, weapon_slots)
    problems = gear_categories.check(kept, cats)
    if problems:
        raise SchemaError(f'{len(problems)} gear category cross-check problem(s): ' + '; '.join(problems[:10]))
    masks = gear_categories.source_masks(kept, cats)
    retired = [r for r, _ in kept if cats[r['#']] in gear_categories.RETIRED]
    rows = [[*row[:8], masks[r['#']]] for r, row in kept if cats[r['#']] not in gear_categories.RETIRED]
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
    if retired:
        print(f'left out {len(retired)} retired pieces ({", ".join(sorted(gear_categories.RETIRED))})')
    if multi_slot:
        print(f'left out {len(multi_slot)} multi-slot pieces with no slot code: ' + ', '.join(multi_slot))


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('csv_dir')
    ap.add_argument('out', nargs='?', default='src/data/items.json')
    provenance.add_cli_args(ap)
    args = ap.parse_args()
    run_main(main, args.csv_dir, args.out, provenance.from_args(args))
