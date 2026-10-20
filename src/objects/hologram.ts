import * as THREE from 'three';
import gsap from 'gsap';
import type Hls from 'hls.js';
import type { ErrorData } from 'hls.js';
import type { ObjectCtx, TableObject } from './types';
import { hitProxy, solid } from './helpers';
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
const CONE = { h: 0.21, rTop: 0.085, rBottom: 0.012 };
const GHOST = { w: 0.12, y: 0.115, intensity: 0.28 };
const SCREEN = { w: 0.32, h: 0.18, y: 0.255, bow: 0.012, tilt: -0.10 };
const CYAN = new THREE.Color(0x6fdcff);

const REST = { cone: 0.20, glow: 0.35, light: 0.05, coneScale: 1 };
const FOCUS = { cone: 0.52, glow: 0.9, light: 0.35, coneScale: 1.12 };

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
  float h = 1.0 - vUv.y;                       // 0 at the lens, 1 at the top
  float rim = pow(abs(dot(normalize(vN), normalize(vV))), 1.6);   // thin at the silhouette: reads as volume
  float fall = pow(1.0 - h, 1.35) * (0.3 + 0.7 * smoothstep(0.0, 0.10, h));
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

/**
 * Owns the one hidden <video>, the hls.js instance and the VideoTexture.
 * `start` swaps the source; `poll` (per frame) reports when real frames flow;
 * `stop` pauses, detaches hls, clears the source and frees the GPU texture.
 */
class Player {
  video: HTMLVideoElement | null = null;
  hls: Hls | null = null;
  texture: THREE.VideoTexture | null = null;
  mode: Mode | null = null;
  live = false;
  playing = false;
  held = false;
  lastError = '';
  private token = 0;

  constructor(
    private readonly fileOverride: string | null,
    /** QA: take the hls.js path even where the browser plays HLS natively. */
    private readonly forceHls: boolean,
    private readonly onLive: (tex: THREE.VideoTexture) => void,
  ) {}

  private ensureVideo(): HTMLVideoElement {
    if (this.video) return this.video;
    const v = document.createElement('video');
    v.muted = true; v.defaultMuted = true; v.loop = true; v.playsInline = true; v.preload = 'auto';
    v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.setAttribute('aria-hidden', 'true');
    v.crossOrigin = 'anonymous';
    v.tabIndex = -1;
    // in the document (Safari decodes nothing for a detached element) but out of sight
    v.style.cssText = 'position:fixed;left:0;bottom:0;width:2px;height:2px;opacity:0.01;pointer-events:none;z-index:-1;';
    document.body.append(v);
    this.video = v;
    return v;
  }

  async start(film: Film): Promise<void> {
    const token = ++this.token;
    const v = this.ensureVideo();
    this.detach();
    this.live = false;
    this.playing = true;
    this.held = false;
    this.lastError = '';
    if (this.fileOverride) {
      this.mode = 'file';
      v.src = this.fileOverride;
    } else if (!this.forceHls && v.canPlayType('application/vnd.apple.mpegurl')) {
      this.mode = 'native';
      v.src = hlsUrl(film);
    } else {
      const mod = await import('hls.js');
      if (token !== this.token) return;
      const HlsCtor = mod.default;
      if (!HlsCtor.isSupported()) { this.lastError = 'hls-unsupported'; this.playing = false; return; }
      this.mode = 'hls';
      const hls = new HlsCtor({ enableWorker: true, maxBufferLength: 20, backBufferLength: 20, startLevel: -1 });
      this.hls = hls;
      let retriedNet = false, retriedMedia = false;
      hls.on(HlsCtor.Events.MANIFEST_PARSED, () => {
        // a 32 cm sheet of light needs no more than 720p
        let cap = -1;
        hls.levels.forEach((l, i) => { if (l.height && l.height <= 720) cap = i; });
        if (cap >= 0) hls.autoLevelCapping = cap;
      });
      hls.on(HlsCtor.Events.ERROR, (_ev, data: ErrorData) => {
        if (!data.fatal) return;
        if (data.type === HlsCtor.ErrorTypes.NETWORK_ERROR && !retriedNet) { retriedNet = true; hls.startLoad(); return; }
        if (data.type === HlsCtor.ErrorTypes.MEDIA_ERROR && !retriedMedia) { retriedMedia = true; hls.recoverMediaError(); return; }
        this.lastError = data.details;
        this.playing = false;
        hls.destroy();
        if (this.hls === hls) this.hls = null;
      });
      hls.attachMedia(v);
      hls.loadSource(hlsUrl(film));
    }
    const p = v.play();
    if (p) p.catch((e: unknown) => { this.lastError = e instanceof Error ? e.name : String(e); });
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
    this.onLive(this.texture);
  }

  hold(on: boolean): void {
    this.held = on;
    const v = this.video;
    if (!v || !this.playing) return;
    if (on) v.pause();
    else { const p = v.play(); if (p) p.catch(() => { /* a paused hologram is acceptable */ }); }
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
    const v = this.video;
    if (v) { v.pause(); v.removeAttribute('src'); v.load(); }
  }

