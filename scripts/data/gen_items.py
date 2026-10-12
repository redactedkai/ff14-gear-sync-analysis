#!/usr/bin/env python3
"""Build src/data/items.json (the real-gear database) from the datamining CSVs.

Usage: python scripts/data/gen_items.py <path-to-ffxiv-datamining>/csv/en  [out.js]  [--source-commit SHA --source-date ISO]

Row format: [name, slotCode, ilvl, equipLevel, jobMask, "stats", unique, hq, sources, statFactor, meldSlots, overmeld, rarity]
  slotCode : index into `slots` in src/core/item-format.json (0=2H weapon 1=1H weapon 2=off-hand 3=head ... 11=ring,
             12=body that also covers the head)
  jobMask  : bit i set when `jobs[i]` in src/core/item-format.json can equip it
  stats    : in the order of `stats` in src/core/item-format.json  (HQ values = NQ + BaseParamValueSpecial)
  hq       : 1 when the item can be high quality (CanBeHq), so its stats are the HQ ones
  sources  : bit i set when the item is in group `sources[i]` of item-format.json (crafted, tomestone, ultimate,
             savage, relic): from its category (gear_categories.py) and the shop and recipe flags (gear_sources.py)
  statFactor : the item's BaseParamModifier, an index into the stat factor table MP of item-level.json (`statFactor` in
             item-format.json): stat k's full-share value on this item is multiplied by MP[k][statFactor] / 100
  meldSlots : guaranteed materia slots (Item.MateriaSlotCount, 0 to `materia.maxSlots` in item-format.json)
  overmeld  : 1 when the item allows overmelding (Item.IsAdvancedMeldingPermitted)
  rarity    : Item.Rarity (`rarity` in item-format.json: 1 white, 2 green, 3 blue, 4 purple, 7 pink)

The file also holds the materia table {values, gate, high} (`materia` in item-format.json, see materia_table()).
"""

import argparse
import json
from pathlib import Path

import gear_categories
import provenance
from gear_sources import sources as gear_sources
from item_format import N_ITEM_PARAMS, SchemaError, item_columns, load_format, meld_fields, read_csv, run_main, stat_factors

MIN_ILVL = 100


def crafter_gatherer_params(base_param_csv, fmt):
    """The BaseParam row ids of the crafter and gatherer stats (`crafterGathererParams` in item-format.json). Raises
    SchemaError when a row id is missing or carries another name, so a renumbering after a patch is caught."""
    names = {r['#']: r['Name'] for r in read_csv(base_param_csv, ['#', 'Name'])}
    bad = []
    for p in fmt['crafterGathererParams']:
        found = names.get(str(p['baseParam']))
        if found != p['name']:
            bad.append(f'{p["baseParam"]} ({p["name"]}): found {found or "no row"!r}')
    if bad:
        raise SchemaError('BaseParam.csv crafter/gatherer stat rows changed: ' + '; '.join(bad))
    return {p['baseParam'] for p in fmt['crafterGathererParams']}


