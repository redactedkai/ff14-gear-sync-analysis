#!/usr/bin/env python3
"""Build src/data/items.json (the real-gear database) from the datamining CSVs.

Usage: python scripts/data/gen_items.py <path-to-ffxiv-datamining>/csv/en  [out.js]  [--source-commit SHA --source-date ISO]

Row format: [name, slotCode, ilvl, equipLevel, jobMask, "stats", unique, hq, routes, statFactor, meldSlots, overmeld, rarity,
            gameId, scales, category, damagePhys, damageMag, defensePhys, defenseMag]
  slotCode : index into `slots` in src/core/item-format.json (0=2H weapon 1=1H weapon 2=off-hand 3=head ... 11=ring,
             12=body that also covers the head)
  jobMask  : bit i set when `jobs[i]` in src/core/item-format.json can equip it
  stats    : in the order of `stats` in src/core/item-format.json  (HQ values = NQ + BaseParamValueSpecial)
  hq       : 1 when the item can be high quality (CanBeHq), so its stats are the HQ ones
  routes   : the ways to get the piece for the "Gear from" filter (gear_activities.py): a list of bit masks, any one of
             which gets it; bit i of a mask = `activities[i]` of item-format.json, and bit len(activities) the market
             board (tradeable pieces). Empty for a piece that can no longer be obtained
  statFactor : the item's BaseParamModifier, an index into the stat factor table MP of item-level.json (`statFactor` in
             item-format.json): stat k's full-share value on this item is multiplied by MP[k][statFactor] / 100
  meldSlots : guaranteed materia slots (Item.MateriaSlotCount, 0 to `materia.maxSlots` in item-format.json)
  overmeld  : 1 when the item allows overmelding (Item.IsAdvancedMeldingPermitted)
  rarity    : Item.Rarity (`rarity` in item-format.json: 1 white, 2 green, 3 blue, 4 purple, 7 pink)
  gameId    : the Item.csv row id (`gameId` in item-format.json), the id other tools and links use
  scales    : 1 when the item's item level follows the wearer's level (Item.SubStatCategory 2, `levelScaled` in
             item-format.json), else 0
  category  : the piece's gear category (gear_categories.py) as an index into `category.list` of item-format.json
  damagePhys, damageMag, defensePhys, defenseMag : weapon damage and defense (`damageDefense` in item-format.json):
             Item.DamagePhys etc., plus the HQ bonus (a BaseParamSpecial pair) when the item can be HQ; 0 when it has none

The file also holds the materia table {values, gate, high} (`materia` in item-format.json, see materia_table()) and
currentTomes, the short names of the two current tomestones (for the "Tomestones (Current)" box's hint).
"""

import argparse
from collections import Counter
from pathlib import Path

import gear_activities
import gear_categories
import provenance
from gear_sources import flags as gear_flags
from item_format import (
    N_ITEM_PARAMS,
    WEAPON_TYPES,
    SchemaError,
    check_bools,
    item_columns,
    load_format,
    meld_fields,
    read_csv,
    row_fields,
    run_main,
    slot_codes,
    stat_factors,
)

MIN_ILVL = 15


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


def damage_defense(row, fmt):
    """{damagePhys, damageMag, defensePhys, defenseMag} of an Item.csv row (`damageDefense` in item-format.json): each
    entry's item column, plus its HQ bonus (the BaseParamSpecial pair naming the entry's BaseParam row) when the item
    can be HQ, as for stats. A value that is not a whole number counts as 0 (rows without it leave it empty)."""
    out = {}
    for e in fmt['damageDefense']['entries']:
        v = row[e['itemColumn']]
        total = int(v) if v.isdigit() else 0
        if row['CanBeHq'] == 'True':
            for i in range(N_ITEM_PARAMS):
                if row[f'BaseParamSpecial[{i}]'] == str(e['baseParam']):
                    total += int(row[f'BaseParamValueSpecial[{i}]'])
        out[e['key']] = total
    return out


# The selection rules of select(), in the order they apply, with the words the drop report uses for each.
DROP_RULES = {
    'name': 'no name',
    'slot': 'no slot code (belts, soul crystals, not gear)',
    'ilvl': f'item level under {MIN_ILVL}',
    'job': 'no combat job',
    'stats': 'no stats',
    'crafter_gatherer': 'crafter or gatherer stat',
    'multi_slot': 'multi-slot with no slot code',
}


