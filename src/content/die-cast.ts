// The die-cast part's panel (SPEC 4.5): a startup Wilson can't name yet,
// AI for CAD. The one fact: he negotiated with Chinese hardware-manufacturing
// vendors for data. Everything beyond that fact is in [brackets] for him.
import { p, type PanelContent } from './types';

export const dieCast: PanelContent = {
  kicker: "a startup I can't name yet",
  title: 'AI for CAD',
  html: [
    p('A sample part [from one of the vendors]. The startup is building AI for CAD, and a model that designs parts has to learn from real ones [the drawings, the revisions, the parts that came back wrong].'),
    p('My job was to negotiate with Chinese hardware-manufacturing vendors for exactly that data [over WeChat and in person, in Mandarin: edit or cut].'),
    p('[One line on what those negotiations actually taught you: what a factory owner needs to hear before he hands over his drawings.]'),
  ].join(''),
};