def materia_table(csv_dir, fmt):
    """The materia table {values, gate, high}, one entry per grade (I first), from the Materia sheet (`materia` in
    item-format.json):
      values: what a grade adds to a combat substat (Materia Value);
      gate  : the lowest gear item level that takes it (the materia item's Item.LevelItem);
      high  : the grades (1-based) that cannot go past the first overmeld slot (MateriaGrade `highColumn` 0).
    Uses the rows of the `statKeys` stats that carry items; rows with values but no items are decoys and are skipped.
    Raises SchemaError when a stat has no row or several, the rows disagree, a grade is missing or extra, a gate is
    unknown or lower than the grade before, or the high grades are not the ones worth more than their neighbours.
    Returns (table, number of decoy rows skipped)."""
    d = Path(csv_dir)
    m = fmt['materia']
    n = m['grades']
    sheet = f'{m["sheet"]}.csv'
    param = {s['key']: str(s['baseParam']) for s in fmt['stats']}
    wanted = {param[k]: k for k in m['statKeys']}
    item_cols = [f'{m["itemColumn"]}[{g}]' for g in range(n)]
    value_cols = [f'{m["valueColumn"]}[{g}]' for g in range(n)]
    rows = read_csv(d / sheet, ['#', m['statColumn'], *item_cols, *value_cols])
    level = {r['#']: r[m['gateColumn']] for r in read_csv(d / 'Item.csv', ['#', m['gateColumn']])}

    by_stat, decoys, problems = {}, 0, []
    for r in rows:
        key = wanted.get(r[m['statColumn']])
        if key is None:
            continue
        if r[item_cols[0]] in ('', '0'):
            decoys += 1
            continue
        by_stat.setdefault(key, []).append(r)
    for key in m['statKeys']:
        if len(by_stat.get(key, [])) != 1:
            problems.append(f'{key}: {len(by_stat.get(key, []))} rows with items, expected 1')
    if problems:
        raise SchemaError(f'{sheet}: ' + '; '.join(problems))

    def grade_index(col):
        """k for a column named Item[k] or Value[k], else None."""
        name, _, rest = col.partition('[')
        if name in (m['itemColumn'], m['valueColumn']) and rest[:-1].isdigit():
            return int(rest[:-1])
        return None

    tables = {}
    for key in m['statKeys']:
        r = by_stat[key][0]
        where = f'{key} (row {r["#"]})'
        extra = [c for c, v in r.items() if v not in ('', '0') and (grade_index(c) or 0) >= n]
        if extra:
            problems.append(f'{where} has more than {n} grades: {", ".join(extra)}')
        vals, gate = [r[c] for c in value_cols], []
        if not all(v.isdigit() and int(v) > 0 for v in vals):
            problems.append(f'{where} values {",".join(vals)}, expected {n} positive numbers')
        for c in item_cols:
            lv = level.get(r[c])
            if lv is None or not lv.isdigit():
                problems.append(f'{where} {c} = {r[c]}: no materia item with a {m["gateColumn"]}')
            gate.append(int(lv) if lv and lv.isdigit() else None)
        if None not in gate and any(b < a for a, b in zip(gate, gate[1:])):
            problems.append(f'{where} gates {",".join(map(str, gate))} decrease')
        tables[key] = ([int(v) if v.isdigit() else v for v in vals], gate)
    first = m['statKeys'][0]
    for key in m['statKeys'][1:]:
        if tables[key] != tables[first]:
            problems.append(f'{key} values or gates differ from {first}')
    if problems:
        raise SchemaError(f'{sheet} materia table: ' + '; '.join(problems))
    values, gate = tables[first]

    grade_sheet = f'{m["gradeSheet"]}.csv'
    grades = {r['#']: r[m['highColumn']] for r in read_csv(d / grade_sheet, ['#', m['highColumn']])}
    missing = [str(g) for g in range(n) if not (grades.get(str(g)) or '').isdigit()]
    if missing:
        raise SchemaError(f'{grade_sheet}: no {m["highColumn"]} for grade row(s) {", ".join(missing)}')
    high = [g + 1 for g in range(n) if grades[str(g)] == '0']
    # a high grade is worth more than each grade next to it (VI: 16, against V 6 and VII 8)
    peaks = [g + 1 for g in range(n) if all(values[g] > values[h] for h in (g - 1, g + 1) if 0 <= h < n)]
    if high != peaks:
        raise SchemaError(
            f'{grade_sheet}: grades {high} cannot pass the first overmeld slot, but {peaks} are worth more than their neighbours'
        )
    return {'values': values, 'gate': gate, 'high': high}, decoys


