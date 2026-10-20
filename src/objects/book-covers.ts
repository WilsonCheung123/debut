// Procedural book covers for src/objects/books.ts: nine designs drawn on
// canvas (palette + typography + one motif each), plus the spine, a plain
// back, cream page edges, and two solid patches, packed into one atlas per
// book so each book is a single draw call.
//
// Atlas (fractions of a square texture; the design space is 1024 px):
//   front cover  x 0.00–0.50, y 0.00–0.75   (512 x 768)
//   back cover   x 0.50–1.00, y 0.00–0.75   (512 x 768)
//   spine        x 0.00–0.75, y 0.75–0.75+sw (drawn upright, stored transposed)
//   page edges   x 0.75–1.00, y 0.75–0.9375 (256 x 192)
//   cloth patch  x 0.75–0.875, y 0.9375–1   endpaper patch x 0.875–1, y 0.9375–1
import { hash2 } from '../materials';

export const SERIF = '"Newsreader", Georgia, "Times New Roman", serif';
export const SANS = '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif';
/** System CJK, serif (Songti) for the title and brush/clerical for the seal. */
export const SONG = '"Songti SC", "STSong", "Songti TC", "Noto Serif CJK SC", "Source Han Serif SC", "SimSun", serif';
export const BRUSH = '"Baoli SC", "Libian SC", "Weibei SC", "Xingkai SC", "STXingkai", "Kaiti SC", "STKaiti", "KaiTi", "LiSu", "Songti SC", serif';

/** Web fonts the covers use; drawn again once these have loaded. */
export const FONT_SPECS = [
  '300 40px "Newsreader"', '400 40px "Newsreader"', '500 40px "Newsreader"', '600 40px "Newsreader"', '700 40px "Newsreader"',
  'italic 400 40px "Newsreader"',
];

export interface Palette {
  bg: string;
  ink: string;
  accent: string;
  /** Page-edge tint (cream, yellower for older books). */
  paper: string;
  /** Colour of the board edges and spine rounding (cloth / card edge). */
  cloth: string;
  endpaper: string;
}

export interface CoverDesign {
  id: string;
  hardcover: boolean;
  /** thickness (x), height (y), depth / cover width (z), metres. */
  size: [number, number, number];
  palette: Palette;
  front(c: CanvasRenderingContext2D, p: Palette): void;
  /** Upright spine, `sw` design px wide, 768 tall. Text reads top to bottom. */
  spine(c: CanvasRenderingContext2D, sw: number, p: Palette): void;
  back?(c: CanvasRenderingContext2D, p: Palette): void;
  /** Roughness of the cover material (paperback gloss vs cloth). */
  roughness: number;
  /** Rotation of the lying book about y (radians) and stack offset, decided by the layout code. */
}

export const ATLAS = {
  front: { x: 0, y: 0, w: 0.5, h: 0.75 },
  back: { x: 0.5, y: 0, w: 0.5, h: 0.75 },
  spine: { x: 0, y: 0.75, w: 0.75 },
  pages: { x: 0.75, y: 0.75, w: 0.25, h: 0.1875 },
  cloth: { x: 0.8125, y: 0.96875 },
  endpaper: { x: 0.9375, y: 0.96875 },
  /** Max spine strip height (fraction): 248 px of 1024. */
  spineMax: 248 / 1024,
} as const;

/** Spine width in design px (768-tall spine): thickness / height, capped to the strip. */
export function spineWidthPx(d: CoverDesign): number {
  return Math.min(248, Math.round((768 * d.size[0]) / d.size[1]));
}

// ---------------------------------------------------------------- drawing kit

const W = 512, H = 768;

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

function text(c: CanvasRenderingContext2D, s: string, x: number, y: number, font: string, color: string, align: Align = 'center', tracking = 0): number {
  c.font = font;
  c.fillStyle = color;
  c.textBaseline = 'alphabetic';
  if (tracking) return tracked(c, s, x, y, tracking, align);
  c.textAlign = align;
  c.fillText(s, x, y);
  return c.measureText(s).width;
}

/** Vertical gradient fill over the cover. */
function gradient(c: CanvasRenderingContext2D, stops: [number, string][], w = W, h = H): void {
  const g = c.createLinearGradient(0, 0, 0, h);
  for (const [t, col] of stops) g.addColorStop(t, col);
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
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

/** Paper / cloth grain: a cached noise tile composited over the area (cheap, GPU-side). */
export function grainOver(c: CanvasRenderingContext2D, w: number, h: number, alpha: number, mode: GlobalCompositeOperation = 'overlay'): void {
  c.save();
  c.globalCompositeOperation = mode;
  c.globalAlpha = alpha;
  c.fillStyle = c.createPattern(tile(), 'repeat')!;
  c.fillRect(0, 0, w, h);
  c.restore();
}

function vignette(c: CanvasRenderingContext2D, strength: number, color = '0,0,0', w = W, h = H): void {
  const g = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.72);
  g.addColorStop(0, `rgba(${color},0)`);
  g.addColorStop(1, `rgba(${color},${strength})`);
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
}

function rule(c: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, color: string, width = 1): void {
  c.strokeStyle = color;
  c.lineWidth = width;
  c.beginPath();
  c.moveTo(x0, y0);
  c.lineTo(x1, y1);
  c.stroke();
}

