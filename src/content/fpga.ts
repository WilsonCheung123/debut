// The FPGA board's panel (SPEC 0.2 "FPGA"): Wilson's words, verbatim, then
// the team's write-up as a link preview card. The card's title, description
// and image were fetched once from the post's Open Graph tags (2026-10-20);
// the image is cached under public/redwood.webp (880 px wide, from the
// 931 × 729 og:image). If the image ever fails to load the card quietly
// drops to text only.
import { p, esc, type PanelContent } from './types';

export const redwood = {
  url: 'https://architectlabs.com/blog/redwood',
  domain: 'architectlabs.com',
  title: 'Introducing Redwood: A frontier AI accelerator designed, verified, and deployed from scratch in two weeks by AI',
  description: "Redwood is a production-worthy AI accelerator designed end-to-end by Architect Labs' AI system in under two weeks.",
  image: '/redwood.webp',
  imageAlt: 'A floorplan of the Redwood chip',
};

/** A link preview card in the paper's own style: image, title, one-line description, domain. The whole card is the link. */
export function linkCard(l: typeof redwood): string {
  return [
    `<style>
      #panel .content .linkcard { display: block; margin: 0.2em 0 1.2em; border: 1px solid var(--paper-line); border-radius: 6px; overflow: hidden;
        background: rgba(255,255,255,.35); text-decoration: none; color: inherit; transition: background-color .18s ease, box-shadow .18s ease, transform .18s ease; }
      #panel .content .linkcard:hover { background: rgba(255,255,255,.65); box-shadow: 0 6px 18px rgba(0,0,0,.08); transform: translateY(-1px); }
      #panel .content .linkcard .linkcard-img { display: block; aspect-ratio: 16 / 9; overflow: hidden; background: #0b1424; }
      #panel .content .linkcard .linkcard-img img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: 50% 40%; }
      #panel .content .linkcard.no-image .linkcard-img { display: none; }
      #panel .content .linkcard .linkcard-text { display: block; padding: 12px 14px 13px; }
      #panel .content .linkcard .linkcard-title { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden;
        font-family: var(--serif); font-size: 17px; line-height: 1.3; color: var(--ink); }
      #panel .content .linkcard .linkcard-desc { display: block; margin-top: 5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        font-size: 14.5px; line-height: 1.4; color: var(--ink-soft); }
      #panel .content .linkcard .linkcard-domain { display: block; margin-top: 8px; font-family: var(--sans); font-size: 12px; letter-spacing: 0.08em;
        font-variant-caps: all-small-caps; color: var(--ink-faint); }
    </style>`,
    `<a class="linkcard" href="${esc(l.url)}" target="_blank" rel="noopener">`,
    `<span class="linkcard-img"><img src="${esc(l.image)}" alt="${esc(l.imageAlt)}" loading="lazy" decoding="async" onerror="this.closest('.linkcard').classList.add('no-image')" /></span>`,
    `<span class="linkcard-text">`,
    `<span class="linkcard-title">${esc(l.title)}</span>`,
    `<span class="linkcard-desc">${esc(l.description)}</span>`,
    `<span class="linkcard-domain">${esc(l.domain)}</span>`,
    `</span></a>`,
  ].join('');
}

export const fpga: PanelContent = {
  kicker: 'Architect',
  title: 'The first intern',
  html: [
    p('I was the first intern at Architect, an AI for chip design startup.'),
    p('I sourced training data and helped post-train a state-of-the-art Verilog model.'),
    p('The team recently hit a milestone. Their own write-up:'),
    linkCard(redwood),
  ].join(''),
};
