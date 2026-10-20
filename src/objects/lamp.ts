import * as THREE from 'three';
import type { ObjectCtx, TableObject } from './types';
import { metal, standard, makeCanvasTexture } from '../materials';

// The desk lamp: an articulated architect's lamp at the back-right, head aimed
// at the table centre, and the dust motes drifting in its light. Not clickable
// (hit is empty). The key light is attached at headWorld() (the bulb) and aimed
// at aimWorld(); the bulb, the shade's lining, the glow cone and the motes
// follow the key's warm-up and focus dim through setGlow().
//
// Nothing on the lamp casts a shadow: the only light in the room is inside its
// own head, and a lamp cannot shadow its own light. (The directional that
// draws the shadows sits behind the head; the arm would otherwise cut a line
// across the pool.)

export interface LampObject extends TableObject {
  /** World position of the bulb, for the key light. */
  headWorld(): THREE.Vector3;
  /** World point the head aims at. */
  aimWorld(): THREE.Vector3;
  setDustCount(n: number): void;
  /** Emissive parts follow the key: warm 0..1 (warm-up), dim 0..1 (focus). */
  setGlow(warm: number, dim: number): void;
}

// Lamp space: the group sits at the lamp's base; layout turns it so local -z
// points at the table centre, 0.74 m away.
const AIM = new THREE.Vector3(0, 0, -0.74);
const MOUTH = new THREE.Vector3(0, 0.408, -0.206);        // centre of the shade's opening
const UP = MOUTH.clone().sub(AIM).normalize();              // shade axis, mouth toward cap
const SHADE_LEN = 0.112;
const PIVOT = new THREE.Vector3(0, 0.040, 0);
const ELBOW = new THREE.Vector3(0, 0.300, 0.100);
const WRIST = MOUTH.clone().addScaledVector(UP, SHADE_LEN + 0.024);
const BULB = MOUTH.clone().addScaledVector(UP, 0.034);

const KEY_FINAL = new THREE.Color(0xffd2a0);
const KEY_AMBER = new THREE.Color(0xff8a2a);