/** A head-in-profile silhouette facing left in a 100 x 140 box (origin top-left). */
function profilePath(c: CanvasRenderingContext2D): void {
  c.beginPath();
  c.moveTo(46, 140);
  c.bezierCurveTo(44, 126, 42, 118, 37, 112);   // throat
  c.bezierCurveTo(30, 110, 24, 108, 22, 104);   // under the chin
  c.bezierCurveTo(18, 100, 19, 96, 24, 94);     // chin
  c.bezierCurveTo(19, 92, 18, 90, 22, 88);      // lower lip
  c.bezierCurveTo(25, 87, 25, 86, 23, 84);      // mouth
  c.bezierCurveTo(19, 83, 19, 80, 23, 78);      // upper lip
  c.bezierCurveTo(21, 76, 17, 74, 13, 72);      // nose base to tip
  c.bezierCurveTo(13, 67, 18, 62, 22, 57);      // bridge
  c.bezierCurveTo(25, 53, 27, 51, 26, 47);      // brow
  c.bezierCurveTo(27, 40, 28, 30, 33, 20);      // forehead
  c.bezierCurveTo(42, 7, 62, -1, 82, 6);        // crown
  c.bezierCurveTo(98, 12, 106, 30, 100, 46);    // back of the head (bun)
  c.bezierCurveTo(98, 56, 92, 60, 88, 66);      // under the bun
  c.bezierCurveTo(86, 80, 82, 96, 74, 108);     // nape
  c.bezierCurveTo(70, 118, 68, 130, 68, 140);   // back of the neck
  c.closePath();
}

/** Spine text running top to bottom (English convention). y is where the text starts; x the centre line. */
function spineText(c: CanvasRenderingContext2D, s: string, x: number, y: number, font: string, color: string, tracking = 0, maxLen = 560): number {
  c.save();
  c.font = font;
  // fit: shrink the font until the run fits the available length
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

function measureTracked(c: CanvasRenderingContext2D, s: string, tracking: number): number {
  const chars = Array.from(s);
  return chars.reduce((a, ch) => a + c.measureText(ch).width, 0) + tracking * Math.max(0, chars.length - 1);
}

/** Stacked upright characters (Chinese spine / title label). */
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
  let bx = x + 10;
  for (let i = 0; bx < x + w - 10; i++) {
    const bw = 1 + Math.floor(hash2(i, 3, seed) * 3);
    if (hash2(i, 7, seed) > 0.42) { c.fillStyle = '#1c1a17'; c.fillRect(bx, y + 8, bw, h - 22); }
    bx += bw + 1 + Math.floor(hash2(i, 9, seed) * 2);
  }
}

// ----------------------------------------------------------------- the nine

const anna: CoverDesign = {
  id: 'book.anna-karenina', hardcover: false, size: [0.040, 0.216, 0.140], roughness: 0.62,
  palette: { bg: '#1f3b34', ink: '#e9dfc7', accent: '#c7ad72', paper: '#e8dec4', cloth: '#e2d8bf', endpaper: '#ddd3b8' },
  front(c, p) {
    gradient(c, [[0, '#26473f'], [1, '#132a25']]);
    // the railway: two rails to a vanishing point, sleepers in perspective, snow
    const vp = { x: 256, y: 336 };
    const span = H - vp.y;
    const railL = (f: number): number => vp.x + (70 - vp.x) * f;
    const railR = (f: number): number => vp.x + (442 - vp.x) * f;
    for (let k = 0; k < 40; k++) {
      const f = 1 / (1 + k * 0.24);
      const y = vp.y + span * f;
      if (y < vp.y + 10) break;
      c.strokeStyle = `rgba(233,223,199,${(0.08 + 0.5 * f).toFixed(3)})`;
      c.lineWidth = 0.6 + 3.2 * f;
      c.beginPath();
      c.moveTo(railL(f) - 16 * f, y);
      c.lineTo(railR(f) + 16 * f, y);
      c.stroke();
    }
    const rail = c.createLinearGradient(0, H, 0, vp.y);
    rail.addColorStop(0, 'rgba(233,223,199,0.95)');
    rail.addColorStop(1, 'rgba(233,223,199,0)');
    c.strokeStyle = rail;
    c.lineWidth = 3;
    c.beginPath(); c.moveTo(70, H); c.lineTo(vp.x, vp.y); c.stroke();
    c.beginPath(); c.moveTo(442, H); c.lineTo(vp.x, vp.y); c.stroke();
    const glow = c.createRadialGradient(vp.x, vp.y, 0, vp.x, vp.y, 150);
    glow.addColorStop(0, 'rgba(240,226,190,0.42)');
    glow.addColorStop(1, 'rgba(240,226,190,0)');
    c.fillStyle = glow;
    c.fillRect(0, 0, W, H);
    for (let i = 0; i < 170; i++) {
      const x = hash2(i, 1, 5) * W, y = hash2(i, 2, 5) * H * (0.3 + 0.7 * hash2(i, 3, 5));
      const r = 0.7 + hash2(i, 4, 5) * 2.2;
      c.fillStyle = `rgba(240,234,220,${(0.15 + hash2(i, 5, 5) * 0.7).toFixed(2)})`;
      c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    }
    text(c, 'ANNA', 256, 128, `300 68px ${SERIF}`, p.ink, 'center', 14);
    text(c, 'KARENINA', 256, 200, `300 68px ${SERIF}`, p.ink, 'center', 14);
    rule(c, 196, 232, 316, 232, 'rgba(199,173,114,0.85)', 1);
    text(c, 'LEO TOLSTOY', 256, 266, `500 15px ${SANS}`, p.accent, 'center', 5.5);
    text(c, 'a novel', 256, 718, `italic 400 20px ${SERIF}`, 'rgba(233,223,199,0.7)');
    grainOver(c, W, H, 0.12);
    vignette(c, 0.26);
  },
  spine(c, sw, p) {
    gradient(c, [[0, '#26473f'], [1, '#132a25']], sw, H);
    c.fillStyle = p.accent;
    c.beginPath(); c.arc(sw / 2, 42, 4.5, 0, Math.PI * 2); c.fill();
    spineText(c, 'ANNA KARENINA', sw / 2, 76, `300 ${Math.min(56, sw * 0.42)}px ${SERIF}`, p.ink, 4, 520);
    spineText(c, 'TOLSTOY', sw / 2, 640, `500 ${Math.min(15, sw * 0.12)}px ${SANS}`, p.accent, 4, 110);
    grainOver(c, sw, H, 0.12);
  },
};

