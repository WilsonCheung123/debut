// The books' textures (src/objects/books.ts): the real cover on the front
// (public/covers/*.webp, 1024 wide, converted from assets/covers/ by
// tools/covers.mjs; The Innovator's Dilemma from Open Library's covers API,
// cover id 9274687), a procedural spine (title and author, legible), a plain
// back, cream page edges and two solid patches, packed into one 1024 x 2048
// atlas per book (512 x 1024 on phones) so each book is a single draw call.
//
// Atlas (design space 1024 x 2048, y down):
//   front cover  x 0–1024,  y 0–FRONT_H        the image, drawn to the book's own aspect
//   spine strip  x 0–768,   y 1580–1828        drawn upright 768 tall, stored transposed (head at the left)
//   page edges   x 768–1024, y 1580–1772       (256 x 192)
//   back cover   x 768–1024, y 1772–2048       (256 x 276, plain: the palette, a barcode)
//   cloth patch  x 0–128,   y 1900–1964        endpaper patch x 128–256, y 1900–1964
import { hash2 } from '../materials';

export const SERIF = '"Newsreader", Georgia, "Times New Roman", serif';
export const SANS = '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif';
/** System CJK, serif (Songti) for the Jin Yong spine. */
export const SONG = '"Songti SC", "STSong", "Songti TC", "Noto Serif CJK SC", "Source Han Serif SC", "SimSun", serif';

/** Web fonts the spines use; drawn again once these have loaded. */
export const FONT_SPECS = [
  '300 40px "Newsreader"', '400 40px "Newsreader"', '500 40px "Newsreader"', '600 40px "Newsreader"', '700 40px "Newsreader"',
  'italic 400 40px "Newsreader"', 'italic 600 40px "Newsreader"',
];

export const AW = 1024, AH = 2048;
/** Tallest front-cover region (fraction of the atlas height). */
const FRONT_H = 1580;
export const ATLAS = {
  spine: { x: 0, y: FRONT_H / AH, w: 768 / AW },
  pages: { x: 768 / AW, y: FRONT_H / AH, w: 256 / AW, h: 192 / AH },
  back: { x: 768 / AW, y: 1772 / AH, w: 256 / AW, h: 276 / AH },
  cloth: { x: 64 / AW, y: 1932 / AH },
  endpaper: { x: 192 / AW, y: 1932 / AH },
  spineMax: 248,
} as const;

export interface Palette {
  /** Cover colour: the front region before the image lands, the spine and back ground. */
  bg: string;
  ink: string;
  accent: string;
  /** Page-edge tint (cream, yellower for older books). */
  paper: string;
  /** Board edges and spine rounding (cloth / card edge). */
  cloth: string;
  endpaper: string;
}

export interface SpineStyle {
  title: string;
  author: string;
  /** Face for the title run. */
  face: 'serif' | 'serif-italic' | 'serif-light' | 'sans' | 'cjk';
  /** Letter-spaced capitals for the title. */
  caps?: boolean;
  /** A small ornament at the head: a rule, a dot, nothing. */
  mark?: 'rule' | 'dot' | 'band';
}

export interface CoverDesign {
  id: string;
  hardcover: boolean;
  /** Cover image (public/ path) and its width / height. */
  image: { src: string; aspect: number };
  /** Height (y) and thickness (x), metres; the depth (cover width) is height x aspect. */
  height: number;
  thickness: number;
  palette: Palette;
  spine: SpineStyle;
  /** Roughness of the cover material (paperback gloss vs cloth). */
  roughness: number;
}

/** thickness (x), height (y), depth (z) in metres. */
export function sizeOf(d: CoverDesign): [number, number, number] {
  return [d.thickness, d.height, d.height * d.image.aspect];
}

/** Front-cover region height in design px (the image keeps its aspect; the region is exactly the book's face). */
export function frontHeightPx(d: CoverDesign): number {
  return Math.min(FRONT_H, Math.round(AW / d.image.aspect));
}

/** Spine width in design px (768-tall spine): thickness / height, capped to the strip. */
export function spineWidthPx(d: CoverDesign): number {
  return Math.min(ATLAS.spineMax, Math.round((768 * d.thickness) / d.height));
}

// ---------------------------------------------------------------- drawing kit

type Align = 'left' | 'center' | 'right';

