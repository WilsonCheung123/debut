// Panel contract. A panel is either plain content (kicker, title, html) or a
// custom factory that mounts its own DOM into the paper and cleans up on close.
import type { Api } from '../api';
import type { State } from '../state';

export interface PanelContent {
  /** Small-caps kicker above the title: the object name or a register ('Realm', 'Architect'). */
  kicker: string;
  /** The heading, in Newsreader 26 px. */
  title: string;
  /** Trusted HTML for the body (our own strings only; never visitor input). */
  html: string;
}

export interface PanelCtx {
  /** The scrollable body element to mount into. Empty when mount is called. */
  body: HTMLElement;
  /** The whole paper (header + body), for panels that need it. */
  paper: HTMLElement;
  /** Closes the panel and exits focus (same as Esc). */
  close(): void;
  /** Smooth-scrolls the body so `el` is near the top. */
  scrollTo(el: HTMLElement): void;
  api: Api;
  state: State;
  /** True when the panel is a bottom sheet (portrait). */
  isSheet: boolean;
  /** Id of the focused object. */
  objectId: string;
}

export interface PanelFactory {
  kicker: string;
  title: string;
  /** Builds the body. Return a cleanup function (called on close) or nothing. */
  mount(ctx: PanelCtx): void | (() => void);
}

export type PanelSpec = PanelContent | PanelFactory;

export function isFactory(spec: PanelSpec): spec is PanelFactory {
  return typeof (spec as PanelFactory).mount === 'function';
}
