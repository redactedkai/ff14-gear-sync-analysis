/* For the Sheets stories: the fields a `sheet-action` event's detail may have, read by name the way the stories record them
   into the `events` output (the detail is a union by `action`, and a story writes one line for every kind). */
import type { SheetAction } from '../../../src/ui/elements/sheets/sheet-action.ts';

/* The union's fields a story records, each missing on the kinds that do not have it. */
export interface ActionFields {
  action: string;
  kind?: unknown;
  id?: unknown;
  index?: number;
  step?: number;
  value?: unknown;
  mode?: unknown;
  name?: string;
}

/* The detail of a `sheet-action` event as ActionFields (the same object). */
export function actionFields(detail: SheetAction): ActionFields {
  return detail;
}