const inferno: CoverDesign = {
  id: 'book.inferno', hardcover: false, size: [0.034, 0.203, 0.134], roughness: 0.6,
  palette: { bg: '#4a1c15', ink: '#f0e4cf', accent: '#e4b27a', paper: '#e4d8bd', cloth: '#dccfb3', endpaper: '#d9ccb0' },
  front(c, p) {
    gradient(c, [[0, '#17100f'], [0.42, '#3e1912'], [0.8, '#7f3220'], [1, '#b4532a']]);
    // ember haze low, mist mid
    const haze = c.createLinearGradient(0, 380, 0, 600);
    haze.addColorStop(0, 'rgba(236,190,140,0)');
    haze.addColorStop(0.5, 'rgba(236,190,140,0.14)');
    haze.addColorStop(1, 'rgba(236,190,140,0)');
    c.fillStyle = haze;
    c.fillRect(0, 380, W, 220);
    // the dark wood: trunks, a few with branches
    for (let i = 0; i < 30; i++) {
      const x = hash2(i, 1, 9) * W;
      const w = 4 + hash2(i, 2, 9) * 22;
      const dark = 0.55 + hash2(i, 3, 9) * 0.4;
      c.fillStyle = `rgba(16,10,9,${dark.toFixed(2)})`;
      c.beginPath();
      c.moveTo(x - w / 2, H);
      c.lineTo(x - w * 0.3, 0);
      c.lineTo(x + w * 0.3, 0);
      c.lineTo(x + w / 2, H);
      c.closePath();
      c.fill();
      if (hash2(i, 4, 9) > 0.5) {
        const by = 120 + hash2(i, 5, 9) * 260;
        const dir = hash2(i, 6, 9) > 0.5 ? 1 : -1;
        c.strokeStyle = `rgba(16,10,9,${dark.toFixed(2)})`;
        c.lineWidth = 2 + w * 0.12;
        c.beginPath();
        c.moveTo(x, by);
        c.quadraticCurveTo(x + dir * 30, by - 30, x + dir * (50 + w), by - 70);
        c.stroke();
      }
    }
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.85)';
    c.shadowBlur = 26;
    text(c, 'DANTE ALIGHIERI', 256, 108, `500 15px ${SANS}`, p.accent, 'center', 7);
    text(c, 'INFERNO', 256, 190, `300 80px ${SERIF}`, p.ink, 'center', 15);
    c.restore();
    text(c, 'The Divine Comedy · I', 256, 722, `italic 400 19px ${SERIF}`, 'rgba(240,228,207,0.78)');
    grainOver(c, W, H, 0.14);
    vignette(c, 0.3);
  },
  spine(c, sw, p) {
    gradient(c, [[0, '#17100f'], [0.6, '#4a1c15'], [1, '#8a3a22']], sw, H);
    c.fillStyle = 'rgba(16,10,9,0.7)';
    c.fillRect(sw * 0.18, 0, sw * 0.07, H);
    c.fillRect(sw * 0.78, 0, sw * 0.05, H);
    spineText(c, 'INFERNO', sw / 2, 76, `300 ${Math.min(58, sw * 0.5)}px ${SERIF}`, p.ink, 7, 420);
    spineText(c, 'DANTE', sw / 2, 650, `500 ${Math.min(15, sw * 0.13)}px ${SANS}`, p.accent, 5, 100);
    grainOver(c, sw, H, 0.14);
  },
};

