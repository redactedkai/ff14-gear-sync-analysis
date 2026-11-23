# Reading the session files

For an agent or script that checks a gear sync model against the plugin's recordings. Marks: **Verified** (checked against recordings), **Inferred**, **Unknown**.

## Where the files are

- The plugin saves to the folder chosen on its Config tab, or to a `snapshots` folder next to the plugin's DLL.
- A session is two files with the same stem: `session-<UTC time>-territory<id>-<hash>.jsonl` and `.pieces.json`.
- Read both as UTF-8. The `.jsonl` has one JSON object per line.

## The session file (`.jsonl`)

Lines come in this order. Each has `type` and `timestampUtc`.

| `type` | Count | Holds |
|---|---|---|
| `sessionStart` | one | `schemaVersion`, `note`, `context`, `territoryId`, `syncedLevel`, `isLevelSynced`, `baseStats`, `totals`, `equipped` |
| `gearChange` | any number | `seq`, `removed`, `added`, `totals`, `gearChangedUtc`, `statsChangedUtc`, and the sync fields |
| `statsChange` | any number | the same as `gearChange` without the piece lists (for example a food buff) |
| `sessionEnd` | one | `changes`, `reason` (`Stopped` is a clean end) |

- `totals` and `baseStats` are lists of `{paramId, name, value}`. Totals hold the stats the game reports in the duty, synced when the duty syncs.
- `equipped` holds each worn piece with its sheet data: `slot`, `slotName`, `itemId`, `name`, `isHq`, `levelEquip`, `itemLevel`, `subStatCategory`, `damagePhys`, `damageMag`, `defensePhys`, `defenseMag`, `baseStats`, `materia`.
- `removed` and `added` hold `{slot, slotName, itemId, name, isHq, materia}`. Join them to `equipped` by `itemId`.
- Each change line repeats `territoryId`, `syncedLevel` and `isLevelSynced`.
- `statsChangedUtc` minus `gearChangedUtc` is how long the game took to update the stats after a gear change.

### Stat ids (`paramId`)

| id | Stat | id | Stat |
|---|---|---|---|
| 1 | Strength | 22 | Direct Hit Rate |
| 2 | Dexterity | 23 | Evasion |
| 3 | Vitality | 24 | Magic Defense |
| 4 | Intelligence | 27 | Critical Hit |
| 5 | Mind | 33 | Attack Magic Potency |
| 6 | Piety | 34 | Healing Magic Potency |
| 14 | Auto-attack Delay | 44 | Determination |
| 19 | Tenacity | 45 | Skill Speed |
| 20 | Attack Power | 46 | Spell Speed |
| 21 | Defense | 47 | Haste |

Physical Damage and Magic Damage never appear in the totals. The weapon's damage is in `equipped` (`damagePhys`, `damageMag`) as the sheet value without the HQ bonus. It is the unsynced value.

## The context block

`context` has the duty and the character. The fields that decide the sync:

| Field | Use |
|---|---|
| `contentFinderConditionId`, `dutyName`, `territoryId` | which duty (the duty id is 0 outside a duty) |
| `classJobLevelRequired`, `classJobLevelSync` | the duty sheet's levels. A sync level of 0 means none. |
| `itemLevelRequired`, `itemLevelSync` | the duty sheet's item levels. 0 means none. |
| `allowMinimumIL`, `fixedItemLevelSync` | what the duty allows |
| `minimumItemLevelOn`, `minimumItemLevelSource` | whether Minimum IL was on, and where the plugin read it |
| `finderSettings` | the Duty Finder flags now and for the queue that popped |
| `jobId`, `jobAbbreviation`, `realLevel`, `currentItemLevel` | the character (`currentItemLevel` is the unsynced average) |

## Which sync a session used

- **Unsynced:** `isLevelSynced` is false.
- **Level sync:** `isLevelSynced` is true, `syncedLevel` equals `classJobLevelSync`, and `minimumItemLevelOn` is false.
- **Minimum IL:** `minimumItemLevelOn` is true and `isLevelSynced` is true, with `syncedLevel` equal to `classJobLevelRequired`.
- `note` is the label the player typed, or `<duty name> - Unsynced`, `- Lvl Synced` or `- Min IL` when left empty. The data fields above decide. The note is a cross-check.

## What the model needs

| Sync | Model input |
|---|---|
| Unsynced | no sync |
| Level sync | level = `classJobLevelSync` |
| Minimum IL | level = `classJobLevelRequired`. Item level cap = `itemLevelRequired` when above 0. When it is 0, no cap, and the level alone decides the item level. |

Verified on the duties recorded, Inferred as a rule for all duties. A Minimum IL session read with `classJobLevelSync` instead of `classJobLevelRequired` gives stats that are a few points too high.

## The pieces file (`.pieces.json`)

One JSON object with `sessionFile`, `context`, `pieces`, `contradictions` and `skipped`. Each piece has `slot`, `slotName`, `itemId`, `name`, `isHq`, `materia`, `stats` (what the piece added to the totals in the duty, non-zero only) and `measurements`.

- A piece's value is the total before its removal minus the total after, from a change where one piece left and none entered.
- A piece the player took off and put back is measured again. Two rings of the same item give the same values.
- `contradictions` lists pieces measured more than once with different values. `skipped` lists changes that could not be used and why (several pieces at once, a swap).
- The weapon and Soul Crystal cannot be removed in a duty, so they have no value.

## Checks to run on every session

1. Start totals equal end totals plus the sum of the removed pieces, per stat (a piece worn twice counts twice).
2. The `.pieces.json` values equal the per-removal differences recomputed from the `.jsonl`.
3. `sessionEnd.reason` is `Stopped` and `sessionEnd.changes` equals the number of change lines.
4. Compare model and game per stat of each piece. Attack Magic Potency and Healing Magic Potency follow Mind, Attack Power follows the main stat (Strength or Dexterity), and Defense and Magic Defense follow the model's defense values.

## Things that look wrong and are not

- `baseStats` on the first line are the unsynced base stats, even in a synced duty. Only the totals carry the synced values.
- A stat that falls to 0 is written as 0 and stays listed. A stat that was never non-zero is left out.
- Accessories carry a small Defense and Magic Defense unsynced, and 0 when synced.
- `Auto-attack Delay` is the weapon's delay and does not change under sync.
- The weapon's damage is never measured under sync, so a model's value for it is a prediction.

## Not covered by the recordings

Duties with an item level cap, fixed-stat duties, jobs and weapon types not yet recorded, melded gear, and weapon stats under sync. Check the files in the folder for which jobs and duties exist.
