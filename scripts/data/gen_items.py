#!/usr/bin/env python3
"""Build src/data/items.js (the real-gear database) from the datamining CSVs.

Usage: python scripts/data/gen_items.py <path-to-ffxiv-datamining>/csv/en  [out.js]

Row format: [name, slotCode, ilvl, equipLevel, jobMask, "12 stats", unique]
  slotCode : 0=2H weapon 1=1H weapon 2=off-hand 3=head 4=body 5=hands 6=legs 7=feet 8=ear 9=neck 10=wrist 11=ring
  jobMask  : bit i set when JOBS[i] (see src/core/constants.js) can equip it
  stats    : str,dex,int,mind,vit,piety,ten,dh,crit,det,sks,sps  (HQ values = NQ + BaseParamValueSpecial)
"""
import csv, json, sys
from pathlib import Path

JOB_ORDER = ['PLD','WAR','DRK','GNB','WHM','SCH','AST','SGE','MNK','DRG','SAM','RPR',
             'NIN','VPR','BRD','MCH','DNC','BLM','SMN','RDM','PCT','BLU']
# BaseParam row id -> index in the 12-stat vector
PARAM_IDX = {1:0, 2:1, 4:2, 5:3, 3:4, 6:5, 19:6, 22:7, 27:8, 44:9, 45:10, 46:11}
MIN_ILVL = 100

def main(csv_dir, out):
    d = Path(csv_dir)
    def rd(name): return list(csv.DictReader(open(d / name, encoding='utf-8')))
    esc = {r['#']: r for r in rd('EquipSlotCategory.csv')}
    cjc = {}
    for r in rd('ClassJobCategory.csv'):
        m = 0
        for i, j in enumerate(JOB_ORDER):
            if r.get(j) == 'True': m |= 1 << i
        cjc[r['#']] = m

    def slot_of(e):
        if e['MainHand'] == '1': return 0 if e['OffHand'] == '-1' else 1
        if e['OffHand'] == '1': return 2
        for k, c in (('Head',3),('Body',4),('Gloves',5),('Legs',6),('Feet',7),('Ears',8),('Neck',9),('Wrists',10)):
            if e[k] == '1': return c
        if e['FingerL'] == '1': return 11
        return None  # waist, soul crystal, nothing

    rows = []
    for r in rd('Item.csv'):
        if not r['Name']: continue
        slot = slot_of(esc.get(r['EquipSlotCategory'], {k: '0' for k in ('MainHand','OffHand','Head','Body','Gloves','Legs','Feet','Ears','Neck','Wrists','FingerL')}))
        if slot is None: continue
        ilvl = int(r['LevelItem'])
        mask = cjc.get(r['ClassJobCategory'], 0)
        if ilvl < MIN_ILVL or not mask: continue
        st = [0]*12
        for i in range(6):
            p = int(r[f'BaseParam[{i}]'])
            if p in PARAM_IDX:
                st[PARAM_IDX[p]] += int(r[f'BaseParamValue[{i}]'])
        if r['CanBeHq'] == 'True':  # only craftable/HQ-able items get the HQ bonus
            for i in range(6):
                p = int(r[f'BaseParamSpecial[{i}]'])
                if p in PARAM_IDX:
                    st[PARAM_IDX[p]] += int(r[f'BaseParamValueSpecial[{i}]'])
        if not any(st): continue
        rows.append([r['Name'], slot, ilvl, int(r['LevelEquip']), mask, ','.join(map(str, st)), 1 if r['IsUnique'] == 'True' else 0])
    rows.sort(key=lambda x: (-x[2], x[1], x[0]))
    Path(out).write_text('export const ITEMS=' + json.dumps(rows, ensure_ascii=False, separators=(',', ':')) + ';\n', encoding='utf-8')
    print(f'{len(rows)} rows -> {out}')

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else 'src/data/items.js')