const threeBody: CoverDesign = {
  id: 'book.three-body', hardcover: false, size: [0.033, 0.210, 0.140], roughness: 0.58,
  palette: { bg: '#0d1430', ink: '#ece3d0', accent: '#e8b45c', paper: '#ece4cf', cloth: '#e3dcc8', endpaper: '#dcd6c4' },
  front(c, p) {
    gradient(c, [[0, '#090f26'], [1, '#141d44']]);
    for (let i = 0; i < 150; i++) {
      const x = hash2(i, 1, 13) * W, y = hash2(i, 2, 13) * H, r = 0.4 + hash2(i, 3, 13) * 1.1;
      c.fillStyle = `rgba(236,227,208,${(0.15 + hash2(i, 4, 13) * 0.6).toFixed(2)})`;
      c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    }
    // three orbits, three suns
    const orbits: [number, number, number][] = [[196, 70, 0.32], [150, 112, -0.9], [118, 164, 1.95]];
    c.strokeStyle = 'rgba(236,227,208,0.3)';
    c.lineWidth = 1.2;
    for (const [rx, ry, rot] of orbits) {
      c.beginPath(); c.ellipse(256, 446, rx, ry, rot, 0, Math.PI * 2); c.stroke();
    }
    const sun = (x: number, y: number, r: number, inner: string, outer: string, halo: number): void => {
      if (halo) {
        const g = c.createRadialGradient(x, y, r * 0.6, x, y, r * 2.4);
        g.addColorStop(0, `rgba(246,198,106,${halo})`);
        g.addColorStop(1, 'rgba(246,198,106,0)');
        c.fillStyle = g;
        c.fillRect(x - r * 2.4, y - r * 2.4, r * 4.8, r * 4.8);
      }
      const g = c.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
      g.addColorStop(0, inner);
      g.addColorStop(1, outer);
      c.fillStyle = g;
      c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    };
    sun(304, 414, 56, '#f8d47c', '#d4802f', 0.32);
    sun(168, 506, 27, '#f2e8d6', '#b9a991', 0.12);
    sun(236, 322, 15, '#e07a4e', '#9a3a22', 0.1);
    text(c, 'THE', 56, 96, `600 20px ${SANS}`, p.accent, 'left', 9);
    text(c, 'THREE-BODY', 54, 164, `700 62px ${SANS}`, p.ink, 'left', -1);
    text(c, 'PROBLEM', 54, 230, `700 62px ${SANS}`, p.ink, 'left', -1);
    rule(c, 56, 256, 176, 256, p.accent, 2);
    text(c, 'CIXIN LIU', 56, 692, `500 18px ${SANS}`, p.ink, 'left', 7);
    text(c, '刘慈欣', 56, 726, `500 20px ${SONG}`, 'rgba(236,227,208,0.75)', 'left', 4);
    grainOver(c, W, H, 0.08);
    vignette(c, 0.2);
  },
  spine(c, sw, p) {
    gradient(c, [[0, '#090f26'], [1, '#141d44']], sw, H);
    const g = c.createRadialGradient(sw / 2, 46, 2, sw / 2, 46, 16);
    g.addColorStop(0, '#f8d47c'); g.addColorStop(0.5, '#d4802f'); g.addColorStop(1, 'rgba(212,128,47,0)');
    c.fillStyle = g;
    c.beginPath(); c.arc(sw / 2, 46, 16, 0, Math.PI * 2); c.fill();
    spineText(c, 'THE THREE-BODY PROBLEM', sw / 2, 84, `700 ${Math.min(42, sw * 0.4)}px ${SANS}`, p.ink, 0, 500);
    spineText(c, 'CIXIN LIU', sw / 2, 630, `500 ${Math.min(14, sw * 0.12)}px ${SANS}`, p.accent, 4, 110);
    grainOver(c, sw, H, 0.08);
  },
};

