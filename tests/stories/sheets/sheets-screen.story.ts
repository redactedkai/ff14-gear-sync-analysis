/* Story of <gsa-sheets-screen>: the Sheets tab's screen over a real page store, as main.js gives it its ports: one Sage sheet with two
   gear sets, the first set's page open. A button outside the screen opens the other set (what a click on its row does), as the router
   would. No Auto-fill is run here. */
import { html } from 'lit';
import '../../../src/ui/elements/sheets/sheets-screen.ts';
import { sageSet, sheetOf } from '../../unit/helpers/fixtures/sheet-fixtures.ts';
import { pagePorts } from '../shared/page-ports.ts';

/* The two sets' names and ids, and the button that opens the second. */
export const FIRST_SET = { id: 'g_1', name: 'Raid' };
export const SECOND_SET = { id: 'g_2', name: 'Dungeons' };
export const OPEN_SECOND_LABEL = 'Open the second set';

export const Default = () => {
  const ports = pagePorts({ sheets: [sheetOf('SGE', [sageSet(FIRST_SET), sageSet(SECOND_SET)])] });
  ports.sheets.openSheet('s_1');
  ports.sheets.openSet(FIRST_SET.id);
  return html`
    <button type="button" @click=${() => ports.sheets.openSet(SECOND_SET.id)}>${OPEN_SECOND_LABEL}</button>
    <gsa-sheets-screen .ports=${ports}></gsa-sheets-screen>
  `;
};
