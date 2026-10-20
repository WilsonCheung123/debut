// The capo and pick's panel (SPEC 4.6): he is learning guitar. Two or three
// light lines; the [bracketed] slots are for what he is learning right now
// and a line he may keep or cut.
import { p, type PanelContent } from './types';

export const guitar: PanelContent = {
  kicker: 'capo and pick',
  title: 'Learning guitar',
  html: [
    p("I'm learning guitar. Slowly, which I'm told is the only way."),
    p('Right now: [the song or the chord change I am fighting with this month].'),
    p("[The capo is for the keys my fingers don't like yet. Keep or cut.]"),
  ].join(''),
};
