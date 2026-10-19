#!/usr/bin/env python3
"""Build src/data/items.json (the real-gear database) from the datamining CSVs.

Usage: python scripts/data/gen_items.py <path-to-ffxiv-datamining>/csv/en  [out.json]  [--source-commit SHA --source-date ISO]

Row format: the fields of `itemRow.fields` in src/core/item-format.json, in that order:
            [name, slotCode, ilvl, equipLevel, jobMask, "stats", unique, hq, routes, kind, meldSlots, overmeld, rarity,
            gameId, scales, category, damagePhys, damageMag, defensePhys, defenseMag]
  slotCode : index into `slots` in src/core/item-format.json (0=2H weapon 1=1H weapon 2=off-hand 3=head ... 11=ring,
             12=body that also covers the head, 13=legs that also cover the feet, 14=body that also covers the hands,
             legs and feet)
  jobMask  : bit i set when `jobs[i]` in src/core/item-format.json can equip it
  stats    : in the order of `stats` in src/core/item-format.json  (HQ values = NQ + BaseParamValueSpecial)
  hq       : 1 when the item can be high quality (CanBeHq), so its stats are the HQ ones
  routes   : the ways to get the piece for the "Gear from" filter (gear_activities.py): a list of bit masks, any one of
             which gets it; bit i of a mask = `activities[i]` of item-format.json, and bit len(activities) the market
             board (tradeable pieces). Empty for a piece that can no longer be obtained
  kind     : the item's BaseParamModifier, an index into the stat factor table MP of item-level.json (`statFactor` in
             item-format.json): stat k's full-share value on this item is multiplied by MP[k][kind] / 100
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
from typing import NamedTuple

import gear_activities
import gear_categories
import provenance
from gear_sources import flags as gear_flags
from item_format import (
    N_ITEM_PARAMS,
    WEAPON_TYPES,
    SchemaError,
    check_bools,
    load_format,
    meld_fields,
    read_csv,
    read_item_sheet,
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
    for param in fmt['crafterGathererParams']:
        found = names.get(str(param['baseParam']))
        if found != param['name']:
            bad.append(f'{param["baseParam"]} ({param["name"]}): found {found or "no row"!r}')
    if bad:
        raise SchemaError('BaseParam.csv crafter/gatherer stat rows changed: ' + '; '.join(bad))
    return {param['baseParam'] for param in fmt['crafterGathererParams']}


def materia_rows(rows, fmt, sheet):
    """Step 1 of the materia table: {stat key: its Materia row} for the `statKeys` stats, taking only rows whose first
    materia item is set, and the number of decoy rows (a combat substat's values with no materia item) skipped. Raises
    SchemaError unless exactly one row per stat is left."""
    materia = fmt['materia']
    stat_of_param = {str(s['baseParam']): s['key'] for s in fmt['stats'] if s['key'] in materia['statKeys']}
    first_item = f'{materia["itemColumn"]}[0]'
    by_stat, decoys = {}, 0
    for row in rows:
        key = stat_of_param.get(row[materia['statColumn']])
        if key is None:
            continue
        if row[first_item] in ('', '0'):
            decoys += 1
            continue
        by_stat.setdefault(key, []).append(row)
    problems = [
        f'{key}: {len(by_stat.get(key, []))} rows with items, expected 1' for key in materia['statKeys'] if len(by_stat.get(key, [])) != 1
    ]
    if problems:
        raise SchemaError(f'{sheet}: ' + '; '.join(problems))
    return {key: found[0] for key, found in by_stat.items()}, decoys


def grade_values(row, key, fmt, gate_of_item, problems):
    """Step 2 of the materia table, for one stat's Materia row: (values, gates), one per grade. Appends to `problems`
    a value that is not positive, a materia item with no gate (gate_of_item: {Item.csv id: LevelItem}), gates that
    decrease, or anything set in the item and value columns past the last grade."""
    materia = fmt['materia']
    n_grades = materia['grades']
    item_cols = [f'{materia["itemColumn"]}[{g}]' for g in range(n_grades)]
    value_cols = [f'{materia["valueColumn"]}[{g}]' for g in range(n_grades)]
    where = f'{key} (row {row["#"]})'

    def grade_index(col):
        """k for a column named Item[k] or Value[k], else None."""
        name, _, rest = col.partition('[')
        if name in (materia['itemColumn'], materia['valueColumn']) and rest[:-1].isdigit():
            return int(rest[:-1])
        return None

    extra = [col for col, v in row.items() if v not in ('', '0') and (grade_index(col) or 0) >= n_grades]
    if extra:
        problems.append(f'{where} has more than {n_grades} grades: {", ".join(extra)}')
    values = [row[col] for col in value_cols]
    if not all(v.isdigit() and int(v) > 0 for v in values):
        problems.append(f'{where} values {",".join(values)}, expected {n_grades} positive numbers')
    gates = []
    for col in item_cols:
        level = gate_of_item.get(row[col])
        if level is None or not level.isdigit():
            problems.append(f'{where} {col} = {row[col]}: no materia item with a {materia["gateColumn"]}')
        gates.append(int(level) if level and level.isdigit() else None)
    if None not in gates and any(b < a for a, b in zip(gates, gates[1:])):
        problems.append(f'{where} gates {",".join(map(str, gates))} decrease')
    return [int(v) if v.isdigit() else v for v in values], gates


def high_grades(grade_csv, values, fmt):
    """Step 4 of the materia table: the grades (1-based) whose `highColumn` in MateriaGrade is 0 (they cannot go past the
    first overmeld slot). Raises SchemaError when a grade row is missing, or when they are not exactly the grades worth
    more than each grade next to them (`values`; VI: 16, against V 6 and VII 8)."""
    materia = fmt['materia']
    n_grades = materia['grades']
    sheet = Path(grade_csv).name
    rate = {r['#']: r[materia['highColumn']] for r in read_csv(grade_csv, ['#', materia['highColumn']])}
    missing = [str(g) for g in range(n_grades) if not (rate.get(str(g)) or '').isdigit()]
    if missing:
        raise SchemaError(f'{sheet}: no {materia["highColumn"]} for grade row(s) {", ".join(missing)}')
    high = [g + 1 for g in range(n_grades) if rate[str(g)] == '0']
    peaks = [g + 1 for g in range(n_grades) if all(values[g] > values[h] for h in (g - 1, g + 1) if 0 <= h < n_grades)]
    if high != peaks:
        raise SchemaError(f'{sheet}: grades {high} cannot pass the first overmeld slot, but {peaks} are worth more than their neighbours')
    return high


def materia_table(csv_dir, fmt, items=None):
    """The materia table {values, gate, high}, one entry per grade (I first), from the Materia sheet (`materia` in
    item-format.json):
      values: what a grade adds to a combat substat (Materia Value);
      gate  : the lowest gear item level that takes it (the materia item's Item.LevelItem);
      high  : the grades (1-based) that cannot go past the first overmeld slot (MateriaGrade `highColumn` 0).
    Uses the rows of the `statKeys` stats that carry items; rows with values but no items are decoys and are skipped.
    Raises SchemaError when a stat has no row or several, the rows disagree, a grade is missing or extra, a gate is
    unknown or lower than the grade before, or the high grades are not the ones worth more than their neighbours.
    items: the Item.csv rows (read_item_sheet), read here when None. Returns (table, number of decoy rows skipped)."""
    csv_path = Path(csv_dir)
    materia = fmt['materia']
    n_grades = materia['grades']
    sheet = f'{materia["sheet"]}.csv'
    grade_cols = [f'{materia[c]}[{g}]' for c in ('itemColumn', 'valueColumn') for g in range(n_grades)]

    # 1. one Materia row per combat substat
    row_of, decoys = materia_rows(read_csv(csv_path / sheet, ['#', materia['statColumn'], *grade_cols]), fmt, sheet)

    # 2. each row's values and gates, then 3. all rows must agree
    gate_of_item = {r['#']: r[materia['gateColumn']] for r in read_item_sheet(csv_dir, items)}
    problems = []
    tables = {key: grade_values(row_of[key], key, fmt, gate_of_item, problems) for key in materia['statKeys']}
    first = materia['statKeys'][0]
    problems += [f'{key} values or gates differ from {first}' for key in materia['statKeys'][1:] if tables[key] != tables[first]]
    if problems:
        raise SchemaError(f'{sheet} materia table: ' + '; '.join(problems))
    values, gates = tables[first]

    # 4. the high grades, tied to the values
    high = high_grades(csv_path / f'{materia["gradeSheet"]}.csv', values, fmt)
    return {'values': values, 'gate': gates, 'high': high}, decoys


def damage_defense(row, fmt):
    """{damagePhys, damageMag, defensePhys, defenseMag} of an Item.csv row (`damageDefense` in item-format.json): each
    entry's item column, plus its HQ bonus (the BaseParamSpecial pair naming the entry's BaseParam row) when the item
    can be HQ, as for stats. An empty value counts as 0 (rows without it leave it empty); any other value that is not
    a whole number (negative, malformed) raises SchemaError instead of becoming 0."""
    out = {}
    for entry in fmt['damageDefense']['entries']:
        value = row[entry['itemColumn']]
        if value and not value.isdigit():
            raise SchemaError(
                f'Item.csv {entry["itemColumn"]} of {row["Name"]} ({row["#"]}) is {value!r}, expected a whole number or nothing'
            )
        total = int(value) if value else 0
        if row['CanBeHq'] == 'True':
            for i in range(N_ITEM_PARAMS):
                if row[f'BaseParamSpecial[{i}]'] == str(entry['baseParam']):
                    total += int(row[f'BaseParamValueSpecial[{i}]'])
        out[entry['key']] = total
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


def job_masks(class_job_category_csv, fmt):
    """{ClassJobCategory id: job mask}: bit i set when `jobs[i]` of item-format.json may equip (its column is True)."""
    masks = {}
    for row in read_csv(class_job_category_csv, ['#', *fmt['jobs']]):
        mask = 0
        for bit, job in enumerate(fmt['jobs']):
            if row[job] == 'True':
                mask |= 1 << bit
        masks[row['#']] = mask
    return masks


def slot_code(slot_row, fmt):
    """The slot code of an EquipSlotCategory row: the first slot (in format order) whose column is 1 and whose blocked
    slots (value -1) are exactly the ones the format names: OffHand for a two-handed weapon, the `blocks` types
    otherwise (a cloak: Head). Waist, soul crystal, non-gear, no row and an unsupported multi-slot combination give
    None."""
    if slot_row is None:
        return None
    column = {s['type']: s['equipSlotColumn'] for s in fmt['slots']}
    blocked = {col for col, v in slot_row.items() if v == '-1'}
    for slot in fmt['slots']:
        if slot_row[slot['equipSlotColumn']] != '1':
            continue
        expect = {'OffHand'} if slot.get('twoHanded') else {column[t] for t in slot.get('blocks', [])}
        if blocked == expect:
            return slot['code']
    return None


def blocks_other_slots(slot_row):
    """True for gear that occupies another slot too (an EquipSlotCategory value of -1)."""
    return slot_row is not None and any(v == '-1' for col, v in slot_row.items() if col != '#')


def item_stats(row, stat_index):
    """The item's stats in format order: each stat pair whose BaseParam is a format stat (stat_index: {BaseParam id:
    position}), plus the HQ pairs when the item can be HQ (only craftable, HQ-able items get the HQ bonus)."""
    stats = [0] * len(stat_index)
    pairs = [('BaseParam', 'BaseParamValue')] + ([('BaseParamSpecial', 'BaseParamValueSpecial')] if row['CanBeHq'] == 'True' else [])
    for param_col, value_col in pairs:
        for i in range(N_ITEM_PARAMS):
            param = int(row[f'{param_col}[{i}]'])
            if param in stat_index:
                stats[stat_index[param]] += int(row[f'{value_col}[{i}]'])
    return stats


def has_crafter_gatherer_stat(row, params):
    """True when any stat pair, normal or HQ, names one of `params` (crafter_gatherer_params)."""
    return any(int(row[f'{col}[{i}]']) in params for col in ('BaseParam', 'BaseParamSpecial') for i in range(N_ITEM_PARAMS))


def make_piece(row, fields, fmt):
    """The kept piece of an Item.csv row (see select): `fields` holds what the rules worked out (slotCode, ilvl,
    jobMask, stats, kind, meld, flags); the rest is copied from the row. rarity and gameId are -1 when not a whole
    number, for check_pieces to report."""
    rarity_col, scaled = fmt['rarity']['itemColumn'], fmt['levelScaled']
    meld_slots, overmeld = fields['meld']
    return {
        'name': row['Name'],
        'slotCode': fields['slotCode'],
        'ilvl': fields['ilvl'],
        'equipLevel': int(row['LevelEquip']),
        'jobMask': fields['jobMask'],
        'stats': ','.join(map(str, fields['stats'])),
        'unique': 1 if row['IsUnique'] == 'True' else 0,
        'hq': 1 if row['CanBeHq'] == 'True' else 0,
        'kind': fields['kind'],
        'meldSlots': meld_slots,
        'overmeld': overmeld,
        'rarity': int(row[rarity_col]) if row[rarity_col].isdigit() else -1,
        'gameId': int(row['#']) if row['#'].isdigit() else -1,
        'scales': 1 if row[scaled['itemColumn']] == str(scaled['value']) else 0,
        **damage_defense(row, fmt),
        'flags': fields['flags'],  # crafted / ultimate (gear_sources.FLAGS), for the categories
    }


def check_pieces(kept, bad_kind, bad_meld, n_kinds, fmt):
    """Raises SchemaError on a kept piece's field the page could not use: an item kind with no stat factor column
    (bad_kind), meld fields out of range (bad_meld), a rarity or row id that is not a whole number, a repeated row id,
    or a level-scaling value outside `levelScaled.known`. bad_kind and bad_meld: the names select() listed."""
    stat_factor, rarity_col, scaled = fmt['statFactor'], fmt['rarity']['itemColumn'], fmt['levelScaled']
    if bad_kind:
        # an item kind BaseParam has no factor for: the page could not know the item's stat factors
        cols = f'{stat_factor["baseParamColumn"]}[0..{n_kinds - 1}]'
        raise SchemaError(f'Item.csv {stat_factor["itemColumn"]} outside BaseParam.csv {cols}: ' + ', '.join(bad_kind[:10]))
    bad_rarity = [f'{r["Name"]} ({r[rarity_col]!r})' for r, piece in kept if piece['rarity'] < 0]
    if bad_rarity:
        raise SchemaError(f'Item.csv {rarity_col} is not a whole number: ' + ', '.join(bad_rarity[:10]))
    ids = [piece['gameId'] for _, piece in kept]
    bad_id = [f'{r["Name"]} ({r["#"]!r})' for r, piece in kept if piece['gameId'] < 0]
    if bad_id or len(set(ids)) != len(ids):
        raise SchemaError('Item.csv row ids are not unique whole numbers: ' + ', '.join(bad_id[:10]))
    known_scaled = {str(v) for v in scaled['known']}
    bad_scaled = [f'{r["Name"]} ({r[scaled["itemColumn"]]!r})' for r, _ in kept if r[scaled['itemColumn']] not in known_scaled]
    if bad_scaled:
        raise SchemaError(f'Item.csv {scaled["itemColumn"]} outside {scaled["known"]}: ' + ', '.join(bad_scaled[:10]))
    if bad_meld:
        materia = fmt['materia']
        expect = f'{materia["slotColumn"]} 0 to {materia["maxSlots"]}, {materia["overmeldColumn"]} True or False'
        raise SchemaError(f'Item.csv meld fields outside {expect}: ' + ', '.join(bad_meld[:10]))


class Selection(NamedTuple):
    """What select() keeps and leaves out.
    kept: (Item.csv row, piece) pairs in Item.csv order. A piece is a dict of the row's fields by `itemRow.fields` name
      (item-format.json) except routes and category, which main() adds, plus `flags` (gear_sources.FLAGS: crafted,
      ultimate) for the categories.
    multi_slot: the pieces left out because they block a combination of slots with no slot code in item-format.json.
    dropped: {DROP_RULES key: rows that rule left out} (a crafter or gatherer stat marks gear a combat job can wear but
      made for crafting or gathering).
    dangling: {sheet: named rows whose EquipSlotCategory or ClassJobCategory id has no row there} (none today); they
      count as no slot or no job, and the drop report names them."""

    kept: list
    multi_slot: list
    dropped: dict
    dangling: Counter


def select(csv_dir, items=None):
    """The gear the database keeps, and what each rule left out: a Selection. items: the Item.csv rows
    (read_item_sheet), read here when None."""
    csv_path = Path(csv_dir)
    fmt = load_format()

    # lookups: stat positions, item kinds, crafter and gatherer stats, slot and job mask by category id, gear flags
    stat_index = {s['baseParam']: i for i, s in enumerate(fmt['stats'])}  # BaseParam row id -> stat position
    n_kinds = len(next(iter(stat_factors(csv_path / 'BaseParam.csv', fmt).values())))
    crafter_gatherer = crafter_gatherer_params(csv_path / 'BaseParam.csv', fmt)
    slot_cols = ['#', 'MainHand', 'OffHand', *(s['equipSlotColumn'] for s in fmt['slots'])]
    slot_categories = {r['#']: r for r in read_csv(csv_path / 'EquipSlotCategory.csv', slot_cols)}
    mask_of_category = job_masks(csv_path / 'ClassJobCategory.csv', fmt)
    items = read_item_sheet(csv_dir, items)
    check_bools(items, ['CanBeHq', 'IsUnique'], 'Item.csv')
    flags = gear_flags(csv_path, items)

    # the rules, in DROP_RULES order: the first one a row fails leaves it out
    kept, multi_slot, bad_kind, bad_meld = [], [], [], []
    dropped = dict.fromkeys(DROP_RULES, 0)
    dangling = Counter()
    for row in items:
        if not row['Name']:
            dropped['name'] += 1
            continue
        slot_row = slot_categories.get(row['EquipSlotCategory'])
        if slot_row is None:
            dangling['EquipSlotCategory'] += 1
        slot = slot_code(slot_row, fmt)
        unsupported = slot is None and blocks_other_slots(slot_row)  # multi-slot gear with no slot code: listed, not kept
        if slot is None and not unsupported:
            dropped['slot'] += 1
            continue
        ilvl = int(row['LevelItem'])
        if ilvl < MIN_ILVL:
            dropped['ilvl'] += 1
            continue
        if row['ClassJobCategory'] not in mask_of_category:
            dangling['ClassJobCategory'] += 1
        mask = mask_of_category.get(row['ClassJobCategory'], 0)
        if not mask:
            dropped['job'] += 1
            continue
        stats = item_stats(row, stat_index)
        if not any(stats):
            dropped['stats'] += 1
            continue
        if has_crafter_gatherer_stat(row, crafter_gatherer):
            dropped['crafter_gatherer'] += 1
            continue
        # Multi-slot gear needs its own slot code (summed slot share, blocked slots); a combination without one is
        # left out and listed, so a patch that adds more of it is noticed.
        if unsupported:
            dropped['multi_slot'] += 1
            multi_slot.append(f'{row["Name"]} (item level {ilvl})')
            continue

        # kept: the fields the page needs, each checked below
        kind = row[fmt['statFactor']['itemColumn']]
        if not (kind.isdigit() and int(kind) < n_kinds):
            bad_kind.append(f'{row["Name"]} ({kind})')
            continue
        meld = meld_fields(row, fmt)
        if meld is None:
            bad_meld.append(f'{row["Name"]} ({row[fmt["materia"]["slotColumn"]]}, {row[fmt["materia"]["overmeldColumn"]]})')
            continue
        worked_out = {'slotCode': slot, 'ilvl': ilvl, 'jobMask': mask, 'stats': stats, 'kind': int(kind), 'meld': meld}
        kept.append((row, make_piece(row, {**worked_out, 'flags': flags.get(int(row['#']), 0)}, fmt)))

    check_pieces(kept, bad_kind, bad_meld, n_kinds, fmt)
    return Selection(kept, multi_slot, dropped, dangling)


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
    items = read_item_sheet(csv_dir)  # the largest sheet, read once and passed on
    selection = select(csv_dir, items)
    kept, dropped = selection.kept, selection.dropped
    n_items = len(kept) + sum(dropped.values())
    cats = gear_categories.categorize(csv_dir, kept, slot_codes(fmt, WEAPON_TYPES), items)
    problems = gear_categories.check(kept, cats)
    if problems:
        raise SchemaError(f'{len(problems)} gear category cross-check problem(s): ' + '; '.join(problems[:10]))
    left_out = Counter(cats[r['#']] for r, _ in kept if cats[r['#']] in gear_categories.LEFT_OUT)
    kept = [(r, row) for r, row in kept if cats[r['#']] not in gear_categories.LEFT_OUT]
    routes, inferred = gear_activities.routes(csv_dir, kept, cats, items)
    cat_index = category_index(fmt)
    # each kept piece's fields plus its routes and category, in the order of `itemRow.fields` (row_fields raises if the
    # format file's rowField entries disagree with that list)
    fields = list(row_fields(fmt))
    pieces = [{**piece, 'routes': routes[r['#']], 'category': cat_index[cats[r['#']]]} for r, piece in kept]
    materia, _decoys = materia_table(csv_dir, fmt, items)
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
        'currentTomes': gear_activities.current_tome_names(csv_dir, items),
        'items': rows,
    }
    provenance.write_generated(out, provenance.json_lines(doc, expand=('items',), ensure_ascii=False))
    print(drop_report(n_items, dropped, left_out, len(rows), selection.dangling))
    print(gear_activities.inferred_report(inferred))
    # gear of a new kind a patch added that the format cannot place yet (none today)
    if selection.multi_slot:
        multi_slot = selection.multi_slot
        print(f'Warning: left out {len(multi_slot)} multi-slot pieces with no slot code: ' + ', '.join(multi_slot))


def drop_report(n_items, dropped, left_out, n_kept, dangling=None):
    """One line: how many Item.csv rows each selection rule left out, in rule order, then the LEFT_OUT categories
    (gear_categories.py) by name, and the rows kept, for example 'Item.csv 52,801 rows: no name -1,921, ...; kept
    20,031'. A rule that left nothing out is skipped. The counts follow the selection figure of
    docs/engineering/data-pipeline.md, section 4. dangling (Selection.dangling): rows whose slot or job category id
    has no row, named after the rule they fall under when there are any."""
    dangling = dangling or {}
    under = {'slot': 'EquipSlotCategory', 'job': 'ClassJobCategory'}
    parts = []
    for rule, n in dropped.items():
        if n:
            sheet = under.get(rule)
            note = f' ({dangling[sheet]:,} with an id that has no {sheet} row)' if dangling.get(sheet) else ''
            parts.append(f'{DROP_RULES[rule]} -{n:,}{note}')
    parts += [f'category {cat} (LEFT_OUT) -{n:,}' for cat, n in sorted(left_out.items())]
    return f'Item.csv {n_items:,} rows: ' + ', '.join(parts) + f'; kept {n_kept:,}'


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('csv_dir')
    ap.add_argument('out', nargs='?', default='src/data/items.json')
    provenance.add_cli_args(ap)
    args = ap.parse_args()
    run_main(main, args.csv_dir, args.out, provenance.from_args(args))