/** Letter-spaced text (manual tracking, works in every browser). Returns the width. */
export function tracked(c: CanvasRenderingContext2D, text: string, x: number, y: number, tracking: number, align: Align = 'center'): number {
  const chars = Array.from(text);
  const widths = chars.map((ch) => c.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + tracking * Math.max(0, chars.length - 1);
  let cx = align === 'left' ? x : align === 'center' ? x - total / 2 : x - total;
  const prev = c.textAlign;
  c.textAlign = 'left';
  chars.forEach((ch, i) => { c.fillText(ch, cx, y); cx += widths[i] + tracking; });
  c.textAlign = prev;
  return total;
}

let grainTile: HTMLCanvasElement | null = null;
function tile(): HTMLCanvasElement {
  if (grainTile) return grainTile;
  const t = document.createElement('canvas');
  t.width = t.height = 128;
  const g = t.getContext('2d')!;
  const img = g.createImageData(128, 128);
  for (let i = 0; i < 128 * 128; i++) {
    const v = Math.round(96 + hash2(i & 127, i >> 7, 41) * 64 + (hash2(i & 127, i >> 7, 42) - 0.5) * 40);
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  grainTile = t;
  return t;
}

/** Paper / cloth grain: a cached noise tile composited over the area (cheap). */
export function grainOver(c: CanvasRenderingContext2D, w: number, h: number, alpha: number, mode: GlobalCompositeOperation = 'overlay'): void {
  c.save();
  c.globalCompositeOperation = mode;
  c.globalAlpha = alpha;
  c.fillStyle = c.createPattern(tile(), 'repeat')!;
  c.fillRect(0, 0, w, h);
  c.restore();
}

function measureTracked(c: CanvasRenderingContext2D, s: string, tracking: number): number {
  const chars = Array.from(s);
  return chars.reduce((a, ch) => a + c.measureText(ch).width, 0) + tracking * Math.max(0, chars.length - 1);
}

/** Spine text running top to bottom (English convention), shrunk until it fits `maxLen`. x is the centre line, y where it starts. */
function spineText(c: CanvasRenderingContext2D, s: string, x: number, y: number, font: string, color: string, tracking = 0, maxLen = 560): number {
  c.save();
  c.font = font;
  let size = parseFloat(font.match(/(\d+(?:\.\d+)?)px/)?.[1] ?? '40');
  let len = measureTracked(c, s, tracking);
  while (len > maxLen && size > 10) {
    size *= 0.94;
    c.font = font.replace(/(\d+(?:\.\d+)?)px/, `${size.toFixed(1)}px`);
    len = measureTracked(c, s, tracking);
  }
  c.fillStyle = color;
  c.textBaseline = 'middle';
  c.translate(x, y);
  c.rotate(Math.PI / 2);
  tracked(c, s, 0, 0, tracking, 'left');
  c.restore();
  return len;
}

/** Stacked upright characters (Chinese spine). */
function stacked(c: CanvasRenderingContext2D, s: string, x: number, y0: number, step: number, font: string, color: string): void {
  c.font = font;
  c.fillStyle = color;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  Array.from(s).forEach((ch, i) => c.fillText(ch, x, y0 + i * step));
}

function barcode(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, seed: number): void {
  c.fillStyle = '#f3efe6';
  c.fillRect(x, y, w, h);
  let bx = x + 6;
  for (let i = 0; bx < x + w - 6; i++) {
    const bw = 1 + Math.floor(hash2(i, 3, seed) * 2);
    if (hash2(i, 7, seed) > 0.42) { c.fillStyle = '#1c1a17'; c.fillRect(bx, y + 5, bw, h - 14); }
    bx += bw + 1 + Math.floor(hash2(i, 9, seed) * 2);
  }
}

// ----------------------------------------------------------------- the nine

const C = (id: string, hardcover: boolean, file: string, aspect: number, height: number, thickness: number, roughness: number, palette: Palette, spine: SpineStyle): CoverDesign =>
  ({ id, hardcover, image: { src: `/covers/${file}.webp`, aspect }, height, thickness, roughness, palette, spine });

export const designs: Record<string, CoverDesign> = Object.fromEntries([
  // Wordsworth Classics paperback: a grey-blue watercolour, gold script
  C('book.anna-karenina', false, 'anna-karenina', 0.650, 0.198, 0.040, 0.62,
    { bg: '#66707f', ink: '#efe6d0', accent: '#d2b065', paper: '#e8dec4', cloth: '#5d6775', endpaper: '#ddd3b8' },
    { title: 'Anna Karenina', author: 'LEO TOLSTOY', face: 'serif-italic', mark: 'dot' }),
  // a red cloth hardcover with copper art-nouveau thistles
  C('book.inferno', true, 'inferno', 0.768, 0.212, 0.031, 0.72,
    { bg: '#7c2419', ink: '#e4b07c', accent: '#c58a55', paper: '#e4d8bd', cloth: '#6e2016', endpaper: '#d9ccb0' },
    { title: 'THE INFERNO', author: 'DANTE ALIGHIERI', face: 'serif', caps: true, mark: 'rule' }),
  // black-and-white portrait, squarer than the rest (the supplied cover)
  C('book.becoming-steve-jobs', true, 'becoming-steve-jobs', 0.860, 0.190, 0.034, 0.6,
    { bg: '#161616', ink: '#ededea', accent: '#a9a9a6', paper: '#ebe4d3', cloth: '#1a1a1a', endpaper: '#d9d4c8' },
    { title: 'Becoming Steve Jobs', author: 'SCHLENDER & TETZELI', face: 'serif', mark: 'rule' }),
  // the 1997 HBS Press jacket: deep purple, yellow-green type
  C('book.innovators-dilemma', true, 'innovators-dilemma', 0.658, 0.235, 0.028, 0.58,
    { bg: '#2a1f4b', ink: '#dbe17e', accent: '#eea04a', paper: '#eee6d2', cloth: '#231a40', endpaper: '#d5d0c4' },
    { title: "The Innovator's Dilemma", author: 'CLAYTON M. CHRISTENSEN', face: 'sans', mark: 'band' }),
  // Head of Zeus paperback: blue space, white capitals
  C('book.three-body', false, 'three-body', 0.651, 0.198, 0.033, 0.56,
    { bg: '#1f2c5c', ink: '#eceef3', accent: '#8fd14f', paper: '#e9e4d6', cloth: '#1a2550', endpaper: '#d8dae0' },
    { title: 'THE THREE-BODY PROBLEM', author: 'CIXIN LIU', face: 'sans', caps: true, mark: 'dot' }),
  // the Knopf brick: white jacket, red title; 1,300 pages thick
  C('book.power-broker', true, 'power-broker', 0.656, 0.240, 0.070, 0.66,
    { bg: '#efebe1', ink: '#c62320', accent: '#1d1a17', paper: '#ebe3cf', cloth: '#e6e1d5', endpaper: '#e2dccc' },
    { title: 'THE POWER BROKER', author: 'ROBERT A. CARO', face: 'serif', caps: true, mark: 'rule' }),
  // FSG paperback: cream, black letterspaced capitals, the pencil's yellow
  C('book.thinking-fast-slow', false, 'thinking-fast-slow', 0.668, 0.210, 0.036, 0.64,
    { bg: '#f0ece3', ink: '#1d1a17', accent: '#e7ad1c', paper: '#efe8d6', cloth: '#e8e3d8', endpaper: '#e4ded0' },
    { title: 'THINKING, FAST AND SLOW', author: 'DANIEL KAHNEMAN', face: 'serif-light', caps: true, mark: 'band' }),
  // the 1960s Hong Kong serial: aged paper, red brush characters
  C('book.demi-gods', false, 'demi-gods', 0.689, 0.185, 0.030, 0.82,
    { bg: '#e2d4b2', ink: '#b5302a', accent: '#3b2a1a', paper: '#e4d6b4', cloth: '#d8c9a6', endpaper: '#d9ccab' },
    { title: '天龍八部', author: '金庸著', face: 'cjk' }),
  // Penguin Classics: the black band, cream type
  C('book.pride-and-prejudice', false, 'pride-and-prejudice', 0.660, 0.198, 0.030, 0.6,
    { bg: '#121212', ink: '#efe7d3', accent: '#f08a2c', paper: '#efe8d4', cloth: '#151515', endpaper: '#e4e0cc' },
    { title: 'Pride and Prejudice', author: 'JANE AUSTEN', face: 'serif', mark: 'band' }),
].map((d) => [d.id, d]));

// ---------------------------------------------------------------- the spine

function fontFor(face: SpineStyle['face'], px: number): string {
  switch (face) {
    case 'serif': return `500 ${px}px ${SERIF}`;
    case 'serif-light': return `300 ${px}px ${SERIF}`;
    case 'serif-italic': return `italic 600 ${px}px ${SERIF}`;
    case 'sans': return `600 ${px}px ${SANS}`;
    case 'cjk': return `600 ${px}px ${SONG}`;
  }
}

/** Upright spine, `sw` wide and 768 tall: ground colour, a mark at the head, the title down the spine, the author at the foot. */
function drawSpine(c: CanvasRenderingContext2D, sw: number, d: CoverDesign): void {
  const p = d.palette, s = d.spine;
  c.fillStyle = p.bg;
  c.fillRect(0, 0, sw, 768);
  const cx = sw / 2;
  if (s.face === 'cjk') {
    // a red band at the head, the title stacked, the author stacked smaller at the foot
    c.fillStyle = p.ink;
    c.fillRect(0, 0, sw, 14);
    const size = Math.min(40, sw * 0.62);
    stacked(c, s.title, cx, 90, size * 1.22, fontFor('cjk', size), p.ink);
    stacked(c, s.author, cx, 560, size * 0.74, fontFor('cjk', size * 0.56), p.accent);
    grainOver(c, sw, 768, 0.22);
    return;
  }
  if (s.mark === 'band') {
    c.fillStyle = p.accent;
    c.fillRect(0, 0, sw, 10);
  } else if (s.mark === 'rule') {
    c.fillStyle = p.accent;
    c.fillRect(sw * 0.22, 36, sw * 0.56, 1.5);
  } else if (s.mark === 'dot') {
    c.fillStyle = p.accent;
    c.beginPath(); c.arc(cx, 40, Math.min(5, sw * 0.08), 0, Math.PI * 2); c.fill();
  }
  const titleSize = Math.min(s.caps ? 30 : 40, sw * (s.caps ? 0.36 : 0.46));
  const tracking = s.caps ? Math.max(2, titleSize * 0.14) : 0.5;
  const titleColor = s.face === 'serif-italic' ? p.accent : p.ink;
  spineText(c, s.title, cx, 72, fontFor(s.face, titleSize), titleColor, tracking, 470);
  const authorSize = Math.min(13, sw * 0.14);
  spineText(c, s.author, cx, 600, `500 ${authorSize}px ${SANS}`, s.face === 'serif-italic' ? p.ink : (p.bg === '#efebe1' || p.bg === '#f0ece3' ? p.accent : p.ink), 3, 140);
  grainOver(c, sw, 768, d.hardcover ? 0.12 : 0.08);
}

/** A plain back: the palette, a small barcode, a faint publisher's mark. */
function drawBack(c: CanvasRenderingContext2D, d: CoverDesign, w: number, h: number): void {
  const p = d.palette;
  c.fillStyle = p.bg;
  c.fillRect(0, 0, w, h);
  if (d.id !== 'book.demi-gods') barcode(c, w * 0.56, h * 0.8, w * 0.36, h * 0.14, d.id.length);
  grainOver(c, w, h, 0.1);
}

/** Cream page edges: fine page lines across the thickness, a little age. */
function drawPages(c: CanvasRenderingContext2D, d: CoverDesign, w: number, h: number): void {
  c.fillStyle = d.palette.paper;
  c.fillRect(0, 0, w, h);
  const seed = d.id.length * 7;
  for (let x = 0; x < w; x += 2) {
    const a = 0.04 + hash2(x, 1, seed) * 0.16;
    c.fillStyle = `rgba(120,96,60,${a.toFixed(3)})`;
    c.fillRect(x, 0, 1, h);
  }
  for (let i = 0; i < 6; i++) {
    const x = hash2(i, 2, seed) * w, bw = 6 + hash2(i, 3, seed) * 30;
    c.fillStyle = `rgba(150,110,50,${(0.04 + hash2(i, 4, seed) * 0.08).toFixed(3)})`;
    c.fillRect(x, 0, bw, h);
  }
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(90,60,20,0.12)');
  g.addColorStop(0.5, 'rgba(90,60,20,0)');
  g.addColorStop(1, 'rgba(90,60,20,0.1)');
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
  grainOver(c, w, h, 0.12);
}

/**
 * Draws a book's atlas into a canvas context `A` px wide (1024 on desktop,
 * 512 on phones; the canvas is 2A tall). `image`, once loaded, is the real
 * cover; before that the front wears the cover colour. Safe to call again
 * (fonts loaded, image landed).
 */
export function drawAtlas(c: CanvasRenderingContext2D, A: number, d: CoverDesign, image: HTMLImageElement | null): void {
  const s = A / AW;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, A, A * 2);
  const region = (x: number, y: number, w: number, h: number, draw: () => void): void => {
    c.save();
    c.beginPath();
    c.rect(x * s, y * s, w * s, h * s);
    c.clip();
    c.translate(x * s, y * s);
    c.scale(s, s);
    draw();
    c.restore();
  };
  // front: the cover colour under the image (also the bleed the UV inset hides)
  const fh = frontHeightPx(d);
  c.fillStyle = d.palette.bg;
  c.fillRect(0, 0, A, Math.ceil(fh * s));
  if (image) {
    c.save();
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    c.drawImage(image, 0, 0, A, fh * s);
    c.restore();
  }
  // spine: drawn upright on a scratch canvas, stored transposed in the strip (head at the left)
  const sw = spineWidthPx(d);
  const tmp = document.createElement('canvas');
  tmp.width = Math.ceil(sw * s);
  tmp.height = Math.ceil(768 * s);
  const tc = tmp.getContext('2d')!;
  tc.scale(s, s);
  drawSpine(tc, sw, d);
  c.save();
  c.setTransform(0, 1, 1, 0, 0, FRONT_H * s);
  c.drawImage(tmp, 0, 0);
  c.restore();
  region(768, FRONT_H, 256, 192, () => drawPages(c, d, 256, 192));
  region(768, 1772, 256, 276, () => drawBack(c, d, 256, 276));
  c.fillStyle = d.palette.cloth;
  c.fillRect(0, 1900 * s, 128 * s, 64 * s);
  c.fillStyle = d.palette.endpaper;
  c.fillRect(128 * s, 1900 * s, 128 * s, 64 * s);
}
