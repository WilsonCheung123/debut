import * as THREE from 'three';
import gsap from 'gsap';
import type Hls from 'hls.js';
import type { ErrorData } from 'hls.js';
import type { ObjectCtx, TableObject } from './types';
import { hitProxy, solid } from './helpers';
import { HIT_LAYER } from '../engine/picking';
import { metal, plastic, makeCanvasTexture, hash2 } from '../materials';
import { FILMS, thumbnailUrl, hlsUrl, type Film } from '../content/hologram';
import { hologramPanel, type HologramController } from '../panels/hologram';

// The hologram projector (SPEC 4.7). A small black puck with a glass lens; at
// rest a faint cone of light with a dim, slowly turning ghost of the selected
// film's poster. On focus the cone brightens and a bowed 16:9 sheet of light
// fades in above it, playing the film muted (hls.js, native HLS on Safari)
// as a VideoTexture through an additive shader: cyan toward the edges, fine
// scanlines, a 0.5% flicker, soft edges. Switching films crossfades through
// a snapshot of the last frame and the next poster, never a pop.
//
// Sorting: everything that is light is additive with depthWrite off, so the
// order among the cone, ghost and screen does not matter; depthTest against
// the opaque puck and table keeps them in the right place; renderOrder puts
// the light after the glass lens so the lens never dims the beam.

const PUCK = { r: 0.046, h: 0.020, bevel: 0.0035 };
const LENS = { base: 0.019, h: 0.0075 };
const CONE = { h: 0.17, rTop: 0.068, rBottom: 0.012 };
const GHOST = { w: 0.12, y: 0.115, intensity: 0.28 };
const SCREEN = { w: 0.32, h: 0.18, y: 0.255, bow: 0.012, tilt: -0.10 };
const CYAN = new THREE.Color(0x6fdcff);

const REST = { cone: 0.26, glow: 0.35, light: 0.05, coneScale: 1 };
const FOCUS = { cone: 0.5, glow: 0.9, light: 0.3, coneScale: 1.05 };

// ---------------------------------------------------------------- shaders

