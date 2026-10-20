// Rest poses and focus poses for every object, plus the camera numbers.
// Units: metres, degrees. Table top is y = 0, x right, z toward the camera.
// Table: 1.60 (x) by 0.90 (z), so x in [-0.80, 0.80], z in [-0.45, 0.45].
//
// Composition (one person's desk, read from the front-left camera):
//   back-left   books cluster (five standing + stack)        hologram puck centre-back
//   back-right  turntable, then the lamp in the corner
//   middle      FPGA board and the die-cast part together, puppet standing just right of centre
//               (a standing object occludes what sits behind it along the view direction: keep that strip clear)
//   front       ID card (left), capo and pick (centre-left), jar (right)

export interface RestPose {
  position: [number, number, number];
  /** Rotation about y in degrees. */
  rotationY?: number;
}

/**
 * A focus frame relative to the object's own world bounds: the camera sits
 * `dist` metres from the bounds centre (plus `targetOffset`), at azimuth `az`
 * (degrees, 0 = straight from the front, positive = from the left) and
 * elevation `el` (degrees above the table plane). Robust to geometry changes.
 */
export interface FocusFrame {
  dist: number;
  az: number;
  el: number;
  fov?: number;
  /** Shift of the look-at point from the bounds centre (metres). */
  targetOffset?: [number, number, number];
  /** Portrait distance multiplier (default camera.portraitDistance). */
  portraitDist?: number;
}

export const camera = {
  rest: {
    /** Three-quarter from the front-left, pitched down. */
    landscape: { az: 24, el: 38, fov: 34, margin: 0.035 },
    /** Phone portrait: higher and more frontal so the table fits the width. */
    portrait: { az: 12, el: 52, fov: 46, margin: 0.035 },
    /** Look-at point (slightly behind centre so the back row is not crowded). */
    target: [0, 0.02, -0.03] as [number, number, number],
    /** Points that must stay inside the frame (table corners + tall things). */
    mustSee: [
      [-0.8, 0, 0.45], [0.8, 0, 0.45], [-0.8, 0, -0.45], [0.8, 0, -0.45],
      [-0.8, 0.26, -0.45], [0.8, 0.26, -0.45],   // headroom for standing books / puppet
      [0.66, 0.5, -0.33],                          // the lamp head (top of the shade)
    ] as [number, number, number][],
  },
  /** Pointer parallax, degrees (landscape, fine pointer only). */
  parallaxDeg: 1.2,
  parallaxLerp: 0.08,
  /** Portrait focus poses pull back by this factor so the object clears the sheet. */
  portraitDistance: 1.45,
};

export const rest: Record<string, RestPose> = {
  books:    { position: [-0.46, 0, -0.22], rotationY: 0 },
  'id-card': { position: [-0.42, 0, 0.26], rotationY: 9 },
  guitar:   { position: [-0.12, 0, 0.30], rotationY: -22 },
  fpga:     { position: [0.04, 0, 0.00], rotationY: -12 },
  'die-cast': { position: [0.21, 0, 0.11], rotationY: 24 },
  hologram: { position: [0.00, 0, -0.30], rotationY: 0 },
  puppet:   { position: [0.16, 0, 0.00], rotationY: -16 },
  jar:      { position: [0.56, 0, 0.22], rotationY: 0 },
  vinyl:    { position: [0.42, 0, -0.28], rotationY: 6 },
  /** The lamp's head points down local -z; 117° turns it toward the table centre. */
  lamp:     { position: [0.66, 0, -0.33], rotationY: 117 },
};

/**
 * The books, in shelf order (also the keyboard/reading order): five standing
 * between the bookends (spines toward +z), left to right, then the lying
 * stack, bottom to top. The books builder decides sizes and exact positions
 * inside the cluster (standing books start near local x = -0.19; the stack
 * sits around local x = +0.14); the engine frames from real bounds.
 */
export const bookSlots: { id: string; title: string; standing: boolean; stackIndex?: number }[] = [
  { id: 'book.anna-karenina',      title: 'Anna Karenina',            standing: true },
  { id: 'book.inferno',            title: 'Inferno',                  standing: true },
  { id: 'book.three-body',         title: 'The Three-Body Problem',   standing: true },
  { id: 'book.power-broker',       title: 'The Power Broker',         standing: true },
  { id: 'book.pride-and-prejudice', title: 'Pride and Prejudice',      standing: true },
  { id: 'book.thinking-fast-slow', title: 'Thinking, Fast and Slow',  standing: false, stackIndex: 0 },
  { id: 'book.innovators-dilemma', title: "The Innovator's Dilemma",  standing: false, stackIndex: 1 },
  { id: 'book.demi-gods',          title: '天龙八部',                  standing: false, stackIndex: 2 },
  { id: 'book.becoming-steve-jobs', title: 'Becoming Steve Jobs',      standing: false, stackIndex: 3 },
];

// Books slide out of the shelf / stack and lift ~8 cm when focused (books.ts
// tweens the motion layer); the target offsets aim where the book will be.
const book: FocusFrame = { dist: 0.5, az: 8, el: 24, fov: 31, targetOffset: [0, 0.085, 0.13] };
const flatBook: FocusFrame = { dist: 0.6, az: 6, el: 40, fov: 31, targetOffset: [0, 0.1, 0.13] };

export const focus: Record<string, FocusFrame> = {
  'book.anna-karenina': book,
  'book.inferno': book,
  'book.three-body': book,
  'book.power-broker': book,
  'book.pride-and-prejudice': book,
  'book.thinking-fast-slow': flatBook,
  'book.innovators-dilemma': flatBook,
  'book.demi-gods': flatBook,
  'book.becoming-steve-jobs': flatBook,
  'id-card':  { dist: 0.26, az: 2, el: 58, fov: 31 },
  guitar:     { dist: 0.30, az: 6, el: 50, fov: 31 },
  fpga:       { dist: 0.30, az: 4, el: 50, fov: 31 },
  'die-cast': { dist: 0.30, az: 10, el: 42, fov: 31 },
  hologram:   { dist: 0.78, az: 6, el: 16, fov: 32, targetOffset: [0, 0.16, 0] },
  puppet:     { dist: 0.62, az: 10, el: 12, fov: 32, targetOffset: [0, 0.01, 0] },
  jar:        { dist: 0.40, az: 8, el: 22, fov: 31 },
  vinyl:      { dist: 0.58, az: -4, el: 40, fov: 32 },
};