export function createLamp(ctx: ObjectCtx): LampObject {
  const group = new THREE.Group();
  group.name = 'lamp';

  // painted steel: a satin enamel, not plastic (a little metalness, mid roughness)
  const enamel = standard({ color: 0x1e1c19, roughness: 0.47, metalness: 0.3 });
  const steel = metal({ color: 0x9c968d, roughness: 0.42, metalness: 0.85 });
  const noShadow = <T extends THREE.Object3D>(o: T, name?: string): T => { o.castShadow = false; o.receiveShadow = true; if (name) o.name = name; return o; };

  // base: a weighted disc with a chamfered top and a short neck
  const baseProfile = [
    [0, 0], [0.080, 0], [0.083, 0.003], [0.083, 0.010], [0.077, 0.015], [0.042, 0.019], [0.020, 0.023], [0.014, 0.026], [0.014, 0.034], [0, 0.034],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const base = noShadow(new THREE.Mesh(new THREE.LatheGeometry(baseProfile, 72), enamel), 'lamp-base');
  group.add(base);

  // hinges: a ball with a short bolt through it along the hinge axis (local x)
  const hinge = (p: THREE.Vector3, r: number): void => {
    const ball = noShadow(new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), enamel));
    ball.position.copy(p);
    const bolt = noShadow(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.72, r * 0.72, r * 2.3, 20), steel));
    bolt.position.copy(p);
    bolt.rotation.z = Math.PI / 2;
    group.add(ball, bolt);
  };
  const rod = (a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material, t0 = 0, t1 = 1): THREE.Mesh => {
    const p = a.clone().lerp(b, t0), qv = a.clone().lerp(b, t1);
    const len = p.distanceTo(qv);
    const mesh = noShadow(new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 18), mat));
    mesh.position.copy(p).add(qv).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), qv.clone().sub(p).normalize());
    return mesh;
  };

  hinge(PIVOT, 0.015);
  // lower arm: a pair of rods with a tension spring between them (the architect's lamp)
  const off = new THREE.Vector3(0.0085, 0, 0);
  group.add(rod(PIVOT.clone().add(off), ELBOW.clone().add(off), 0.0042, enamel));
  group.add(rod(PIVOT.clone().sub(off), ELBOW.clone().sub(off), 0.0042, enamel));
  const springSide = new THREE.Vector3(0, 0.008, -0.013);
  group.add(rod(PIVOT.clone().add(springSide), ELBOW.clone().add(springSide), 0.0052, steel, 0.2, 0.78));
  hinge(ELBOW, 0.0125);
  group.add(rod(ELBOW, WRIST, 0.0058, enamel));
  hinge(WRIST, 0.011);

  // the head: a bell shade whose wide mouth faces the aim, with a lit lining,
  // a bulb, a cap, and the glow cone. Head space: +y is the shade axis (mouth at y=0).
  const head = new THREE.Group();
  head.name = 'lamp-head';
  const pts: THREE.Vector2[] = [new THREE.Vector2(0.0775, 0), new THREE.Vector2(0.0765, 0.005)];
  for (let i = 1; i <= 10; i++) {
    const t = i / 10;
    pts.push(new THREE.Vector2(0.0245 + (0.0765 - 0.0245) * Math.pow(1 - t, 1.55), 0.005 + t * (SHADE_LEN - 0.005)));
  }
  const shadeGeo = new THREE.LatheGeometry(pts, 64);
  const shade = noShadow(new THREE.Mesh(shadeGeo, enamel), 'lamp-shade');
  const liningMap = makeCanvasTexture({
    width: 8, height: 64,
    draw(c, W, H) {
      const g = c.createLinearGradient(0, H, 0, 0); // v=0 (mouth) at the bottom of the canvas
      g.addColorStop(0, 'rgb(150,110,78)');
      g.addColorStop(0.28, 'rgb(255,214,160)');
      g.addColorStop(0.6, 'rgb(214,160,108)');
      g.addColorStop(1, 'rgb(110,78,54)');
      c.fillStyle = g;
      c.fillRect(0, 0, W, H);
    },
  });
  const liningMat = standard({ color: 0x8a6a4c, roughness: 0.6, metalness: 0, emissive: 0xffffff, emissiveMap: liningMap, emissiveIntensity: 0, side: THREE.BackSide });
  const lining = noShadow(new THREE.Mesh(shadeGeo, liningMat), 'lamp-lining');
  lining.scale.setScalar(0.992);
  head.add(shade, lining);
  const bulbMat = standard({ color: 0xfff2e0, roughness: 0.35, metalness: 0, emissive: KEY_FINAL.clone(), emissiveIntensity: 0 });
  const bulb = noShadow(new THREE.Mesh(new THREE.SphereGeometry(0.0165, 24, 16), bulbMat), 'lamp-bulb');
  bulb.position.y = 0.034;
  const socket = noShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.0085, 0.0085, 0.05, 16), enamel));
  socket.position.y = 0.072;
  const cap = noShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.0255, 0.0255, 0.022, 32), enamel), 'lamp-cap');
  cap.position.y = SHADE_LEN + 0.006;
  const vent = noShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.006, 24), steel));
  vent.position.y = SHADE_LEN + 0.02;
  head.add(bulb, socket, cap, vent);

  // the glow: a faint additive cone of light-in-air below the mouth
  const GLOW_LEN = 0.30;
  const glowGeo = new THREE.CylinderGeometry(0.07, 0.19, GLOW_LEN, 40, 1, true);
  glowGeo.translate(0, -GLOW_LEN / 2, 0);
  const glowMat = new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: 0 }, uColor: { value: new THREE.Color(0xffc48a) }, uLen: { value: GLOW_LEN } },
    vertexShader: `
      uniform float uLen;
      varying float vT; varying vec3 vN; varying vec3 vV;
      void main() {
        vT = clamp(-position.y / uLen, 0.0, 1.0);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float uOpacity; uniform vec3 uColor;
      varying float vT; varying vec3 vN; varying vec3 vV;
      void main() {
        float facing = abs(dot(normalize(vN), normalize(vV)));
        float a = pow(1.0 - vT, 2.4) * pow(facing, 1.1) * uOpacity;
        gl_FragColor = vec4(uColor * a, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const glow = new THREE.Mesh(glowGeo, glowMat);
  glow.name = 'lamp-glow';
  glow.castShadow = false;
  glow.receiveShadow = false;
  glow.renderOrder = 2;
  head.add(glow);

  head.position.copy(MOUTH);
  head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), UP);
  group.add(head);

  // dust motes in the light (lamp space; the group is turned toward the table)
  const dust = createDust(ctx, ctx.isPhone ? 60 : 200, BULB, AIM);
  group.add(dust.points);

  const v = new THREE.Vector3();
  const tmpColor = new THREE.Color();
  return {
    id: 'lamp',
    label: 'Desk lamp',
    group,
    hit: [],
    anchor: new THREE.Vector3(0, 0.5, 0),
    focus: { camera: ctx.focusPose('lamp'), panel: null },
    update(dt, t) { dust.update(dt, t); },
    headWorld() { return group.localToWorld(v.copy(BULB)).clone(); },
    aimWorld() { return group.localToWorld(v.copy(AIM)).clone(); },
    setDustCount(n) { dust.setCount(n); },
    setGlow(warm, dim) {
      const k = 1 - 0.3 * dim;
      tmpColor.copy(KEY_AMBER).lerp(KEY_FINAL, Math.min(1, warm * 1.15));
      bulbMat.emissive.copy(tmpColor);
      bulbMat.emissiveIntensity = 2.3 * warm * k;
      liningMat.emissiveIntensity = 1.15 * warm * k;
      glowMat.uniforms.uOpacity.value = 0.085 * warm * (1 - 0.45 * dim);
      dust.setOpacity(warm * (1 - 0.5 * dim));
    },
  };
}

interface Dust { points: THREE.Points; update(dt: number, t: number): void; setCount(n: number): void; setOpacity(o: number): void }

/**
 * ~200 motes drifting slowly inside the light: additive, soft-edged sprites
 * sized in metres (so they read the same at 1440 and 1920), never smaller
 * than ~2.5 px (a 1 px point flickers as it moves: that is the sparkle),
 * dimmer toward the edge of the cone and fading out close to the camera.
 */
function createDust(ctx: ObjectCtx, count: number, apex: THREE.Vector3, aim: THREE.Vector3): Dust {
  const axis = aim.clone().sub(apex);
  const length = axis.length();
  axis.normalize();
  const u = new THREE.Vector3().crossVectors(axis, new THREE.Vector3(0, 1, 0)).normalize();
  if (u.lengthSq() < 1e-6) u.set(1, 0, 0);
  const w = new THREE.Vector3().crossVectors(axis, u).normalize();
  const n = count;
  const pos = new Float32Array(n * 3);
  const sizes = new Float32Array(n);
  const alphas = new Float32Array(n);
  const seed = new Float32Array(n * 4); // along, radial (0..1 of the cone radius), angle, speed
  const sprite = makeCanvasTexture({
    width: 32, height: 32,
    draw(c, W, H) {
      const g = c.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.3, 'rgba(255,255,255,0.5)');
      g.addColorStop(0.6, 'rgba(255,255,255,0.12)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, W, H);
    },
  });
  sprite.generateMipmaps = false;
  sprite.minFilter = THREE.LinearFilter;
  const radiusAt = (along: number): number => 0.03 + along * 0.26;
  const place = (i: number, along: number): void => {
    const r = Math.sqrt(Math.random());
    seed[i * 4] = along; seed[i * 4 + 1] = r; seed[i * 4 + 2] = Math.random() * Math.PI * 2; seed[i * 4 + 3] = 0.6 + Math.random() * 0.8;
    sizes[i] = 0.0035 + Math.random() * Math.random() * 0.0065;
    alphas[i] = (1 - r * r * 0.85) * (0.35 + Math.random() * 0.65);
  };
  for (let i = 0; i < n; i++) place(i, Math.random());
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTex: { value: sprite }, uColor: { value: new THREE.Color(0xffd8ac) }, uOpacity: { value: 0 }, uScale: { value: 1000 } },
    vertexShader: `
      attribute float aSize; attribute float aAlpha;
      uniform float uScale;
      varying float vA;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float px = aSize * uScale / max(0.05, -mv.z);
        gl_PointSize = clamp(px, 2.5, 20.0);
        // motes within 30 cm of the lens would be huge blurs: fade them out
        vA = aAlpha * smoothstep(0.12, 0.32, -mv.z) * clamp(px / 2.5, 0.35, 1.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform sampler2D uTex; uniform vec3 uColor; uniform float uOpacity;
      varying float vA;
      void main() {
        float t = texture2D(uTex, gl_PointCoord).a;
        gl_FragColor = vec4(uColor * (t * vA * uOpacity), 1.0);
      }`,
    transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.name = 'dust';
  points.frustumCulled = false;
  points.renderOrder = 3;
  const p = new THREE.Vector3();
  const size2 = new THREE.Vector2();
  const write = (i: number, t: number): void => {
    const along = seed[i * 4], r = seed[i * 4 + 1] * radiusAt(along), a = seed[i * 4 + 2] + t * 0.04 * seed[i * 4 + 3];
    const sway = Math.sin(t * 0.6 * seed[i * 4 + 3] + i) * 0.004;
    const bob = Math.cos(t * 0.45 * seed[i * 4 + 3] + i * 1.7) * 0.003;
    p.copy(apex).addScaledVector(axis, along * length)
      .addScaledVector(u, Math.cos(a) * r + sway)
      .addScaledVector(w, Math.sin(a) * r + bob);
    pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
  };
  let active = n;
  let opacity = 0;
  return {
    points,
    update(dt, t) {
      for (let i = 0; i < active; i++) {
        // drift slowly down the light toward the table; wrap back near the head
        seed[i * 4] += dt * 0.01 * seed[i * 4 + 3];
        if (seed[i * 4] > 1) place(i, 0.06);
        write(i, t);
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.aSize.needsUpdate = true;
      geo.attributes.aAlpha.needsUpdate = true;
      // pixels per metre at unit distance: screen height / (2 tan(fov/2))
      const h = ctx.renderer.getDrawingBufferSize(size2).y;
      mat.uniforms.uScale.value = h / (2 * Math.tan(THREE.MathUtils.degToRad(ctx.camera.fov) / 2));
      mat.uniforms.uOpacity.value = 0.3 * opacity;
    },
    setCount(c) {
      active = Math.max(0, Math.min(n, c));
      geo.setDrawRange(0, active);
    },
    setOpacity(o) { opacity = o; },
  };
}
