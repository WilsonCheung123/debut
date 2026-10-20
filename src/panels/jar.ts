import gsap from 'gsap';
import type { PanelFactory, PanelCtx } from './types';
import { esc } from '../content/types';
import { jarNote, jarDone, principles, principlesLink, principlesTitle } from '../content/principles';

// The jar's panel (SPEC 4.10): a slip of paper, slightly crumpled, that
// unfolds over ~500 ms; name / email / note in handwriting as the visitor
// types; POST /api/note with client validation and error states; on success
// the slip folds and drops (and the 3D jar receives a slip via `drop`), then
// the Namiya line appears. A quiet link opens the principles in the same panel.

export interface JarPanelOptions {
  /** Drops a small 3D slip into the jar. Called once per successful submit. */
  drop(): Promise<void>;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/; // the worker's rule
const LIMITS = { name: 80, email: 254, note: 2000 } as const;
type Field = 'name' | 'email' | 'note';

export function jarPanel(opts: JarPanelOptions): PanelFactory {
  return {
    kicker: 'the jar',
    title: 'Leave a slip',
    mount(ctx: PanelCtx) {
      injectStyle();
      const reduced = ctx.state.reducedMotion;
      const root = document.createElement('div');
      root.className = 'jar-panel';
      root.innerHTML = `
        <div class="jar-stage">
          <div class="jar-wrap">
            <form class="jar-slip" novalidate autocomplete="on" style="clip-path:${tornEdge()}">
              <div class="jar-crumple" aria-hidden="true"></div>
              <div class="jar-body">
                <p class="jar-note">${esc(jarNote)}</p>
                <label class="jar-field" data-field="name">
                  <span class="sr-only">Your name</span>
                  <input name="name" type="text" placeholder="your name" autocomplete="name" maxlength="${LIMITS.name}" spellcheck="false" />
                  <span class="jar-hint" aria-live="polite"></span>
                </label>
                <label class="jar-field" data-field="email">
                  <span class="sr-only">Your email, so I can write back</span>
                  <input name="email" type="email" placeholder="an address I can write back to" autocomplete="email" maxlength="${LIMITS.email}" spellcheck="false" />
                  <span class="jar-hint" aria-live="polite"></span>
                </label>
                <label class="jar-field jar-field-note" data-field="note">
                  <span class="sr-only">Your note</span>
                  <textarea name="note" placeholder="what's on your mind" rows="4" maxlength="${LIMITS.note}"></textarea>
                  <span class="jar-hint" aria-live="polite"></span>
                </label>
                <p class="jar-error" role="alert"></p>
                <div class="jar-actions">
                  <button type="submit">put it in the jar</button>
                  <span class="jar-status" aria-live="polite"></span>
                </div>
              </div>
            </form>
          </div>
          <p class="jar-done">${esc(jarDone)}</p>
        </div>
        <section class="jar-principles" aria-label="${esc(principlesTitle)}">
          <h2>${esc(principlesTitle)}</h2>
          ${principles.map((line) => `<p>${esc(line)}</p>`).join('')}
        </section>`;
      ctx.body.append(root);
      // the small note sits beside the title ("Leave a slip · notes on focus"), outside the content
      const titleEl = document.getElementById('panel-title');
      const link = document.createElement('button');
      link.type = 'button';
      link.className = 'jar-link';
      link.setAttribute('aria-expanded', 'false');
      link.setAttribute('aria-controls', 'jar-principles');
      link.textContent = principlesLink;
      if (titleEl) titleEl.append(link); else root.prepend(link);

      const q = <T extends HTMLElement>(sel: string): T => root.querySelector<T>(sel)!;
      const stage = q<HTMLDivElement>('.jar-stage');
      const wrap = q<HTMLDivElement>('.jar-wrap');
      const form = q<HTMLFormElement>('.jar-slip');
      const crumple = q<HTMLDivElement>('.jar-crumple');
      const body = q<HTMLDivElement>('.jar-body');
      const done = q<HTMLParagraphElement>('.jar-done');
      const errorEl = q<HTMLParagraphElement>('.jar-error');
      const status = q<HTMLSpanElement>('.jar-status');
      const submit = q<HTMLButtonElement>('button[type="submit"]');
      const section = q<HTMLElement>('.jar-principles');
      section.id = 'jar-principles';
      const inputs: Record<Field, HTMLInputElement | HTMLTextAreaElement> = {
        name: q<HTMLInputElement>('input[name="name"]'),
        email: q<HTMLInputElement>('input[name="email"]'),
        note: q<HTMLTextAreaElement>('textarea[name="note"]'),
      };
      const tweens: (gsap.core.Timeline | gsap.core.Tween)[] = [];
      let closed = false;
      let busy = false;

      // the note grows with its lines (no scrollbar on a slip of paper)
      const grow = (): void => { inputs.note.style.height = 'auto'; inputs.note.style.height = `${inputs.note.scrollHeight}px`; };
      inputs.note.addEventListener('input', grow);

      // --- validation
      const hintOf = (f: Field): HTMLElement => root.querySelector<HTMLElement>(`.jar-field[data-field="${f}"] .jar-hint`)!;
      const setBad = (f: Field, msg: string | null): void => {
        const field = inputs[f].closest('.jar-field')!;
        field.classList.toggle('bad', !!msg);
        hintOf(f).textContent = msg ?? '';
        inputs[f].setAttribute('aria-invalid', msg ? 'true' : 'false');
      };
      const check = (f: Field): string | null => {
        const v = inputs[f].value.trim();
        if (f === 'name') return !v ? 'a name, please' : v.length > LIMITS.name ? `up to ${LIMITS.name} characters` : null;
        if (f === 'email') return !v ? 'an address I can write back to' : (!EMAIL_RE.test(v) || v.length > LIMITS.email) ? 'that doesn’t look like an address' : null;
        return !v ? 'write something first' : v.length > LIMITS.note ? `up to ${LIMITS.note} characters` : null;
      };
      const validate = (): Field | null => {
        let first: Field | null = null;
        for (const f of ['name', 'email', 'note'] as Field[]) {
          const msg = check(f);
          setBad(f, msg);
          if (msg && !first) first = f;
        }
        return first;
      };
      for (const f of ['name', 'email', 'note'] as Field[]) {
        inputs[f].addEventListener('input', () => { if (inputs[f].closest('.jar-field')!.classList.contains('bad')) setBad(f, check(f)); errorEl.textContent = ''; });
      }

      // --- submit
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (busy) return;
        errorEl.textContent = '';
        const bad = validate();
        if (bad) { inputs[bad].focus({ preventScroll: true }); return; }
        busy = true;
        submit.disabled = true;
        status.textContent = 'putting it in…';
        const payload = { name: inputs.name.value.trim(), email: inputs.email.value.trim(), note: inputs.note.value.trim() };
        try {
          const res = await ctx.api.post<{ ok?: boolean }>('/api/note', payload);
          if (closed) return;
          if (!res || res.ok !== true) throw new Error('server error');
          status.textContent = '';
          await foldAndDrop();
        } catch (err) {
          if (closed) return;
          busy = false;
          submit.disabled = false;
          status.textContent = '';
          const d = describe(err);
          if (d.field) { setBad(d.field, d.msg); inputs[d.field].focus({ preventScroll: true }); }
          else errorEl.textContent = d.msg;
        }
      });

      // --- the slip folds, drops into the jar, and the line appears
      const foldAndDrop = (): Promise<void> => new Promise((resolve) => {
        for (const el of Object.values(inputs)) el.readOnly = true;
        const startH = wrap.offsetHeight;
        stage.style.height = `${startH}px`;
        done.classList.add('measure');
        const doneH = done.offsetHeight;
        done.classList.remove('measure');
        if (reduced) {
          wrap.style.display = 'none';
          stage.style.height = '';
          done.classList.add('show');
          void opts.drop();
          resolve();
          return;
        }
        wrap.classList.add('falling');
        const tl = gsap.timeline({ onComplete: () => { wrap.style.display = 'none'; stage.style.height = ''; resolve(); } });
        tl.set(wrap, { transformOrigin: '50% 0%' })
          .to(wrap, { rotateX: -74, duration: 0.34, ease: 'power2.in' }, 0)                       // tips away, foreshortened
          .to(crumple, { opacity: 0.9, duration: 0.3, ease: 'power1.in' }, 0.04)
          .to(wrap, { scaleY: 0.28, scaleX: 0.5, rotate: 5, duration: 0.24, ease: 'power2.inOut' }, 0.3) // down to a small packet
          .to(wrap, { y: 360, rotate: 16, opacity: 0, duration: 0.46, ease: 'power2.in' }, 0.52)     // drops
          .call(() => { if (!closed) void opts.drop(); }, [], 0.56)                                   // the 3D slip goes through the slot
          .to(stage, { height: doneH, duration: 0.45, ease: 'power2.inOut' }, 0.56)
          .add(() => done.classList.add('show'), 0.98)
          .fromTo(done, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out' }, 0.98);
        tweens.push(tl);
      });

      // --- principles
      let open = false;
      link.addEventListener('click', () => {
        open = !open;
        link.setAttribute('aria-expanded', String(open));
        gsap.killTweensOf(section);
        if (open) {
          section.classList.add('open');
          if (reduced) { section.style.height = ''; ctx.scrollTo(section); return; }
          const h = section.scrollHeight;
          tweens.push(gsap.fromTo(section, { height: 0, opacity: 0 }, {
            height: h, opacity: 1, duration: 0.42, ease: 'power3.out',
            onComplete: () => { section.style.height = ''; },
          }));
          window.setTimeout(() => { if (!closed && open) ctx.scrollTo(section); }, 60);
        } else {
          if (reduced) { section.classList.remove('open'); return; }
          tweens.push(gsap.to(section, {
            height: 0, opacity: 0, duration: 0.3, ease: 'power2.in',
            onComplete: () => { section.classList.remove('open'); section.style.height = ''; },
          }));
        }
      });

      // --- the unfold: from a crumpled thumbnail to the flat slip, ~500 ms
      if (!reduced) {
        gsap.set(wrap, { scaleX: 0.3, scaleY: 0.22, rotate: -9, rotateX: 34, transformPerspective: 900, transformOrigin: '50% 10%' });
        gsap.set(crumple, { opacity: 1 });
        gsap.set(body, { opacity: 0 });
        const tl = gsap.timeline();
        tl.to(wrap, { scaleX: 1, rotate: -3, duration: 0.28, ease: 'power2.out' }, 0.12)
          .to(wrap, { scaleY: 1, rotateX: 0, rotate: 0, duration: 0.4, ease: 'power3.out' }, 0.22)
          .to(crumple, { opacity: 0, duration: 0.34, ease: 'power2.out' }, 0.24)
          .to(body, { opacity: 1, duration: 0.3, ease: 'power2.out' }, 0.3);
        tweens.push(tl);
      } else {
        gsap.set(crumple, { opacity: 0 });
      }

      return () => {
        closed = true;
        link.remove();
        for (const t of tweens) t.kill();
        gsap.killTweensOf([wrap, crumple, body, section, stage, done]);
      };
    },
  };
}

