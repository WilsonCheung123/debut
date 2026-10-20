// The FPGA board's panel (SPEC 4.4): Architect. Three or four sentences,
// Wilson's facts only, nothing claimed on the company's behalf.
import { p, link, type PanelContent } from './types';

export const fpga: PanelContent = {
  kicker: 'Architect',
  title: 'The first intern',
  html: [
    p('I was the first intern at Architect.'),
    p('I sourced training data and helped post-train a state-of-the-art Verilog model.'),
    p('[One line, in your words, on what that work was actually like.]'),
    `<p>The team recently hit a few milestones; their own write-up is ${link('https://architectlabs.com/blog/redwood', 'here')}.</p>`,
  ].join(''),
};
