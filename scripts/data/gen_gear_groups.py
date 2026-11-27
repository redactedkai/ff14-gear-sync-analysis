#!/usr/bin/env python3
"""Build src/data/gear-groups.json (which jobs share gear, for Copy sheet) from the item database.

Usage: python scripts/data/gen_gear_groups.py [items.json] [out.json]

Output: {"_generated": notice, "source": ..., "formatVersion": n, "groups": [[job id, ...], ...]}
One group per line, jobs in the job bit order, groups ordered by their first job. Every job is in exactly one group.

The rule (`gearGroups` and `jobLevelCaps` in src/core/item-format.json): over the pieces of the listed slot types, two
jobs are linked when `linkPercent` percent or more of the pieces either can wear are pieces both can (shared / either,
by each row's job mask). A group is jobs linked pairwise that also have the same level cap, so Blue Mage (cap 80) and
Beastmaster (cap 50), whose gear overlaps the casters' and the Monk and Samurai's, each stand alone.

It reads items.json, not the CSVs, so it runs after gen_items.py and its source is items.json's. Stops with exit
status 1 (SchemaError) when the data is not clean: jobs linked through a third job but not to each other (a group
that is not a clique), or an unlinked pair sharing `unlinkedPercentMax` percent or more (no clear gap).
"""

import argparse
import itertools
import json
from argparse import ArgumentParser, Namespace
from collections.abc import Collection, Sequence
from pathlib import Path

import provenance
from item_format import ROOT, GearGroupsFormat, ItemFormat, ItemRow, SchemaError, load_format, row_fields, run_main, whole


def wearers_by_job(rows: Sequence[ItemRow], fields: dict[str, int], jobs: Sequence[str], slot_codes: Collection[int]) -> list[set[int]]:
    """[set of row indexes, ...] one per job (in job bit order): the rows of `slot_codes` whose job mask has the job."""
    slot, mask = fields['slotCode'], fields['jobMask']
    sets: list[set[int]] = [set() for _ in jobs]
    for index, row in enumerate(rows):
        if whole(row, slot) not in slot_codes:
            continue
        for bit in range(len(jobs)):
            if (whole(row, mask) >> bit & 1) != 0:
                sets[bit].add(index)
    return sets


def gear_groups(rows: Sequence[ItemRow], fmt: ItemFormat) -> list[list[str]]:
    """[[job id, ...], ...]: the gear groups of the item rows `rows` under the rule in the module comment."""
    jobs: list[str] = fmt['jobs']
    rule: GearGroupsFormat = fmt['gearGroups']
    caps: dict[str, int] = fmt['jobLevelCaps']
    fields: dict[str, int] = row_fields(fmt)
    slot_codes: set[int] = {s['code'] for s in fmt['slots'] if s['type'] in rule['slotTypes']}
    sets: list[set[int]] = wearers_by_job(rows, fields, jobs, slot_codes)
    for job, wearable in zip(jobs, sets, strict=True):
        if len(wearable) == 0:
            raise SchemaError(f'{job} can wear no piece of {", ".join(rule["slotTypes"])}: is the job mask order still right?')

    linked: set[tuple[int, int]] = set()
    for a, b in itertools.combinations(range(len(jobs)), 2):
        share: float = 100 * len(sets[a] & sets[b]) / len(sets[a] | sets[b])
        if share >= rule['linkPercent']:
            linked.add((a, b))
        elif share >= rule['unlinkedPercentMax']:
            raise SchemaError(
                f'{jobs[a]} and {jobs[b]} share {share:.0f}% of their pieces: between {rule["unlinkedPercentMax"]}% and '
                f'{rule["linkPercent"]}%, so the gear groups are not clear. Update gearGroups in {ROOT.name}/src/core/item-format.json.'
            )

    groups: list[list[str]] = []
    placed: set[int] = set()
    for a in range(len(jobs)):
        if a in placed:
            continue
        members: list[int] = [b for b in range(len(jobs)) if b == a or (min(a, b), max(a, b)) in linked]
        members = [b for b in members if caps.get(jobs[b]) == caps.get(jobs[a])]
        for b, c in itertools.combinations(members, 2):
            if (b, c) not in linked:
                raise SchemaError(f"{jobs[a]}'s group is not a clique: {jobs[b]} and {jobs[c]} are not linked to each other")
        if len(placed & set(members)) > 0:
            raise SchemaError(f"{jobs[a]}'s group overlaps an earlier group")
        placed.update(members)
        groups.append([jobs[b] for b in members])
    return groups


def main(items_path: str | Path, out: str | Path) -> None:
    doc = json.loads(Path(items_path).read_text(encoding='utf-8'))
    fmt: ItemFormat = load_format()
    if doc['formatVersion'] != fmt['formatVersion']:
        found = doc['formatVersion']
        raise SchemaError(f'{items_path} has format version {found}, expected {fmt["formatVersion"]}: run gen_items.py first')
    source = doc['source']
    result = {
        '_generated': provenance.note(source),
        'source': source,
        'formatVersion': fmt['formatVersion'],
        'groups': gear_groups(doc['items'], fmt),
    }
    provenance.write_generated(out, provenance.json_lines(result, expand=('groups',)))  # one group per line


if __name__ == '__main__':
    ap: ArgumentParser = argparse.ArgumentParser()
    _ = ap.add_argument('items', nargs='?', default='src/data/items.json')
    _ = ap.add_argument('out', nargs='?', default='src/data/gear-groups.json')
    args: Namespace = ap.parse_args()
    run_main(main, args.items, args.out)