const powerBroker: CoverDesign = {
  id: 'book.power-broker', hardcover: true, size: [0.064, 0.235, 0.155], roughness: 0.7,
  palette: { bg: '#1d1c1f', ink: '#efe6d2', accent: '#d2783a', paper: '#e9e1cc', cloth: '#2a2528', endpaper: '#d9cdb5' },
  front(c, p) {
    gradient(c, [[0, '#19181c'], [0.5, '#2d2327'], [0.66, '#8f4526'], [0.775, '#d8823f'], [0.782, '#141317'], [1, '#101014']]);
    // dusk sky band behind the bridge, the bridge in silhouette, a wet reflection
    const deckY = 600, towerTop = 426;
    c.fillStyle = '#0e0d10';
    for (const tx of [168, 344]) {
      c.fillRect(tx - 9, towerTop, 18, deckY - towerTop + 24);
      c.fillRect(tx - 20, 466, 40, 6);
      c.fillRect(tx - 20, 536, 40, 6);
    }
    const cableY = (x: number): number => {
      const q = (x0: number, y0: number, cx: number, cy: number, x1: number, y1: number): number => {
        const t = (x - x0) / (x1 - x0);
        return (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * cy + t * t * y1;
      };
      if (x < 168) return q(0, 560, 70, 560, 168, towerTop);
      if (x < 344) return q(168, towerTop, 256, 622, 344, towerTop);
      return q(344, towerTop, 442, 560, 512, 560);
    };
    c.strokeStyle = '#0e0d10';
    c.lineWidth = 1.2;
    for (let x = 6; x < W; x += 13) {
      c.beginPath(); c.moveTo(x, cableY(x)); c.lineTo(x, deckY); c.stroke();
    }
    c.lineWidth = 4;
    c.beginPath();
    c.moveTo(0, 560); c.quadraticCurveTo(70, 560, 168, towerTop);
    c.quadraticCurveTo(256, 622, 344, towerTop);
    c.quadraticCurveTo(442, 560, 512, 560);
    c.stroke();
    c.fillStyle = '#0e0d10';
    c.fillRect(0, deckY, W, 11);
    for (let i = 0; i < 18; i++) {
      const y = 630 + hash2(i, 1, 21) * 120, w = 60 + hash2(i, 2, 21) * 300, x = hash2(i, 3, 21) * (W - w);
      c.fillStyle = `rgba(216,130,63,${(0.04 + hash2(i, 4, 21) * 0.1).toFixed(3)})`;
      c.fillRect(x, y, w, 1.5);
    }
    text(c, 'THE', 256, 92, `500 26px ${SERIF}`, p.ink, 'center', 10);
    text(c, 'POWER', 256, 188, `700 100px ${SERIF}`, p.ink, 'center', 2);
    text(c, 'BROKER', 256, 286, `700 100px ${SERIF}`, p.ink, 'center', 2);
    text(c, 'Robert Moses and the Fall of New York', 256, 330, `italic 400 20px ${SERIF}`, 'rgba(239,230,210,0.82)');
    text(c, 'ROBERT A. CARO', 256, 732, `500 17px ${SANS}`, p.ink, 'center', 7);
    grainOver(c, W, H, 0.1);
    vignette(c, 0.22);
  },
  spine(c, sw, p) {
    gradient(c, [[0, '#19181c'], [0.72, '#2d2327'], [0.86, '#8f4526'], [0.9, '#141317'], [1, '#101014']], sw, H);
    const two = sw > 150;
    if (two) {
      spineText(c, 'THE POWER', sw * 0.3, 70, `700 ${Math.min(62, sw * 0.34)}px ${SERIF}`, p.ink, 2, 470);
      spineText(c, 'BROKER', sw * 0.7, 70, `700 ${Math.min(62, sw * 0.34)}px ${SERIF}`, p.ink, 2, 470);
    } else {
      spineText(c, 'THE POWER BROKER', sw / 2, 70, `700 ${Math.min(48, sw * 0.46)}px ${SERIF}`, p.ink, 1, 500);
    }
    spineText(c, 'CARO', sw / 2, 600, `500 ${Math.min(20, sw * 0.12)}px ${SANS}`, p.ink, 8, 90);
    grainOver(c, sw, H, 0.1);
  },
};

const pride: CoverDesign = {
  id: 'book.pride-and-prejudice', hardcover: true, size: [0.031, 0.205, 0.135], roughness: 0.86,
  palette: { bg: '#b7c5ae', ink: '#1f2d26', accent: '#a98b48', paper: '#efe8d4', cloth: '#b7c5ae', endpaper: '#e4e0cc' },
  front(c, p) {
    c.fillStyle = p.bg;
    c.fillRect(0, 0, W, H);
    // a fine lattice in the cloth
    c.strokeStyle = 'rgba(40,60,45,0.09)';
    c.lineWidth = 1;
    for (let d = -H; d < W + H; d += 22) {
      c.beginPath(); c.moveTo(d, 0); c.lineTo(d + H, H); c.stroke();
      c.beginPath(); c.moveTo(d, H); c.lineTo(d + H, 0); c.stroke();
    }
    c.strokeStyle = 'rgba(169,139,72,0.95)';
    c.lineWidth = 1.6; c.strokeRect(26, 26, W - 52, H - 52);
    c.lineWidth = 0.8; c.strokeRect(33, 33, W - 66, H - 66);
    text(c, 'Pride', 256, 150, `400 70px ${SERIF}`, p.ink);
    text(c, 'and', 256, 196, `italic 400 30px ${SERIF}`, p.ink);
    text(c, 'Prejudice', 256, 262, `400 70px ${SERIF}`, p.ink);
    // the cameo: an oval with a regency profile
    const cx = 256, cy = 462;
    c.fillStyle = '#e9e5d4';
    c.beginPath(); c.ellipse(cx, cy, 96, 122, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = p.accent; c.lineWidth = 2.2;
    c.beginPath(); c.ellipse(cx, cy, 96, 122, 0, 0, Math.PI * 2); c.stroke();
    c.lineWidth = 0.9;
    c.beginPath(); c.ellipse(cx, cy, 88, 113, 0, 0, Math.PI * 2); c.stroke();
    c.save();
    c.translate(cx - 56, cy - 86);
    c.scale(1.22, 1.22);
    profilePath(c);
    c.fillStyle = p.ink;
    c.fill();
    c.restore();
    // a ribbon in the hair
    c.strokeStyle = p.accent; c.lineWidth = 2;
    c.beginPath(); c.moveTo(cx + 36, cy - 62); c.quadraticCurveTo(cx + 56, cy - 70, cx + 62, cy - 50); c.stroke();
    rule(c, 176, 612, 336, 612, p.accent, 1);
    c.fillStyle = p.accent;
    c.beginPath(); c.moveTo(256, 606); c.lineTo(262, 612); c.lineTo(256, 618); c.lineTo(250, 612); c.closePath(); c.fill();
    text(c, 'JANE AUSTEN', 256, 650, `500 16px ${SANS}`, p.ink, 'center', 7);
    grainOver(c, W, H, 0.24);
    vignette(c, 0.12, '20,35,28');
  },
  spine(c, sw, p) {
    c.fillStyle = p.bg;
    c.fillRect(0, 0, sw, H);
    c.strokeStyle = 'rgba(169,139,72,0.95)';
    c.lineWidth = 1.2;
    c.beginPath(); c.ellipse(sw / 2, 46, Math.min(9, sw * 0.14), Math.min(12, sw * 0.18), 0, 0, Math.PI * 2); c.stroke();
    rule(c, sw * 0.2, 70, sw * 0.8, 70, 'rgba(169,139,72,0.8)', 1);
    spineText(c, 'Pride and Prejudice', sw / 2, 92, `400 ${Math.min(44, sw * 0.44)}px ${SERIF}`, p.accent, 1, 480);
    spineText(c, 'AUSTEN', sw / 2, 650, `500 ${Math.min(14, sw * 0.13)}px ${SANS}`, p.ink, 4, 90);
    rule(c, sw * 0.2, 716, sw * 0.8, 716, 'rgba(169,139,72,0.8)', 1);
    grainOver(c, sw, H, 0.24);
  },
};

const kahneman: CoverDesign = {
  id: 'book.thinking-fast-slow', hardcover: true, size: [0.040, 0.240, 0.160], roughness: 0.66,
  palette: { bg: '#efe8d9', ink: '#1b1917', accent: '#c0442c', paper: '#ebe3cf', cloth: '#e6dfcf', endpaper: '#e0d9c8' },
  front(c, p) {
    c.fillStyle = p.bg;
    c.fillRect(0, 0, W, H);
    text(c, 'Thinking,', 50, 122, `400 62px ${SERIF}`, p.ink, 'left');
    text(c, 'Fast', 50, 212, `700 88px ${SERIF}`, p.accent, 'left');
    text(c, 'and Slow', 50, 288, `300 62px ${SERIF}`, p.ink, 'left');
    // two mirrored faces; the space between them is the vase
    const s = 1.86, top = 386;
    c.save();
    c.translate(256 + 10 - 13 * s, top);
    c.scale(s, s);
    profilePath(c);
    c.fillStyle = p.accent;
    c.fill();
    c.restore();
    c.save();
    c.translate(256 - 10 + 13 * s, top);
    c.scale(-s, s);
    profilePath(c);
    c.fillStyle = p.ink;
    c.fill();
    c.restore();
    text(c, 'DANIEL KAHNEMAN', 50, 724, `500 16px ${SANS}`, p.ink, 'left', 7);
    grainOver(c, W, H, 0.1);
  },
  spine(c, sw, p) {
    c.fillStyle = p.bg;
    c.fillRect(0, 0, sw, H);
    const f = Math.min(40, sw * 0.36);
    let y = 70;
    y += spineText(c, 'Thinking, ', sw / 2, y, `400 ${f}px ${SERIF}`, p.ink, 0, 200);
    y += spineText(c, 'Fast ', sw / 2, y, `700 ${f}px ${SERIF}`, p.accent, 0, 120);
    spineText(c, 'and Slow', sw / 2, y, `300 ${f}px ${SERIF}`, p.ink, 0, 200);
    spineText(c, 'KAHNEMAN', sw / 2, 630, `500 ${Math.min(14, sw * 0.12)}px ${SANS}`, p.ink, 4, 110);
    grainOver(c, sw, H, 0.1);
  },
};

const innovator: CoverDesign = {
  id: 'book.innovators-dilemma', hardcover: true, size: [0.026, 0.235, 0.156], roughness: 0.64,
  palette: { bg: '#d2a13a', ink: '#1d1811', accent: '#f4ecd8', paper: '#ebe3cd', cloth: '#c08f2e', endpaper: '#e6dcc4' },
  front(c, p) {
    gradient(c, [[0, '#d6a63e'], [1, '#c08f2c']]);
    text(c, 'The', 48, 94, `italic 400 36px ${SERIF}`, p.ink, 'left');
    text(c, "Innovator's", 46, 166, `700 68px ${SANS}`, p.ink, 'left', -1.5);
    text(c, 'Dilemma', 46, 236, `700 68px ${SANS}`, p.ink, 'left', -1.5);
    c.fillStyle = p.ink;
    c.fillRect(48, 258, 150, 6);
    text(c, 'When New Technologies Cause', 48, 306, `italic 400 20px ${SERIF}`, 'rgba(29,24,17,0.85)', 'left');
    text(c, 'Great Firms to Fail', 48, 332, `italic 400 20px ${SERIF}`, 'rgba(29,24,17,0.85)', 'left');
    // two S-curves: the incumbent flattening, the disruptor rising through it
    const sig = (x0: number, y0: number, x1: number, y1: number, k: number): [number, number][] => {
      const pts: [number, number][] = [];
      for (let i = 0; i <= 48; i++) {
        const t = i / 48;
        const s = 1 / (1 + Math.exp(-k * (t - 0.5)));
        pts.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * s]);
      }
      return pts;
    };
    const stroke = (pts: [number, number][], color: string, width: number): void => {
      c.strokeStyle = color; c.lineWidth = width; c.lineCap = 'round';
      c.beginPath();
      pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
      c.stroke();
    };
    rule(c, 60, 664, 460, 664, 'rgba(29,24,17,0.5)', 1.5);
    rule(c, 60, 664, 60, 400, 'rgba(29,24,17,0.5)', 1.5);
    stroke(sig(60, 640, 440, 446, 7), p.ink, 7);
    stroke(sig(230, 660, 466, 400, 9), p.accent, 5);
    c.fillStyle = p.ink;
    c.beginPath(); c.arc(366, 468, 6, 0, Math.PI * 2); c.fill();
    text(c, 'CLAYTON M. CHRISTENSEN', 48, 726, `600 15px ${SANS}`, p.ink, 'left', 5);
    grainOver(c, W, H, 0.1);
    vignette(c, 0.1);
  },
  spine(c, sw, p) {
    gradient(c, [[0, '#d6a63e'], [1, '#c08f2c']], sw, H);
    c.fillStyle = p.ink;
    c.fillRect(sw * 0.25, 40, sw * 0.5, 5);
    spineText(c, "THE INNOVATOR'S DILEMMA", sw / 2, 66, `700 ${Math.min(40, sw * 0.5)}px ${SANS}`, p.ink, 0, 520);
    spineText(c, 'CHRISTENSEN', sw / 2, 616, `600 ${Math.min(13, sw * 0.13)}px ${SANS}`, p.ink, 3, 120);
    grainOver(c, sw, H, 0.1);
  },
};

