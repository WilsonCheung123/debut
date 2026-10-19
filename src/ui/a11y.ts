import type { TableObject } from '../objects/types';

export interface A11yHandlers {
  onFocusIn(obj: TableObject): void;
  onFocusOut(obj: TableObject): void;
  onActivate(obj: TableObject, button: HTMLButtonElement): void;
}

/** The hidden list of objects: one button each, in reading order. */
export class A11yList {
  readonly el: HTMLUListElement;
  private readonly buttons = new Map<string, HTMLButtonElement>();

  constructor(root: HTMLElement) {
    this.el = document.createElement('ul');
    this.el.id = 'a11y';
    this.el.className = 'sr-only';
    this.el.setAttribute('aria-label', 'Things on the table');
    root.append(this.el);
  }

  build(objects: TableObject[], h: A11yHandlers): void {
    this.el.innerHTML = '';
    this.buttons.clear();
    for (const obj of objects) {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = obj.label;
      btn.dataset.id = obj.id;
      btn.addEventListener('focus', () => h.onFocusIn(obj));
      btn.addEventListener('blur', () => h.onFocusOut(obj));
      btn.addEventListener('click', () => h.onActivate(obj, btn));
      li.append(btn);
      this.el.append(li);
      this.buttons.set(obj.id, btn);
    }
  }

  buttonFor(id: string): HTMLButtonElement | undefined { return this.buttons.get(id); }

  setExpanded(id: string | null): void {
    for (const [k, b] of this.buttons) b.setAttribute('aria-expanded', String(k === id));
  }
}
