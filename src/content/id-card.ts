// The student ID's panel (SPEC 0.2 "Student ID"): Wilson's words, verbatim,
// four short paragraphs. No flip: the panel opens with the focus. No email
// anywhere: the jar is the contact path.
import { p, type PanelContent } from './types';

export const idCard: PanelContent = {
  kicker: 'student id',
  title: 'Wilson Cheung',
  html: [
    p('Howdy guys, my name is Wilson.'),
    p('I spent my childhood in rural China, grew up in Hong Kong, and came to the US for boarding school. Now I study at Harvard.'),
    p("I do three things: build products, read, and talk to interesting people. To relax, I play the guitar and hit the gym. Drop me a note in the jar if you think we'd enjoy chatting!"),
    p("That's it. You'll have to look elsewhere to learn more about me. There's only so much room on a student card..."),
  ].join(''),
};