/** Maps a failed request to what the slip says. Field errors go under the field; the rest in the error line. */
function describe(err: unknown): { field?: Field; msg: string } {
  const m = (err instanceof Error ? err.message : String(err)).toLowerCase();
  if (m.startsWith('name:')) return { field: 'name', msg: 'a name, up to 80 characters' };
  if (m.startsWith('email:')) return { field: 'email', msg: 'that doesn’t look like an address' };
  if (m.startsWith('note:')) return { field: 'note', msg: 'write something, up to 2000 characters' };
  if (m.includes('too many')) return { msg: 'The jar is full for now: five slips an hour from one place. Keep the slip and try again in a little while.' };
  if (m.includes('verification')) return { msg: 'The check at the door didn’t pass. Try once more.' };
  return { msg: 'The jar is out of reach right now. Keep the slip; try again in a little while.' };
}

/** A torn top edge as a clip-path polygon (stable, px-sized tears). */
function tornEdge(): string {
  const pts: string[] = [];
  const n = 26;
  let s = 7;
  const rnd = (): number => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  for (let i = 0; i <= n; i++) {
    const x = (i / n) * 100;
    const y = i === 0 || i === n ? 4 : 1 + rnd() * 7;
    pts.push(`${x.toFixed(1)}% ${y.toFixed(1)}px`);
  }
  pts.push('100% 100%', '0% 100%');
  return `polygon(${pts.join(',')})`;
}