const demiGods: CoverDesign = {
  id: 'book.demi-gods', hardcover: false, size: [0.030, 0.185, 0.125], roughness: 0.78,
  palette: { bg: '#e2cfa6', ink: '#2b1f14', accent: '#b7362a', paper: '#e6d6ae', cloth: '#dac7a0', endpaper: '#e3d3ae' },
  front(c, p) {
    gradient(c, [[0, '#e6d4ad'], [1, '#d9c399']]);
    grainOver(c, W, H, 0.2);
    vignette(c, 0.3, '80,45,15');
    c.strokeStyle = 'rgba(43,31,20,0.75)';
    c.lineWidth = 2; c.strokeRect(22, 22, W - 44, H - 44);
    c.lineWidth = 0.8; c.strokeRect(30, 30, W - 60, H - 60);
    // the title label (題簽), vertical title, author
    c.fillStyle = '#f1e7cf';
    c.fillRect(350, 50, 104, 372);
    c.strokeStyle = 'rgba(43,31,20,0.8)';
    c.lineWidth = 1.5;
    c.strokeRect(350, 50, 104, 372);
    stacked(c, '天龍八部', 402, 110, 88, `600 66px ${SONG}`, p.ink);
    stacked(c, '金庸', 402, 476, 38, `500 30px ${SONG}`, p.ink);
    stacked(c, '著', 402, 556, 0, `400 22px ${SONG}`, 'rgba(43,31,20,0.8)');
    // a dry brush stroke across the lower-left, then the vermilion seal with 龍
    c.save();
    c.globalAlpha = 0.12;
    c.strokeStyle = '#2b1f14';
    c.lineWidth = 34;
    c.lineCap = 'round';
    c.beginPath(); c.moveTo(70, 690); c.quadraticCurveTo(150, 560, 250, 520); c.stroke();
    c.restore();
    c.save();
    c.translate(124, 612);
    c.rotate(-0.05);
    c.fillStyle = p.accent;
    c.beginPath();
    const r = 56;
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      // a square with a jittered edge: a carved stone chop
      const sq = Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a)));
      const rr = (r / sq) * (0.97 + hash2(i, 1, 31) * 0.06);
      const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
      if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
    }
    c.closePath();
    c.fill();
    c.fillStyle = '#f3e6c9';
    c.font = `700 82px ${BRUSH}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('龍', 0, 4);
    c.restore();
  },
  spine(c, sw, p) {
    gradient(c, [[0, '#e6d4ad'], [1, '#d9c399']], sw, H);
    grainOver(c, sw, H, 0.2);
    rule(c, sw * 0.15, 30, sw * 0.85, 30, 'rgba(43,31,20,0.7)', 1.2);
    rule(c, sw * 0.15, 738, sw * 0.85, 738, 'rgba(43,31,20,0.7)', 1.2);
    stacked(c, '天龍八部', sw / 2, 96, Math.min(78, sw * 0.62), `600 ${Math.min(58, sw * 0.5)}px ${SONG}`, p.ink);
    stacked(c, '金庸', sw / 2, 626, Math.min(30, sw * 0.26), `500 ${Math.min(24, sw * 0.2)}px ${SONG}`, p.ink);
    c.fillStyle = p.accent;
    c.fillRect(sw / 2 - 7, 690, 14, 14);
  },
};

const jobs: CoverDesign = {
  id: 'book.becoming-steve-jobs', hardcover: true, size: [0.034, 0.222, 0.148], roughness: 0.6,
  palette: { bg: '#e7e6e2', ink: '#161616', accent: '#8c8a84', paper: '#ede8da', cloth: '#dedcd6', endpaper: '#e4e2dc' },
  front(c, p) {
    c.fillStyle = p.bg;
    c.fillRect(0, 0, W, H);
    text(c, 'Becoming', 52, 114, `300 48px ${SERIF}`, p.ink, 'left');
    text(c, 'Steve Jobs', 50, 186, `600 66px ${SANS}`, p.ink, 'left', -1);
    text(c, 'The Evolution of a Reckless Upstart', 52, 230, `italic 400 18px ${SERIF}`, 'rgba(22,22,22,0.72)', 'left');
    text(c, 'into a Visionary Leader', 52, 254, `italic 400 18px ${SERIF}`, 'rgba(22,22,22,0.72)', 'left');
    // round glasses
    const y = 440, r = 56, dx = 68;
    c.strokeStyle = p.ink;
    c.lineWidth = 4.5;
    c.lineCap = 'round';
    c.beginPath(); c.arc(256 - dx, y, r, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.arc(256 + dx, y, r, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.moveTo(256 - dx + r, y - 4); c.quadraticCurveTo(256, y - 22, 256 + dx - r, y - 4); c.stroke();
    c.beginPath(); c.moveTo(256 - dx - r, y - 2); c.lineTo(256 - dx - r - 34, y - 12); c.stroke();
    c.beginPath(); c.moveTo(256 + dx + r, y - 2); c.lineTo(256 + dx + r + 34, y - 12); c.stroke();
    text(c, 'BRENT SCHLENDER', 52, 700, `500 15px ${SANS}`, p.ink, 'left', 5);
    text(c, 'RICK TETZELI', 52, 726, `500 15px ${SANS}`, p.ink, 'left', 5);
    grainOver(c, W, H, 0.06);
  },
  spine(c, sw, p) {
    c.fillStyle = p.bg;
    c.fillRect(0, 0, sw, H);
    c.strokeStyle = p.ink; c.lineWidth = 2;
    c.beginPath(); c.arc(sw / 2 - 7, 44, 5, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.arc(sw / 2 + 7, 44, 5, 0, Math.PI * 2); c.stroke();
    spineText(c, 'Becoming Steve Jobs', sw / 2, 76, `600 ${Math.min(42, sw * 0.42)}px ${SANS}`, p.ink, 0, 500);
    spineText(c, 'SCHLENDER · TETZELI', sw / 2, 586, `500 ${Math.min(13, sw * 0.12)}px ${SANS}`, p.accent, 3, 150);
    grainOver(c, sw, H, 0.06);
  },
};

export const designs: Record<string, CoverDesign> = Object.fromEntries(
  [anna, inferno, threeBody, powerBroker, pride, kahneman, innovator, demiGods, jobs].map((d) => [d.id, d]),
);

// ---------------------------------------------------------------- the atlas

function drawBack(c: CanvasRenderingContext2D, d: CoverDesign): void {
  const p = d.palette;
  if (d.back) { d.back(c, p); return; }
  c.fillStyle = p.bg;
  c.fillRect(0, 0, W, H);
  if (d.id === 'book.pride-and-prejudice') { grainOver(c, W, H, 0.24); return; }
  if (d.id === 'book.demi-gods') {
    grainOver(c, W, H, 0.2);
    vignette(c, 0.3, '80,45,15');
    c.strokeStyle = 'rgba(43,31,20,0.75)';
    c.lineWidth = 2; c.strokeRect(22, 22, W - 44, H - 44);
    return;
  }
  barcode(c, 316, 640, 150, 90, d.id.length);
  c.strokeStyle = p.ink === '#1b1917' || p.ink === '#161616' || p.ink === '#1d1811' ? p.ink : p.accent;
  c.lineWidth = 1.5;
  c.beginPath(); c.arc(70, 690, 12, 0, Math.PI * 2); c.stroke();
  c.beginPath(); c.arc(70, 690, 4, 0, Math.PI * 2); c.stroke();
  grainOver(c, W, H, 0.1);
  vignette(c, 0.18);
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
  // a few slightly yellowed bands (older signatures) and soft tonal variation
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
 * Draws a book's whole atlas into a square canvas context of size `A`
 * (1024 on desktop, 512 on phones). Safe to call again (fonts loaded).
 */
export function drawAtlas(c: CanvasRenderingContext2D, A: number, d: CoverDesign): void {
  const s = A / 1024;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, A, A);
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
  region(0, 0, 512, 768, () => d.front(c, d.palette));
  region(512, 0, 512, 768, () => drawBack(c, d));
  // spine: drawn upright on a scratch canvas, stored transposed in the strip (head at the left)
  const sw = spineWidthPx(d);
  const tmp = document.createElement('canvas');
  tmp.width = Math.ceil(sw * s);
  tmp.height = Math.ceil(768 * s);
  const tc = tmp.getContext('2d')!;
  tc.scale(s, s);
  d.spine(tc, sw, d.palette);
  c.save();
  c.setTransform(0, 1, 1, 0, 0, 768 * s);
  c.drawImage(tmp, 0, 0);
  c.restore();
  region(768, 768, 256, 192, () => drawPages(c, d, 256, 192));
  c.fillStyle = d.palette.cloth;
  c.fillRect(768 * s, 960 * s, 128 * s, 64 * s);
  c.fillStyle = d.palette.endpaper;
  c.fillRect(896 * s, 960 * s, 128 * s, 64 * s);
}
