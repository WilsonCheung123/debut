// The worked example of a custom panel factory. Object builders copy this
// shape for kahneman, jar, hologram, vinyl and pinocchio panels: the factory
// mounts its own DOM into ctx.body and returns a cleanup for close.
import type { PanelFactory, PanelCtx } from './types';
import { esc } from '../content/types';

export function placeholderPanel(name: string, kicker = 'coming'): PanelFactory {
  return {
    kicker,
    title: name,
    mount(ctx: PanelCtx) {
      const p = document.createElement('p');
      p.innerHTML = `${esc(name)} is being built.`;
      const small = document.createElement('p');
      small.className = 'kicker';
      small.textContent = ctx.isSheet ? 'pull the handle down to close' : 'press esc to go back';
      ctx.body.append(p, small);
      // cleanup: nothing to release here; real panels pause video, detach APIs, etc.
      return () => { /* nothing */ };
    },
  };
}
