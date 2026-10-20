// The student ID's panel (SPEC 4.3): the bio, in Wilson's voice, first person,
// from his facts. Appears after the card is flipped. No email anywhere: the
// jar is the contact path.
import { p, type PanelContent } from './types';

export const idCard: PanelContent = {
  kicker: 'student id',
  title: 'Wilson Cheung',
  html: [
    p('I spent the first years of my life in rural China, grew up in Hong Kong, and came to the US for boarding school. First in my family to do any of it.'),
    p("I don't have a lot of interests. I do three things: build products, read, and talk to interesting, smart people. If you can help with any of the three, reach out."),
    p('The threads I keep pulling on: US–China, tech × humanities, spirituality.'),
    '<p class="kicker">the jar on the desk is how to reach me</p>',
  ].join(''),
};
