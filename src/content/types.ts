// Content shapes and small HTML helpers for src/content/<id>.ts files.
// Content files are plain TS objects / HTML strings: Wilson's words, kept as
// written except light copy-editing; anything invented is in [brackets].
export type { PanelContent } from '../panels/types';

export interface BookContent {
  id: string;            // 'book.anna-karenina'
  title: string;
  author: string;
  blurb: string;         // Wilson's words
  quote?: string;
  /** Optional image shown above the text (public/ path). */
  image?: { src: string; alt: string };
}

export interface SimpleContent {
  kicker: string;
  title: string;
  /** Paragraphs in order. Use the helpers below to build the html. */
  paragraphs: string[];
  links?: { href: string; text: string }[];
}

/** Escapes text for HTML. Content strings are ours, but quotes contain apostrophes etc. */
export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

/** Marks [bracketed] editor notes so they stand out in the panel. */
export function brackets(s: string): string {
  return esc(s).replace(/\[([^\]]+)\]/g, '<mark class="todo">[$1]</mark>');
}

export const p = (text: string): string => `<p>${brackets(text)}</p>`;
export const quote = (text: string, cite?: string): string =>
  `<blockquote><p>${esc(text)}</p>${cite ? `<cite>${esc(cite)}</cite>` : ''}</blockquote>`;
export const figure = (src: string, alt: string): string =>
  `<figure><img src="${esc(src)}" alt="${esc(alt)}" loading="lazy" decoding="async" /></figure>`;
export const link = (href: string, text: string): string =>
  `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(text)}</a>`;
export const kicker = (text: string): string => `<p class="kicker">${esc(text)}</p>`;

/** Renders a BookContent into a plain panel. */
export function bookPanel(b: BookContent): { kicker: string; title: string; html: string } {
  return {
    kicker: 'a book',
    title: b.title,
    html: [
      `<p class="byline">${esc(b.author)}</p>`,
      b.image ? figure(b.image.src, b.image.alt) : '',
      p(b.blurb),
      b.quote ? quote(b.quote) : '',
    ].join(''),
  };
}