def select(csv_dir):
    """The gear the database keeps: (kept, multi_slot, crafter_gatherer), where kept is a list of (Item.csv row,
    database row) pairs in Item.csv order, multi_slot names the pieces left out because they block a combination of
    slots with no slot code in item-format.json, and crafter_gatherer names the pieces left out because they carry a
    crafter or gatherer stat (gear a combat job can wear but made for crafting or gathering)."""
    d = Path(csv_dir)
    fmt = load_format()
    param_idx = {s['baseParam']: i for i, s in enumerate(fmt['stats'])}  # BaseParam row id -> stat index
    n_stats = len(fmt['stats'])
    sf = fmt['statFactor']
    n_kinds = len(next(iter(stat_factors(d / 'BaseParam.csv', fmt).values())))
    dohdol = crafter_gatherer_params(d / 'BaseParam.csv', fmt)

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
    kept, multi_slot, crafter_gatherer, bad_kind, bad_meld, bad_rarity = [], [], [], [], [], []
    rarity_col = fmt['rarity']['itemColumn']
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
        if any(int(r[f'{c}[{i}]']) in dohdol for c in ('BaseParam', 'BaseParamSpecial') for i in range(N_ITEM_PARAMS)):
            crafter_gatherer.append(f'{r["Name"]} (item level {ilvl})')
            continue
        # Multi-slot gear needs its own slot code (summed slot share, blocked slots); a combination without one is
        # left out and listed, so a patch that adds more of it is noticed.
        if unsupported:
            multi_slot.append(f'{r["Name"]} (item level {ilvl})')
            continue
        kind = r[sf['itemColumn']]
        if not (kind.isdigit() and int(kind) < n_kinds):
            bad_kind.append(f'{r["Name"]} ({kind})')
            continue
        meld = meld_fields(r, fmt)
        if meld is None:
            bad_meld.append(f'{r["Name"]} ({r[fmt["materia"]["slotColumn"]]}, {r[fmt["materia"]["overmeldColumn"]]})')
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
                    int(kind),
                    *meld,
                    int(r[rarity_col]) if r[rarity_col].isdigit() else -1,
                ],
            )
        )
    if bad_kind:
        # an item kind BaseParam has no factor for: the page could not know the item's stat factors
        cols = f'{sf["baseParamColumn"]}[0..{n_kinds - 1}]'
        raise SchemaError(f'Item.csv {sf["itemColumn"]} outside BaseParam.csv {cols}: ' + ', '.join(bad_kind[:10]))
    bad_rarity = [f'{r["Name"]} ({r[rarity_col]!r})' for r, row in kept if row[12] < 0]
    if bad_rarity:
        raise SchemaError(f'Item.csv {rarity_col} is not a whole number: ' + ', '.join(bad_rarity[:10]))
    if bad_meld:
        m = fmt['materia']
        expect = f'{m["slotColumn"]} 0 to {m["maxSlots"]}, {m["overmeldColumn"]} True or False'
        raise SchemaError(f'Item.csv meld fields outside {expect}: ' + ', '.join(bad_meld[:10]))
    return kept, multi_slot, crafter_gatherer


def main(csv_dir, out, source='detect'):
    """source: provenance dict, None for unknown, or 'detect' to ask git about csv_dir. Only written as a header comment;
    the DATA_SOURCE constant lives in item-level.json."""
    if source == 'detect':
        source = provenance.detect(csv_dir)
    fmt = load_format()
    kept, multi_slot, crafter_gatherer = select(csv_dir)
    weapon_slots = {s['code'] for s in fmt['slots'] if s['type'] in ('weapon', 'offhand')}
    cats = gear_categories.categorize(csv_dir, kept, weapon_slots)
    problems = gear_categories.check(kept, cats)
    if problems:
        raise SchemaError(f'{len(problems)} gear category cross-check problem(s): ' + '; '.join(problems[:10]))
    masks = gear_categories.source_masks(kept, cats)
    rows = [[*row[:8], masks[r['#']], *row[9:]] for r, row in kept if cats[r['#']] not in gear_categories.RETIRED]
    # the generator and item-format.json must agree on where the trailing fields sit (materia.rowFields, rarity.rowField)
    fields = {**fmt['materia']['rowFields'], 'rarity': fmt['rarity']['rowField']}
    if rows and len(rows[0]) != max(fields.values()) + 1:
        raise SchemaError(f'item rows have {len(rows[0])} fields, item-format.json row fields expect {fields}')
    materia, decoys = materia_table(csv_dir, fmt)
    # A job no item is left for means the job columns or their values changed shape (e.g. 'True' became '1').
    seen = 0
    for r in rows:
        seen |= r[4]
    absent = [j for i, j in enumerate(fmt['jobs']) if not seen >> i & 1]
    if absent:
        raise SchemaError(f'ClassJobCategory.csv: no item is wearable by {", ".join(absent)}. Did the job columns change?')
    rows.sort(key=lambda x: (-x[2], x[1], x[0]))
    # one line, compact: {"_generated": notice, "source": provenance, "materia": table, "items": [rows]}
    doc = {'_generated': provenance.note(source), 'source': source, 'materia': materia, 'items': rows}
    provenance.write_generated(out, json.dumps(doc, ensure_ascii=False, separators=(',', ':')) + '\n')
    # the one message: gear of a new kind a patch added that the format cannot place yet (none today)
    if multi_slot:
        print(f'Warning: left out {len(multi_slot)} multi-slot pieces with no slot code: ' + ', '.join(multi_slot))


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('csv_dir')
    ap.add_argument('out', nargs='?', default='src/data/items.json')
    provenance.add_cli_args(ap)
    args = ap.parse_args()
    run_main(main, args.csv_dir, args.out, provenance.from_args(args))