const CONE_VERT = /* glsl */ `
varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

const CONE_FRAG = /* glsl */ `
uniform float intensity; uniform float time; uniform vec3 colorA; uniform vec3 colorB;
varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main() {
  float h = vUv.y;                             // CylinderGeometry: uv.y is 0 at the bottom (the lens), 1 at the open top
  float rim = pow(abs(dot(normalize(vN), normalize(vV))), 1.6);   // thin at the silhouette: reads as volume
  float fall = pow(1.0 - h, 1.2) * (0.35 + 0.65 * smoothstep(0.0, 0.08, h)) * smoothstep(1.0, 0.7, h); // brightest at the lens, gone by the top
  float bands = 0.93 + 0.07 * sin(h * 24.0 - time * 1.1 + sin(vUv.x * 12.566 + time * 0.3));
  float flick = 1.0 + 0.02 * sin(time * 9.0) * sin(time * 3.1);
  vec3 col = mix(colorA, colorB, h);
  float a = intensity * rim * fall * bands * flick;
  gl_FragColor = vec4(col * a, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const SCREEN_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const SCREEN_FRAG = /* glsl */ `
uniform sampler2D mapA; uniform sampler2D mapB; uniform float mixT;
uniform float opacity; uniform float intensity; uniform float time; uniform float tint; uniform float lines; uniform vec3 tintColor;
varying vec2 vUv;
void main() {
  vec3 c = mix(texture2D(mapA, vUv).rgb, texture2D(mapB, vUv).rgb, mixT);
  vec2 d = abs(vUv - 0.5) * 2.0;
  float edge = smoothstep(0.3, 1.0, length(d * vec2(1.0, 0.85)));
  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  vec3 cyan = tintColor * (lum * 1.1 + 0.02);
  vec3 col = mix(c, cyan, clamp(tint * (0.25 + 0.75 * edge), 0.0, 1.0));
  float scan = 0.93 + 0.07 * (0.5 + 0.5 * sin(vUv.y * lines * 6.2831853));
  float flick = 1.0 + 0.005 * (0.6 * sin(time * 1.9) + 0.4 * sin(time * 3.7 + 1.3));
  float fx = smoothstep(0.0, 0.07, vUv.x) * smoothstep(1.0, 0.93, vUv.x);
  float fy = smoothstep(0.0, 0.09, vUv.y) * smoothstep(1.0, 0.91, vUv.y);
  float a = opacity * intensity * scan * flick * fx * fy;
  gl_FragColor = vec4(col * a + tintColor * (0.03 * opacity * intensity * fx * fy), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

interface ScreenUniforms {
  [uniform: string]: THREE.IUniform;
  mapA: { value: THREE.Texture }; mapB: { value: THREE.Texture }; mixT: { value: number };
  opacity: { value: number }; intensity: { value: number }; time: { value: number };
  tint: { value: number }; lines: { value: number }; tintColor: { value: THREE.Color };
}

function screenMaterial(tex: THREE.Texture, opts: { intensity: number; tint: number; lines: number }): THREE.ShaderMaterial & { uniforms: ScreenUniforms } {
  const uniforms: ScreenUniforms = {
    mapA: { value: tex }, mapB: { value: tex }, mixT: { value: 0 },
    opacity: { value: 1 }, intensity: { value: opts.intensity }, time: { value: 0 },
    tint: { value: opts.tint }, lines: { value: opts.lines }, tintColor: { value: CYAN.clone() },
  };
  return new THREE.ShaderMaterial({
    uniforms, vertexShader: SCREEN_VERT, fragmentShader: SCREEN_FRAG,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  }) as THREE.ShaderMaterial & { uniforms: ScreenUniforms };
}

// ---------------------------------------------------------------- geometry helpers

function arc(pts: THREE.Vector2[], cx: number, cy: number, r: number, a0: number, a1: number, n = 4): void {
  for (let i = 1; i <= n; i++) {
    const a = THREE.MathUtils.degToRad(a0 + (a1 - a0) * (i / n));
    pts.push(new THREE.Vector2(cx + r * Math.cos(a), cy + r * Math.sin(a)));
  }
}

/** The puck's lathe profile: bevelled bottom and top, a hairline groove on the top face, a low boss under the lens. */
function puckProfile(): THREE.Vector2[] {
  const { r, h, bevel: b } = PUCK;
  const p: THREE.Vector2[] = [new THREE.Vector2(0, 0), new THREE.Vector2(r - b, 0)];
  arc(p, r - b, b, b, -90, 0);
  p.push(new THREE.Vector2(r, h - b));
  arc(p, r - b, h - b, b, 0, 90);
  // groove (duplicated points keep its edges crisp under the lathe's averaged normals)
  const g0 = 0.0352, g1 = 0.0328;
  p.push(new THREE.Vector2(g0, h), new THREE.Vector2(g0, h));
  p.push(new THREE.Vector2(g0 - 0.0006, h - 0.0007), new THREE.Vector2(g1 + 0.0006, h - 0.0007));
  p.push(new THREE.Vector2(g1, h), new THREE.Vector2(g1, h));
  // boss under the ring and lens
  p.push(new THREE.Vector2(0.0215, h), new THREE.Vector2(0.0215, h));
  p.push(new THREE.Vector2(0.0215, h + 0.0015), new THREE.Vector2(0.0215, h + 0.0015));
  p.push(new THREE.Vector2(0, h + 0.0015));
  return p;
}

/** Fine concentric rings as a bump map: turned, brushed plastic. */
function brushedBump(): THREE.CanvasTexture {
  return makeCanvasTexture({
    width: 256, height: 256, colorSpace: THREE.NoColorSpace, anisotropy: 4,
    draw(c, w, h) {
      c.fillStyle = '#808080';
      c.fillRect(0, 0, w, h);
      for (let i = 0; i < 520; i++) {
        const y = hash2(i, 1, 17) * h;
        const a = 0.05 + hash2(i, 2, 17) * 0.18;
        c.strokeStyle = hash2(i, 3, 17) > 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;
        c.lineWidth = 0.5 + hash2(i, 4, 17) * 1.2;
        c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke();
      }
    },
  });
}

/** Shown when a poster cannot be loaded: a quiet teal gradient with the studio's ring mark. */
function fallbackPoster(): THREE.CanvasTexture {
  return makeCanvasTexture({
    width: 256, height: 144,
    draw(c, w, h) {
      const g = c.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, '#0e2630'); g.addColorStop(0.55, '#1c5664'); g.addColorStop(1, '#0a1a22');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgba(225,245,255,0.85)'; c.lineWidth = 2;
      c.beginPath(); c.arc(w / 2, h / 2, 26, 0, Math.PI * 2); c.stroke();
    },
  });
}

function bowedPlane(w: number, h: number, bow: number): THREE.PlaneGeometry {
  const geo = new THREE.PlaneGeometry(w, h, 32, 1);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const nx = pos.getX(i) / (w / 2);
    pos.setZ(i, bow * nx * nx);             // edges come toward the viewer, like a curved display
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

// ---------------------------------------------------------------- the player

type Mode = 'hls' | 'native' | 'file';

/** Fullscreen across engines (Safari before 16.4 is prefixed; iOS only has the video-level call). */
interface FsVideo extends HTMLVideoElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
  webkitEnterFullscreen?: () => void;
}
interface FsDocument extends Document {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
}
const fsElement = (): Element | null => document.fullscreenElement ?? (document as FsDocument).webkitFullscreenElement ?? null;

/**
 * Owns the one hidden <video>, the hls.js instance and the VideoTexture.
 *
 * The expensive parts of starting a stream in Chrome are not the network: it is
 * importing hls.js, opening the MediaSource and loading the playlists. `prepare`
 * does all of that at idle (no fragment is fetched: autoStartLoad off), so the
 * focus click only has to `startLoad` and `play`. `poll` (per frame) reports when
 * real frames flow; `stop` pauses, detaches hls, clears the source and frees the
 * GPU texture. `enterCinema` turns the same element into the fullscreen player
 * with sound (same stream, same position); leaving fullscreen returns it to the
 * muted, hidden hologram source without a reload.
 */
class Player {
  video: HTMLVideoElement | null = null;
  hls: Hls | null = null;
  texture: THREE.VideoTexture | null = null;
  mode: Mode | null = null;
  live = false;
  playing = false;
  cinema = false;
  lastError = '';
  /** A short trace of media and hls.js events (QA: `__hologram.status().events`). */
  events: string[] = [];
  private preparedFor: string | null = null;
  private hlsMod: Promise<typeof Hls | null> | null = null;
  private token = 0;
  private readonly t0 = performance.now();

  constructor(
    private readonly fileOverride: string | null,
    /** QA: take the hls.js path even where the browser plays HLS natively. */
    private readonly forceHls: boolean,
    private readonly onLive: (tex: THREE.VideoTexture) => void,
    private readonly onCinema: (on: boolean) => void,
  ) {
    const onFsChange = (): void => { if (this.cinema && fsElement() !== this.video) this.leaveCinema(); };
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    // Escape while the fullscreen player (or its fallback overlay) is up closes only that, never the focus
    document.addEventListener('keydown', (e) => {
      if (!this.cinema || e.key !== 'Escape') return;
      e.stopPropagation();
      e.preventDefault();
      this.leaveCinema();
    }, true);
  }

  trace(s: string): void {
    this.events.push(`${((performance.now() - this.t0) / 1000).toFixed(2)} ${s}`);
    if (this.events.length > 200) this.events.shift();
  }

  private ensureVideo(): HTMLVideoElement {
    if (this.video) return this.video;
    const v = document.createElement('video');
    v.muted = true; v.defaultMuted = true; v.loop = true; v.playsInline = true; v.preload = 'auto';
    v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.setAttribute('aria-hidden', 'true');
    v.crossOrigin = 'anonymous';
    v.tabIndex = -1;
    v.className = 'holo-video';
    for (const ev of ['loadstart', 'loadedmetadata', 'loadeddata', 'playing', 'waiting', 'stalled', 'pause', 'ended', 'error', 'emptied'])
      v.addEventListener(ev, () => this.trace(ev === 'error' ? `video:error ${v.error?.code ?? '?'} ${v.error?.message ?? ''}` : `video:${ev}`));
    v.addEventListener('webkitendfullscreen', () => { if (this.cinema) this.leaveCinema(); }); // iOS's own player
    // in the document (Safari decodes nothing for a detached element) but out of sight
    document.body.append(v);
    this.video = v;
    return v;
  }

  private useNative(v: HTMLVideoElement): boolean {
    return !this.fileOverride && !this.forceHls && !!v.canPlayType('application/vnd.apple.mpegurl');
  }

  private loadHls(): Promise<typeof Hls | null> {
    this.hlsMod ??= import('hls.js')
      .then((m) => { this.trace('hls.js imported'); return m.default; })
      .catch((e: unknown) => { this.lastError = `hls-import: ${e instanceof Error ? e.message : String(e)}`; this.hlsMod = null; return null; });
    return this.hlsMod;
  }

  private newHls(HlsCtor: typeof Hls, autoStartLoad: boolean): Hls {
    const hls = new HlsCtor({
      enableWorker: true, autoStartLoad,
      // a 32 cm sheet of light: ~20 s ahead is plenty (the default maxBufferSize would fetch whole films)
      maxBufferLength: 20, maxMaxBufferLength: 30, maxBufferSize: 8 * 1000 * 1000, backBufferLength: 10,
    });
    for (const ev of [HlsCtor.Events.MEDIA_ATTACHED, HlsCtor.Events.MANIFEST_LOADED, HlsCtor.Events.LEVEL_LOADED, HlsCtor.Events.FRAG_BUFFERED])
      hls.on(ev, () => this.trace(`hls:${ev}`));
    hls.on(HlsCtor.Events.MANIFEST_PARSED, () => {
      // no more than 720p on the hologram
      let cap = -1;
      hls.levels.forEach((l, i) => { if (l.height && l.height <= 720) cap = i; });
      if (cap >= 0) hls.autoLevelCapping = cap;
    });
    let retriedNet = false, retriedMedia = false;
    hls.on(HlsCtor.Events.ERROR, (_ev, data: ErrorData) => {
      this.trace(`hls:error ${data.fatal ? 'FATAL' : 'minor'} ${data.type} ${data.details}${data.response ? ` http ${data.response.code}` : ''}`);
      if (!data.fatal) return;
      if (data.type === HlsCtor.ErrorTypes.NETWORK_ERROR && !retriedNet) { retriedNet = true; hls.startLoad(); return; }
      if (data.type === HlsCtor.ErrorTypes.MEDIA_ERROR && !retriedMedia) { retriedMedia = true; hls.recoverMediaError(); return; }
      this.lastError = data.details;
      this.playing = false;
      hls.destroy();
      if (this.hls === hls) { this.hls = null; this.preparedFor = null; }
    });
    return hls;
  }

  /** Idle work for the film most likely to play next: import hls.js, open the MediaSource, load the playlists. Fetches no video. */
  async prepare(film: Film): Promise<void> {
    if (this.playing || this.preparedFor === film.id || this.fileOverride) return;
    const v = this.ensureVideo();
    if (this.useNative(v)) return; // Safari's own stack starts fast enough
    const token = this.token;
    const HlsCtor = await this.loadHls();
    if (!HlsCtor || token !== this.token || this.playing || this.preparedFor === film.id) return;
    if (!HlsCtor.isSupported()) { this.lastError = 'hls-unsupported'; return; }
    this.detach();
    this.mode = 'hls';
    const hls = this.newHls(HlsCtor, false);
    this.hls = hls;
    hls.attachMedia(v);
    hls.loadSource(hlsUrl(film));
    this.preparedFor = film.id;
    this.trace(`prepared ${film.id.slice(0, 8)}`);
  }

  async start(film: Film): Promise<void> {
    const token = ++this.token;
    const v = this.ensureVideo();
    this.trace(`start ${film.id.slice(0, 8)}${this.preparedFor === film.id ? ' (prepared)' : ''}`);
    this.live = false;
    this.playing = true;
    this.lastError = '';
    if (this.fileOverride) {
      this.detach();
      this.mode = 'file';
      v.src = this.fileOverride;
    } else if (this.useNative(v)) {
      this.detach();
      this.mode = 'native';
      v.src = hlsUrl(film);
    } else if (this.hls && this.preparedFor === film.id) {
      this.hls.startLoad();
    } else {
      this.detach();
      const HlsCtor = await this.loadHls();
      if (token !== this.token) return;
      if (!HlsCtor) { this.playing = false; return; }
      if (!HlsCtor.isSupported()) { this.lastError = 'hls-unsupported'; this.playing = false; return; }
      this.mode = 'hls';
      const hls = this.newHls(HlsCtor, true);
      this.hls = hls;
      hls.attachMedia(v);
      hls.loadSource(hlsUrl(film));
      this.preparedFor = film.id;
    }
    this.play(v);
  }

  private play(v: HTMLVideoElement): void {
    const p = v.play();
    if (p) p.catch((e: unknown) => { this.lastError = e instanceof Error ? e.name : String(e); this.trace(`play rejected ${this.lastError}`); });
  }

  /** Called every frame: attaches the VideoTexture once the first frame exists (never before: an empty video would log a WebGL warning). */
  poll(): void {
    const v = this.video;
    if (this.live || !this.playing || !v) return;
    if (v.readyState < 2 || v.videoWidth === 0) return;
    if (!this.texture) {
      this.texture = new THREE.VideoTexture(v);
      this.texture.colorSpace = THREE.SRGBColorSpace;
      this.texture.minFilter = THREE.LinearFilter;
      this.texture.magFilter = THREE.LinearFilter;
      this.texture.generateMipmaps = false;
    }
    this.texture.needsUpdate = true;
    this.live = true;
    this.trace(`live ${v.videoWidth}x${v.videoHeight}`);
    this.onLive(this.texture);
  }

  /**
   * The same element, fullscreen, with sound and the browser's controls. Must run inside the
   * user's click (unmuting and fullscreen are gated on the gesture). Where fullscreen is
   * refused the element stays as a full-viewport overlay (Escape closes it).
   */
  enterCinema(): boolean {
    const v = this.video as FsVideo | null;
    if (!v || !this.playing || this.cinema) return false;
    this.cinema = true;
    this.trace('cinema on');
    v.muted = false;
    v.controls = true;
    v.classList.add('cinema');
    this.onCinema(true);
    const req = v.requestFullscreen ?? v.webkitRequestFullscreen;
    if (req) {
      try {
        const p = req.call(v);
        if (p && typeof (p as Promise<void>).catch === 'function') (p as Promise<void>).catch((e: unknown) => this.trace(`fullscreen refused ${e instanceof Error ? e.message : String(e)}`));
      } catch (e: unknown) { this.trace(`fullscreen threw ${e instanceof Error ? e.message : String(e)}`); }
    } else if (v.webkitEnterFullscreen) {
      v.webkitEnterFullscreen();
    }
    if (v.paused) this.play(v);
    return true;
  }

  leaveCinema(): void {
    if (!this.cinema) return;
    this.cinema = false;
    this.trace('cinema off');
    const v = this.video;
    if (v) {
      v.muted = true;
      v.controls = false;
      v.classList.remove('cinema');
      if (fsElement() === v) {
        const d = document as FsDocument;
        const p = d.exitFullscreen ? d.exitFullscreen() : d.webkitExitFullscreen?.();
        if (p && typeof (p as Promise<void>).catch === 'function') (p as Promise<void>).catch(() => { /* already out */ });
      }
      if (this.playing && v.paused) this.play(v); // the visitor may have paused it in fullscreen; the hologram runs
    }
    this.onCinema(false);
  }

  /** Draws the current frame into `canvas`; false when there is no frame (or the canvas would be tainted). */
  snapshot(canvas: HTMLCanvasElement): boolean {
    const v = this.video;
    if (!v || !this.live || v.readyState < 2 || v.videoWidth === 0) return false;
    const c = canvas.getContext('2d', { willReadFrequently: true });
    if (!c) return false;
    try {
      c.drawImage(v, 0, 0, canvas.width, canvas.height);
      c.getImageData(0, 0, 1, 1); // throws if the frame tainted the canvas
      return true;
    } catch { return false; }
  }

  private detach(): void {
    if (this.hls) { this.hls.destroy(); this.hls = null; }
    this.preparedFor = null;
    const v = this.video;
    if (v) { v.pause(); v.removeAttribute('src'); v.load(); }
  }

  stop(): void {
    this.token++;
    if (this.cinema) this.leaveCinema();
    this.playing = false;
    this.live = false;
    this.detach();
    this.texture?.dispose(); // the GPU copy goes; the object is reused next time
  }

  dispose(): void {
    this.stop();
    this.texture = null;
    this.video?.remove();
    this.video = null;
  }
}

const VIDEO_CSS = `
video.holo-video { position: fixed; left: 0; bottom: 0; width: 2px; height: 2px; opacity: 0.01; pointer-events: none; z-index: -1; background: #000; }
video.holo-video.cinema { inset: 0; width: 100%; height: 100%; opacity: 1; pointer-events: auto; z-index: 40; object-fit: contain; }
`;

// ---------------------------------------------------------------- the object

export function createHologram(ctx: ObjectCtx): TableObject {
  const { state } = ctx;
  const group = new THREE.Group();
  group.name = 'hologram';

  // --- the puck
  const bump = brushedBump();
  const bodyMat = plastic({ color: 0x232326, roughness: 0.62 }).clone();
  bodyMat.bumpMap = bump;
  bodyMat.bumpScale = 0.0004;
  const body = solid(new THREE.Mesh(new THREE.LatheGeometry(puckProfile(), 72), bodyMat), 'hologram');
  group.add(body);

  const ringMat = metal({ color: 0x8a8884, roughness: 0.38 });
  const ring = solid(new THREE.Mesh(new THREE.TorusGeometry(0.0205, 0.0014, 10, 64), ringMat), 'hologram:ring');
  ring.rotation.x = Math.PI / 2;
  ring.position.y = PUCK.h + 0.0015;
  ring.castShadow = false;
  group.add(ring);

  const lensTop = PUCK.h + 0.0015;
  const glowMat = new THREE.MeshBasicMaterial({ color: 0x3fcfff, transparent: true, opacity: REST.glow, depthWrite: false });
  const glow = new THREE.Mesh(new THREE.CircleGeometry(LENS.base - 0.001, 40), glowMat);
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = lensTop + 0.0004;
  glow.renderOrder = 1;
  group.add(glow);

  const rs = (LENS.base * LENS.base + LENS.h * LENS.h) / (2 * LENS.h);
  const theta = Math.acos((rs - LENS.h) / rs);
  const lensMat = new THREE.MeshPhysicalMaterial({
    color: 0x4e7686, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.6,
    clearcoat: 1, clearcoatRoughness: 0.05, ior: 1.5, depthWrite: false,
  });
  const lens = new THREE.Mesh(new THREE.SphereGeometry(rs, 48, 16, 0, Math.PI * 2, 0, theta), lensMat);
  lens.position.y = lensTop - (rs - LENS.h);
  lens.castShadow = true;
  lens.renderOrder = 1;
  group.add(lens);

  const light = new THREE.PointLight(0x5fd4ff, REST.light, 0.45, 2);
  light.position.y = PUCK.h + 0.03;
  group.add(light);

  // --- the cone of light
  const coneUniforms = {
    intensity: { value: REST.cone }, time: { value: 0 },
    colorA: { value: new THREE.Color(0xcdf3ff) }, colorB: { value: CYAN.clone() },
  };
  const coneMat = new THREE.ShaderMaterial({
    uniforms: coneUniforms, vertexShader: CONE_VERT, fragmentShader: CONE_FRAG,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.FrontSide, // one layer: a beam, not a bowl
  });
  const coneGeo = new THREE.CylinderGeometry(CONE.rTop, CONE.rBottom, CONE.h, 56, 1, true);
  coneGeo.translate(0, CONE.h / 2, 0); // apex at the origin so scale.y grows it upward
  const cone = new THREE.Mesh(coneGeo, coneMat);
  cone.position.y = lensTop + 0.002;
  cone.renderOrder = 2;
  cone.frustumCulled = false;
  group.add(cone);

  // --- posters, slots, snapshot
  const black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  black.needsUpdate = true;
  let fallback: THREE.CanvasTexture | null = null;
  const posters = new Map<number, THREE.Texture>();
  const loading = new Map<number, ((t: THREE.Texture) => void)[]>();
  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin('anonymous');
  let posterFallback = false;
  const poster = (i: number, cb: (t: THREE.Texture) => void): void => {
    const have = posters.get(i);
    if (have) { cb(have); return; }
    const waiting = loading.get(i);
    if (waiting) { waiting.push(cb); return; }
    loading.set(i, [cb]);
    const done = (t: THREE.Texture): void => {
      posters.set(i, t);
      const cbs = loading.get(i) ?? [];
      loading.delete(i);
      for (const f of cbs) f(t);
    };
    loader.load(
      thumbnailUrl(FILMS[i], 960),
      (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = Math.min(ctx.maxAnisotropy, 8);
        t.minFilter = THREE.LinearMipmapLinearFilter;
        done(t);
      },
      undefined,
      () => { posterFallback = true; fallback ??= fallbackPoster(); done(fallback); },
    );
  };
  const snapCanvas = document.createElement('canvas');
  snapCanvas.width = 960; snapCanvas.height = 540;
  const snapTex = new THREE.CanvasTexture(snapCanvas);
  snapTex.colorSpace = THREE.SRGBColorSpace;
  snapTex.minFilter = THREE.LinearFilter;
  snapTex.generateMipmaps = false;

  // --- the ghost (rest) and the screen (focus)
  const ghostMat = screenMaterial(black, { intensity: GHOST.intensity, tint: 0.85, lines: 70 });
  const ghost = new THREE.Mesh(new THREE.PlaneGeometry(GHOST.w, GHOST.w * 9 / 16), ghostMat);
  ghost.position.y = GHOST.y;
  ghost.renderOrder = 3;
  group.add(ghost);

  const screenMat = screenMaterial(black, { intensity: 1, tint: 0.55, lines: 150 });
  screenMat.uniforms.opacity.value = 0;
  const screen = new THREE.Mesh(bowedPlane(SCREEN.w, SCREEN.h, SCREEN.bow), screenMat);
  screen.position.y = SCREEN.y;
  screen.rotation.x = SCREEN.tilt;
  screen.renderOrder = 3;
  // visible for the engine's first compile (opacity 0), hidden on the first frame so it never counts in bounds
  screen.visible = true;
  let firstFrame = true;
  group.add(screen);

  // crossfade slots on the screen: composite = mix(mapA, mapB, mixT)
  const su = screenMat.uniforms;
  let mixTween: gsap.core.Tween | null = null;
  let pendingTex: THREE.Texture | null = null;
  const showStatic = (t: THREE.Texture): void => {
    mixTween?.kill(); mixTween = null; pendingTex = null;
    su.mapA.value = t; su.mapB.value = t; su.mixT.value = 0;
  };
  const fadeTo = (t: THREE.Texture, duration: number): void => {
    if (mixTween) { pendingTex = t; return; }       // chained after the running dissolve: no jump mid-fade
    if (su.mapB.value === t && su.mixT.value === 1) return;
    su.mapA.value = su.mixT.value >= 1 ? su.mapB.value : su.mapA.value;
    su.mapB.value = t;
    su.mixT.value = 0;
    mixTween = gsap.to(su.mixT, {
      value: 1, duration: state.reducedMotion ? 0.2 : duration, ease: 'sine.inOut',
      onComplete: () => { mixTween = null; const next = pendingTex; pendingTex = null; if (next) fadeTo(next, duration); },
    });
  };

  // --- playback
  const params = new URLSearchParams(location.search);
  const holoParam = params.get('holo');
  const fileOverride = holoParam && holoParam.startsWith('/') ? holoParam : null; // QA: a same-origin test video instead of Mux
  let selected = 0;
  let focused = false;
  if (!document.getElementById('hologram-video-css')) {
    const s = document.createElement('style');
    s.id = 'hologram-video-css';
    s.textContent = VIDEO_CSS;
    document.head.append(s);
  }
  const player = new Player(fileOverride, holoParam === 'hls', (tex) => { if (focused) fadeTo(tex, 0.5); }, (on) => {
    // fullscreen covers the table: no texture uploads meanwhile; back from it, the sheet fades in on the running stream
    if (on) { screen.visible = false; return; }
    if (!focused) return;
    screen.visible = true;
    su.opacity.value = 0;
    tw(su.opacity, { value: 1, ease: 'power2.out' }, 0.5);
  });
  let prepareTimer = 0;
  const prepareSoon = (delay: number): void => {
    clearTimeout(prepareTimer);
    prepareTimer = window.setTimeout(() => { if (!focused) void player.prepare(FILMS[selected]); }, delay);
  };
  // idle after the lamp has warmed: the first film is ready to start on the click
  const whenReady = (): void => { if (state.ready) prepareSoon(2500); else setTimeout(whenReady, 500); };
  whenReady();

  const listeners = new Set<(i: number) => void>();
  const controller: HologramController = {
    films: FILMS,
    get selected() { return selected; },
    select(i) {
      if (i === selected || i < 0 || i >= FILMS.length) return;
      selected = i;
      for (const l of listeners) l(i);
      if (!focused) { poster(i, (t) => { if (selected === i && !focused) showGhost(t); }); prepareSoon(0); return; }
      if (player.snapshot(snapCanvas)) { snapTex.needsUpdate = true; showStatic(snapTex); }
      poster(i, (t) => { if (selected === i && focused) fadeTo(t, 0.35); });
      void player.start(FILMS[i]);
    },
    cinema() { return focused && player.enterCinema(); },
    onChange(cb) { listeners.add(cb); return () => { listeners.delete(cb); }; },
  };

  const gu = ghostMat.uniforms;
  const showGhost = (t: THREE.Texture): void => { gu.mapA.value = t; gu.mapB.value = t; gu.mixT.value = 0; };
  poster(0, showGhost);

  const tw = (target: object, vars: gsap.TweenVars, duration: number, delay = 0): gsap.core.Tween =>
    gsap.to(target, { ...vars, duration: state.reducedMotion ? 0.2 : duration, delay: state.reducedMotion ? Math.min(delay, 0.2) : delay, overwrite: 'auto' });

  const enter = (): void => {
    focused = true;
    clearTimeout(prepareTimer);
    // a late poster fills a still-black screen; it never interrupts a video that has already gone live
    poster(selected, (t) => { if (focused && !player.live && su.mapA.value === black && su.mapB.value === black) showStatic(t); });
    const have = posters.get(selected);
    showStatic(have ?? black);
    screen.visible = true;
    screenProxy.layers.set(HIT_LAYER);
    tw(su.opacity, { value: 1, ease: 'power2.out' }, 0.6, 0.45);        // with the panel entrance
    tw(coneUniforms.intensity, { value: FOCUS.cone, ease: 'power2.inOut' }, 0.9);
    tw(cone.scale, { y: state.reducedMotion ? 1 : FOCUS.coneScale, ease: 'power2.inOut' }, 0.9);
    tw(glowMat, { opacity: FOCUS.glow, ease: 'power2.inOut' }, 0.9);
    tw(light, { intensity: FOCUS.light, ease: 'power2.inOut' }, 0.9);
    tw(gu.opacity, { value: 0, ease: 'power2.in' }, 0.45, 0.25);
    void player.start(FILMS[selected]);
  };

  const exit = (): void => {
    focused = false;
    screenProxy.layers.disableAll();
    // hold the last frame as a still, release the video now (no race with a quick re-focus), fade the still with the panel
    if (player.snapshot(snapCanvas)) { snapTex.needsUpdate = true; showStatic(snapTex); }
    else if (su.mapA.value === player.texture || su.mapB.value === player.texture) showStatic(posters.get(selected) ?? black);
    player.stop();
    screen.visible = true;
    tw(su.opacity, { value: 0, ease: 'power2.in', onComplete: () => { if (!focused) screen.visible = false; } }, 0.24);
    tw(su.intensity, { value: 1 }, 0.24);
    tw(coneUniforms.intensity, { value: REST.cone, ease: 'power2.inOut' }, 0.8);
    tw(cone.scale, { y: 1, ease: 'power2.inOut' }, 0.8);
    tw(glowMat, { opacity: REST.glow, ease: 'power2.inOut' }, 0.8);
    tw(light, { intensity: REST.light, ease: 'power2.inOut' }, 0.8);
    poster(selected, (t) => { if (!focused) showGhost(t); });
    tw(gu.opacity, { value: 1, ease: 'power2.out' }, 0.6, 0.3);
    prepareSoon(2000); // the next focus starts as fast as this one did
  };

  // --- hit, anchor
  const proxy = hitProxy(0.14, 0.30, 0.14, 'hologram:proxy');
  proxy.position.y = 0.15;
  group.add(proxy);
  // the floating sheet is a click target only while focused (second click: fullscreen with sound)
  const screenProxy = hitProxy(SCREEN.w, SCREEN.h, 0.04, 'hologram:screen');
  screenProxy.position.y = SCREEN.y;
  screenProxy.rotation.x = SCREEN.tilt;
  screenProxy.layers.disableAll();
  group.add(screenProxy);

  // QA hook (tests/scenarios/hologram*.json)
  (window as unknown as { __hologram: unknown }).__hologram = {
    get selected() { return selected; },
    get focused() { return focused; },
    get cinema() { return player.cinema; },
    get screenVisible() { return screen.visible; },
    get screenOpacity() { return su.opacity.value; },
    get ghostOpacity() { return gu.opacity.value; },
    get liveMix() { return (su.mapB.value === player.texture && player.texture) ? su.mixT.value : 0; },
    get posterFallback() { return posterFallback; },
    status() {
      const v = player.video;
      const h = player.hls;
      return {
        mode: player.mode, playing: player.playing, live: player.live, hls: h !== null, cinema: player.cinema,
        readyState: v?.readyState ?? -1, videoWidth: v?.videoWidth ?? 0, paused: v?.paused ?? true, muted: v?.muted ?? true,
        controls: v?.controls ?? false, fullscreen: !!v && fsElement() === v,
        currentTime: v?.currentTime ?? 0, src: v?.currentSrc ?? '', error: player.lastError, events: player.events.slice(),
        buffered: v ? Array.from({ length: v.buffered.length }, (_, i) => [v.buffered.start(i), v.buffered.end(i)]) : [],
        mediaError: v?.error ? `${v.error.code} ${v.error.message}` : '',
        level: h ? { current: h.currentLevel, cap: h.autoLevelCapping, heights: h.levels.map((l) => l.height) } : null,
      };
    },
  };

  return {
    id: 'hologram',
    label: 'Hologram projector',
    group,
    hit: [body, proxy, screenProxy],
    anchor: new THREE.Vector3(0, CONE.h + 0.04, 0),
    hover: { lift: 0.012, tilt: 2.5 },
    focus: {
      camera: ctx.focusPose('hologram'),
      panel: hologramPanel(controller),
      onEnter: enter,
      onExit: exit,
      onClickInside() { controller.cinema(); },
    },
    update(_dt, t) {
      if (firstFrame) { firstFrame = false; screen.visible = false; }
      coneUniforms.time.value = t;
      su.time.value = t;
      gu.time.value = t;
      ghost.rotation.y = t * 0.22;
      player.poll();
    },
    dispose() {
      clearTimeout(prepareTimer);
      player.dispose();
      for (const t of posters.values()) t.dispose();
      snapTex.dispose(); black.dispose(); bump.dispose(); fallback?.dispose();
      body.geometry.dispose(); ring.geometry.dispose(); glow.geometry.dispose(); lens.geometry.dispose();
      coneGeo.dispose(); ghost.geometry.dispose(); screen.geometry.dispose(); proxy.geometry.dispose(); screenProxy.geometry.dispose();
      bodyMat.dispose(); glowMat.dispose(); lensMat.dispose(); coneMat.dispose(); ghostMat.dispose(); screenMat.dispose();
    },
  };
}