  stop(): void {
    this.token++;
    this.playing = false;
    this.live = false;
    this.held = false;
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
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
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
      thumbnailUrl(FILMS[i]),
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
  snapCanvas.width = 480; snapCanvas.height = 270;
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
  const player = new Player(fileOverride, holoParam === 'hls', (tex) => { if (focused) fadeTo(tex, 0.5); });

  const listeners = new Set<(i: number) => void>();
  const controller: HologramController = {
    films: FILMS,
    get selected() { return selected; },
    select(i) {
      if (i === selected || i < 0 || i >= FILMS.length) return;
      selected = i;
      for (const l of listeners) l(i);
      if (!focused) { poster(i, (t) => { if (selected === i && !focused) showGhost(t); }); return; }
      if (player.snapshot(snapCanvas)) { snapTex.needsUpdate = true; showStatic(snapTex); }
      poster(i, (t) => { if (selected === i && focused) fadeTo(t, 0.35); });
      void player.start(FILMS[i]);
    },
    hold(on) {
      player.hold(on);
      gsap.to(su.intensity, { value: on ? 0.55 : 1, duration: state.reducedMotion ? 0.2 : 0.4, ease: 'power2.out', overwrite: 'auto' });
    },
    onChange(cb) { listeners.add(cb); return () => { listeners.delete(cb); }; },
  };

  const gu = ghostMat.uniforms;
  const showGhost = (t: THREE.Texture): void => { gu.mapA.value = t; gu.mapB.value = t; gu.mixT.value = 0; };
  poster(0, showGhost);

  const tw = (target: object, vars: gsap.TweenVars, duration: number, delay = 0): gsap.core.Tween =>
    gsap.to(target, { ...vars, duration: state.reducedMotion ? 0.2 : duration, delay: state.reducedMotion ? Math.min(delay, 0.2) : delay, overwrite: 'auto' });

  const enter = (): void => {
    focused = true;
    poster(selected, (t) => { if (focused && su.mapA.value === black) showStatic(t); });
    const have = posters.get(selected);
    showStatic(have ?? black);
    screen.visible = true;
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
    // hold the last frame as a still, release the video now (no race with a quick re-focus), fade the still with the panel
    if (player.snapshot(snapCanvas)) { snapTex.needsUpdate = true; showStatic(snapTex); }
    else if (su.mapA.value === player.texture || su.mapB.value === player.texture) showStatic(posters.get(selected) ?? black);
    player.stop();
    tw(su.opacity, { value: 0, ease: 'power2.in', onComplete: () => { if (!focused) screen.visible = false; } }, 0.24);
    tw(su.intensity, { value: 1 }, 0.24);
    tw(coneUniforms.intensity, { value: REST.cone, ease: 'power2.inOut' }, 0.8);
    tw(cone.scale, { y: 1, ease: 'power2.inOut' }, 0.8);
    tw(glowMat, { opacity: REST.glow, ease: 'power2.inOut' }, 0.8);
    tw(light, { intensity: REST.light, ease: 'power2.inOut' }, 0.8);
    poster(selected, (t) => { if (!focused) showGhost(t); });
    tw(gu.opacity, { value: 1, ease: 'power2.out' }, 0.6, 0.3);
  };

  // --- hit, anchor
  const proxy = hitProxy(0.14, 0.30, 0.14, 'hologram:proxy');
  proxy.position.y = 0.15;
  group.add(proxy);

  // QA hook (tests/scenarios/hologram*.json)
  (window as unknown as { __hologram: unknown }).__hologram = {
    get selected() { return selected; },
    get focused() { return focused; },
    get held() { return player.held; },
    get screenVisible() { return screen.visible; },
    get screenOpacity() { return su.opacity.value; },
    get ghostOpacity() { return gu.opacity.value; },
    get liveMix() { return (su.mapB.value === player.texture && player.texture) ? su.mixT.value : 0; },
    get posterFallback() { return posterFallback; },
    status() {
      const v = player.video;
      return {
        mode: player.mode, playing: player.playing, live: player.live, hls: player.hls !== null,
        readyState: v?.readyState ?? -1, videoWidth: v?.videoWidth ?? 0, paused: v?.paused ?? true,
        currentTime: v?.currentTime ?? 0, src: v?.currentSrc ?? '', error: player.lastError,
      };
    },
  };

  return {
    id: 'hologram',
    label: 'Hologram projector',
    group,
    hit: [body, proxy],
    anchor: new THREE.Vector3(0, CONE.h + 0.04, 0),
    hover: { lift: 0.012, tilt: 2.5 },
    focus: {
      camera: ctx.focusPose('hologram'),
      panel: hologramPanel(controller),
      onEnter: enter,
      onExit: exit,
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
      player.dispose();
      for (const t of posters.values()) t.dispose();
      snapTex.dispose(); black.dispose(); bump.dispose(); fallback?.dispose();
      body.geometry.dispose(); ring.geometry.dispose(); glow.geometry.dispose(); lens.geometry.dispose();
      coneGeo.dispose(); ghost.geometry.dispose(); screen.geometry.dispose();
      bodyMat.dispose(); glowMat.dispose(); lensMat.dispose(); coneMat.dispose(); ghostMat.dispose(); screenMat.dispose();
    },
  };
}
