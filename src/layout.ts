// Rest poses and focus poses for every object, plus the camera numbers.
// Units: metres, degrees. Table top is y = 0, x right, z toward the camera.
// Table: 1.30 (x) by 0.80 (z), so x in [-0.65, 0.65], z in [-0.40, 0.40] (TABLE in engine/scene.ts).
//
// Composition (one person's desk, read from the front-left camera):
//   back-left   books cluster (nine standing between bookends)  hologram puck centre-back
//   back-right  turntable, then the lamp in the corner
//   middle      FPGA board and the die-cast part together, puppet standing just right of centre
//               (a standing object occludes what sits behind it along the view direction: keep that strip clear)
//   front       ID card (left), capo and pick (centre-left), jar (right)

export interface RestPose {
  position: [number, number, number];
  /** Rotation about y in degrees. */
  rotationY?: number;
  /** Uniform scale (the lamp only: a 10% shorter lamp keeps the rest camera close). */
  scale?: number;
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
    /**
     * Fallback points that must stay inside the frame, used until the objects
     * exist; at boot the engine replaces them with the objects' real bounds
     * (plus the lamp) expanded by `fitPad`, so the camera frames the things on
     * the desk and the table's edges may leave the frame.
     */
    mustSee: [
      [-0.65, 0, 0.4], [0.65, 0, 0.4], [-0.65, 0, -0.4], [0.65, 0, -0.4], [0.4, 0.5, -0.2],
    ] as [number, number, number][],
    /** Metres of table kept visible around the outermost objects. */
    fitPad: 0.03,
  },
  /** Pointer parallax, degrees (landscape, fine pointer only). */
  parallaxDeg: 1.2,
  parallaxLerp: 0.08,
  /** Portrait focus poses pull back by this factor so the object clears the sheet. */
  portraitDistance: 1.45,
};

export const rest: Record<string, RestPose> = {
  // Occlusion from the rest camera (az 24): a point (x, z) hides (x + 0.445 d, z - d) for d > 0, and a thing
  // h tall hides the table up to d = h / tan(38°) behind it. The puppet (0.26 m) is the only one that matters:
  // its strip runs through the gap between the turntable and the lamp base.
  books:    { position: [-0.41, 0, -0.25], rotationY: 0 },
  hologram: { position: [-0.01, 0, -0.28], rotationY: 0 },
  vinyl:    { position: [0.28, 0, -0.25], rotationY: 6 },
  fpga:     { position: [-0.30, 0, 0.06], rotationY: -12 },
  'die-cast': { position: [-0.13, 0, 0.10], rotationY: 24 },
  puppet:   { position: [0.44, 0, 0.08], rotationY: -16 },
  'id-card': { position: [-0.42, 0, 0.25], rotationY: 9 },
  guitar:   { position: [0.12, 0, 0.26], rotationY: -22 },
  jar:      { position: [0.56, 0, 0.24], rotationY: 0 },
  /** The lamp's head points down local -z, 0.74 m out; 123° aims it at (-0.06, 0.09): the pool covers the centre-front. */
  lamp:     { position: [0.56, 0, -0.31], rotationY: 123, scale: 0.9 },
};

/**
 * The books, in shelf order (also the keyboard/reading order, SPEC 4.1's
 * list): nine standing between the bookends, spines toward +z, left to right.
 * The books builder decides sizes and exact positions inside the cluster
 * (the row starts near local x = -0.19); the engine frames from real bounds.
 */
export const bookSlots: { id: string; title: string }[] = [
  { id: 'book.anna-karenina',       title: 'Anna Karenina' },
  { id: 'book.inferno',             title: 'Inferno' },
  { id: 'book.becoming-steve-jobs', title: 'Becoming Steve Jobs' },
  { id: 'book.innovators-dilemma',  title: "The Innovator's Dilemma" },
  { id: 'book.three-body',          title: 'The Three-Body Problem' },
  { id: 'book.power-broker',        title: 'The Power Broker' },
  { id: 'book.thinking-fast-slow',  title: 'Thinking, Fast and Slow' },
  { id: 'book.demi-gods',           title: '天龙八部' },
  { id: 'book.pride-and-prejudice', title: 'Pride and Prejudice' },
];

// A single book (keyboard / deep link) slides out of the row and lifts ~8 cm when
// focused (books.ts tweens the motion layer); the target offset aims where it will be.
const book: FocusFrame = { dist: 0.5, az: 8, el: 24, fov: 31, targetOffset: [0, 0.085, 0.15] };
// The shelf (clicking the cluster): frontal, low, the row lifted to eye level (SHELF in books.ts).
const shelf: FocusFrame = { dist: 0.62, az: 0, el: 7, fov: 30, targetOffset: [0, 0.10, 0.06] };

export const focus: Record<string, FocusFrame> = {
  books: shelf,
  'book.anna-karenina': book,
  'book.inferno': book,
  'book.becoming-steve-jobs': book,
  'book.innovators-dilemma': book,
  'book.three-body': book,
  'book.power-broker': book,
  'book.thinking-fast-slow': book,
  'book.demi-gods': book,
  'book.pride-and-prejudice': book,
  // the ID lifts 5.5 cm and faces the camera when focused (ID_FOCUS_LIFT): aim where it will be
  'id-card':  { dist: 0.30, az: 2, el: 58, fov: 31, targetOffset: [0, 0.062, 0] },
  guitar:     { dist: 0.30, az: 6, el: 50, fov: 31 },
  fpga:       { dist: 0.30, az: 4, el: 52, fov: 31 },
  'die-cast': { dist: 0.30, az: 12, el: 44, fov: 31 },
  hologram:   { dist: 0.84, az: 6, el: 22, fov: 32, targetOffset: [0, 0.05, 0] },
  puppet:     { dist: 0.62, az: 10, el: 12, fov: 32, targetOffset: [0, 0.01, 0] },
  jar:        { dist: 0.36, az: 14, el: 30, fov: 31, targetOffset: [0, 0.008, 0] },
  vinyl:      { dist: 0.58, az: -4, el: 40, fov: 32 },
};