let styled = false;
function injectStyle(): void {
  if (styled) return;
  styled = true;
  const style = document.createElement('style');
  style.id = 'jar-panel-style';
  style.textContent = `
.jar-panel { --slip: #fbf7ef; --pencil: #aaa397; --inkh: #2a2521; --rule: rgba(70,60,50,.24); }
.jar-stage { position: relative; margin: 0 0 14px; }
.jar-wrap { position: relative; z-index: 2; will-change: transform; filter: drop-shadow(0 8px 12px rgba(40,30,15,.2)) drop-shadow(0 1px 2px rgba(40,30,15,.16)); }
.jar-wrap.falling { position: absolute; left: 0; right: 0; top: 0; }
.jar-slip { position: relative; margin: 0; padding: 24px 22px 16px; background: var(--slip); color: var(--inkh); transform: rotate(-0.6deg); overflow: hidden; }
.jar-slip::before { content: ''; position: absolute; inset: 0; pointer-events: none; background-image: var(--grain); background-size: 128px 128px; opacity: .07; mix-blend-mode: multiply; }
.jar-slip::after { content: ''; position: absolute; inset: 0; pointer-events: none;
  background:
    linear-gradient(90deg, transparent 46.5%, rgba(0,0,0,.035) 49.2%, rgba(0,0,0,.07) 50%, rgba(255,255,255,.4) 50.7%, transparent 53.5%),
    linear-gradient(180deg, transparent 35%, rgba(0,0,0,.03) 37.6%, rgba(0,0,0,.06) 38.2%, rgba(255,255,255,.35) 38.9%, transparent 41.5%); }
.jar-crumple { position: absolute; inset: 0; z-index: 1; pointer-events: none; opacity: 0;
  background:
    linear-gradient(112deg, transparent 30%, rgba(0,0,0,.11) 31%, rgba(255,255,255,.28) 32%, transparent 34%),
    linear-gradient(68deg, transparent 55%, rgba(0,0,0,.1) 56%, rgba(255,255,255,.22) 57%, transparent 59%),
    linear-gradient(150deg, transparent 20%, rgba(0,0,0,.09) 21.5%, transparent 23%),
    linear-gradient(20deg, transparent 70%, rgba(0,0,0,.09) 71.5%, rgba(255,255,255,.24) 72.5%, transparent 74%),
    linear-gradient(135deg, transparent 62%, rgba(0,0,0,.07) 63%, transparent 65%),
    radial-gradient(ellipse at 30% 40%, rgba(0,0,0,.14), transparent 60%),
    radial-gradient(ellipse at 75% 70%, rgba(0,0,0,.12), transparent 55%); }
.jar-body { position: relative; z-index: 2; }
#panel .content .jar-note { font-size: 15.5px; line-height: 1.5; color: var(--ink-soft); margin: 0 0 14px; }
.jar-field { position: relative; display: block; margin: 0 0 4px; }
.jar-field:nth-of-type(1) { transform: rotate(-0.35deg); }
.jar-field:nth-of-type(2) { transform: rotate(0.3deg); }
#panel .content .jar-slip input, #panel .content .jar-slip textarea {
  display: block; width: 100%; box-sizing: border-box; min-height: 44px; margin: 0;
  font-family: var(--hand); font-size: 25px; line-height: 34px; letter-spacing: .01em; color: var(--inkh); caret-color: var(--inkh);
  background: transparent; border: 0; border-radius: 0; border-bottom: 1px solid var(--rule); padding: 5px 4px 4px; outline: none;
  transition: border-color .15s ease; }
#panel .content .jar-slip textarea { resize: none; overflow: hidden; min-height: 142px; border-bottom: 0; padding-bottom: 0;
  background-image: repeating-linear-gradient(to bottom, transparent 0 33px, var(--rule) 33px 34px); background-attachment: local; background-position: 0 5px; }
#panel .content .jar-slip input:focus-visible, #panel .content .jar-slip textarea:focus-visible { outline: none; border-bottom-color: rgba(70,60,50,.55); }
#panel .content .jar-slip input::placeholder, #panel .content .jar-slip textarea::placeholder { color: var(--pencil); opacity: 1; }
#panel .content .jar-slip input:read-only, #panel .content .jar-slip textarea:read-only { pointer-events: none; }
.jar-field.bad input { border-bottom-color: var(--maroon) !important; }
.jar-hint { display: block; min-height: 0; font-family: var(--sans); font-size: 12px; letter-spacing: .02em; color: var(--maroon); margin: 2px 0 0 4px; }
.jar-hint:empty { display: none; }
.jar-field-note .jar-hint { margin-top: 6px; }
#panel .content .jar-error { font-family: var(--sans); font-size: 13px; line-height: 1.45; color: var(--maroon); margin: 8px 0 0; }
.jar-error:empty { display: none; }
.jar-actions { display: flex; align-items: center; gap: 12px; margin-top: 14px; }
#panel .content .jar-actions button { background: transparent; border-color: rgba(70,60,50,.4); color: var(--inkh); }
#panel .content .jar-actions button:hover { background: rgba(255,255,255,.55); }
#panel .content .jar-actions button:disabled { opacity: .55; cursor: default; }
.jar-status { font-family: var(--sans); font-size: 12px; letter-spacing: .06em; text-transform: lowercase; font-variant-caps: all-small-caps; color: var(--ink-faint); }
#panel .content .jar-done { display: none; margin: 0; font-size: 17px; line-height: 1.55; color: var(--ink); padding: 6px 0 0; }
#panel .content .jar-done.show { display: block; }
#panel .content .jar-done.measure { display: block; position: absolute; visibility: hidden; left: 0; right: 0; }
#panel h1 .jar-link { display: inline-block; vertical-align: baseline; margin: 0 0 0 14px; padding: 12px 2px; margin-top: -12px; margin-bottom: -12px; border: 0; border-radius: 0; background: transparent;
  font-family: var(--serif); font-style: italic; font-weight: 400; font-size: 14px; line-height: 20px; letter-spacing: 0; text-transform: none; font-variant-caps: normal; color: var(--ink-faint);
  text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 3px; text-decoration-color: rgba(29,26,23,.3); cursor: pointer; white-space: nowrap; }
#panel h1 .jar-link:hover, #panel h1 .jar-link[aria-expanded="true"] { background: transparent; color: var(--ink); text-decoration-color: currentColor; }
.jar-principles { display: none; overflow: hidden; }
.jar-principles.open { display: block; }
.jar-principles h2 { margin-top: 0.9em !important; }
#panel .content .jar-principles p { margin: 0 0 0.8em; }
@media (prefers-reduced-motion: reduce) { .jar-wrap { will-change: auto; } }
`;
  document.head.append(style);
}
