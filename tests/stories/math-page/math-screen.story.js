/* Story of <gsa-math-screen>: the Math tab's screen over a real page store, as main.js gives it its ports: the bar and the three
   sub-tabs, Stat Allocation open. */
import { html } from 'lit';
import '../../../src/ui/elements/math-page/math-screen.ts';
import { pagePorts } from '../shared/page-ports.js';

/* The job the screen starts with (the page's neutral default) and one to pick, with the name the Job box shows for it. */
export const START_JOB_NAME = 'Paladin';
export const PICKED_JOB = { id: 'SGE', name: 'Sage' };

export const Default = () => {
  const ports = pagePorts({ tab: 'math' });
  return html`<gsa-math-screen .ports=${ports}></gsa-math-screen>`;
};