def select(csv_dir):
    """The gear the database keeps: (kept, multi_slot, dropped), where kept is a list of (Item.csv row, piece) pairs in
    Item.csv order. A piece is a dict of the row's fields by `itemRow.fields` name (item-format.json) except routes and
    category, which main() adds, plus `flags` (gear_sources.FLAGS: crafted, ultimate) for the categories. multi_slot
    names the pieces left out because they block a combination of slots with no slot code in item-format.json, and
    dropped is {DROP_RULES key: rows that rule left out} (a crafter or gatherer stat marks gear a combat job can wear
    but made for crafting or gathering)."""
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
    check_bools(items, ['CanBeHq', 'IsUnique'], 'Item.csv')
    src = gear_flags(d, items)
    kept, multi_slot, bad_kind, bad_meld = [], [], [], []
    dropped = dict.fromkeys(DROP_RULES, 0)
    rarity_col = fmt['rarity']['itemColumn']
    scaled = fmt['levelScaled']
    known_scaled = {str(v) for v in scaled['known']}
    for r in items:
        if not r['Name']:
            dropped['name'] += 1
            continue
        e = esc.get(r['EquipSlotCategory'])
        slot = slot_of(e)
        unsupported = slot is None and blocks_other_slots(e)  # multi-slot gear with no slot code: listed, not kept
        if slot is None and not unsupported:
            dropped['slot'] += 1
            continue
        ilvl = int(r['LevelItem'])
        if ilvl < MIN_ILVL:
            dropped['ilvl'] += 1
            continue
        mask = cjc.get(r['ClassJobCategory'], 0)
        if not mask:
            dropped['job'] += 1
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
            dropped['stats'] += 1
            continue
        if any(int(r[f'{c}[{i}]']) in dohdol for c in ('BaseParam', 'BaseParamSpecial') for i in range(N_ITEM_PARAMS)):
            dropped['crafter_gatherer'] += 1
            continue
        # Multi-slot gear needs its own slot code (summed slot share, blocked slots); a combination without one is
        # left out and listed, so a patch that adds more of it is noticed.
        if unsupported:
            dropped['multi_slot'] += 1
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
        piece = {
            'name': r['Name'],
            'slotCode': slot,
            'ilvl': ilvl,
            'equipLevel': int(r['LevelEquip']),
            'jobMask': mask,
            'stats': ','.join(map(str, st)),
            'unique': 1 if r['IsUnique'] == 'True' else 0,
            'hq': 1 if r['CanBeHq'] == 'True' else 0,
            'kind': int(kind),
            'meldSlots': meld[0],
            'overmeld': meld[1],
            'rarity': int(r[rarity_col]) if r[rarity_col].isdigit() else -1,
            'gameId': int(r['#']) if r['#'].isdigit() else -1,
            'scales': 1 if r[scaled['itemColumn']] == str(scaled['value']) else 0,
            **damage_defense(r, fmt),
            'flags': src.get(int(r['#']), 0),  # crafted / ultimate (gear_sources.FLAGS), for the categories
        }
        kept.append((r, piece))
    if bad_kind:
        # an item kind BaseParam has no factor for: the page could not know the item's stat factors
        cols = f'{sf["baseParamColumn"]}[0..{n_kinds - 1}]'
        raise SchemaError(f'Item.csv {sf["itemColumn"]} outside BaseParam.csv {cols}: ' + ', '.join(bad_kind[:10]))
    bad_rarity = [f'{r["Name"]} ({r[rarity_col]!r})' for r, piece in kept if piece['rarity'] < 0]
    if bad_rarity:
        raise SchemaError(f'Item.csv {rarity_col} is not a whole number: ' + ', '.join(bad_rarity[:10]))
    ids = [piece['gameId'] for r, piece in kept]
    bad_id = [f'{r["Name"]} ({r["#"]!r})' for r, piece in kept if piece['gameId'] < 0]
    if bad_id or len(set(ids)) != len(ids):
        raise SchemaError('Item.csv row ids are not unique whole numbers: ' + ', '.join(bad_id[:10]))
    bad_scaled = [f'{r["Name"]} ({r[scaled["itemColumn"]]!r})' for r, row in kept if r[scaled['itemColumn']] not in known_scaled]
    if bad_scaled:
        raise SchemaError(f'Item.csv {scaled["itemColumn"]} outside {scaled["known"]}: ' + ', '.join(bad_scaled[:10]))
    if bad_meld:
        m = fmt['materia']
        expect = f'{m["slotColumn"]} 0 to {m["maxSlots"]}, {m["overmeldColumn"]} True or False'
        raise SchemaError(f'Item.csv meld fields outside {expect}: ' + ', '.join(bad_meld[:10]))
    return kept, multi_slot, dropped


