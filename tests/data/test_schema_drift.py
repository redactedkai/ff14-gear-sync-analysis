"""Tests that a game patch which renames or drops a column, or changes a slot share, stops the generators
(gen_items.py, gen_item_level.py, item_format.py and the source and category checks).

Each test edits a copy of the fixtures in tests/data/fixtures/ (described in common.py) with `edit_csv`, `rename_column`
and the helpers of SchemaDriftTest. ParamGrow (levels 0..100) is written in setUp.

Run: npm run test:py (npm run check:all runs them too)
"""

import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import common  # noqa: F401  (puts scripts/data on sys.path, so this comes before the generator imports)
import gear_activities
import gen_item_level
import gen_items
import item_format
from common import (
    FIXTURES,
    ROOT,
    edit_csv,
    rename_column,
    run_quiet,
    write_param_grow,
)
from item_format import SchemaError, load_format


class SchemaDriftTest(unittest.TestCase):
    """A game patch that renames or drops a column, or changes a slot share, must stop the generators."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)
        for f in FIXTURES.glob('*.csv'):
            shutil.copy(f, self.dir / f.name)
        write_param_grow(self.dir / 'ParamGrow.csv', range(0, 101))

    def tearDown(self):
        self.tmp.cleanup()

    def assert_fails(self, gen, *needles):
        with self.assertRaises(SchemaError) as cm:
            run_quiet(gen.main, str(self.dir), str(self.dir / 'out.js'))
        for n in needles:
            self.assertIn(n, str(cm.exception))
        self.assertFalse((self.dir / 'out.js').exists(), 'no output is written on a schema error')

    def test_unmodified_fixtures_pass(self):
        run_quiet(gen_items.main, str(self.dir), str(self.dir / 'items.json'))
        run_quiet(gen_item_level.main, str(self.dir), str(self.dir / 'item-level.json'))

    def test_renamed_job_column(self):
        rename_column(self.dir / 'ClassJobCategory.csv', 'SGE', 'SAGE')
        self.assert_fails(gen_items, 'ClassJobCategory.csv', 'SGE')

    def test_changed_job_values(self):
        def fn(rows):
            for r in rows[1:]:
                r[:] = ['1' if v == 'True' else v for v in r]

        edit_csv(self.dir / 'ClassJobCategory.csv', fn)
        self.assert_fails(gen_items, 'ClassJobCategory.csv', 'PLD', 'BLU')

    def test_boolean_columns_other_than_true_false(self):
        """CanBeHq, IsUnique and IsUntradable are read as the string 'True'; an exporter that wrote 1/0 instead must stop
        the generator rather than make every piece non-HQ, non-Unique or tradeable."""
        for col in ('CanBeHq', 'IsUnique', 'IsUntradable'):
            with self.subTest(col=col):
                shutil.copy(FIXTURES / 'Item.csv', self.dir / 'Item.csv')

                def fn(rows, col=col):
                    i = rows[0].index(col)
                    for r in rows[1:]:
                        r[i] = {'True': '1', 'False': '0'}[r[i]]

                edit_csv(self.dir / 'Item.csv', fn)
                self.assert_fails(gen_items, 'Item.csv', col, "'0', '1'", 'True or False')

    def test_missing_equip_slot_column(self):
        for col in ('Gloves', 'OffHand', 'MainHand', 'FingerL'):
            with self.subTest(col=col):
                shutil.copy(FIXTURES / 'EquipSlotCategory.csv', self.dir / 'EquipSlotCategory.csv')
                rename_column(self.dir / 'EquipSlotCategory.csv', col, col + 'X')
                self.assert_fails(gen_items, 'EquipSlotCategory.csv', col)

    def test_missing_item_column(self):
        cols = ('Name', 'EquipSlotCategory', 'LevelItem', 'LevelEquip', 'ClassJobCategory', 'CanBeHq', 'IsUnique', 'Rarity')
        cols += ('BaseParam[0]', 'BaseParamValue[5]', 'BaseParamSpecial[2]', 'BaseParamValueSpecial[5]')
        for col in cols:
            with self.subTest(col=col):
                shutil.copy(FIXTURES / 'Item.csv', self.dir / 'Item.csv')
                rename_column(self.dir / 'Item.csv', col, 'Renamed' + col)
                self.assert_fails(gen_items, 'Item.csv', col)

    def test_changed_totem_id(self):
        def fn(rows):
            col = rows[0].index('Name')
            next(r for r in rows if r[0] == '44743')[col] = 'Something Else'

        edit_csv(self.dir / 'Item.csv', fn)
        self.assert_fails(gen_items, 'ultimate totem', 'Oracle Totem', 'ULTIMATE_TOTEMS')

    def test_missing_source_columns(self):
        cols = (
            ('Recipe.csv', 'ItemResult'),
            ('SpecialShop.csv', 'UseCurrencyType'),
            ('TomestonesItem.csv', 'Item'),
            ('TomestonesItem.csv', 'Tomestones'),
            ('Quest.csv', 'Reward[0]'),
            ('Quest.csv', 'Festival'),
            ('QuestClassJobReward.csv', 'RewardItem[0]'),
            ('Achievement.csv', 'Item'),
            ('GCScripShopItem.csv', 'Item'),
            ('GilShop.csv', 'FestivalId'),
            ('GilShopItem.csv', 'QuestRequired[1]'),
            ('GilShopItem.csv', 'AchievementRequired'),
        )
        for sheet, col in cols:
            with self.subTest(col=col):
                shutil.copy(FIXTURES / sheet, self.dir / sheet)
                rename_column(self.dir / sheet, col, col + 'X')
                self.assert_fails(gen_items, sheet, col)
                shutil.copy(FIXTURES / sheet, self.dir / sheet)

    def test_changed_currency_id(self):
        # a currency the game files cannot place is keyed by id with its name: a patch that reuses the id stops the run
        def fn(rows):
            col = rows[0].index('Name')
            next(r for r in rows if r[0] == '26533')[col] = 'Something Else'

        edit_csv(self.dir / 'Item.csv', fn)
        self.assert_fails(gen_items, 'currency', 'Sack of Nuts')

    def test_changed_retired_shop_id(self):
        def fn(rows):
            col = rows[0].index('Name')
            next(r for r in rows if r[0] == '1769983')[col] = 'Something Else'

        edit_csv(self.dir / 'SpecialShop.csv', fn)
        self.assert_fails(gen_items, 'retired shop', 'Deepshadow Gear Exchange')

    def test_activity_with_no_box(self):
        # combat gear sold for a crafters' scrip (type 16, code 2) has no "Gear categories" box: a new kind of source stops the run
        def fn(rows):
            h = rows[0]
            r = next(r for r in rows if r[0] == '1769003')
            k = next(k for k in range(60) if r[h.index(f'Item[{k}].Item[0]')] == '1007')
            r[h.index(f'Item[{k}].ItemCost[0]')] = '2'

        edit_csv(self.dir / 'SpecialShop.csv', fn)
        self.assert_fails(gen_items, 'Scrips', 'Test Tonban', 'has no box', 'ACTIVITY_BOX')

    def test_missing_item_level_stat_column(self):
        rename_column(self.dir / 'ItemLevel.csv', 'DirectHitRate', 'DirectHit')
        self.assert_fails(gen_item_level, 'ItemLevel.csv', 'DirectHitRate')

    def test_missing_class_job_column(self):
        rename_column(self.dir / 'ClassJob.csv', 'ModifierVitality', 'ModifierVit')
        self.assert_fails(gen_item_level, 'ClassJob.csv', 'ModifierVitality')

    def test_missing_param_grow_column(self):
        rename_column(self.dir / 'ParamGrow.csv', 'LevelModifier', 'LevelMod')
        self.assert_fails(gen_item_level, 'ParamGrow.csv', 'LevelModifier')

    def test_base_param_slot_share_mismatch(self):
        def fn(rows):
            col = rows[0].index('RingPercent')
            next(r for r in rows if r[0] == '5')[col] = '70'  # Mind

        edit_csv(self.dir / 'BaseParam.csv', fn)
        self.assert_fails(gen_item_level, 'BaseParam.csv', 'mind RingPercent = 70, page uses 67')

    def test_base_param_missing_column(self):
        rename_column(self.dir / 'BaseParam.csv', 'TwoHandWeaponPercent', 'TwoHandPercent')
        self.assert_fails(gen_item_level, 'BaseParam.csv', 'TwoHandWeaponPercent')

    def test_base_param_missing_stat_row(self):
        edit_csv(self.dir / 'BaseParam.csv', lambda rows: rows.remove(next(r for r in rows if r[0] == '46')))
        self.assert_fails(gen_item_level, 'BaseParam.csv', 'no row 46 (sps)')

    def test_rarity_not_a_number(self):
        def fn(rows):
            col = rows[0].index('Rarity')
            next(r for r in rows if r[0] == '1005')[col] = 'green'  # Test Robe

        edit_csv(self.dir / 'Item.csv', fn)
        self.assert_fails(gen_items, 'Rarity', 'not a whole number', 'Test Robe')

    def test_damage_defense_not_a_number(self):
        """An empty weapon damage or defense cell is 0; a negative or malformed one stops the generator instead of
        silently becoming 0."""

        def fn(rows):
            col = rows[0].index('DefensePhys')
            next(r for r in rows if r[0] == '1005')[col] = '-5'  # Test Robe

        edit_csv(self.dir / 'Item.csv', fn)
        self.assert_fails(gen_items, 'DefensePhys', 'Test Robe', "'-5'")

    def test_unknown_level_scaled_value(self):
        """A SubStatCategory value the format does not know stops gen_items: it might be a new kind of scaling."""

        def fn(rows):
            col = rows[0].index('SubStatCategory')
            next(r for r in rows if r[0] == '1005')[col] = '3'  # Test Robe

        edit_csv(self.dir / 'Item.csv', fn)
        self.assert_fails(gen_items, 'SubStatCategory outside [0, 1, 2]', "Test Robe ('3')")

    def test_crafter_gatherer_param_renamed(self):
        """A crafter/gatherer stat row id that now names something else stops gen_items (item-format.json is stale)."""

        def fn(rows):
            next(r for r in rows if r[0] == '72')[1] = 'Gathering Rate'

        edit_csv(self.dir / 'BaseParam.csv', fn)
        self.assert_fails(gen_items, 'BaseParam.csv', '72 (Gathering)', 'Gathering Rate')

    def test_unknown_stat_factor_kind(self):
        """An item kind (BaseParamModifier) with no MeldParam column stops gen_items: its stat factors are unknown."""

        def fn(rows):
            col = rows[0].index('BaseParamModifier')
            next(r for r in rows if r[0] == '1015')[col] = '13'  # Test Tank Helm

        edit_csv(self.dir / 'Item.csv', fn)
        self.assert_fails(gen_items, 'BaseParamModifier', 'MeldParam[0..12]', 'Test Tank Helm (13)')

    def test_stat_factor_columns(self):
        rename_column(self.dir / 'BaseParam.csv', 'MeldParam[12]', 'MeldParam12')
        self.assert_fails(gen_item_level, 'BaseParam.csv', 'MeldParam[12]')
        self.assert_fails(gen_items, 'BaseParam.csv', 'MeldParam[12]')
        shutil.copy(FIXTURES / 'BaseParam.csv', self.dir / 'BaseParam.csv')
        rename_column(self.dir / 'Item.csv', 'BaseParamModifier', 'Modifier')
        self.assert_fails(gen_items, 'Item.csv', 'BaseParamModifier')

    def test_stat_factor_not_a_percent(self):
        def fn(rows):
            col = rows[0].index('MeldParam[5]')
            next(r for r in rows if r[0] == '3')[col] = '0'  # Vitality

        edit_csv(self.dir / 'BaseParam.csv', fn)
        self.assert_fails(gen_item_level, 'BaseParam.csv', 'vit MeldParam', 'percents 1 to 100')

    def test_missing_meld_columns(self):
        for col in ('MateriaSlotCount', 'IsAdvancedMeldingPermitted'):
            with self.subTest(col=col):
                shutil.copy(FIXTURES / 'Item.csv', self.dir / 'Item.csv')
                rename_column(self.dir / 'Item.csv', col, col + 'X')
                self.assert_fails(gen_items, 'Item.csv', col)
        shutil.copy(FIXTURES / 'Item.csv', self.dir / 'Item.csv')
        for sheet, col in (('Materia.csv', 'Item[11]'), ('Materia.csv', 'Value[0]'), ('MateriaGrade.csv', 'OvermeldNQPercent[1]')):
            with self.subTest(col=col):
                shutil.copy(FIXTURES / sheet, self.dir / sheet)
                rename_column(self.dir / sheet, col, col + 'X')
                self.assert_fails(gen_items, sheet, col)
                shutil.copy(FIXTURES / sheet, self.dir / sheet)

    def test_meld_slots_above_five(self):
        def fn(rows):
            col = rows[0].index('MateriaSlotCount')
            next(r for r in rows if r[0] == '1005')[col] = '6'  # Test Robe

        edit_csv(self.dir / 'Item.csv', fn)
        self.assert_fails(gen_items, 'MateriaSlotCount 0 to 5', 'Test Robe (6, False)')

    def test_bad_overmeld_value(self):
        def fn(rows):
            col = rows[0].index('IsAdvancedMeldingPermitted')
            next(r for r in rows if r[0] == '1005')[col] = '1'

        edit_csv(self.dir / 'Item.csv', fn)
        self.assert_fails(gen_items, 'IsAdvancedMeldingPermitted True or False', 'Test Robe (5, 1)')

    def test_combat_materia_rows_disagree(self):
        def fn(rows):
            col = rows[0].index('Value[11]')
            next(r for r in rows if r[0] == '15')[col] = '55'  # Critical Hit

        edit_csv(self.dir / 'Materia.csv', fn)
        self.assert_fails(gen_items, 'Materia.csv', 'crit values or gates differ from piety')

    def test_materia_gate_disagrees(self):
        """A materia item whose LevelItem differs from the other stats' item of that grade."""

        def fn(rows):
            col = rows[0].index('LevelItem')
            next(r for r in rows if r[0] == '41782')[col] = '700'  # Quicktongue Materia XII

        edit_csv(self.dir / 'Item.csv', fn)
        self.assert_fails(gen_items, 'Materia.csv', 'values or gates differ')

    def test_decoy_is_not_counted_but_a_second_item_row_is(self):
        def fn(rows):
            col = rows[0].index('Item[0]')
            next(r for r in rows if r[0] == '44')[col] = '5629'  # the Direct Hit decoy gets an item

        edit_csv(self.dir / 'Materia.csv', fn)
        self.assert_fails(gen_items, 'Materia.csv', 'dh: 2 rows with items, expected 1')

    def test_missing_combat_materia_row(self):
        edit_csv(self.dir / 'Materia.csv', lambda rows: rows.remove(next(r for r in rows if r[0] == '24')))
        self.assert_fails(gen_items, 'Materia.csv', 'sks: 0 rows with items')

    def test_thirteenth_grade(self):
        def fn(rows):
            h = rows[0]
            r = next(r for r in rows if r[0] == '7')  # Piety
            r[h.index('Item[12]')], r[h.index('Value[12]')] = '41770', '60'

        edit_csv(self.dir / 'Materia.csv', fn)
        self.assert_fails(gen_items, 'more than 12 grades', 'Item[12]', 'Value[12]')

    def test_high_grades_mismatch(self):
        def fn(rows):
            col = rows[0].index('OvermeldNQPercent[1]')
            next(r for r in rows if r[0] == '5')[col] = '6'  # grade VI now allowed past the first overmeld slot

        edit_csv(self.dir / 'MateriaGrade.csv', fn)
        self.assert_fails(gen_items, 'MateriaGrade.csv', 'grades [8, 10, 12]', '[6, 8, 10, 12]')

    def test_overmeld_rates_stops(self):
        for cell, value, words in [
            ('OvermeldHQPercent[2]', '', ('MateriaGrade.csv', 'grade row 0', 'hq')),  # empty
            ('OvermeldNQPercent[3]', '101', ('MateriaGrade.csv', 'grade row 0', 'nq')),  # over 100
            ('OvermeldNQPercent[1]', '90', ('MateriaGrade.csv', 'rise from one slot')),  # rises
            ('OvermeldHQPercent[0]', '79', ('MateriaGrade.csv', 'HQ rate is below')),
        ]:
            with self.subTest(cell=cell, value=value):
                shutil.copy(FIXTURES / 'MateriaGrade.csv', self.dir / 'MateriaGrade.csv')
                self.set_cell('MateriaGrade.csv', '0', cell, value)
                self.assert_fails(gen_items, *words)

    # one test per remaining stop: each edits a copy of the fixtures the way a patch might and expects the error to
    # name what changed

    def set_cell(self, sheet, row_id, column, value):
        def fn(rows):
            col = rows[0].index(column)
            next(r for r in rows if r[0] == row_id)[col] = value

        edit_csv(self.dir / sheet, fn)

    def drop_row(self, sheet, row_id):
        edit_csv(self.dir / sheet, lambda rows: rows.remove(next(r for r in rows if r[0] == row_id)))

    def test_changed_known_source_and_fixed_item_ids(self):
        # Neophyte's Ring is in ITEM_OVERRIDES too, which is checked first: KNOWN_SOURCE gets an entry whose name
        # the fixture's row 26533 (Sack of Nuts) does not have
        with mock.patch.dict(gear_activities.KNOWN_SOURCE, {26533: ('Something Else', 'Quest')}):
            self.assert_fails(gen_items, 'KNOWN_SOURCE', 'Something Else')
        self.set_cell('Item.csv', '25', 'Name', 'Something Else')  # Wolf Mark
        self.assert_fails(gen_items, 'FIXED_ITEMS', 'Wolf Mark')

    def test_category_with_no_drop_activity(self):
        with mock.patch.dict(gear_activities.DROP_ACTIVITY):
            del gear_activities.DROP_ACTIVITY['dungeon']
            self.assert_fails(gen_items, 'no drop activity', "'dungeon'", 'DROP_ACTIVITY')

    def test_no_current_tomestone(self):
        self.set_cell('TomestonesItem.csv', '3', 'Item', '0')
        self.assert_fails(gen_items, 'TomestonesItem.csv', 'no tomestone in slot(s) [3]')

    def test_special_shop_listing_columns_renamed(self):
        def fn(rows):
            rows[0] = [c.replace('].Item[', '].Thing[') for c in rows[0]]

        edit_csv(self.dir / 'SpecialShop.csv', fn)
        self.assert_fails(gen_items, 'SpecialShop.csv has no Item[k].Item[0] columns')

    def test_duplicate_item_id(self):
        edit_csv(self.dir / 'Item.csv', lambda rows: rows.append(list(next(r for r in rows if r[0] == '1005'))))
        self.assert_fails(gen_items, 'row ids are not unique')

    def test_gear_category_cross_check(self):
        # a recipe result filed as dungeon gear: the categories and the crafted flag disagree
        self.set_cell('Item.csv', '1020', 'SubcategorySort', '8270')
        self.assert_fails(gen_items, 'gear category cross-check', 'Test Sallet HQ', 'recipe result')

    def test_missing_materia_grade_row(self):
        self.drop_row('MateriaGrade.csv', '3')
        self.assert_fails(gen_items, 'MateriaGrade.csv', 'grade row(s) 3')

    def test_class_job_row_missing(self):
        self.drop_row('ClassJob.csv', '40')  # Sage
        self.assert_fails(gen_item_level, 'ClassJob.csv has no row for SGE')

    def test_class_job_modifier_not_positive(self):
        self.set_cell('ClassJob.csv', '40', 'ModifierMind', '0')
        self.assert_fails(gen_item_level, 'ClassJob.csv SGE', 'expected positive whole numbers')

    def test_param_grow_without_item_level_sync(self):
        def fn(rows):
            col = rows[0].index('ItemLevelSync')
            for r in rows[1:]:
                r[col] = '0'

        edit_csv(self.dir / 'ParamGrow.csv', fn)
        self.assert_fails(gen_item_level, 'ParamGrow.csv: no level has an ItemLevelSync')

    def test_damage_defense_slot_share_not_a_number(self):
        self.set_cell('BaseParam.csv', '12', 'TwoHandWeaponPercent', 'x')
        self.assert_fails(gen_item_level, 'BaseParam.csv slot shares', 'damagePhys', 'expected whole numbers')

    def test_slot_codes_not_contiguous(self):
        fmt = load_format()
        fmt['slots'][0]['code'] = 99
        with self.assertRaisesRegex(SchemaError, r'slot codes are not 0\.\.14'):
            item_format.slot_shares(self.dir / 'BaseParam.csv', fmt, fmt['damageDefense']['entries'])

    def test_command_line_exits_nonzero(self):
        rename_column(self.dir / 'ClassJobCategory.csv', 'SGE', 'SAGE')
        script = ROOT / 'scripts' / 'data' / 'gen_items.py'
        p = subprocess.run([sys.executable, str(script), str(self.dir), str(self.dir / 'out.js')], capture_output=True, text=True)
        self.assertEqual(p.returncode, 1)
        self.assertIn('SGE', p.stderr)
        self.assertNotIn('Traceback', p.stderr)
