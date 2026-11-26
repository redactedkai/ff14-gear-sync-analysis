/* What the Sheets screen does for the events of its elements: each `sheet-action` event (sheet-action.ts) of <gsa-sheet-manager>,
   <gsa-sheet-page> and <gsa-set-page> is answered with a call to the sheets store, the app store or a dialog, and the pick of the
   caret menu after a sheet's name (<gsa-switch-menu>) goes to the manager, another sheet or a New sheet dialog. Plain functions of
   a port (the screen's model implements it), so Node tests run them. */
import type { AppFacade } from '../../store/app-facade.ts';
import type { SheetsFacade } from '../../store/sheets-facade.ts';
import type { SheetAction } from './sheet-action.ts';
import type { SheetDialogs } from './sheet-dialogs-model.ts';
import type { SwitchPick } from './switch-menu.ts';

/* What the answers need: the two stores, the dialogs, and the "not found" screen's button. */
export interface AnswerPort {
  sheets: SheetsFacade;
  app: AppFacade;
  dialogs: SheetDialogs;
  goMissing(): void;
  syncPlace(): void;
}

/* The answer to each action, by its `action` name: `port` is the screen's model, `detail` the event's detail. An action with a
   `result` field has it filled in here. */
const ANSWERS: { [Name in SheetAction['action']]: (port: AnswerPort, detail: Extract<SheetAction, { action: Name }>) => void } = {
  new: ({ dialogs, sheets }, detail) => (detail.kind === 'sheet' ? dialogs.openNewSheet(detail.opener) : void sheets.newSet()),
  open: ({ sheets }, detail) => (detail.kind === 'sheet' ? sheets.openSheet(detail.id) : sheets.openSet(detail.id)),
  edit: ({ dialogs }, detail) =>
    detail.kind === 'sheet' ? dialogs.openEditSheet(detail.id, detail.opener) : dialogs.openEditSet(detail.id, detail.opener),
  copy: ({ dialogs, sheets }, detail) =>
    detail.kind === 'sheet' ? dialogs.openCopy(detail.id, detail.opener) : void sheets.copySet(detail.id),
  delete: ({ dialogs }, detail) => dialogs.askDelete(detail.kind, detail.id, detail.opener),
  move: ({ sheets }, detail) =>
    detail.kind === 'sheet' ? sheets.moveSheet(detail.from, detail.to) : sheets.moveSet(detail.from, detail.to),
  step: ({ sheets }, detail) => {
    detail.result = detail.kind === 'sheet' ? sheets.stepSheet(detail.index, detail.step) : sheets.stepSet(detail.index, detail.step);
  },
  'to-manager': ({ sheets }) => sheets.openManager(),
  'leave-missing': port => port.goMissing(),
  figures: ({ app }, detail) => app.setSheetFigures(detail.mode),
  level: ({ sheets }, detail) => {
    detail.result = sheets.setLevel(detail.value);
  },
  cap: ({ sheets }, detail) => {
    detail.result = sheets.setCap(detail.value);
  },
  sync: ({ sheets }, detail) => {
    detail.result = sheets.setSyncOn(detail.on);
  },
  clan: ({ sheets }, detail) => sheets.setClan(detail.name || null),
  party: ({ sheets }, detail) => sheets.setPartyRoles(detail.value),
};

/* Answers one action of an element (`detail`: the `sheet-action` event's detail). */
export function answerSheetAction(port: AnswerPort, detail: SheetAction): void {
  (ANSWERS[detail.action] as (port: AnswerPort, detail: SheetAction) => void)(port, detail);
}

/* Answers a pick in the caret menu after a sheet's name (`pick`: the <gsa-switch-menu> element's switch-pick event detail): the
   manager, another sheet, or a New sheet dialog over the manager. */
export function pickSheet(port: AnswerPort, pick: SwitchPick): void {
  const { sheets, dialogs } = port;
  if (pick.kind === 'all') {
    sheets.openManager();
  } else if (pick.kind === 'item') {
    if (pick.id !== sheets.sheetId && pick.id !== null) {
      sheets.openSheet(pick.id);
    }
  } else {
    sheets.openManager();
    // the set page's leave question may hold the move: then the sheet stays open and no dialog opens
    if (sheets.sheetId === null) {
      // the move to the manager is this pick, not a change of page that closes the dialog on the next draw
      port.syncPlace();
      dialogs.openNewSheet(pick.opener);
    }
  }
}