def category_index(fmt):
    """{category key: its index in `category.list` of item-format.json}, the value of a row's category field. Raises
    SchemaError unless the list holds every category a kept piece can have (gear_categories.CATEGORIES minus LEFT_OUT)
    exactly once and nothing else, so a category added to gear_categories.py can't reach the page without a label."""
    keys = [c['key'] for c in fmt['category']['list']]
    kept = set(gear_categories.CATEGORIES) - gear_categories.LEFT_OUT
    missing = sorted(kept - set(keys))
    unknown = sorted(set(keys) - kept)
    twice = sorted({k for k in keys if keys.count(k) > 1})
    if missing or unknown or twice:
        raise SchemaError(f'item-format.json category.list: missing {missing}, unknown {unknown}, listed twice {twice}')
    return {k: i for i, k in enumerate(keys)}


def main(csv_dir, out, source='detect'):
    """source: provenance dict, None for unknown, or 'detect' to ask git about csv_dir. Only written as a header comment;
    the DATA_SOURCE constant lives in item-level.json."""
    if source == 'detect':
        source = provenance.detect(csv_dir)
    fmt = load_format()
    kept, multi_slot, dropped = select(csv_dir)
    n_items = len(kept) + sum(dropped.values())
    cats = gear_categories.categorize(csv_dir, kept, slot_codes(fmt, WEAPON_TYPES))
    problems = gear_categories.check(kept, cats)
    if problems:
        raise SchemaError(f'{len(problems)} gear category cross-check problem(s): ' + '; '.join(problems[:10]))
    left_out = Counter(cats[r['#']] for r, _ in kept if cats[r['#']] in gear_categories.LEFT_OUT)
    kept = [(r, row) for r, row in kept if cats[r['#']] not in gear_categories.LEFT_OUT]
    routes = gear_activities.routes(csv_dir, kept, cats)
    cat_index = category_index(fmt)
    # each kept piece's fields plus its routes and category, in the order of `itemRow.fields` (row_fields raises if the
    # format file's rowField entries disagree with that list)
    fields = list(row_fields(fmt))
    pieces = [{**piece, 'routes': routes[r['#']], 'category': cat_index[cats[r['#']]]} for r, piece in kept]
    materia, _decoys = materia_table(csv_dir, fmt)
    # A job no item is left for means the job columns or their values changed shape (e.g. 'True' became '1').
    seen = 0
    for piece in pieces:
        seen |= piece['jobMask']
    absent = [j for i, j in enumerate(fmt['jobs']) if not seen >> i & 1]
    if absent:
        raise SchemaError(f'ClassJobCategory.csv: no item is wearable by {", ".join(absent)}. Did the job columns change?')
    pieces.sort(key=lambda p: (-p['ilvl'], p['slotCode'], p['name']))
    rows = [[piece[f] for f in fields] for piece in pieces]
    # {"_generated": notice, "source": provenance, "materia": table, "currentTomes": names, "items": [rows]}, one item
    # row per line so a patch's diff lists the rows that changed
    doc = {
        '_generated': provenance.note(source),
        'source': source,
        'materia': materia,
        'currentTomes': gear_activities.current_tome_names(csv_dir),
        'items': rows,
    }
    provenance.write_generated(out, provenance.json_lines(doc, expand=('items',), ensure_ascii=False))
    print(drop_report(n_items, dropped, left_out, len(rows)))
    # gear of a new kind a patch added that the format cannot place yet (none today)
    if multi_slot:
        print(f'Warning: left out {len(multi_slot)} multi-slot pieces with no slot code: ' + ', '.join(multi_slot))


def drop_report(n_items, dropped, left_out, n_kept):
    """One line: how many Item.csv rows each selection rule left out, in rule order, then the LEFT_OUT categories
    (gear_categories.py) by name, and the rows kept, for example 'Item.csv 52,801 rows: no name -1,921, ...; kept
    20,031'. A rule that left nothing out is skipped. The counts follow the selection figure of
    docs/engineering/data-pipeline.md, section 4."""
    parts = [f'{DROP_RULES[k]} -{n:,}' for k, n in dropped.items() if n]
    parts += [f'category {cat} (LEFT_OUT) -{n:,}' for cat, n in sorted(left_out.items())]
    return f'Item.csv {n_items:,} rows: ' + ', '.join(parts) + f'; kept {n_kept:,}'


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('csv_dir')
    ap.add_argument('out', nargs='?', default='src/data/items.json')
    provenance.add_cli_args(ap)
    args = ap.parse_args()
    run_main(main, args.csv_dir, args.out, provenance.from_args(args))
