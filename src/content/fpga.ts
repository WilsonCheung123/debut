// The FPGA board's panel (SPEC 4.4): Architect. Three or four sentences,
// Wilson's facts only, nothing claimed on the company's behalf.
import { p, esc, type PanelContent } from './types';

export const fpga: PanelContent = {
  kicker: 'Architect',
  title: 'The first intern',
  html: [
    p('I was the first intern at Architect.'),
    p('I sourced training data and helped post-train a state-of-the-art Verilog model.'),
    p('[One line, in your words, on what that work was actually like.]'),
    p('The team recently hit a few milestones. Their own write-up:'),
    `<p><a class="btn" style="display:inline-block" href="${esc('https://architectlabs.com/blog/redwood')}" target="_blank" rel="noopener">architectlabs.com/blog/redwood</a></p>`,
  ].join(''),
};
