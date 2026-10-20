// The die-cast part's panel (SPEC 0.2 "Die-cast"): Wilson's words, verbatim.
// The company stays unnamed.
import { p, type PanelContent } from './types';

export const dieCast: PanelContent = {
  kicker: "a startup I can't name yet",
  title: 'A sample part',
  html: [
    p('This is a sample part from a Chinese manufacturer, one of thousands of CAD files I sourced for a startup teaching AI to design parts of its own.'),
    p('I believe some of that data ended up at one of the labs whose model helped build this website. Small world!'),
  ].join(''),
};
